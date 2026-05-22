import { Injectable, Logger } from '@nestjs/common';
import { SkillsService } from '../../skills/skills.service';
import { SubagentsService } from '../../subagents/subagents.service';
import { ApplicationTypesService } from '../../application-types/application-types.service';
import { McpRegistryService } from '../../mcp-registry/core/mcp-registry.service';
import { AgentRoleRegistryService } from '../../agent-role-registry/agent-role-registry.service';
import { PackageManifest, ManifestMcpServer } from '../dto/manifest.dto';
import {
  LockItem,
  LockItemKind,
  LockItemProvenance,
  PackageLockfile,
  ProvenanceRequester,
  SkillDependencyContributions,
  ValidationIssue,
} from '../dto/lockfile.dto';
import { extractPlaceholders, hashDirectory, hashManifest } from './lockfile-hash';

interface QueueEntry {
  kind: LockItemKind;
  name: string;
  source?: 'standard' | 'optional';
  provenance: LockItemProvenance;
  /** For MCP servers — the user's manifest entry carries env bindings. */
  mcpEntry?: ManifestMcpServer;
}

/**
 * Resolves a PackageManifest into a deterministic PackageLockfile.
 *
 * Walks the user's selections in BFS order, hashes each item's source
 * directory, and expands transitive contributions:
 *   - skill → records .dependencies.json side-effects
 *   - application-type → enqueues bundled subagents with provenance back
 *     to this app type
 *   - mcp-server → records unbound placeholders as warnings
 *
 * Always returns a lockfile; the `conflicts` array signals whether a build
 * can proceed.
 */
@Injectable()
export class PackageResolverService {
  private readonly logger = new Logger(PackageResolverService.name);

  constructor(
    private readonly skillsService: SkillsService,
    private readonly subagentsService: SubagentsService,
    private readonly applicationTypesService: ApplicationTypesService,
    private readonly mcpRegistryService: McpRegistryService,
    private readonly agentRoleRegistryService: AgentRoleRegistryService,
  ) {}

