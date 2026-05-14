import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { safeRoot } from '../../claude/utils/path.utils';
import type { ReviewItem, ReviewVerdict } from '../../memory/types';

/**
 * ReviewQueueStore — per-project JSONL with tombstones, plus a cross-project
 * cycle index for the Settings UI.
 *
 * Storage:
 *   workspace/<project>/.etienne/adaptive-memory/review-queue.jsonl
 *     append-only event log:
 *       {"op": "publish", "item": <ReviewItem>}
 *       {"op": "verdict", "itemId": "...", "verdict": "good"|"badly_reasoned"|"unusable"|"pending"}
 *     Replayed on read; latest verdict wins. Append-only means a file
 *     truncate never silently loses history.
 *
 *   workspace/<project>/.etienne/adaptive-memory/review-queue.index.json
 *     {cycleId → [itemId, ...]} for fast list-by-cycle.
 *
 *   workspace/.agent/adaptive-memory/cycles.json
 *     cross-project summary:
 *       {[project]: [{cycleId, publishedAt, itemCount, verdicts: {good,...}}]}
 *     Lets the cross-project Settings UI render a timeline of recent cycles
 *     without scanning every project's .etienne dir.
 *
 * Concurrency: same per-project lock pattern used elsewhere in the repo
 * (in-process serialization keyed by project name). JSONL append is atomic
 * enough on a single process; the lock prevents read-modify-write races on
 * the index files.
 */
@Injectable()
export class ReviewQueueStore {
  private readonly logger = new Logger(ReviewQueueStore.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  /** Per-project write locks. */
  private writeLocks = new Map<string, Promise<void>>();

  // --- paths ---------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  private dirFor(project: string): string {
    return join(this.projectRoot(project), '.etienne', 'adaptive-memory');
  }

  jsonlPath(project: string): string {
    return join(this.dirFor(project), 'review-queue.jsonl');
  }

  indexPath(project: string): string {
    return join(this.dirFor(project), 'review-queue.index.json');
  }

  cyclesPath(): string {
    return join(this.workspaceRoot, '.agent', 'adaptive-memory', 'cycles.json');
  }

  // --- public API ----------------------------------------------------------

  /**
   * Append a `publish` op for each item; bulk operation under one lock so the
   * cycle index is consistent. Items in the same call must share `cycleId`.
   */
  async publish(project: string, items: ReviewItem[]): Promise<{ published: number; cycleId: string | null }> {
    if (items.length === 0) return { published: 0, cycleId: null };
    const cycleId = items[0].cycleId;
    for (const it of items) {
      if (it.cycleId !== cycleId) {
        throw new Error(`publish() received items with mixed cycleIds: ${cycleId} vs ${it.cycleId}`);
      }
    }
    return this.withLock(project, async () => {
      await fs.mkdir(this.dirFor(project), { recursive: true });
      const lines = items.map((item) =>
        JSON.stringify({ op: 'publish', item }) + '\n',
      );
      await fs.appendFile(this.jsonlPath(project), lines.join(''), 'utf8');
      await this.appendToIndex(project, cycleId, items.map((i) => i.id));
      await this.appendCycleSummary(project, cycleId, items);
      return { published: items.length, cycleId };
    });
  }

  /**
   * Record a verdict on an item. Appended as a tombstone event; readers
   * replay all events to compute the latest state.
   */
  async setVerdict(
    project: string,
    itemId: string,
    verdict: ReviewVerdict,
  ): Promise<void> {
    await this.withLock(project, async () => {
      await fs.mkdir(this.dirFor(project), { recursive: true });
      await fs.appendFile(
        this.jsonlPath(project),
        JSON.stringify({ op: 'verdict', itemId, verdict }) + '\n',
        'utf8',
      );
      // Update the cross-project cycle summary's verdict tally lazily — we
      // recompute from scratch when we know the cycle that owns this item.
      const owningCycle = await this.cycleOfItem(project, itemId);
      if (owningCycle) {
        const items = await this.readByCycle(project, owningCycle);
        await this.updateCycleSummary(project, owningCycle, items);
      }
    });
  }

  /**
   * Read all items for a project, applying the latest verdict per item.
   * Returns items in publish order.
   */
  async listByProject(project: string): Promise<ReviewItem[]> {
    const events = await this.readEvents(project);
    return this.applyVerdicts(events);
  }

  /** Read items for a specific cycle. */
  async readByCycle(project: string, cycleId: string): Promise<ReviewItem[]> {
    const all = await this.listByProject(project);
    return all.filter((it) => it.cycleId === cycleId);
  }

