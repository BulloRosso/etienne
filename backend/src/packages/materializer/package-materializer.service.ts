import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SkillsService } from '../../skills/skills.service';
import { SubagentsService } from '../../subagents/subagents.service';
import { AgentRoleRegistryService } from '../../agent-role-registry/agent-role-registry.service';
import { A2ASettingsService } from '../../a2a-settings/a2a-settings.service';
import { McpServerConfigService } from '../../claude/mcpserverconfig/mcp.server.config';
import { CodingAgentConfigurationService } from '../../coding-agent-configuration/coding-agent-configuration.service';
import { ApplicationTypesService } from '../../application-types/application-types.service';
import { PackageManifest } from '../dto/manifest.dto';
import { PackageLockfile } from '../dto/lockfile.dto';

export interface MaterializeOptions {
  /** When true, copy intro videos and write intro.videos manifest. Default true. */
  copyIntroVideos?: boolean;
}

export interface MaterializeResult {
  warnings: string[];
  /** Relative paths (POSIX) of .docu files copied from the project template. */
  templatePreviewDocs: string[];
  /** Relative paths to user-guidance.md files inside provisioned skills. */
  guidanceDocuments: string[];
}

/**
 * Materializes a resolved package (manifest + lockfile) into a target project
 * directory. The same materializer is used by:
 *
 *   - ProjectsService.createProject (workspace projects)
 *   - PackageBuilderService          (tmp dir → zip)
 *
 * The materializer does NOT generate the LLM welcome message or invalidate
 * sessions — those are workspace-only side effects handled by the caller.
 */
@Injectable()
export class PackageMaterializerService {
  private readonly logger = new Logger(PackageMaterializerService.name);
  private readonly templateRepositoryDir = path.resolve(
    process.cwd(),
    '..',
    'project-template-repository',
  );

  constructor(
    private readonly skillsService: SkillsService,
    private readonly subagentsService: SubagentsService,
    private readonly agentRoleRegistryService: AgentRoleRegistryService,
    private readonly a2aSettingsService: A2ASettingsService,
    private readonly mcpServerConfigService: McpServerConfigService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
    private readonly applicationTypesService: ApplicationTypesService,
  ) {}

  async materialize(
    manifest: PackageManifest,
    lockfile: PackageLockfile,
    targetProjectDir: string,
    opts: MaterializeOptions = {},
  ): Promise<MaterializeResult> {
    const warnings: string[] = [];
    const copyIntroVideos = opts.copyIntroVideos ?? true;

    // 1. Directory scaffold + base agent config.
    await this.createProjectStructure(targetProjectDir);

    // 2. Project template — copies tree, returns .docu preview docs.
    let templatePreviewDocs: string[] = [];
    if (manifest.template?.name) {
      try {
        templatePreviewDocs = await this.applyProjectTemplate(
          targetProjectDir,
          manifest.template.name,
        );
      } catch (err: any) {
        warnings.push(`Failed to apply template '${manifest.template.name}': ${err.message}`);
      }
    }

    // 3. Mission brief and agent role.
    if (manifest.missionBrief !== undefined) {
      await this.writeMissionBrief(targetProjectDir, manifest.missionBrief);
    }
    if (manifest.agentRole) {
      try {
        await this.writeAgentRole(targetProjectDir, manifest);
      } catch (err: any) {
        warnings.push(`Failed to write agent role: ${err.message}`);
      }
    }

    // 4. Standard skills.
    try {
      const results = await this.skillsService.provisionStandardSkillsToDir(targetProjectDir);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        warnings.push(`Failed to provision ${failed.length} standard skills`);
      }
    } catch (err: any) {
      warnings.push(`Failed to provision standard skills: ${err.message}`);
    }