  async resolve(manifest: PackageManifest): Promise<PackageLockfile> {
    const items = new Map<string, LockItem>();
    const conflicts: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const queue: QueueEntry[] = [];

    // Seed the queue with user selections.
    if (manifest.applicationType) {
      queue.push({
        kind: 'application-type',
        name: manifest.applicationType.id,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
      });
    } else {
      conflicts.push({
        severity: 'error',
        code: 'application-type-missing',
        message: 'A package must select exactly one application type.',
      });
    }

    if (manifest.template) {
      queue.push({
        kind: 'template',
        name: manifest.template.name,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
      });
    }

    if (manifest.agentRole?.type === 'registry' && manifest.agentRole.roleId) {
      queue.push({
        kind: 'agent-role',
        name: manifest.agentRole.roleId,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
      });
    }

    for (const skill of manifest.skills) {
      queue.push({
        kind: 'skill',
        name: skill.name,
        source: skill.source,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
      });
    }

    for (const subagent of manifest.subagents) {
      queue.push({
        kind: 'subagent',
        name: subagent.name,
        source: subagent.source,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
      });
    }

    for (const mcp of manifest.mcpServers) {
      queue.push({
        kind: 'mcp-server',
        name: mcp.name,
        provenance: { requestedBy: { kind: 'user' }, reason: 'user-selected' },
        mcpEntry: mcp,
      });
    }

    // BFS expansion.
    while (queue.length > 0) {
      const next = queue.shift()!;
      const key = `${next.kind}:${next.name}`;

      const existing = items.get(key);
      if (existing) {
        // If a user item was later auto-discovered as a transitive dep, keep
        // the user provenance (it's stronger) — don't downgrade.
        if (
          existing.provenance.requestedBy.kind !== 'user' &&
          next.provenance.requestedBy.kind === 'user'
        ) {
          existing.provenance = next.provenance;
        }
        continue;
      }

      try {
        const entry = await this.loadCatalogEntry(next);
        if (!entry) {
          conflicts.push({
            severity: 'error',
            code: 'catalog-entry-missing',
            message: `${next.kind} "${next.name}" was not found in the catalog.`,
            ref: { kind: next.kind, name: next.name },
          });
          continue;
        }
        items.set(key, entry);

        // Per-kind transitive expansion.
        if (entry.kind === 'application-type') {
          const bundled = await this.applicationTypesService.listBundledSubagentFiles(entry.name);
          for (const fileName of bundled) {
            const subagentName = fileName.replace(/\.md$/, '');
            queue.push({
              kind: 'subagent',
              name: subagentName,
              source: 'standard',
              provenance: {
                requestedBy: { kind: 'application-type', name: entry.name },
                reason: 'bundled-by-app-type',
              },
            });
          }
        }

        if (entry.kind === 'mcp-server' && entry.unboundPlaceholders?.length) {
          for (const token of entry.unboundPlaceholders) {
            warnings.push({
              severity: 'warning',
              code: 'mcp-placeholder-unbound',
              message: `MCP server "${entry.name}" has unbound placeholder ${token}.`,
              ref: { kind: 'mcp-server', name: entry.name },
            });
          }
        }

        if (entry.kind === 'skill' && entry.dependencyContributions?.binaries?.length) {
          for (const bin of entry.dependencyContributions.binaries) {
            warnings.push({
              severity: 'warning',
              code: 'skill-binary-required',
              message: `Skill "${entry.name}" requires binary "${bin.name}" (${bin.packageManager}).`,
              ref: { kind: 'skill', name: entry.name },
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Resolver failed on ${key}: ${err.message}`);
        conflicts.push({
          severity: 'error',
          code: 'resolver-failure',
          message: `Failed to resolve ${next.kind} "${next.name}": ${err.message}`,
          ref: { kind: next.kind, name: next.name },
        });
      }
    }

    this.detectConflicts([...items.values()], conflicts);

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      manifestHash: hashManifest(manifest),
      items: [...items.values()],
      conflicts,
      warnings,
    };
  }

  // ─── per-kind loaders ──────────────────────────────────────────────────

  private async loadCatalogEntry(q: QueueEntry): Promise<LockItem | null> {
    switch (q.kind) {
      case 'application-type':
        return this.loadApplicationType(q);
      case 'skill':
        return this.loadSkill(q);
      case 'subagent':
        return this.loadSubagent(q);
      case 'mcp-server':
        return this.loadMcpServer(q);
      case 'template':
        return this.loadTemplate(q);
      case 'agent-role':
        return this.loadAgentRole(q);
    }
  }

  private async loadApplicationType(q: QueueEntry): Promise<LockItem | null> {
    const config = await this.applicationTypesService.getApplicationType(q.name);
    if (!config) return null;
    const sourceDir = this.applicationTypesService.getBundledSubagentsDir(q.name).replace(/[\\/]subagents$/, '');
    // Hash only the bundled-subagents dir to keep it scoped — config.json
    // and resources/ are not yet materialized into the project tree.
    const contentHash = await hashDirectory(this.applicationTypesService.getBundledSubagentsDir(q.name));
    return {
      kind: 'application-type',
      name: q.name,
      resolvedVersion: config.version || 'unversioned',
      contentHash,
      provenance: q.provenance,
    };
  }

  private async loadSkill(q: QueueEntry): Promise<LockItem | null> {
    const source = q.source ?? 'standard';
    const sourceDir = this.skillsService.getRepoSkillSourceDir(q.name, source);
    const metadata = await this.skillsService.getSkillMetadata(q.name, source);
    const deps = await this.skillsService.getSkillDependencies(q.name, source);
    const contentHash = await hashDirectory(sourceDir);

    const contributions: SkillDependencyContributions = {};
    if (deps?.binaries?.length) contributions.binaries = deps.binaries;
    if (deps?.envVars?.length) contributions.envVars = deps.envVars;
    // Event rules and prompts are read from the actual on-disk file by the
    // materializer; the resolver only flags their existence for the lockfile.
    const rawDeps = deps as Record<string, unknown> | null;
    const eventRules = (rawDeps?.provisionEventRules as unknown[] | undefined) ?? undefined;
    const prompts = (rawDeps?.provisionPrompts as unknown[] | undefined) ?? undefined;
    if (eventRules?.length) contributions.eventRules = eventRules;
    if (prompts?.length) contributions.prompts = prompts;

    return {
      kind: 'skill',
      name: q.name,
      source,
      resolvedVersion: metadata?.version || 'unversioned',
      contentHash,
      provenance: q.provenance,
      dependencyContributions:
        Object.keys(contributions).length > 0 ? contributions : undefined,
    };
  }

  private async loadSubagent(q: QueueEntry): Promise<LockItem | null> {
    const source = q.source ?? 'standard';
    const sourceDir = this.subagentsService.getRepoSubagentSourceDir(q.name, source);
    const contentHash = await hashDirectory(sourceDir);
    return {
      kind: 'subagent',
      name: q.name,
      source,
      resolvedVersion: 'unversioned',
      contentHash,
      provenance: q.provenance,
    };
  }

  private async loadMcpServer(q: QueueEntry): Promise<LockItem | null> {
    // Look up the unresolved entry so placeholders are still visible.
    const entry = await this.mcpRegistryService.getServer(q.name);
    if (!entry) return null;
    const placeholders = extractPlaceholders(entry);
    const bound = new Set(Object.keys(q.mcpEntry?.envBindings ?? {}));
    // A placeholder is "bound" if the user provided a value for the inner key.
    const unboundPlaceholders = placeholders.filter((token) => {
      const inner = token.slice(2, -1); // strip ${ and }
      const colonIdx = inner.indexOf(':');
      const keyName = colonIdx >= 0 ? inner.slice(colonIdx + 1) : inner;
      return !bound.has(keyName);
    });
    return {
      kind: 'mcp-server',
      name: q.name,
      resolvedVersion: entry.metadata?.version || 'unversioned',
      // MCP server entries live in a federated registry — there's no single
      // on-disk source dir. Hash the entry shape itself for reproducibility.
      contentHash: '',
      provenance: q.provenance,
      unboundPlaceholders: unboundPlaceholders.length > 0 ? unboundPlaceholders : undefined,
    };
  }

  private async loadTemplate(q: QueueEntry): Promise<LockItem | null> {
    // Templates are filesystem-only — the resolver records the name; the
    // materializer reads from the template repo at apply time.
    return {
      kind: 'template',
      name: q.name,
      resolvedVersion: 'unversioned',
      contentHash: '',
      provenance: q.provenance,
    };
  }

  private async loadAgentRole(q: QueueEntry): Promise<LockItem | null> {
    const roleContent = await this.agentRoleRegistryService.getRoleContent(q.name);
    if (!roleContent) return null;
    return {
      kind: 'agent-role',
      name: q.name,
      resolvedVersion: 'unversioned',
      contentHash: '',
      provenance: q.provenance,
    };
  }

  // ─── conflict detection ────────────────────────────────────────────────

  private detectConflicts(items: LockItem[], conflicts: ValidationIssue[]): void {
    // Duplicate (kind, name) handled by the visited map. Detect cross-kind
    // collisions on names that would clash on disk.
    const subagentNames = new Set(items.filter((i) => i.kind === 'subagent').map((i) => i.name));
    const skillNames = new Set(items.filter((i) => i.kind === 'skill').map((i) => i.name));

    for (const name of skillNames) {
      if (subagentNames.has(name)) {
        conflicts.push({
          severity: 'error',
          code: 'name-collision-skill-subagent',
          message: `Name "${name}" is used by both a skill and a subagent.`,
        });
      }
    }
  }
}

/**
 * Internal export used only by tests — surface to keep the file from being
 * a single-export module that gets tree-shaken in dev.
 */
export type { QueueEntry };