  /**
   * Read items whose status is `pending` and that have not been seen in
   * subsequent verdict feedback for the project. Used by the Ponderer's
   * self-edit stage as "unappliedFeedback".
   */
  async pending(project: string): Promise<ReviewItem[]> {
    const all = await this.listByProject(project);
    return all.filter((it) => it.status === 'pending');
  }

  /** Cross-project cycle summary for the Settings UI. */
  async cyclesSummary(): Promise<CyclesSummary> {
    if (!existsSync(this.cyclesPath())) return {};
    try {
      const raw = await fs.readFile(this.cyclesPath(), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as CyclesSummary;
      }
      return {};
    } catch (err: any) {
      this.logger.warn(`Could not read cycles summary: ${err.message}`);
      return {};
    }
  }

  // --- helpers -------------------------------------------------------------

  private async withLock<T>(project: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(project) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    this.writeLocks.set(project, next);
    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  }

  private async readEvents(project: string): Promise<JSONLEvent[]> {
    const path = this.jsonlPath(project);
    if (!existsSync(path)) return [];
    const raw = await fs.readFile(path, 'utf8');
    const events: JSONLEvent[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // Skip malformed lines; never let corruption block reads.
      }
    }
    return events;
  }

  private applyVerdicts(events: JSONLEvent[]): ReviewItem[] {
    const byId = new Map<string, ReviewItem>();
    const order: string[] = [];
    for (const ev of events) {
      if (ev.op === 'publish') {
        if (!byId.has(ev.item.id)) order.push(ev.item.id);
        byId.set(ev.item.id, { ...ev.item });
      } else if (ev.op === 'verdict') {
        const cur = byId.get(ev.itemId);
        if (cur) cur.status = ev.verdict;
      }
    }
    return order.map((id) => byId.get(id)!).filter(Boolean);
  }

  private async cycleOfItem(project: string, itemId: string): Promise<string | null> {
    const items = await this.listByProject(project);
    const found = items.find((it) => it.id === itemId);
    return found?.cycleId ?? null;
  }

  // --- per-project index ---------------------------------------------------

  private async appendToIndex(
    project: string,
    cycleId: string,
    itemIds: string[],
  ): Promise<void> {
    const path = this.indexPath(project);
    let index: Record<string, string[]> = {};
    if (existsSync(path)) {
      try {
        index = JSON.parse(await fs.readFile(path, 'utf8'));
      } catch {
        index = {};
      }
    }
    index[cycleId] = [...(index[cycleId] ?? []), ...itemIds];
    await atomicWriteJson(path, index);
  }

  // --- cross-project summary ----------------------------------------------

  private async appendCycleSummary(
    project: string,
    cycleId: string,
    items: ReviewItem[],
  ): Promise<void> {
    await this.updateCycleSummary(project, cycleId, items);
  }

  private async updateCycleSummary(
    project: string,
    cycleId: string,
    items: ReviewItem[],
  ): Promise<void> {
    const dir = join(this.workspaceRoot, '.agent', 'adaptive-memory');
    await fs.mkdir(dir, { recursive: true });
    const path = this.cyclesPath();
    let summary: CyclesSummary = {};
    if (existsSync(path)) {
      try {
        summary = JSON.parse(await fs.readFile(path, 'utf8'));
      } catch {
        summary = {};
      }
    }
    const verdicts: Record<ReviewVerdict, number> = {
      pending: 0,
      good: 0,
      badly_reasoned: 0,
      unusable: 0,
    };
    for (const it of items) verdicts[it.status] += 1;

    const projectEntries = (summary[project] ?? []).filter((c) => c.cycleId !== cycleId);
    projectEntries.push({
      cycleId,
      publishedAt: items[0]?.provenance.createdAt ?? new Date().toISOString(),
      itemCount: items.length,
      verdicts,
    });
    summary[project] = projectEntries.sort((a, b) =>
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
    );
    await atomicWriteJson(path, summary);
  }
}

// --- types ---------------------------------------------------------------

type JSONLEvent =
  | { op: 'publish'; item: ReviewItem }
  | { op: 'verdict'; itemId: string; verdict: ReviewVerdict };

export interface CycleSummary {
  cycleId: string;
  publishedAt: string;
  itemCount: number;
  verdicts: Record<ReviewVerdict, number>;
}

export type CyclesSummary = Record<string /* project */, CycleSummary[]>;

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, path);
}