    // 4b. Standard subagents.
    try {
      const results = await this.subagentsService.provisionStandardSubagentsToDir(targetProjectDir);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        warnings.push(`Failed to provision ${failed.length} standard subagents`);
      }
    } catch (err: any) {
      warnings.push(`Failed to provision standard subagents: ${err.message}`);
    }

    // 5. Optional skills (user-selected non-standard).
    const optionalSkills = manifest.skills.filter((s) => s.source === 'optional');
    if (optionalSkills.length > 0) {
      try {
        const results = await this.skillsService.provisionSkillsFromRepositoryToDir(
          targetProjectDir,
          optionalSkills.map((s) => s.name),
          'optional',
        );
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          warnings.push(`Failed to provision ${failed.length} optional skills`);
        }
      } catch (err: any) {
        warnings.push(`Failed to provision optional skills: ${err.message}`);
      }
    }

    // 5b. Optional subagents (resolver expansion added bundled subagents to
    // the lockfile; the manifest itself only lists user-selected ones).
    const optionalSubagents = manifest.subagents.filter((s) => s.source === 'optional');
    if (optionalSubagents.length > 0) {
      try {
        const results = await this.subagentsService.provisionSubagentsToDir(
          targetProjectDir,
          optionalSubagents.map((s) => s.name),
          'optional',
        );
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          warnings.push(`Failed to provision ${failed.length} optional subagents`);
        }
      } catch (err: any) {
        warnings.push(`Failed to provision optional subagents: ${err.message}`);
      }
    }

    // 6. MCP servers — write .mcp.json and register in .claude/settings.json.
    if (manifest.mcpServers.length > 0) {
      try {
        const mcpServers: Record<string, any> = {};
        for (const m of manifest.mcpServers) {
          mcpServers[m.name] = m.config;
        }
        await this.mcpServerConfigService.saveMcpConfigToDir(targetProjectDir, { mcpServers });
      } catch (err: any) {
        warnings.push(`Failed to configure MCP servers: ${err.message}`);
      }
    }

    // 7. A2A agents.
    if (manifest.a2aAgents && manifest.a2aAgents.length > 0) {
      try {
        for (const agent of manifest.a2aAgents as any[]) {
          await this.a2aSettingsService.addAgent(targetProjectDir, agent);
        }
      } catch (err: any) {
        warnings.push(`Failed to configure A2A agents: ${err.message}`);
      }
    }

    // 7b. Application type (writes marker + bundled subagents).
    if (manifest.applicationType) {
      try {
        await this.applicationTypesService.applyApplicationTypeToDir(
          targetProjectDir,
          manifest.applicationType.id,
        );
      } catch (err: any) {
        warnings.push(`Failed to apply application type: ${err.message}`);
      }
    }

    // 8. Intro videos.
    if (copyIntroVideos) {
      try {
        await this.copyIntroVideos(targetProjectDir, warnings);
      } catch (err: any) {
        warnings.push(`Failed to create intro.videos: ${err.message}`);
      }
    }

    // 9. UI config.
    try {
      await this.createUIConfig(targetProjectDir, manifest, templatePreviewDocs);
    } catch (err: any) {
      warnings.push(`Failed to create UI config: ${err.message}`);
    }

    // 9b. Extra files (from "Promote project to package" flow).
    if (manifest.extraFiles?.paths?.length) {
      try {
        await this.copyExtraFiles(manifest.extraFiles, targetProjectDir, warnings);
      } catch (err: any) {
        warnings.push(`Failed to copy extra files: ${err.message}`);
      }
    }

    // 10. Guidance docs.
    const guidanceDocuments = await this.findGuidanceDocuments(targetProjectDir);

    return { warnings, templatePreviewDocs, guidanceDocuments };
  }

  private async copyExtraFiles(
    extraFiles: { sourceProject: string; paths: string[] },
    targetProjectDir: string,
    warnings: string[],
  ): Promise<void> {
    const workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';
    const sourceProjectDir = path.join(workspaceDir, extraFiles.sourceProject);
    if (!(await fs.pathExists(sourceProjectDir))) {
      warnings.push(
        `Source project '${extraFiles.sourceProject}' not found — extra files skipped.`,
      );
      return;
    }
    for (const relPath of extraFiles.paths) {
      // Guard against path traversal: refuse anything that resolves outside
      // the source project dir after normalization.
      const normalized = path.posix.normalize(relPath);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        warnings.push(`Refusing extra file with unsafe path: ${relPath}`);
        continue;
      }
      const src = path.join(sourceProjectDir, normalized);
      const dst = path.join(targetProjectDir, normalized);
      if (!(await fs.pathExists(src))) {
        warnings.push(`Extra file not found in source project: ${normalized}`);
        continue;
      }
      // Skip if destination exists (e.g. materializer already wrote it from
      // the catalog) — never overwrite catalog-derived content.
      if (await fs.pathExists(dst)) continue;
      await fs.ensureDir(path.dirname(dst));
      await fs.copy(src, dst);
    }
  }

  // ─── extracted helpers (1:1 with the original projects.service.ts) ─────

  private async createProjectStructure(projectPath: string): Promise<void> {
    await fs.ensureDir(path.join(projectPath, '.claude'));
    await fs.ensureDir(path.join(projectPath, '.claude', 'skills'));
    await fs.ensureDir(path.join(projectPath, '.etienne'));
    await fs.ensureDir(path.join(projectPath, 'data'));
    await fs.ensureDir(path.join(projectPath, 'out'));
    await fs.ensureDir(path.join(projectPath, '.attachments'));

    const activeAgent = this.codingAgentConfigService.getActiveAgentType();
    try {
      if (activeAgent === 'openai') {
        let codexConfig = await this.codingAgentConfigService.getConfigForProject('openai');
        codexConfig = codexConfig.replaceAll('{{PROJECT_PATH}}', projectPath.replace(/\\/g, '/'));
        await fs.ensureDir(path.join(projectPath, '.codex'));
        await fs.writeFile(path.join(projectPath, '.codex', 'config.toml'), codexConfig, 'utf-8');
        await fs.writeJson(
          path.join(projectPath, '.claude', 'settings.json'),
          { hooks: {}, enabledMcpjsonServers: [], allowedTools: [] },
          { spaces: 2 },
        );
      } else {
        const claudeConfig = await this.codingAgentConfigService.getConfigForProject('anthropic');
        await fs.writeFile(path.join(projectPath, '.claude', 'settings.json'), claudeConfig, 'utf-8');
      }
    } catch (error: any) {
      this.logger.warn(`Failed to write coding agent config: ${error.message}`);
      await fs.writeJson(
        path.join(projectPath, '.claude', 'settings.json'),
        { hooks: {}, enabledMcpjsonServers: [], allowedTools: [] },
        { spaces: 2 },
      );
    }

    await fs.writeJson(
      path.join(projectPath, 'data', 'permissions.json'),
      { allowedTools: [] },
      { spaces: 2 },
    );
  }

  private async writeMissionBrief(projectPath: string, missionBrief: string): Promise<void> {
    const content = `# Mission Brief\n\n${missionBrief}`.trim();
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    await fs.writeFile(path.join(projectPath, missionFileName), content, 'utf-8');
  }

  private async writeAgentRole(projectPath: string, manifest: PackageManifest): Promise<void> {
    const role = manifest.agentRole;
    if (!role) return;

    let content = '';
    if (role.type === 'registry' && role.roleId) {
      const roleContent = await this.agentRoleRegistryService.getRoleContent(role.roleId);
      if (roleContent) content = roleContent;
    } else if (role.type === 'custom' && role.customContent) {
      content = role.customContent;
    }

    if (content) {
      const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
      const missionFileName = this.codingAgentConfigService.getMissionFileName();
      await fs.ensureDir(path.join(projectPath, agentConfigDir));
      await fs.writeFile(
        path.join(projectPath, agentConfigDir, missionFileName),
        content.trim(),
        'utf-8',
      );
    }
  }

  private async applyProjectTemplate(projectPath: string, templateName: string): Promise<string[]> {
    const templateSourcePath = path.join(this.templateRepositoryDir, templateName);
    if (!(await fs.pathExists(templateSourcePath))) {
      throw new Error(`Template '${templateName}' not found`);
    }

    const previewDocs: string[] = [];

    const copyRecursive = async (srcDir: string, destDir: string): Promise<void> => {
      const entries = await fs.readdir(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        if (entry.isDirectory()) {
          const destPath = path.join(destDir, entry.name);
          await fs.ensureDir(destPath);
          await copyRecursive(srcPath, destPath);
        } else if (!entry.name.startsWith('.')) {
          if (entry.name.endsWith('.docu')) {
            const destFileName = entry.name.slice(0, -5);
            const destPath = path.join(destDir, destFileName);
            if (!(await fs.pathExists(destPath))) {
              await fs.copy(srcPath, destPath);
            }
            const relativePath = path.relative(projectPath, destPath).replace(/\\/g, '/');
            previewDocs.push(relativePath);
          } else {
            const destPath = path.join(destDir, entry.name);
            if (!(await fs.pathExists(destPath))) {
              await fs.copy(srcPath, destPath);
            }
          }
        }
      }
    };

    await copyRecursive(templateSourcePath, projectPath);
    return previewDocs;
  }

  private async copyIntroVideos(projectPath: string, warnings: string[]): Promise<void> {
    const frontendPublicDir = path.resolve(process.cwd(), '..', 'frontend', 'public');
    const introVideoFiles = ['etienne-intro-1.mp4', 'etienne-intro-2.mp4', 'etienne-intro-3.mp4'];
    const copiedVideos: string[] = [];

    for (const videoFile of introVideoFiles) {
      const videoSource = path.join(frontendPublicDir, videoFile);
      if (await fs.pathExists(videoSource)) {
        await fs.copy(videoSource, path.join(projectPath, videoFile));
        copiedVideos.push(videoFile);
      }
    }

    const introVideosContent =
      '# These videos introduce the key features of your agent\n' +
      copiedVideos.map((v) => v + '\n').join('');
    await fs.writeFile(path.join(projectPath, 'intro.videos'), introVideosContent, 'utf-8');

    if (copiedVideos.length === 0) {
      warnings.push('No intro video files found in frontend/public');
    }
  }

  private async createUIConfig(
    projectPath: string,
    manifest: PackageManifest,
    templatePreviewDocs: string[],
  ): Promise<void> {
    const etienneDir = path.join(projectPath, '.etienne');
    await fs.ensureDir(etienneDir);
    const uiConfigPath = path.join(etienneDir, 'user-interface.json');

    // When copying UI from an existing workspace project, resolve from
    // WORKSPACE_ROOT (mirrors the original projects.service behavior).
    const workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

    if (manifest.copyUIFrom) {
      const fromPath = path.join(
        workspaceDir,
        manifest.copyUIFrom,
        '.etienne',
        'user-interface.json',
      );
      if (await fs.pathExists(fromPath)) {
        const existingConfig = await fs.readJson(fromPath);
        if (manifest.agentName && existingConfig.appBar) {
          existingConfig.appBar.title = manifest.agentName;
        }
        const previewDocs: string[] = existingConfig.previewDocuments || [];
        if (!previewDocs.includes('intro.videos')) previewDocs.push('intro.videos');
        for (const doc of templatePreviewDocs) {
          if (!previewDocs.includes(doc)) previewDocs.push(doc);
        }
        existingConfig.previewDocuments = previewDocs;
        await fs.writeJson(uiConfigPath, existingConfig, { spaces: 2 });
        return;
      }
    }

    const uiConfig = {
      appBar: {
        title: manifest.agentName || 'Etienne',
        fontColor: 'white',
        backgroundColor: '#1976d2',
      },
      welcomePage: {
        message: '',
        backgroundColor: '#f5f5f5',
        quickActions: [],
        showWelcomeMessage: true,
      },
      previewDocuments: ['intro.videos', ...templatePreviewDocs],
      autoFilePreviewExtensions: [],
    };
    await fs.writeJson(uiConfigPath, uiConfig, { spaces: 2 });
  }

  private async findGuidanceDocuments(projectPath: string): Promise<string[]> {
    const guidanceDocs: string[] = [];
    try {
      const skillsDir = path.join(projectPath, '.claude', 'skills');
      if (!(await fs.pathExists(skillsDir))) return guidanceDocs;
      const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true });
      for (const entry of skillEntries) {
        if (entry.isDirectory()) {
          const guidancePath = path.join(skillsDir, entry.name, 'user-guidance.md');
          if (await fs.pathExists(guidancePath)) {
            guidanceDocs.push(`.claude/skills/${entry.name}/user-guidance.md`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to scan for guidance documents: ${err.message}`);
    }
    return guidanceDocs;
  }
}
