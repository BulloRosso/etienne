/**
 * Tests for the Adaptive Memory classification firewall.
 *
 * Run with: tsx test/memory-classification.test.ts
 * (or:      node -r ts-node/register/transpile-only test/memory-classification.test.ts)
 *
 * No test framework is configured for this backend; tests are ad-hoc scripts that
 * exit non-zero on failure. Each `check` is one assertion; a `case` groups checks
 * around one PRD enforcement point so failures pinpoint which firewall rule broke.
 */

import { strict as assert } from 'node:assert';
import {
  ClassificationViolation,
  applyClassificationCeiling,
  assertNoSecretEvidence,
  enforceWriteClassification,
  maxClassification,
  personalityAdmissionCheck,
  reduceMax,
  strictestCeiling,
} from '../src/memory/classification';
import type {
  CandidateContext,
  Classification,
  PersonalityCandidate,
  Provenance,
  Skill,
} from '../src/memory/types';

// --- Test harness --------------------------------------------------------------

let failures = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}
function group(label: string, body: () => void): void {
  console.log(`\n# ${label}`);
  body();
}

// --- Fixtures ------------------------------------------------------------------

const PROV: Provenance = {
  sourceSessions: [],
  sourceEntries: [],
  createdBy: 'agent',
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
};

function skill(name: string, ceiling: Classification): Skill {
  return {
    id: name,
    name,
    body: '',
    frontmatter: {
      description: `${name} skill`,
      sourcePriorities: [],
      classificationContext: ceiling,
      invocationTriggers: [],
    },
    originalHash: 'h0',
    currentHash: 'h0',
  };
}

function emptyContext(): CandidateContext {
  return {
    wikiPages: [],
    kgSubgraph: { entities: [], edges: [] },
    ragFragments: [],
    preferences: [],
    sorRecords: [],
    activeSkills: [],
  };
}

// --- maxClassification & reduceMax --------------------------------------------

group('maxClassification (PRD §9 helper)', () => {
  test('orders public < private < secret', () => {
    assert.equal(maxClassification('public', 'private'), 'private');
    assert.equal(maxClassification('private', 'secret'), 'secret');
    assert.equal(maxClassification('public', 'secret'), 'secret');
  });
  test('is commutative', () => {
    assert.equal(maxClassification('private', 'public'), 'private');
    assert.equal(maxClassification('secret', 'private'), 'secret');
  });
  test('is idempotent', () => {
    assert.equal(maxClassification('public', 'public'), 'public');
    assert.equal(maxClassification('private', 'private'), 'private');
    assert.equal(maxClassification('secret', 'secret'), 'secret');
  });
  test('reduceMax of empty list defaults to public', () => {
    assert.equal(reduceMax([]), 'public');
  });
  test('reduceMax picks the highest', () => {
    assert.equal(
      reduceMax([
        { classification: 'public' as Classification },
        { classification: 'private' as Classification },
        { classification: 'public' as Classification },
      ]),
      'private',
    );
    assert.equal(
      reduceMax([
        { classification: 'private' as Classification },
        { classification: 'secret' as Classification },
      ]),
      'secret',
    );
  });
});

// --- strictestCeiling ----------------------------------------------------------

group('strictestCeiling (PRD §5.2)', () => {
  test('picks the lowest ceiling across active skills', () => {
    const s = [skill('a', 'private'), skill('b', 'public'), skill('c', 'secret')];
    assert.equal(strictestCeiling(s), 'public');
  });
  test('returns secret for an empty skill set (no opinion)', () => {
    assert.equal(strictestCeiling([]), 'secret');
  });
  test('handles a single-skill set', () => {
    assert.equal(strictestCeiling([skill('only', 'private')]), 'private');
  });
});

// --- enforceWriteClassification (firewall point 1) -----------------------------

