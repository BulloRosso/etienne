import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { safeRoot } from '../claude/utils/path.utils';
import type {
  Classification,
  Provenance,
  WikiPage,
} from '../memory/types';
import {
  extractLinks,
  parsePage,
  type PageFrontmatter,
  type ParsedPage,
} from './frontmatter';

/**
 * Backend façade over the per-project `wiki` skill at
 * `workspace/<project>/.claude/skills/wiki/`.
 *
 * Read paths (getPage, listPages, search bucket walks): direct fs reads, since
 * the page format is stable and we want low latency for the Adaptive-Memory
 * within-task loop.
 *
 * Write paths (putPage, delete): shell out to `tsx wiki-add.ts` / `tsx
 * wiki-delete.ts` so that backlink maintenance, history-append, stub creation,
 * and tombstone handling stay in one place. Critically this guarantees that
 * pages produced by the Adaptive-Memory writeback tool are byte-identical to
 * pages produced when the agent invokes the skill directly during a session.
 *
 * The service does NOT enforce classification policy here. The Adaptive-Memory
 * writeback tool calls `enforceWriteClassification(input)` first; what reaches
 * `WikiService.putPage` is already validated.
 */
@Injectable()
export class WikiService {
  private readonly logger = new Logger(WikiService.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  // --- paths ---------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  private wikiRoot(project: string): string {
    return join(this.projectRoot(project), 'wiki');
  }

  private skillRoot(project: string): string {
    return join(this.projectRoot(project), '.claude', 'skills', 'wiki');
  }

  private bucketDir(project: string, bucket: WikiBucket): string {
    return join(this.wikiRoot(project), bucket);
  }

  private slugPath(project: string, slug: string, bucket?: WikiBucket): string | null {
    if (bucket) {
      const p = join(this.bucketDir(project, bucket), `${slug}.md`);
      return existsSync(p) ? p : null;
    }
    for (const b of WIKI_BUCKETS) {
      const p = join(this.bucketDir(project, b), `${slug}.md`);
      if (existsSync(p)) return p;
    }
    return null;
  }

  // --- public API ----------------------------------------------------------

  /**
   * Read a single page by slug. Searches `topics/`, then `sources/`, then
   * `queries/`. Returns `null` when the page does not exist or is a tombstone
   * (`status: deleted`).
   */
  async getPage(project: string, slug: string): Promise<WikiPage | null> {
    const path = this.slugPath(project, slug);
    if (!path) return null;
    const raw = await fs.readFile(path, 'utf8');
    const parsed = parsePage(raw);
    if (parsed.frontmatter.status === 'deleted') return null;
    return this.toWikiPage(slug, parsed);
  }

