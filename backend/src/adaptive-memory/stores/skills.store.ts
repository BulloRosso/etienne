import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { safeRoot } from '../../claude/utils/path.utils';
import type {
  Classification,
  Skill,
  SkillFrontmatter,
  StoreName,
} from '../../memory/types';

/**
 * SkillsStore — Adaptive Memory's view of provisioned project skills.
 *
 * Skills are owned by SkillsService at the per-project level under
 * `<project>/.claude/skills/<name>/SKILL.md`. This store reads them, parses
 * frontmatter into the PRD SkillFrontmatter shape, and tracks two hashes:
 *
 *   - `originalHash`: hash of the file content the first time we saw the skill
 *     (i.e. as provisioned from the central repo). Persisted cross-project at
 *     `workspace/.agent/adaptive-memory/skills.state.json` so the diff against
 *     the original survives across projects that share a skill name.
 *
 *   - `currentHash`: hash of the file content at read time. Drift between the
 *     two is what the frontend Skill diff viewer surfaces and what the
 *     Ponderer's self-edit cycle compares against `originalHash` to decide
 *     whether a push-upstream is meaningful.
 *
 * The store is read-mostly. `write()` is used by the Ponderer's self-edit
 * stage to rewrite the dreaming skill body — that writes the SKILL.md file
 * and updates `currentHash`, but never touches `originalHash`.
 */
@Injectable()
export class SkillsStore {
  private readonly logger = new Logger(SkillsStore.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  // --- paths ---------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  private skillFile(project: string, name: string): string {
    return join(this.projectRoot(project), '.claude', 'skills', name, 'SKILL.md');
  }

  /** Cross-project skill state. Lives in workspace/.agent/ per the plan. */
  private statePath(): string {
    return join(
      this.workspaceRoot,
      '.agent',
      'adaptive-memory',
      'skills.state.json',
    );
  }

  // --- public API ----------------------------------------------------------

  /**
   * Read a single skill for a project. Returns `null` when the skill is not
   * provisioned. On first sight of a skill the file's content hash is recorded
   * as the `originalHash` in the cross-project state file.
   */
  async get(project: string, name: string): Promise<Skill | null> {
    const path = this.skillFile(project, name);
    if (!existsSync(path)) return null;
    const raw = await fs.readFile(path, 'utf8');
    const { frontmatter, body } = this.parseFrontmatter(raw);
    const currentHash = sha256(raw);
    const originalHash = await this.resolveOriginalHash(name, currentHash);
    return {
      id: `${project}:${name}`,
      name,
      body,
      frontmatter: this.toSkillFrontmatter(name, frontmatter),
      originalHash,
      currentHash,
    };
  }

  /** Load a set of skills by name; missing skills are silently dropped. */
  async byIds(project: string, names: string[]): Promise<Skill[]> {
    const out: Skill[] = [];
    for (const n of names) {
      const s = await this.get(project, n);
      if (s) out.push(s);
    }
    return out;
  }

  /**
   * List skill names provisioned in a project. The Picker uses this together
   * with frontmatter-matching to compute `activeSkillIds`.
   */
  async list(project: string): Promise<string[]> {
    const dir = join(this.projectRoot(project), '.claude', 'skills');
    if (!existsSync(dir)) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .filter((e) => existsSync(join(dir, e.name, 'SKILL.md')))
      .map((e) => e.name);
  }

