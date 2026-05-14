/**
 * Tests for the verdict bridge between the legacy dreaming verdict union and the
 * PRD ReviewVerdict union.
 *
 * Run with: tsx test/memory-verdict-mapping.test.ts
 */

import { strict as assert } from 'node:assert';
import type { ReviewVerdict } from '../src/memory/types';
import {
  type DreamVerdict,
  type LegacyVerdict,
  isDreamVerdict,
  isLegacyVerdict,
  isReviewVerdict,
  toLegacyVerdict,
  toReviewVerdict,
} from '../src/memory/verdict-mapping';

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

group('isDreamVerdict / isLegacyVerdict / isReviewVerdict guards', () => {
  test('isDreamVerdict accepts all 6 known strings', () => {
    for (const v of ['good', 'bad', 'deepen', 'badly_reasoned', 'unusable', 'pending']) {
      assert.equal(isDreamVerdict(v), true, `expected ${v} accepted`);
    }
  });
  test('isDreamVerdict rejects non-strings and unknown strings', () => {
    assert.equal(isDreamVerdict(undefined), false);
    assert.equal(isDreamVerdict(null), false);
    assert.equal(isDreamVerdict(''), false);
    assert.equal(isDreamVerdict('approved'), false);
    assert.equal(isDreamVerdict(7), false);
  });
  test('isLegacyVerdict partitions the union correctly', () => {
    const legacy: DreamVerdict[] = ['good', 'bad', 'deepen'];
    const review: DreamVerdict[] = ['badly_reasoned', 'unusable', 'pending'];
    for (const v of legacy) assert.equal(isLegacyVerdict(v), true);
    for (const v of review) assert.equal(isLegacyVerdict(v), false);
  });
  test('isReviewVerdict partitions the union correctly', () => {
    const review: DreamVerdict[] = ['good', 'badly_reasoned', 'unusable', 'pending'];
    const onlyLegacy: DreamVerdict[] = ['bad', 'deepen'];
    for (const v of review) assert.equal(isReviewVerdict(v), true);
    for (const v of onlyLegacy) assert.equal(isReviewVerdict(v), false);
  });
});

group('toReviewVerdict (legacy → PRD)', () => {
  const cases: Array<[DreamVerdict, ReviewVerdict]> = [
    ['good', 'good'],
    ['bad', 'badly_reasoned'],
    ['deepen', 'pending'],
    ['badly_reasoned', 'badly_reasoned'],
    ['unusable', 'unusable'],
    ['pending', 'pending'],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.equal(toReviewVerdict(input), expected);
    });
  }
});

group('toLegacyVerdict (PRD → legacy)', () => {
  const cases: Array<[ReviewVerdict, LegacyVerdict]> = [
    ['good', 'good'],
    ['badly_reasoned', 'bad'],
    ['unusable', 'bad'],
    ['pending', 'deepen'],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.equal(toLegacyVerdict(input), expected);
    });
  }
});

group('round-trip stability', () => {
  test('good ↔ good is stable', () => {
    assert.equal(toLegacyVerdict(toReviewVerdict('good')), 'good');
    assert.equal(toReviewVerdict(toLegacyVerdict('good')), 'good');
  });
  test('bad → badly_reasoned → bad is stable', () => {
    assert.equal(toLegacyVerdict(toReviewVerdict('bad')), 'bad');
  });
  test('badly_reasoned → bad → badly_reasoned is stable', () => {
    assert.equal(toReviewVerdict(toLegacyVerdict('badly_reasoned')), 'badly_reasoned');
  });
  test('unusable collapses to bad in legacy direction (lossy, by design)', () => {
    // toLegacyVerdict('unusable') === 'bad', and bad maps back to badly_reasoned
    // (not unusable). This is intentional: legacy has no separate bucket for unusable.
    assert.equal(toLegacyVerdict('unusable'), 'bad');
    assert.equal(toReviewVerdict(toLegacyVerdict('unusable')), 'badly_reasoned');
  });
  test('deepen → pending → deepen is stable', () => {
    assert.equal(toLegacyVerdict(toReviewVerdict('deepen')), 'deepen');
  });
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
