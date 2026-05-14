import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import type { Classification, PersonalityEntry, Provenance } from '../../memory/types';
import { personalityAdmissionCheck } from '../../memory/classification';
import type { PersonalityCandidate } from '../../memory/types';

/**
 * PersonalityStore — Adaptive Memory's cross-project operating-principle store.
 *
 * NOT the same as PersonaManagerService's "persona identity" — that lives at
 * `workspace/.agent/personality.json` and describes the agent's outward
 * presentation. PersonalityEntries here are inferred operating principles
 * (PRD §3) that the Ponderer accumulates from high-quality sessions.
 *
 * Storage layout (all paths cross-project, under `workspace/.agent/`):
 *
 *   workspace/.agent/personality/
 *     <inferenceTag>.md          # one entry per file, body + YAML frontmatter
 *     index.json                 # fast lookup: tag → {classification, provenance, isAbstract}
 *
 * FIREWALL: this store NEVER returns secret-class entries from list/get
 * (defence-in-depth: admission was already enforced at write time; this is the
 * belt). The Picker structurally does not depend on this store at all —
 * personality only influences Skills via the Ponderer's self-edit stage.
 */
@Injectable()
export class PersonalityStore {
  private readonly logger = new Logger(PersonalityStore.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  // --- paths ---------------------------------------------------------------

  private rootDir(): string {
    return join(this.workspaceRoot, '.agent', 'personality');
  }

  private entryPath(inferenceTag: string): string {
    return join(this.rootDir(), `${this.safeFilename(inferenceTag)}.md`);
  }

  private indexPath(): string {
    return join(this.rootDir(), 'index.json');
  }

  /**
   * `tag:something` → `tag-something` for filesystem safety. Round-trippable
   * via the index file, so callers always refer to entries by `inferenceTag`,
   * never the filename.
   */
  private safeFilename(inferenceTag: string): string {
    return inferenceTag.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '');
  }

  // --- public API ----------------------------------------------------------

  /**
   * Admit-and-write. Runs the classification firewall (PRD §6.4) — secret
   * evidence → reject; private evidence requires `isAbstract`. On admission,
   * persists the entry as both a markdown file and an index entry.
   *
   * Returns the persisted PersonalityEntry on success, or a structured
   * rejection object explaining which firewall rule fired.
   */
  async admitAndWrite(
    candidate: PersonalityCandidate,
  ): Promise<
    | { admitted: true; entry: PersonalityEntry }
    | { admitted: false; reason: 'secret_evidence' | 'private_not_abstract' }
  > {
    const check = personalityAdmissionCheck(candidate);
    if (!check.admit) return { admitted: false, reason: check.reason };

    const classification = this.classificationFromAdmission(candidate);
    const provenance: Provenance = {
      sourceSessions: [...candidate.evidence],
      sourceEntries: [],
      createdBy: 'ponderer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      inferenceTag: candidate.inferenceTag,
    };
    const entry: PersonalityEntry = {
      id: candidate.inferenceTag,
      classification,
      provenance,
      principle: candidate.principle,
      context: candidate.context,
      evidence: [...candidate.evidence],
    };
    await this.persist(entry, candidate.isAbstract);
    return { admitted: true, entry };
  }

  /**
   * Read one entry by its inferenceTag id. Returns null for missing entries
   * and for any entry classified `secret` (defence-in-depth — admission
   * should already have blocked secrets, but we never trust prior validators).
   */
  async get(inferenceTag: string): Promise<PersonalityEntry | null> {
    const path = this.entryPath(inferenceTag);
    if (!existsSync(path)) return null;
    const raw = await fs.readFile(path, 'utf8');
    const parsed = this.parseFile(raw);
    if (!parsed) return null;
    if (parsed.classification === 'secret') {
      this.logger.warn(
        `Refusing to read secret-class PersonalityEntry ${inferenceTag}; admission firewall should have blocked this`,
      );
      return null;
    }
    return parsed;
  }

