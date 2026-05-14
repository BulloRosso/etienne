/**
 * Bridge between the legacy DreamItem verdict ('good' | 'bad' | 'deepen') used by
 * existing dreaming UI and the PRD ReviewVerdict ('pending' | 'good' | 'badly_reasoned'
 * | 'unusable').
 *
 * Two directions, intentionally asymmetric:
 *   toReviewVerdict()    legacy → PRD     for surfacing dreaming feedback as ReviewItems
 *   toLegacyVerdict()    PRD    → legacy  for keeping the existing dream-file flow alive
 *
 * Note: 'deepen' has no PRD analogue — it is preserved as-is in the union and only
 * surfaces on legacy strategy-mining items. 'pending' (PRD) has no legacy analogue —
 * legacy items are written with a concrete verdict and never carry a pending state.
 */

import type { ReviewVerdict } from './types';

export type LegacyVerdict = 'good' | 'bad' | 'deepen';

/**
 * Wire-format verdict accepted by the existing dreaming feedback endpoints and by the
 * new ReviewItem endpoints. A superset of both. Persisted as-is in JSONL.
 */
export type DreamVerdict = LegacyVerdict | 'badly_reasoned' | 'unusable' | 'pending';

const VALID_VERDICTS: ReadonlySet<DreamVerdict> = new Set<DreamVerdict>([
  'good',
  'bad',
  'deepen',
  'badly_reasoned',
  'unusable',
  'pending',
]);

export function isLegacyVerdict(v: DreamVerdict): v is LegacyVerdict {
  return v === 'good' || v === 'bad' || v === 'deepen';
}

export function isReviewVerdict(v: DreamVerdict): v is ReviewVerdict {
  return v === 'pending' || v === 'good' || v === 'badly_reasoned' || v === 'unusable';
}

export function isDreamVerdict(v: unknown): v is DreamVerdict {
  return typeof v === 'string' && VALID_VERDICTS.has(v as DreamVerdict);
}

/**
 * Map a legacy verdict onto the PRD ReviewVerdict space.
 *
 *   good   → good
 *   bad    → badly_reasoned   (closest semantic match)
 *   deepen → pending          (deepen says "not done yet"; pending is the PRD's "not yet decided")
 */
export function toReviewVerdict(v: DreamVerdict): ReviewVerdict {
  switch (v) {
    case 'good': return 'good';
    case 'bad': return 'badly_reasoned';
    case 'badly_reasoned': return 'badly_reasoned';
    case 'unusable': return 'unusable';
    case 'pending': return 'pending';
    case 'deepen': return 'pending';
  }
}

/**
 * Map a PRD verdict back onto the legacy union for endpoints that still emit
 * legacy-shape DreamItems.
 *
 *   pending        → deepen  (no exact match; deepen means "needs more work" too)
 *   good           → good
 *   badly_reasoned → bad
 *   unusable       → bad     (no separate legacy bucket; unusable items are treated as bad)
 */
export function toLegacyVerdict(v: ReviewVerdict): LegacyVerdict {
  switch (v) {
    case 'good': return 'good';
    case 'badly_reasoned': return 'bad';
    case 'unusable': return 'bad';
    case 'pending': return 'deepen';
  }
}