group('enforceWriteClassification (firewall point 1)', () => {
  test('throws on undefined', () => {
    assert.throws(() => enforceWriteClassification({}), ClassificationViolation);
  });
  test('throws on null', () => {
    assert.throws(
      () => enforceWriteClassification({ classification: null }),
      ClassificationViolation,
    );
  });
  test('throws on empty string', () => {
    assert.throws(
      () => enforceWriteClassification({ classification: '' }),
      ClassificationViolation,
    );
  });
  test('throws on unknown level', () => {
    assert.throws(
      () => enforceWriteClassification({ classification: 'restricted' }),
      ClassificationViolation,
    );
  });
  test('accepts each valid level', () => {
    assert.doesNotThrow(() => enforceWriteClassification({ classification: 'public' }));
    assert.doesNotThrow(() => enforceWriteClassification({ classification: 'private' }));
    assert.doesNotThrow(() => enforceWriteClassification({ classification: 'secret' }));
  });
  test('preserves other input fields after the assertion', () => {
    const input: { classification?: unknown; payload: string } = {
      classification: 'private',
      payload: 'hello',
    };
    enforceWriteClassification(input);
    // After the assertion narrows the type, payload is still accessible.
    assert.equal(input.payload, 'hello');
  });
});

// --- applyClassificationCeiling (firewall point 2) -----------------------------

group('applyClassificationCeiling (firewall point 2)', () => {
  test('drops entries strictly above the ceiling', () => {
    const ctx: CandidateContext = {
      ...emptyContext(),
      wikiPages: [
        { id: 'p1', classification: 'public', provenance: PROV, title: 'P1', slug: 'p1', body: '', links: [] },
        { id: 'p2', classification: 'private', provenance: PROV, title: 'P2', slug: 'p2', body: '', links: [] },
        { id: 'p3', classification: 'secret', provenance: PROV, title: 'P3', slug: 'p3', body: '', links: [] },
      ],
    };
    const { filtered, dropped } = applyClassificationCeiling(ctx, 'private');
    assert.equal(filtered.wikiPages.length, 2);
    assert.deepEqual(filtered.wikiPages.map((p) => p.id), ['p1', 'p2']);
    assert.equal(dropped, 1);
  });

  test('with ceiling=public, drops both private and secret', () => {
    const ctx: CandidateContext = {
      ...emptyContext(),
      wikiPages: [
        { id: 'p1', classification: 'public', provenance: PROV, title: 'P1', slug: 'p1', body: '', links: [] },
        { id: 'p2', classification: 'private', provenance: PROV, title: 'P2', slug: 'p2', body: '', links: [] },
        { id: 'p3', classification: 'secret', provenance: PROV, title: 'P3', slug: 'p3', body: '', links: [] },
      ],
    };
    const { filtered, dropped } = applyClassificationCeiling(ctx, 'public');
    assert.equal(filtered.wikiPages.length, 1);
    assert.equal(filtered.wikiPages[0].id, 'p1');
    assert.equal(dropped, 2);
  });

  test('preserves whole pages — never splits a page mid-body', () => {
    // This is the load-bearing property from PRD §5.2 step 4. The function
    // cannot split a page because it operates on whole-page entries; we assert
    // the body survives untouched when the page survives.
    const ctx: CandidateContext = {
      ...emptyContext(),
      wikiPages: [
        {
          id: 'p1',
          classification: 'public',
          provenance: PROV,
          title: 'P1',
          slug: 'p1',
          body: '# Long body\n\nmany paragraphs',
          links: ['related'],
        },
      ],
    };
    const { filtered } = applyClassificationCeiling(ctx, 'private');
    assert.equal(filtered.wikiPages[0].body, '# Long body\n\nmany paragraphs');
    assert.deepEqual(filtered.wikiPages[0].links, ['related']);
  });

  test('drops across every store and sums the count', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'wp', classification: 'secret', provenance: PROV, title: '', slug: 'wp', body: '', links: [] },
      ],
      kgSubgraph: {
        entities: [
          { id: 'e1', classification: 'secret', provenance: PROV, type: 't', label: 'l', attributes: {} },
          { id: 'e2', classification: 'public', provenance: PROV, type: 't', label: 'l', attributes: {} },
        ],
        edges: [
          { id: 'edge', classification: 'secret', provenance: PROV, subject: 'e1', predicate: 'p', object: 'e2' },
        ],
      },
      ragFragments: [
        { id: 'r1', classification: 'secret', provenance: PROV, text: '', embeddingId: '', tags: [] },
      ],
      preferences: [
        { id: 'pref1', classification: 'secret', provenance: PROV, scope: 'user', statement: '', confidence: 0.5 },
      ],
      sorRecords: [],
      activeSkills: [],
    };
    const { filtered, dropped } = applyClassificationCeiling(ctx, 'private');
    assert.equal(filtered.wikiPages.length, 0);
    assert.equal(filtered.kgSubgraph.entities.length, 1);
    assert.equal(filtered.kgSubgraph.edges.length, 0);
    assert.equal(filtered.ragFragments.length, 0);
    assert.equal(filtered.preferences.length, 0);
    // 1 wiki + 1 entity + 1 edge + 1 rag + 1 pref = 5
    assert.equal(dropped, 5);
  });

  test('does not mutate the input CandidateContext', () => {
    const ctx: CandidateContext = {
      ...emptyContext(),
      wikiPages: [
        { id: 'p1', classification: 'secret', provenance: PROV, title: '', slug: 'p1', body: '', links: [] },
      ],
    };
    const before = ctx.wikiPages.length;
    applyClassificationCeiling(ctx, 'private');
    assert.equal(ctx.wikiPages.length, before);
  });
});

