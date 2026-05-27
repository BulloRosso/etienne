import { SearchResult } from './rag.service';

/**
 * Reciprocal Rank Fusion (Cormack et al. 2009).
 *
 *   score(d) = Σᵢ 1 / (k + rankᵢ(d))
 *
 * Both inputs are assumed pre-sorted best-first. RRF combines two heterogeneous
 * ranked lists without needing to normalize raw scores — useful here because
 * cosine similarity (bounded ~[0,1]) and BM25 (unbounded negative-ish, as we
 * return -rank) live on incompatible scales.
 *
 * Deduplicates by SearchResult.id. When the same id appears on both sides we
 * keep the dense-side content/metadata (Chroma's `documents` field is
 * authoritative; FTS5 stores a copy).
 */
export function fuseRRF(
  dense: SearchResult[],
  sparse: SearchResult[],
  k: number = 60,
  topK: number = 5,
): SearchResult[] {
  const fused = new Map<string, { result: SearchResult; score: number }>();

  const addContribution = (
    list: SearchResult[],
    preferContent: boolean,
  ): void => {
    list.forEach((item, index) => {
      if (!item || !item.id) return;
      const rank = index + 1;
      const contribution = 1 / (k + rank);
      const existing = fused.get(item.id);
      if (existing) {
        existing.score += contribution;
        // Fill in any missing content/metadata from the other side.
        if (preferContent && item.content && !existing.result.content) {
          existing.result = { ...existing.result, content: item.content };
        }
      } else {
        fused.set(item.id, { result: item, score: contribution });
      }
    });
  };

  addContribution(dense, true);
  addContribution(sparse, false);

  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ result, score }) => ({
      ...result,
      similarity: score,
    }));
}