  /** List all admitted entries. Excludes any secret-class entry. */
  async list(): Promise<PersonalityEntry[]> {
    if (!existsSync(this.indexPath())) return [];
    let index: Record<string, IndexRecord>;
    try {
      index = JSON.parse(await fs.readFile(this.indexPath(), 'utf8'));
    } catch (err: any) {
      this.logger.warn(`Could not read personality index: ${err.message}`);
      return [];
    }
    const out: PersonalityEntry[] = [];
    for (const tag of Object.keys(index)) {
      const entry = await this.get(tag);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * Delete an entry. Used by Ponderer maintenance when feedback retires a tag.
   * Returns `noop: true` if no entry existed.
   */
  async delete(inferenceTag: string): Promise<{ noop: boolean }> {
    const path = this.entryPath(inferenceTag);
    if (!existsSync(path)) return { noop: true };
    await fs.unlink(path);
    await this.removeFromIndex(inferenceTag);
    return { noop: false };
  }

  // --- helpers ------------------------------------------------------------

  /**
   * Compute the effective classification of a candidate that has cleared
   * admission. Per the firewall, surviving candidates are either fully public
   * or private+abstract; we pick the higher of evidence classifications.
   */
  private classificationFromAdmission(c: PersonalityCandidate): Classification {
    let max: Classification = 'public';
    for (const cls of c.evidenceClassifications) {
      if (cls === 'private') max = 'private';
    }
    return max;
  }

  private async persist(entry: PersonalityEntry, isAbstract: boolean): Promise<void> {
    const dir = this.rootDir();
    await fs.mkdir(dir, { recursive: true });

    const fm = yaml
      .dump(
        {
          id: entry.id,
          classification: entry.classification,
          isAbstract,
          provenance: entry.provenance,
        },
        { lineWidth: 120, noRefs: true },
      )
      .replace(/\n+$/, '');
    const body = `# ${entry.id}\n\n## Principle\n\n${entry.principle.trim()}\n\n## Context\n\n${entry.context.trim()}\n`;
    const content = `---\n${fm}\n---\n${body}`;
    const path = this.entryPath(entry.id);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, path);
    await this.upsertIndex(entry, isAbstract);
  }

  private async upsertIndex(
    entry: PersonalityEntry,
    isAbstract: boolean,
  ): Promise<void> {
    const index = await this.readIndex();
    index[entry.id] = {
      classification: entry.classification,
      isAbstract,
      inferenceTag: entry.provenance.inferenceTag ?? entry.id,
      createdAt: entry.provenance.createdAt,
      updatedAt: entry.provenance.updatedAt,
    };
    await this.writeIndex(index);
  }

  private async removeFromIndex(tag: string): Promise<void> {
    const index = await this.readIndex();
    delete index[tag];
    await this.writeIndex(index);
  }

  private async readIndex(): Promise<Record<string, IndexRecord>> {
    if (!existsSync(this.indexPath())) return {};
    try {
      const raw = await fs.readFile(this.indexPath(), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, IndexRecord>;
      }
      return {};
    } catch (err: any) {
      this.logger.warn(`Could not read personality index: ${err.message}`);
      return {};
    }
  }

  private async writeIndex(index: Record<string, IndexRecord>): Promise<void> {
    const dir = this.rootDir();
    await fs.mkdir(dir, { recursive: true });
    const path = this.indexPath();
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
    await fs.rename(tmp, path);
  }

  private parseFile(raw: string): PersonalityEntry | null {
    const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const m = FENCE.exec(raw);
    if (!m) return null;
    let fm: Record<string, unknown>;
    try {
      const loaded = yaml.load(m[1]);
      if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return null;
      fm = loaded as Record<string, unknown>;
    } catch {
      return null;
    }
    if (typeof fm.id !== 'string' || typeof fm.classification !== 'string') return null;
    const body = m[2] ?? '';
    // Crude section split — files are written by us, so we control the layout.
    const principleMatch = /##\s+Principle\s+([\s\S]*?)(?=\n##\s|$)/.exec(body);
    const contextMatch = /##\s+Context\s+([\s\S]*?)(?=\n##\s|$)/.exec(body);
    return {
      id: fm.id,
      classification: fm.classification as Classification,
      provenance: fm.provenance as Provenance,
      principle: principleMatch?.[1]?.trim() ?? '',
      context: contextMatch?.[1]?.trim() ?? '',
      evidence: Array.isArray((fm.provenance as any)?.sourceSessions)
        ? ((fm.provenance as Provenance).sourceSessions ?? [])
        : [],
    };
  }
}

interface IndexRecord {
  classification: Classification;
  isAbstract: boolean;
  inferenceTag: string;
  createdAt: string;
  updatedAt: string;
}