// --- personalityAdmissionCheck (firewall point 3, PRD §6.4) --------------------

group('personalityAdmissionCheck (firewall point 3)', () => {
  function cand(
    evidenceClassifications: Classification[],
    isAbstract: boolean,
  ): PersonalityCandidate {
    return {
      principle: 'Behave well',
      context: 'Always',
      evidence: [],
      inferenceTag: 'tag:test',
      isAbstract,
      evidenceClassifications,
    };
  }
  test('any secret evidence → never admit', () => {
    const r = personalityAdmissionCheck(cand(['public', 'secret'], true));
    assert.equal(r.admit, false);
    assert.equal((r as { admit: false; reason: string }).reason, 'secret_evidence');
  });
  test('private evidence + non-abstract → reject (private_not_abstract)', () => {
    const r = personalityAdmissionCheck(cand(['private', 'public'], false));
    assert.equal(r.admit, false);
    assert.equal((r as { admit: false; reason: string }).reason, 'private_not_abstract');
  });
  test('private evidence + abstract → admit', () => {
    const r = personalityAdmissionCheck(cand(['private', 'public'], true));
    assert.equal(r.admit, true);
  });
  test('all-public evidence → admit regardless of abstraction', () => {
    assert.equal(personalityAdmissionCheck(cand(['public'], false)).admit, true);
    assert.equal(personalityAdmissionCheck(cand(['public', 'public'], true)).admit, true);
  });
  test('empty evidence → admit (max defaults to public)', () => {
    assert.equal(personalityAdmissionCheck(cand([], false)).admit, true);
  });
});

// --- assertNoSecretEvidence ----------------------------------------------------

group('assertNoSecretEvidence (paranoia helper)', () => {
  test('throws when any evidence is secret', () => {
    assert.throws(
      () => assertNoSecretEvidence(['public', 'private', 'secret']),
      ClassificationViolation,
    );
  });
  test('does not throw on clean evidence', () => {
    assert.doesNotThrow(() => assertNoSecretEvidence(['public', 'private']));
    assert.doesNotThrow(() => assertNoSecretEvidence([]));
  });
});

// --- Result --------------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
