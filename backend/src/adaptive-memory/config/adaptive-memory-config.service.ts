import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { safeRoot } from '../../claude/utils/path.utils';

/**
 * Adaptive Memory configuration with two-layer merge and file-existence activation.
 *
 * Layers:
 *   1. workspace/.agent/adaptive-memory/config.defaults.json   (cross-project; optional)
 *   2. workspace/<project>/.etienne/adaptive-memory.config.json (per-project; *required for activation*)
 *
 * Activation rule: a project is active iff its per-project config file exists.
 * No file → `isActive(project)` returns false, the Ponderer cron is not
 * registered, and the within-task controller returns 409 adaptive_memory_inactive.
 * `POST /api/adaptive-memory/:project/settings` is the activation gesture
 * (creates the file); `DELETE` deactivates (removes the file).
 */

export const AdaptiveMemoryConfigSchema = z.object({
  projectId: z.string().optional(),
  wikiBaseUrl: z.string().optional(),
  kgSparqlEndpoint: z.string().optional(),
  ragServiceUrl: z.string().optional(),
  mcpConnectors: z.array(z.string()).default([]),
  skillsRepo: z.string().default('skill-repository'),
  ponderer: z
    .object({
      schedule: z.string().default('0 22 * * *'),
      timeZone: z.string().default('UTC'),
      qualityThresholdForInduction: z.number().min(0).max(1).default(0.7),
      maxReviewItemsPerCycle: z.number().int().positive().default(25),
    })
    .default({}),
  classificationPolicy: z
    .object({
      defaultForAgentWrites: z.enum(['public', 'private', 'secret']).default('private'),
      secretSorTags: z.array(z.string()).default([]),
    })
    .default({}),
  tokenBudget: z.number().int().positive().default(100_000),
});

export type AdaptiveMemoryConfig = z.infer<typeof AdaptiveMemoryConfigSchema>;

/** Baked-in defaults applied when neither layer 1 nor layer 2 supplies a field. */
export const BAKED_IN_DEFAULTS: AdaptiveMemoryConfig =
  AdaptiveMemoryConfigSchema.parse({});

