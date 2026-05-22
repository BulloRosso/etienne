import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PackageResolverService } from './resolver/package-resolver.service';
import { PackageBuilderService, BuildResult } from './builder/package-builder.service';
import { PackageMaterializerService } from './materializer/package-materializer.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';
import { McpRegistryService } from '../mcp-registry/core/mcp-registry.service';
import { SkillsService } from '../skills/skills.service';
import { SubagentsService } from '../subagents/subagents.service';
import { ApplicationTypesService } from '../application-types/application-types.service';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';
import { PackageManifest, ManifestMcpServer } from './dto/manifest.dto';
import { PackageLockfile, ValidationIssue } from './dto/lockfile.dto';
import { DeployResult, ResolveResult, ValidateResult } from './dto/package-result.dto';

/**
 * Orchestrator for the packages HTTP surface.
 *
 * - resolve: manifest → lockfile + validation
 * - validate: manifest → validation only
 * - build: manifest → resolve → materialize → zip
 */
@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private readonly resolver: PackageResolverService,
    private readonly builder: PackageBuilderService,
    private readonly materializer: PackageMaterializerService,
    private readonly mcpServerConfigService: McpServerConfigService,
    private readonly mcpRegistryService: McpRegistryService,
    private readonly skillsService: SkillsService,
    private readonly subagentsService: SubagentsService,
    private readonly applicationTypesService: ApplicationTypesService,
    private readonly codingAgentConfig: CodingAgentConfigurationService,
  ) {}

  async resolve(manifest: PackageManifest): Promise<ResolveResult> {
    const lockfile = await this.resolver.resolve(manifest);
    return { lockfile };
  }

  async validate(manifest: PackageManifest): Promise<ValidateResult> {
    const lockfile = await this.resolver.resolve(manifest);
    return { conflicts: lockfile.conflicts, warnings: lockfile.warnings };
  }

  async build(manifest: PackageManifest): Promise<BuildResult> {
    const lockfile = await this.resolver.resolve(manifest);
    if (lockfile.conflicts.length > 0) {
      const codes = lockfile.conflicts.map((c) => c.code).join(', ');
      const e: Error & { conflicts?: ValidationIssue[] } = new Error(
        `Cannot build package with unresolved conflicts: ${codes}`,
      );
      e.conflicts = lockfile.conflicts;
      throw e;
    }
    return this.builder.build(manifest, lockfile);
  }

  /**
   * Exposed for tests and callers that want to provide their own lockfile
   * (e.g. a future deploy endpoint that resolved earlier in the flow).
   */
  buildWithLockfile(manifest: PackageManifest, lockfile: PackageLockfile): Promise<BuildResult> {
    return this.builder.build(manifest, lockfile);
  }

  /**
   * Materialize the package into /workspace/<manifest.name>/.
   *
   * Differences vs. build():
   *   - Writes to the live workspace, not a tmp dir.
   *   - Refuses to overwrite an existing project.
   *   - Copies intro videos (live workspace shows them in the UI).
   *   - Invalidates any cached MCP session for the new project so the agent
   *     picks up the configured servers on first chat.
   *   - No LLM-generated welcome message — that's a workspace UX detail the
   *     wizard adds; the package composer is opinion-free.
   */
  async deploy(manifest: PackageManifest): Promise<DeployResult> {
    if (!manifest.name) {
      return {
        success: false,
        projectName: '',
        errors: ['Package manifest is missing a name.'],
      };
    }
    const projectPath = path.join(this.workspaceDir, manifest.name);

    if (await fs.pathExists(projectPath)) {
      return {
        success: false,
        projectName: manifest.name,
        errors: [`Project '${manifest.name}' already exists`],
      };
    }

    const lockfile = await this.resolver.resolve(manifest);
    if (lockfile.conflicts.length > 0) {
      return {
        success: false,
        projectName: manifest.name,
        errors: lockfile.conflicts.map((c) => c.message),
      };
    }

    try {
      const result = await this.materializer.materialize(manifest, lockfile, projectPath, {
        copyIntroVideos: true,
      });
      const warnings = [...result.warnings];

      // Session invalidation — only meaningful for live workspace projects.
      if (manifest.mcpServers.length > 0) {
        try {
          const mcpServers: Record<string, any> = {};
          for (const m of manifest.mcpServers) {
            mcpServers[m.name] = m.config;
          }
          await this.mcpServerConfigService.saveMcpConfig(manifest.name, { mcpServers });
        } catch (err: any) {
          warnings.push(`Failed to invalidate MCP session: ${err.message}`);
        }
      }

      return {
        success: true,
        projectName: manifest.name,
        warnings: warnings.length > 0 ? warnings : undefined,
        guidanceDocuments:
          result.guidanceDocuments.length > 0 ? result.guidanceDocuments : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Failed to deploy package "${manifest.name}":`, err);
      try {
        await fs.remove(projectPath);
      } catch {
        // ignore cleanup error
      }
      return {
        success: false,
        projectName: manifest.name,
        errors: [err.message],
      };
    }
  }

  /**
   * Apply a previously-built package zip to a new project on this backend.
   *
   * Unlike deploy() — which re-runs resolve + materialize and is subject to
   * catalog drift — import() extracts the zip's contents as-is into
   * /workspace/<manifest.name>/. The lockfile is preserved verbatim, which is
   * the whole point of having one: identical packages produce identical
   * projects regardless of when or where they are applied.
   *
   * If `overrideName` is provided, that becomes the workspace folder name
   * (the file's package.manifest.json is rewritten in-place to match).
   */
  async import(zipBuffer: Buffer, overrideName?: string): Promise<DeployResult> {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-pkg-import-'));
    try {
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(tmpRoot, /* overwrite */ true);

      // The builder zips a single top-level directory named after the package.
      // Locate that staging dir so we can read its manifest and copy its tree.
      const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      if (dirs.length !== 1) {
        return {
          success: false,
          projectName: '',
          errors: [
            `Expected exactly one top-level directory in the zip; found ${dirs.length}.`,
          ],
        };
      }
      const stagingDir = path.join(tmpRoot, dirs[0].name);

      const manifestPath = path.join(stagingDir, 'package.manifest.json');
      if (!(await fs.pathExists(manifestPath))) {
        return {
          success: false,
          projectName: '',
          errors: ['Zip is missing package.manifest.json — not a built package.'],
        };
      }
      const manifest = (await fs.readJson(manifestPath)) as PackageManifest;

      const targetName = (overrideName || manifest.name || '').trim();
      if (!targetName) {
        return {
          success: false,
          projectName: '',
          errors: ['Package manifest has no name and no overrideName was provided.'],
        };
      }
      if (overrideName && overrideName !== manifest.name) {
        manifest.name = overrideName;
        await fs.writeJson(manifestPath, manifest, { spaces: 2 });
      }

      const projectPath = path.join(this.workspaceDir, targetName);
      if (await fs.pathExists(projectPath)) {
        return {
          success: false,
          projectName: targetName,
          errors: [`Project '${targetName}' already exists`],
        };
      }

      // Atomic-ish: copy from staging to workspace; on failure, roll back.
      try {
        await fs.copy(stagingDir, projectPath);
      } catch (err: any) {
        try {
          await fs.remove(projectPath);
        } catch {
          // ignore cleanup error
        }
        throw err;
      }

      const warnings: string[] = [];

      // Session invalidation: an imported project needs the same MCP cache
      // bust as a fresh deploy so the agent picks up the configured servers.
      if (manifest.mcpServers?.length) {
        try {
          const mcpServers: Record<string, any> = {};
          for (const m of manifest.mcpServers) {
            mcpServers[m.name] = m.config;
          }
          await this.mcpServerConfigService.saveMcpConfig(targetName, { mcpServers });
        } catch (err: any) {
          warnings.push(`Failed to invalidate MCP session: ${err.message}`);
        }
      }

      // Surface guidance documents the same way deploy() does.
      const guidanceDocuments = await collectGuidanceDocuments(projectPath);

      return {
        success: true,
        projectName: targetName,
        warnings: warnings.length > 0 ? warnings : undefined,
        guidanceDocuments: guidanceDocuments.length > 0 ? guidanceDocuments : undefined,
      };
    } catch (err: any) {
      this.logger.error('Failed to import package zip:', err);
      return {
        success: false,
        projectName: '',
        errors: [err.message],
      };
    } finally {
      try {
        await fs.remove(tmpRoot);
      } catch (err: any) {
        this.logger.warn(`Failed to clean up import tmp dir ${tmpRoot}: ${err.message}`);
      }
    }
  }

  /**
   * Derive a PackageManifest from an existing workspace project ("promote").
   *
   * Reads catalog-derived state from the project tree:
   *   - .etienne/application-type.json     → applicationType.id
   *   - .claude/skills/*                   → skills[] (source reverse-looked-up
   *                                          against the skill repository)
   *   - .claude/agents/*.md                → subagents[] (reverse-looked-up
   *                                          against the subagent repository)
   *   - .mcp.json server names             → mcpServers[] (configs RE-FETCHED
   *                                          from the registry, NOT read from
   *                                          disk — keeps secrets out of the
   *                                          derived manifest)
   *   - <missionFile>                      → missionBrief
   *   - .etienne/user-interface.json       → agentName (from appBar.title)
   *
   * The returned manifest is a starting point: the user edits in the composer
   * before Build/Deploy. Bundled-by-app-type subagents are filtered out so
   * the resolver will re-add them with proper provenance.
   */
  async fromProject(projectName: string): Promise<PackageManifest> {
    const projectDir = path.join(this.workspaceDir, projectName);
    if (!(await fs.pathExists(projectDir))) {
      throw new Error(`Project '${projectName}' not found in workspace`);
    }

    const manifest: PackageManifest = {
      schemaVersion: 1,
      name: projectName,
      skills: [],
      subagents: [],
      mcpServers: [],
    };

    // applicationType
    const appTypeMarker = path.join(projectDir, '.etienne', 'application-type.json');
    let appTypeBundledSubagents = new Set<string>();
    if (await fs.pathExists(appTypeMarker)) {
      try {
        const marker = (await fs.readJson(appTypeMarker)) as { id?: string };
        if (marker.id) {
          manifest.applicationType = { id: marker.id };
          // Compute bundled subagent names so we can skip them from manifest.subagents
          // — the resolver will add them back with provenance.
          const bundled = await this.applicationTypesService.listBundledSubagentFiles(marker.id);
          for (const fileName of bundled) {
            appTypeBundledSubagents.add(fileName.replace(/\.md$/, ''));
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to read application-type marker: ${err.message}`);
      }
    }

    // agentName + missionBrief
    try {
      const uiConfigPath = path.join(projectDir, '.etienne', 'user-interface.json');
      if (await fs.pathExists(uiConfigPath)) {
        const ui = await fs.readJson(uiConfigPath);
        if (ui?.appBar?.title) manifest.agentName = ui.appBar.title;
      }
    } catch {
      // non-critical
    }
    try {
      const missionFile = path.join(projectDir, this.codingAgentConfig.getMissionFileName());
      if (await fs.pathExists(missionFile)) {
        const content = await fs.readFile(missionFile, 'utf-8');
        // strip the "# Mission Brief\n\n" header the materializer writes
        manifest.missionBrief = content.replace(/^#\s*Mission Brief\s*\n+/, '').trim();
      }
    } catch {
      // non-critical
    }

    // skills — reverse-lookup source against the repository catalog
    try {
      const projectSkillNames = await this.skillsService.listSkills(projectName);
      if (projectSkillNames.length > 0) {
        const catalog = await this.skillsService.listCatalogSkills();
        const catalogByName = new Map(catalog.map((s) => [s.name, s]));
        const standardSet = new Set(
          catalog.filter((s) => s.source === 'standard').map((s) => s.name),
        );
        for (const name of projectSkillNames) {
          // Standard skills are auto-provisioned by the materializer — omit them
          // from the manifest so the lockfile reflects them via provisionStandard
          // rather than as explicit user picks.
          if (standardSet.has(name)) continue;
          const catalogEntry = catalogByName.get(name);
          manifest.skills.push({
            name,
            source: catalogEntry?.source || 'optional',
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to gather project skills: ${err.message}`);
    }

    // subagents — only those NOT bundled by the application type
    try {
      const agentsDir = path.join(projectDir, '.claude', 'agents');
      if (await fs.pathExists(agentsDir)) {
        const repo = await this.subagentsService.listRepositorySubagents(true);
        const repoByName = new Map(repo.map((s) => [s.name, s]));
        const standardRepoNames = new Set(
          repo.filter((s) => s.source === 'standard').map((s) => s.name),
        );
        const files = await fs.readdir(agentsDir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const name = file.slice(0, -3);
          if (appTypeBundledSubagents.has(name)) continue;
          // Standard subagents come for free via provisionStandardSubagents.
          if (standardRepoNames.has(name)) continue;
          const repoEntry = repoByName.get(name);
          manifest.subagents.push({
            name,
            source: repoEntry?.source || 'optional',
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to gather project subagents: ${err.message}`);
    }

    // MCP servers — re-fetch from registry to keep secrets out of the manifest.
    // The on-disk .mcp.json may contain resolved placeholder values from a
    // live session; we never read it here.
    try {
      const mcpConfig = await this.mcpServerConfigService.getMcpConfig(projectName);
      const configuredNames = Object.keys(mcpConfig.mcpServers || {});
      const standardRegistryNames = new Set<string>();
      // Standard MCP servers are auto-added by the wizard; we filter them out
      // for the same reason as standard skills.
      try {
        const registry = await this.mcpRegistryService.listServers();
        for (const entry of registry) {
          if (entry.isStandard) standardRegistryNames.add(entry.name);
        }
      } catch {
        // non-critical
      }
      const out: ManifestMcpServer[] = [];
      for (const name of configuredNames) {
        if (standardRegistryNames.has(name)) continue;
        const entry = await this.mcpRegistryService.getServer(name);
        if (!entry) continue; // user-added custom server with no registry entry — skip for now
        const config: Record<string, unknown> = {
          type: entry.transport,
        };
        if (entry.url) config.url = entry.url;
        if (entry.command) config.command = entry.command;
        if (entry.args) config.args = entry.args;
        if (entry.headers) config.headers = entry.headers;
        if (entry.env) config.env = entry.env;
        out.push({ name, config });
      }
      manifest.mcpServers = out;
    } catch (err: any) {
      this.logger.warn(`Failed to gather project MCP servers: ${err.message}`);
    }

    return manifest;
  }
}

async function collectGuidanceDocuments(projectPath: string): Promise<string[]> {
  const out: string[] = [];
  const skillsDir = path.join(projectPath, '.claude', 'skills');
  if (!(await fs.pathExists(skillsDir))) return out;
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const p = path.join(skillsDir, entry.name, 'user-guidance.md');
    if (await fs.pathExists(p)) {
      out.push(`.claude/skills/${entry.name}/user-guidance.md`);
    }
  }
  return out;
}
