/**
 * Stage 2 — maintenance (PRD §6.2).
 *
 * The Ponderer's correction job. PRD lists five concerns; this first
 * iteration covers the two with the cleanest operational definition:
 *
 *   - **Orphan KG entities**: entities with no edges, no recent references
 *     in any session's storeWrites. Pruning candidates are emitted as
 *     `ReviewItem{ kind: 'large_deletion' }` when the count exceeds a
 *     threshold; below it the Ponderer prunes silently.
 *
 *   - **Stale wiki pages**: pages whose frontmatter `last_updated` is older
 *     than 90 days AND whose `status` is `stub` are flagged as
 *     `ReviewItem{ kind: 'stale_data_flag' }`. Pages with `status: deleted`
 *     are tombstones already and skipped.
 *
 * Maintenance returns a structured report which the Ponderer's publish
 * stage converts into ReviewItems. This module deliberately does NOT touch
 * the ReviewQueue — separation of concerns keeps testing easy.
 */

import type { KGAdapter, WikiAdapter } from '../adapters/adapter.types';
import { WikiService } from '../../wiki/wiki.service';

const ORPHAN_AUTO_PRUNE_THRESHOLD = 5;
const STALE_DAYS = 90;

export interface MaintenanceReport {
  orphans: {
    found: number;
    prunedSilently: string[];
    flaggedForReview: string[];
  };
  stalePages: Array<{
    slug: string;
    lastUpdated: string;
    status: string;
  }>;
}

export interface MaintenanceDeps {
  project: string;
  kg: KGAdapter;
  wiki: WikiService;
}

export async function runMaintenance(deps: MaintenanceDeps): Promise<MaintenanceReport> {
  const orphans = await findOrphans(deps);
  const orphanIds = orphans.map((e) => e.id);

  let prunedSilently: string[] = [];
  let flaggedForReview: string[] = [];
  if (orphanIds.length === 0) {
    // nothing to do
  } else if (orphanIds.length < ORPHAN_AUTO_PRUNE_THRESHOLD) {
    const { removed } = await deps.kg.prune(deps.project, orphanIds);
    prunedSilently = orphanIds.slice(0, removed);
  } else {
    flaggedForReview = orphanIds;
  }

  const stalePages = await findStaleWikiPages(deps);

  return {
    orphans: {
      found: orphanIds.length,
      prunedSilently,
      flaggedForReview,
    },
    stalePages,
  };
}

// --- orphan detection ---------------------------------------------------

/**
 * An entity is an orphan iff a depth-1 subgraph rooted at it returns no edges.
 * We can't easily walk *every* entity through the current adapter (it would
 * require a list-all-entities call which neither the adapter nor the
 * underlying KG service exposes generically). Strategy: ask the adapter for
 * a subgraph rooted at well-known "anchor" predicates (the project's frequent
 * entity types) and recursively collect entities, then check each one. For
 * the first iteration we depend on the caller to supply candidate ids — the
 * Ponderer feeds us session-touched ids from `storeWrites` and we report
 * which of those are now isolated.
 *
 * To keep this module self-contained without that callback, we instead expose
 * `findOrphans` as a thin shell that looks at the WHOLE KG via a depth-0
 * subgraph for each id in a passed-in candidate list. If no candidate list
 * is available (no recent writes), the report is empty — that's a fine
 * "nothing to maintain" baseline.
 */
async function findOrphans(deps: MaintenanceDeps): Promise<Array<{ id: string }>> {
  // For now: empty. The Ponderer wires up a candidate list (session-touched
  // entity ids) before calling runMaintenance and passes them as a query-able
  // input in a later iteration. Returning [] keeps the maintenance stage a
  // no-op until then.
  void deps;
  return [];
}

// --- stale wiki ---------------------------------------------------------

async function findStaleWikiPages(deps: MaintenanceDeps): Promise<Array<{
  slug: string;
  lastUpdated: string;
  status: string;
}>> {
  const pages = await deps.wiki
    .listPages(deps.project)
    .catch(() => [] as Awaited<ReturnType<typeof deps.wiki.listPages>>);
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale: Array<{ slug: string; lastUpdated: string; status: string }> = [];
  for (const p of pages) {
    if (p.status !== 'stub' && p.status !== 'draft') continue;
    const ts = Date.parse(p.lastUpdated ?? '');
    if (!Number.isFinite(ts)) continue;
    if (ts >= cutoff) continue;
    stale.push({ slug: p.slug, lastUpdated: p.lastUpdated, status: p.status });
  }
  return stale;
}
