/**
 * Cross-document dedup for coverage rows.
 *
 * A real ~1,200-row tender restates the same clause across volumes
 * (master spec, annex, Q&A addendum). The engineer should answer once
 * and have the answer propagate. This service does the matching:
 *
 *   1. Embed each row's `ears` text (single batch via EmbeddingsService).
 *   2. Compute pairwise cosine similarity over the (small) row set.
 *   3. Single-link cluster anything above the threshold (default 0.92).
 *   4. Pick a canonical per cluster — preferred state rank
 *      (committed > reviewed > drafted > open), tie-break by id.
 *   5. Stamp `clusterId / clusterRole / clusterSize` on rows and
 *      return a parallel `clusters[]` array for the envelope.
 *
 * Pure-ish: takes rows + threshold in, returns annotated rows +
 * clusters out. Disk I/O lives in the MCP tool wrapper.
 *
 * Threshold of 0.92 is conservative for `multilingual-e5-base`
 * (the default transformers provider) — it groups paraphrases of the
 * same clause but tends NOT to group requirements with opposing
 * constraints ("voltage shall be 525 kV" vs "shall not exceed 525 kV").
 * The popover always shows members verbatim so a human eyeballs.
 */
import { Logger } from '@nestjs/common';
import { EmbeddingsService } from '../embeddings/embeddings.service';

export type ClusterRole = 'canonical' | 'duplicate';

export interface ClusterableRow {
  requirementId: string;
  ears: string;
  state?: string;
  plannedResponseSlug?: string;
  // Other fields pass through untouched.
  [k: string]: unknown;
}

export interface AnnotatedRow extends ClusterableRow {
  clusterId?: string;
  clusterRole?: ClusterRole;
  clusterSize?: number;
}

export interface ClusterRecord {
  id: string;
  canonicalRowId: string;
  memberRowIds: string[]; // includes canonical
  similarityRange: [number, number];
}

export interface ClusterResult {
  rows: AnnotatedRow[];
  clusters: ClusterRecord[];
}

// State preference for picking a canonical inside a cluster. Higher
// rank wins. Determinism matters: when two rows have the same state
// rank we tie-break on `requirementId` (alphabetic) so re-running
// dedup always produces the same canonical.
const STATE_RANK: Record<string, number> = {
  committed: 6,
  deviation: 5,
  reviewed: 4,
  clarify: 3,
  drafted: 2,
  open: 1,
};

export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(private readonly embeddings: EmbeddingsService) {}

  /**
   * Cluster rows and return annotated rows + cluster records. Rows that
   * end up in singleton clusters are NOT annotated (no clusterId set) —
   * the cockpit only renders cluster affordances when there's actual
   * dedup to surface.
   *
   * Threshold is a cosine cutoff in [0,1]. Defaults to 0.92.
   */
  async clusterRows(
    rows: ClusterableRow[],
    threshold = 0.92,
  ): Promise<ClusterResult> {
    if (rows.length === 0) return { rows: [], clusters: [] };

    // Empty / whitespace-only `ears` would embed to garbage — exclude
    // them up front so they don't drag a real cluster's similarity range
    // sideways. They pass through annotated as singletons.
    const indexed = rows.map((r, i) => ({ row: r, originalIndex: i }));
    const candidates = indexed.filter((x) => x.row.ears.trim().length > 0);
    if (candidates.length === 0) {
      return { rows: rows.map((r) => ({ ...r })), clusters: [] };
    }

    this.logger.log(`Embedding ${candidates.length} rows for clustering…`);
    const vectors = await this.embeddings.embedBatch(
      candidates.map((c) => c.row.ears),
    );

    // Single-link clustering: walk the upper triangle, union rows whose
    // pairwise cosine ≥ threshold. O(N²) — fine for the < 2 000 rows we
    // expect; for larger projects a vector-DB nearest-neighbour pass
    // would be the right replacement, but it's premature optimisation
    // until we have data showing the simple version is the bottleneck.
    const parent = new Array(candidates.length).fill(0).map((_, i) => i);
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const next = parent[x];
        parent[x] = r;
        x = next;
      }
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // We need to record similarity ranges per resulting cluster, so we
    // also collect the pairwise scores that joined them.
    const joinedPairs: Array<{ a: number; b: number; sim: number }> = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const sim = cosine(vectors[i], vectors[j]);
        if (sim >= threshold) {
          union(i, j);
          joinedPairs.push({ a: i, b: j, sim });
        }
      }
    }

    // Group candidates by root id.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < candidates.length; i++) {
      const r = find(i);
      const g = groups.get(r);
      if (g) g.push(i);
      else groups.set(r, [i]);
    }

    // Build cluster records (skip singletons — they aren't useful UX).
    const clusters: ClusterRecord[] = [];
    const annotated: AnnotatedRow[] = rows.map((r) => ({ ...r }));
    let clusterIdx = 1;
    for (const [, members] of groups) {
      if (members.length < 2) continue;
      const memberRows = members.map((m) => candidates[m].row);
      const canonical = pickCanonical(memberRows);
      const clusterId = `CL-${clusterIdx++}`;
      const memberSims = joinedPairs
        .filter((p) => members.includes(p.a) || members.includes(p.b))
        .map((p) => p.sim);
      const range: [number, number] =
        memberSims.length === 0
          ? [threshold, threshold]
          : [Math.min(...memberSims), Math.max(...memberSims)];

      // Propagate the canonical's plannedResponseSlug onto the cluster
      // record — the cockpit's "edit canonical, apply to cluster" flow
      // needs a single source of truth. We do NOT mutate the duplicates'
      // existing slugs here (that's a destructive write); the cockpit
      // surfaces both and lets the user decide.

      clusters.push({
        id: clusterId,
        canonicalRowId: canonical.requirementId,
        memberRowIds: memberRows.map((r) => r.requirementId),
        similarityRange: range,
      });

      // Annotate each row in the original output array.
      for (const m of members) {
        const original = candidates[m].originalIndex;
        annotated[original].clusterId = clusterId;
        annotated[original].clusterRole =
          candidates[m].row.requirementId === canonical.requirementId
            ? 'canonical'
            : 'duplicate';
        if (candidates[m].row.requirementId === canonical.requirementId) {
          annotated[original].clusterSize = memberRows.length;
        }
      }
    }

    this.logger.log(
      `Dedup: ${clusters.length} cluster(s) over ${rows.length} rows`,
    );
    return { rows: annotated, clusters };
  }
}

function pickCanonical(rows: ClusterableRow[]): ClusterableRow {
  const byRank = rows.slice().sort((a, b) => {
    const ra = STATE_RANK[a.state ?? 'open'] ?? 0;
    const rb = STATE_RANK[b.state ?? 'open'] ?? 0;
    if (ra !== rb) return rb - ra;
    return a.requirementId.localeCompare(b.requirementId);
  });
  return byRank[0];
}

function cosine(a: number[], b: number[]): number {
  // Embeddings from both providers are L2-normalised already, so dot
  // == cosine. Re-normalising would burn CPU for nothing. Length check
  // catches the rare provider-mismatch case explicitly.
  if (a.length !== b.length) {
    throw new Error(
      `cosine: dimension mismatch ${a.length} vs ${b.length} — different embedding providers?`,
    );
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Clamp tiny float drift outside [-1, 1].
  if (dot > 1) return 1;
  if (dot < -1) return -1;
  return dot;
}