  /**
   * Create or update a page. Delegates to `wiki-add.ts` so dedup, backlinks,
   * stub-creation, and history-append all follow the skill's rules.
   */
  async putPage(
    project: string,
    page: PutPageInput,
  ): Promise<{ slug: string; path: string; mode: 'create' | 'update' }> {
    const scriptsDir = join(this.skillRoot(project), 'scripts');
    const wikiAdd = join(scriptsDir, 'wiki-add.ts');
    if (!existsSync(wikiAdd)) {
      throw new NotFoundException(
        `wiki skill not provisioned for project ${project} (expected ${wikiAdd})`,
      );
    }

    // wiki-add reads JSON from a file path; write a tempfile next to the script.
    const tempPath = join(
      this.projectRoot(project),
      '.etienne',
      `wiki-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    );
    await fs.mkdir(join(this.projectRoot(project), '.etienne'), {
      recursive: true,
    });
    const exists = page.slug
      ? this.slugPath(project, page.slug, page.bucket ?? 'topics') !== null
      : false;
    const mode = page.mode ?? (exists ? 'update' : 'create');

    await fs.writeFile(
      tempPath,
      JSON.stringify(
        {
          title: page.title,
          slug: page.slug,
          bucket: page.bucket ?? 'topics',
          body: page.body,
          tags: page.tags ?? [],
          status: page.status,
          confidence: page.confidence,
          mission_relevance: page.mission_relevance,
          sources: page.sources,
          mode,
          classification: page.classification,
          provenance: page.provenance,
          supersedes: page.supersedes,
          aliases: page.aliases,
        },
        null,
        2,
      ),
      'utf8',
    );

    try {
      const result = await this.runTsx(
        wikiAdd,
        ['--input', tempPath],
        this.projectRoot(project),
      );
      if (!result.ok) {
        throw new Error(`wiki-add failed: ${result.error ?? 'unknown error'}`);
      }
      return {
        slug: String(result.slug),
        path: String(result.path),
        mode: mode as 'create' | 'update',
      };
    } finally {
      // Best-effort cleanup; non-fatal if it lingers.
      fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Soft-delete via the skill's `wiki-delete.ts`. Pages are marked
   * `status: deleted` and a redirect entry is appended; the underlying file
   * remains on disk per the skill's history-append-only principle.
   */
  async deletePage(
    project: string,
    slug: string,
    opts?: { bucket?: WikiBucket; reason?: string },
  ): Promise<{ slug: string; bucket: WikiBucket; noop: boolean }> {
    const scriptsDir = join(this.skillRoot(project), 'scripts');
    const wikiDelete = join(scriptsDir, 'wiki-delete.ts');
    if (!existsSync(wikiDelete)) {
      throw new NotFoundException(
        `wiki-delete script not provisioned for project ${project} (expected ${wikiDelete})`,
      );
    }
    const bucket = opts?.bucket ?? 'topics';
    const args = ['--slug', slug, '--bucket', bucket];
    if (opts?.reason) args.push('--reason', opts.reason);

    const result = await this.runTsx(wikiDelete, args, this.projectRoot(project));
    if (!result.ok) {
      throw new Error(`wiki-delete failed: ${result.error ?? 'unknown error'}`);
    }
    return { slug, bucket, noop: Boolean(result.noop) };
  }

  /**
   * List page summaries across buckets. Filters out tombstones. Optional
   * predicates support tag / classification filtering for the cross-project
   * Settings UI and the Picker's keyword-based pull.
   */
  async listPages(
    project: string,
    filter?: { bucket?: WikiBucket; tag?: string; classification?: Classification },
  ): Promise<WikiPageSummary[]> {
    const buckets: WikiBucket[] = filter?.bucket ? [filter.bucket] : [...WIKI_BUCKETS];
    const out: WikiPageSummary[] = [];

    for (const bucket of buckets) {
      const dir = this.bucketDir(project, bucket);
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;
        const slug = entry.replace(/\.md$/, '');
        const raw = await fs.readFile(join(dir, entry), 'utf8').catch(() => '');
        if (!raw) continue;
        const parsed = parsePage(raw);
        if (parsed.frontmatter.status === 'deleted') continue;
        if (filter?.tag && !parsed.frontmatter.tags?.includes(filter.tag)) continue;
        if (
          filter?.classification &&
          (parsed.frontmatter.classification ?? 'private') !== filter.classification
        ) {
          continue;
        }
        out.push({
          slug,
          bucket,
          title: parsed.frontmatter.title ?? slug,
          status: parsed.frontmatter.status ?? 'draft',
          classification: parsed.frontmatter.classification ?? 'private',
          tags: parsed.frontmatter.tags ?? [],
          missionRelevance: parsed.frontmatter.mission_relevance ?? 0,
          lastUpdated: parsed.frontmatter.last_updated ?? '',
        });
      }
    }
    return out;
  }

  /**
   * Keyword search via the skill's `wiki-search.ts`. Returns the ranked hit
   * slugs; the caller composes follow-up `getPage` calls to fetch whole pages
   * (the Picker keeps Wiki pages whole — never splits them).
   */
  async search(
    project: string,
    keywords: string[],
    opts?: { limit?: number },
  ): Promise<Array<{ slug: string; bucket: WikiBucket; score: number }>> {
    const scriptsDir = join(this.skillRoot(project), 'scripts');
    const wikiSearch = join(scriptsDir, 'wiki-search.ts');
    if (!existsSync(wikiSearch)) {
      this.logger.warn(
        `wiki-search script not provisioned for project ${project}; returning empty`,
      );
      return [];
    }
    const query = keywords.filter(Boolean).join(' ');
    if (!query.trim()) return [];

    const args = ['--query', query];
    if (opts?.limit) args.push('--limit', String(opts.limit));

    const result = await this.runTsx(wikiSearch, args, this.projectRoot(project));
    if (!result.ok) {
      this.logger.warn(
        `wiki-search failed for project ${project}: ${result.error ?? 'unknown'}`,
      );
      return [];
    }
    const hits = Array.isArray(result.hits) ? result.hits : [];
    return hits.map((h: { slug?: unknown; path?: unknown; score?: unknown }) => ({
      slug: String(h.slug ?? ''),
      bucket: this.bucketFromPath(String(h.path ?? '')),
      score: typeof h.score === 'number' ? h.score : 0,
    }));
  }

  // --- helpers -------------------------------------------------------------

  private bucketFromPath(p: string): WikiBucket {
    for (const b of WIKI_BUCKETS) {
      if (p.includes(`${b}${'/'}`) || p.includes(`${b}${'\\'}`)) return b;
    }
    return 'topics';
  }

  private toWikiPage(slug: string, parsed: ParsedPage): WikiPage {
    const fm = parsed.frontmatter;
    return {
      id: slug,
      classification: (fm.classification as Classification | undefined) ?? 'private',
      provenance: synthesiseProvenance(fm),
      title: fm.title ?? slug,
      slug,
      body: parsed.body,
      links: extractLinks(parsed.body),
    };
  }

  /**
   * Spawn `tsx <script> ...args` from the project root and parse the JSON
   * stdout the wiki scripts always emit.
   *
   * The scripts use `process.cwd()` to resolve `wiki/`, so `cwd` must be the
   * project root. On Windows `npx` resolves to `npx.cmd`, so we go through a
   * shell to find it.
   */
  private async runTsx(
    scriptPath: string,
    args: string[],
    cwd: string,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const command = isWin ? 'npx.cmd' : 'npx';
      const child = spawn(command, ['tsx', scriptPath, ...args], {
        cwd,
        env: process.env,
        // shell:false on POSIX so user shell rc files don't run; npx.cmd handles itself.
        shell: isWin,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn(
            `tsx ${basename(scriptPath)} exited ${code}: ${stderr.trim() || stdout.trim()}`,
          );
        }
        // Even on non-zero exit, scripts emit JSON `{ok: false, error: "..."}`,
        // so try to parse and let the caller decide.
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(
            new Error(
              `tsx ${basename(scriptPath)} produced non-JSON output (exit ${code}): ${
                stderr.trim() || stdout.trim()
              }`,
            ),
          );
        }
      });
    });
  }
}

// --- types ---------------------------------------------------------------

export const WIKI_BUCKETS = ['topics', 'sources', 'queries'] as const;
export type WikiBucket = (typeof WIKI_BUCKETS)[number];

export interface PutPageInput {
  title: string;
  slug?: string;
  bucket?: WikiBucket;
  body: string;
  tags?: string[];
  status?: PageFrontmatter['status'];
  confidence?: PageFrontmatter['confidence'];
  mission_relevance?: number;
  sources: PageFrontmatter['sources'];
  classification: Classification;
  provenance: Provenance;
  supersedes?: string[];
  aliases?: string[];
  mode?: 'create' | 'update';
}

export interface WikiPageSummary {
  slug: string;
  bucket: WikiBucket;
  title: string;
  status: NonNullable<PageFrontmatter['status']>;
  classification: Classification;
  tags: string[];
  missionRelevance: number;
  lastUpdated: string;
}

/**
 * If the page lacks an explicit `provenance` block, synthesise a minimal one
 * at the boundary so PRD callers always see a well-typed Provenance. Per the
 * plan's "No data migration" stance, this is read-only — we never write the
 * synthesised value back to disk.
 */
function synthesiseProvenance(fm: PageFrontmatter): Provenance {
  const p = fm.provenance;
  const fallbackTs = fm.last_updated ?? fm.created ?? new Date(0).toISOString();
  return {
    sourceSessions: p?.sourceSessions ?? [],
    sourceEntries: p?.sourceEntries ?? [],
    createdBy: p?.createdBy ?? 'user',
    createdAt: p?.createdAt ?? fm.created ?? fallbackTs,
    updatedAt: p?.updatedAt ?? fm.last_updated ?? fallbackTs,
    inferenceTag: p?.inferenceTag,
  };
}
