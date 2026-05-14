/**
 * Classification firewall (PRD §9).
 *
 * Pure module — no NestJS, no DI, no I/O. Consumed at five enforcement points:
 *   1. Write-time (writeback tools)        → enforceWriteClassification
 *   2. Pack-time (Packer)                  → applyClassificationCeiling + strictestCeiling
 *   3. Personality admission (Ponderer)    → personalityAdmissionCheck
 *   4. Personality access (Picker)         → enforced structurally; this module exposes
 *                                            assertNoPersonalityDep for the structural test
 *   5. RAG query-time (RAGAdapter)         → callers compose with classificationFilter
 *
 * Classification levels: public < private < secret.
 */

import type {
  CandidateContext,
  Classification,
  KGEdge,
  KGEntity,
  PersonalityCandidate,
  RAGFragment,
  Skill,
  WikiPage,
} from './types';

const RANK: Record<Classification, number> = { public: 0, private: 1, secret: 2 };

export class ClassificationViolation extends Error {
  readonly code: string;
  readonly detail: unknown;
  constructor(code: string, detail?: unknown) {
    super(code);
    this.name = 'ClassificationViolation';
    this.code = code;
    this.detail = detail;
  }
}

/** Returns the higher classification of `a` and `b`. */
export function maxClassification(a: Classification, b: Classification): Classification {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Reduce a list of classified entries to their maximum (defaults to 'public' when empty). */
export function reduceMax(
  entries: ReadonlyArray<{ classification: Classification }>,
): Classification {
  return entries.reduce<Classification>(
    (acc, e) => maxClassification(acc, e.classification),
    'public',
  );
}

/**
 * The strictest ceiling across a set of active skills.
 *
 * "Strictest" = lowest classificationContext, since classificationContext is an
 * *upper bound* for entries pulled while the skill is active. Multiple active
 * skills mean every entry must satisfy each ceiling, so the lowest wins.
 *
 * Empty input → 'secret' (the loosest ceiling), since with no skill the firewall
 * has no opinion. Callers in practice always have at least one active skill.
 */
export function strictestCeiling(skills: ReadonlyArray<Skill>): Classification {
  if (skills.length === 0) return 'secret';
  return skills.reduce<Classification>((acc, s) => {
    const ceiling = s.frontmatter.classificationContext;
    return RANK[ceiling] < RANK[acc] ? ceiling : acc;
  }, 'secret');
}

/**
 * Writeback-time check (firewall point 1). Throws on missing or invalid classification.
 *
 * Use at the top of every writeback tool handler:
 *   handler: async (input) => { enforceWriteClassification(input); ... }
 */
export function enforceWriteClassification(
  input: { classification?: unknown } & Record<string, unknown>,
): asserts input is { classification: Classification } & Record<string, unknown> {
  const c = input.classification;
  if (c !== 'public' && c !== 'private' && c !== 'secret') {
    throw new ClassificationViolation('writeback_missing_or_invalid_classification', {
      got: c,
    });
  }
}

/**
 * Pack-time filter (firewall point 2). Drops every entry whose classification
 * exceeds the ceiling. Returns a NEW CandidateContext and a drop count.
 *
 * Wiki pages obey the whole-page rule by virtue of being indivisible at this layer:
 * either the page survives or it is dropped entirely.
 */
export function applyClassificationCeiling(
  c: CandidateContext,
  ceiling: Classification,
): { filtered: CandidateContext; dropped: number } {
  const maxRank = RANK[ceiling];
  const allow = (item: { classification: Classification }): boolean =>
    RANK[item.classification] <= maxRank;

  const wikiPages: WikiPage[] = c.wikiPages.filter(allow);
  const entities: KGEntity[] = c.kgSubgraph.entities.filter(allow);
  const edges: KGEdge[] = c.kgSubgraph.edges.filter(allow);
  const ragFragments: RAGFragment[] = c.ragFragments.filter(allow);
  const preferences = c.preferences.filter(allow);

  const dropped =
    (c.wikiPages.length - wikiPages.length) +
    (c.kgSubgraph.entities.length - entities.length) +
    (c.kgSubgraph.edges.length - edges.length) +
    (c.ragFragments.length - ragFragments.length) +
    (c.preferences.length - preferences.length);

  return {
    filtered: {
      wikiPages,
      kgSubgraph: { entities, edges },
      ragFragments,
      preferences,
      sorRecords: c.sorRecords,
      activeSkills: c.activeSkills,
    },
    dropped,
  };
}

/**
 * Personality admission (firewall point 3, PRD §6.4).
 *
 * Hard rule:
 *   - secret evidence    → never admit
 *   - private evidence   → admit only when isAbstract
 *   - public evidence    → always admit
 */
export function personalityAdmissionCheck(
  c: PersonalityCandidate,
): { admit: true } | { admit: false; reason: 'secret_evidence' | 'private_not_abstract' } {
  const max = c.evidenceClassifications.reduce<Classification>(
    (acc, cls) => maxClassification(acc, cls),
    'public',
  );
  if (max === 'secret') return { admit: false, reason: 'secret_evidence' };
  if (max === 'private' && !c.isAbstract) {
    return { admit: false, reason: 'private_not_abstract' };
  }
  return { admit: true };
}

/**
 * Assertion helper for tests and Ponderer paranoia. Throws if any evidence is `secret`.
 * Use only when admission was already supposedly enforced — this is a belt-and-braces check.
 */
export function assertNoSecretEvidence(
  classifications: ReadonlyArray<Classification>,
): void {
  for (const c of classifications) {
    if (c === 'secret') {
      throw new ClassificationViolation('secret_evidence_leaked');
    }
  }
}