  /**
   * Overwrite a skill body. Frontmatter is re-emitted from `skill.frontmatter`
   * (preserving its order is not critical — the wiki-skill convention is the
   * canonical schema, and other skills don't have stable frontmatter layouts).
   *
   * Updates `currentHash` and preserves `originalHash`.
   */
  async write(project: string, skill: Skill): Promise<Skill> {
    const path = this.skillFile(project, skill.name);
    if (!existsSync(path)) {
      throw new Error(`skill not provisioned for ${project}: ${skill.name}`);
    }
    const content = renderSkillFile(skill);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, path);
    const currentHash = sha256(content);
    await this.persistHashes(skill.name, {
      originalHash: skill.originalHash,
      currentHash,
    });
    return { ...skill, currentHash };
  }

  /**
   * Force-recompute `originalHash` for a skill — used after a fresh provision
   * from the central repo to reset the diff baseline.
   */
  async resetOriginalHash(project: string, name: string): Promise<void> {
    const path = this.skillFile(project, name);
    if (!existsSync(path)) return;
    const raw = await fs.readFile(path, 'utf8');
    const hash = sha256(raw);
    await this.persistHashes(name, { originalHash: hash, currentHash: hash });
  }

  // --- helpers ------------------------------------------------------------

  private parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
    const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const m = FENCE.exec(raw);
    if (!m) return { frontmatter: {}, body: raw };
    let parsed: unknown;
    try {
      parsed = yaml.load(m[1]);
    } catch (err: any) {
      this.logger.warn(`Could not parse frontmatter: ${err.message}`);
      return { frontmatter: {}, body: m[2] ?? '' };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { frontmatter: parsed as Record<string, unknown>, body: m[2] ?? '' };
    }
    return { frontmatter: {}, body: m[2] ?? '' };
  }

  /**
   * Coerce arbitrary skill frontmatter into PRD SkillFrontmatter shape with
   * sensible defaults. Skills predate the PRD so most won't have
   * `sourcePriorities` or `classificationContext` set — defaults are
   * conservative (private ceiling, empty priority list).
   */
  private toSkillFrontmatter(
    name: string,
    fm: Record<string, unknown>,
  ): SkillFrontmatter {
    const description =
      typeof fm.description === 'string' ? fm.description : `Skill: ${name}`;
    const sourcePriorities = Array.isArray(fm.sourcePriorities)
      ? (fm.sourcePriorities as Array<{ store: StoreName; priority: number }>).filter(
          (p) =>
            p &&
            typeof p === 'object' &&
            typeof (p as any).store === 'string' &&
            typeof (p as any).priority === 'number',
        )
      : [];
    const classificationContext = isClassification(fm.classificationContext)
      ? fm.classificationContext
      : 'private';
    const invocationTriggers = Array.isArray(fm.invocationTriggers)
      ? (fm.invocationTriggers as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [];
    const baselineTurns =
      typeof fm.baselineTurns === 'number' ? fm.baselineTurns : undefined;
    const out: SkillFrontmatter = {
      description,
      sourcePriorities,
      classificationContext,
      invocationTriggers,
    };
    if (baselineTurns !== undefined) out.baselineTurns = baselineTurns;
    return out;
  }

  /**
   * Cross-project hash state. `{name: {originalHash, currentHash}}` keyed by
   * skill name (NOT name+project — skills are identified globally per the plan).
   */
  private async readState(): Promise<Record<string, { originalHash: string; currentHash: string }>> {
    const path = this.statePath();
    if (!existsSync(path)) return {};
    try {
      const raw = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, { originalHash: string; currentHash: string }>;
      }
      return {};
    } catch (err: any) {
      this.logger.warn(`Could not read skills state: ${err.message}`);
      return {};
    }
  }

  private async persistHashes(
    name: string,
    hashes: { originalHash: string; currentHash: string },
  ): Promise<void> {
    const path = this.statePath();
    await fs.mkdir(join(this.workspaceRoot, '.agent', 'adaptive-memory'), {
      recursive: true,
    });
    const state = await this.readState();
    state[name] = hashes;
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, path);
  }

  /**
   * On first sight of a skill, record its current hash as the original.
   * Subsequent calls return the persisted original.
   */
  private async resolveOriginalHash(name: string, currentHash: string): Promise<string> {
    const state = await this.readState();
    if (state[name]?.originalHash) return state[name].originalHash;
    await this.persistHashes(name, { originalHash: currentHash, currentHash });
    return currentHash;
  }
}

// --- module-private helpers ----------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isClassification(v: unknown): v is Classification {
  return v === 'public' || v === 'private' || v === 'secret';
}

/**
 * Serialise a Skill back to SKILL.md. We re-emit frontmatter with js-yaml's
 * default block style; downstream consumers (the agent, wiki scripts) don't
 * depend on key order, so this is fine.
 */
function renderSkillFile(skill: Skill): string {
  const fmObj: Record<string, unknown> = {
    description: skill.frontmatter.description,
    invocationTriggers: skill.frontmatter.invocationTriggers,
    classificationContext: skill.frontmatter.classificationContext,
  };
  if (skill.frontmatter.sourcePriorities.length > 0) {
    fmObj.sourcePriorities = skill.frontmatter.sourcePriorities;
  }
  if (skill.frontmatter.baselineTurns !== undefined) {
    fmObj.baselineTurns = skill.frontmatter.baselineTurns;
  }
  const fmStr = yaml.dump(fmObj, { lineWidth: 120, noRefs: true });
  // Strip the trailing newline yaml.dump appends so the fence is tight.
  const trimmed = fmStr.replace(/\n+$/, '');
  const body = skill.body.endsWith('\n') ? skill.body : skill.body + '\n';
  return `---\n${trimmed}\n---\n${body}`;
}