@Injectable()
export class AdaptiveMemoryConfigService {
  private readonly logger = new Logger(AdaptiveMemoryConfigService.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  // --- paths ---------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  /** Per-project config file. Its existence is the activation switch. */
  configPath(project: string): string {
    return join(this.projectRoot(project), '.etienne', 'adaptive-memory.config.json');
  }

  /** Cross-project defaults file (optional). */
  defaultsPath(): string {
    return join(this.workspaceRoot, '.agent', 'adaptive-memory', 'config.defaults.json');
  }

  // --- activation ----------------------------------------------------------

  /**
   * The load-bearing gate. Returns `true` iff a per-project config file
   * exists at the canonical path. Cron registration, within-task interception,
   * Ponderer runs, and writes to `workspace/.agent/personality/` are all
   * predicated on this.
   */
  isActive(project: string): boolean {
    try {
      return existsSync(this.configPath(project));
    } catch {
      return false;
    }
  }

  /** List opted-in projects by scanning the workspace for per-project config files. */
  async listActiveProjects(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.workspaceRoot);
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      try {
        const stat = await fs.stat(join(this.workspaceRoot, entry));
        if (!stat.isDirectory()) continue;
        if (this.isActive(entry)) out.push(entry);
      } catch {
        /* skip */
      }
    }
    return out;
  }

  // --- read ---------------------------------------------------------------

  /**
   * Merged config: BAKED_IN_DEFAULTS ← workspace/.agent/.../config.defaults.json ←
   * per-project file. Throws if the project is not opted in.
   */
  async get(project: string): Promise<AdaptiveMemoryConfig> {
    if (!this.isActive(project)) {
      throw new Error(`adaptive_memory_inactive: ${project}`);
    }
    const defaults = await this.readJsonIfExists(this.defaultsPath());
    const perProject = await this.readJsonIfExists(this.configPath(project));
    const merged = deepMerge(deepMerge(BAKED_IN_DEFAULTS, defaults ?? {}), perProject ?? {});
    // Re-validate the merged shape so callers see a fully-defaulted object.
    return AdaptiveMemoryConfigSchema.parse({ ...merged, projectId: project });
  }

  /**
   * Read-without-activation: same merge as `get` but returns `null` instead
   * of throwing when the project is not opted in. Used by the Settings UI to
   * preview what a config would look like if activated.
   */
  async peek(project: string): Promise<AdaptiveMemoryConfig | null> {
    if (!this.isActive(project)) return null;
    return this.get(project);
  }

  // --- write --------------------------------------------------------------

  /**
   * Save (or create) the per-project config. Creating the file activates the
   * module for this project; callers are responsible for re-registering the
   * Ponderer cron afterward.
   *
   * IMPORTANT: stores only the *sparse* layer — fields the caller explicitly
   * supplied or that already existed in the per-project file. Defaults are
   * NOT materialised into the per-project layer, so they can fall through to
   * workspace defaults on read. The returned object is the fully-merged view
   * as a courtesy to callers; only the sparse layer hits disk.
   */
  async save(
    project: string,
    incoming: Partial<AdaptiveMemoryConfig>,
  ): Promise<AdaptiveMemoryConfig> {
    const dir = join(this.projectRoot(project), '.etienne');
    await fs.mkdir(dir, { recursive: true });
    const existing = this.isActive(project)
      ? await this.readJsonIfExists(this.configPath(project))
      : {};
    const sparseMerged = deepMerge(existing ?? {}, incoming as Record<string, unknown>);
    // Validate the *fully-merged* shape so we catch invalid values now, but
    // persist only the sparse layer.
    AdaptiveMemoryConfigSchema.parse(
      deepMerge(BAKED_IN_DEFAULTS, sparseMerged),
    );
    await this.atomicWriteJson(this.configPath(project), sparseMerged);
    this.logger.log(`Adaptive Memory config saved for ${project} (active)`);
    return this.get(project);
  }

  /**
   * Deactivate the module for a project by deleting its per-project config
   * file. Callers should unregister the Ponderer cron afterward.
   */
  async deactivate(project: string): Promise<{ deactivated: boolean }> {
    const path = this.configPath(project);
    if (!existsSync(path)) return { deactivated: false };
    await fs.unlink(path);
    this.logger.log(`Adaptive Memory deactivated for ${project}`);
    return { deactivated: true };
  }

  // --- defaults file ------------------------------------------------------

  async getDefaults(): Promise<AdaptiveMemoryConfig> {
    const defaults = await this.readJsonIfExists(this.defaultsPath());
    return AdaptiveMemoryConfigSchema.parse(
      deepMerge(BAKED_IN_DEFAULTS, defaults ?? {}),
    );
  }

  async saveDefaults(
    incoming: Partial<AdaptiveMemoryConfig>,
  ): Promise<AdaptiveMemoryConfig> {
    const dir = join(this.workspaceRoot, '.agent', 'adaptive-memory');
    await fs.mkdir(dir, { recursive: true });
    const existing = await this.readJsonIfExists(this.defaultsPath());
    const merged = deepMerge(existing ?? {}, incoming);
    const validated = AdaptiveMemoryConfigSchema.parse(merged);
    await this.atomicWriteJson(this.defaultsPath(), validated);
    return validated;
  }

  // --- helpers ------------------------------------------------------------

  private async readJsonIfExists(path: string): Promise<Record<string, unknown> | null> {
    if (!existsSync(path)) return null;
    try {
      const raw = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`Could not read ${path}: ${err.message}`);
      return null;
    }
  }

  private async atomicWriteJson(path: string, value: unknown): Promise<void> {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, path);
  }
}

/**
 * Deep-merge two plain-object configs. Arrays in `b` replace arrays in `a`
 * (no concatenation — that surprises users when they think they're overriding).
 * Non-object values in `b` win.
 */
function deepMerge<T extends Record<string, unknown>>(a: T, b: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...a };
  for (const [key, val] of Object.entries(b)) {
    if (val === undefined) continue;
    const cur = out[key];
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      cur &&
      typeof cur === 'object' &&
      !Array.isArray(cur)
    ) {
      out[key] = deepMerge(cur as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out as T;
}
