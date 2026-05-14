/**
 * Packer test.
 *
 * Load-bearing properties:
 *   - PRD §13 / firewall point 2: classification ceiling is applied first.
 *     Mixed-classification fixture asserts dropped count and meta.droppedForClassification.
 *   - PRD §5.2 step 4: Wiki pages are kept whole or dropped entirely.
 *   - Source priority: lower numbers win, ties stable.
 *
 * Run with: tsx test/adaptive-memory-packer.test.ts
 */

import { strict as assert } from 'node:assert';
import type {
  CandidateContext,
  Provenance,
  Skill,
  StoreName,
} from '../src/memory/types';
import { Packer } from '../src/adaptive-memory/subagents/packer.service';

const PROV: Provenance = {
  sourceSessions: [],
  sourceEntries: [],
  createdBy: 'agent',
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
};

function provAt(updatedAt: string): Provenance {
  return { ...PROV, updatedAt };
}

function skill(name: string, ceiling: 'public' | 'private' | 'secret', priorities: Array<{ store: StoreName; priority: number }>): Skill {
  return {
    id: name,
    name,
    body: `# ${name}`,
    frontmatter: {
      description: `${name} skill`,
      sourcePriorities: priorities,
      classificationContext: ceiling,
      invocationTriggers: [],
    },
    originalHash: 'h0',
    currentHash: 'h0',
  };
}

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

function main(): void {
  const packer = new Packer();

  console.log('\n# classification ceiling (firewall point 2)');
  test('secret entries dropped when ceiling=private; count surfaced in meta', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w1', classification: 'public', provenance: PROV, title: 'W1', slug: 'w1', body: 'public wiki', links: [] },
        { id: 'w2', classification: 'private', provenance: PROV, title: 'W2', slug: 'w2', body: 'private wiki', links: [] },
        { id: 'w3', classification: 'secret', provenance: PROV, title: 'W3', slug: 'w3', body: 'secret wiki', links: [] },
      ],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [
        { id: 'r1', classification: 'secret', provenance: PROV, text: 'secret pricing', embeddingId: 'v', tags: [] },
      ],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'private', [])],
    };
    const pkg = packer.pack(ctx, 'user prompt', { tokenBudget: 100_000 });
    assert.equal(pkg.meta.droppedForClassification, 2, 'one secret wiki + one secret rag dropped');
    assert.ok(pkg.knowledge.includes('public wiki'));
    assert.ok(pkg.knowledge.includes('private wiki'));
    assert.ok(!pkg.knowledge.includes('secret wiki'));
    assert.ok(!pkg.knowledge.includes('secret pricing'));
  });

  test('strictest ceiling wins across multiple active skills', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w1', classification: 'public', provenance: PROV, title: 'pub', slug: 'w1', body: 'public', links: [] },
        { id: 'w2', classification: 'private', provenance: PROV, title: 'pri', slug: 'w2', body: 'private', links: [] },
      ],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'private', []), skill('s2', 'public', [])],
    };
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 100_000 });
    // Ceiling = public (strictest of {private, public}); private should be dropped.
    assert.equal(pkg.meta.droppedForClassification, 1);
    assert.ok(pkg.knowledge.includes('public'));
    assert.ok(!pkg.knowledge.includes('private'));
  });

  console.log('\n# whole-page protection (PRD §5.2 step 4)');
  test('large Wiki pages are not split mid-body', () => {
    const big = 'X'.repeat(4000); // ~1000 tokens by our estimator
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w', classification: 'public', provenance: PROV, title: 'big', slug: 'w', body: big, links: [] },
      ],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'public', [])],
    };
    // Budget large enough → whole page survives intact.
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 100_000 });
    assert.ok(pkg.knowledge.includes(big), 'whole page body must survive');
  });

  test('when a Wiki page does not fit, it is dropped entirely', () => {
    const big = 'X'.repeat(4000); // ~1000 tokens
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w', classification: 'public', provenance: PROV, title: 'big', slug: 'w', body: big, links: [] },
      ],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'public', [])],
    };
    // Budget too small → page is dropped, no partial.
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 200 });
    assert.ok(
      !pkg.knowledge.includes(big),
      'page must be dropped, not truncated, when over budget',
    );
    // The page might leave a section header behind only if we partially serialised it —
    // we shouldn't.
    assert.ok(
      !pkg.knowledge.includes('Wiki — big'),
      'no partial section header should appear',
    );
  });

  console.log('\n# source priority');
  test('priorities order sections — lower numbers come first', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w', classification: 'public', provenance: PROV, title: 'wikipage', slug: 'w', body: 'wikibody', links: [] },
      ],
      kgSubgraph: {
        entities: [
          { id: 'e1', classification: 'public', provenance: PROV, type: 'T', label: 'L', attributes: {} },
        ],
        edges: [],
      },
      ragFragments: [
        { id: 'r1', classification: 'public', provenance: PROV, text: 'ragtext', embeddingId: 'v', tags: [] },
      ],
      preferences: [],
      sorRecords: [],
      // Wiki priority is the WORST here; RAG is best. So RAG should appear first.
      activeSkills: [
        skill('s1', 'public', [
          { store: 'wiki', priority: 5 },
          { store: 'kg', priority: 3 },
          { store: 'rag', priority: 1 },
        ]),
      ],
    };
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 100_000 });
    const idxRag = pkg.knowledge.indexOf('ragtext');
    const idxKg = pkg.knowledge.indexOf('Knowledge graph subgraph');
    const idxWiki = pkg.knowledge.indexOf('wikibody');
    assert.ok(idxRag >= 0 && idxKg >= 0 && idxWiki >= 0);
    assert.ok(idxRag < idxKg && idxKg < idxWiki, `priority order should be rag(1) < kg(3) < wiki(5); got ${idxRag}/${idxKg}/${idxWiki}`);
  });

  test('unreferenced stores sink to the bottom', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w', classification: 'public', provenance: PROV, title: 'wikipage', slug: 'w', body: 'wikibody', links: [] },
      ],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [
        { id: 'r1', classification: 'public', provenance: PROV, text: 'ragtext', embeddingId: 'v', tags: [] },
      ],
      preferences: [],
      sorRecords: [],
      // Only RAG declared; wiki is unreferenced → sinks below.
      activeSkills: [skill('s1', 'public', [{ store: 'rag', priority: 1 }])],
    };
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 100_000 });
    const idxRag = pkg.knowledge.indexOf('ragtext');
    const idxWiki = pkg.knowledge.indexOf('wikibody');
    assert.ok(idxRag >= 0 && idxWiki >= 0);
    assert.ok(idxRag < idxWiki, 'declared store appears before unreferenced one');
  });

  console.log('\n# recency within store');
  test('older entries are dropped first when budget tightens', () => {
    const old = 'OLD ' + 'X'.repeat(800);  // ~200 tokens
    const newer = 'NEWER ' + 'X'.repeat(800); // ~200 tokens
    const ctx: CandidateContext = {
      wikiPages: [],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [
        { id: 'old', classification: 'public', provenance: provAt('2020-01-01T00:00:00Z'), text: old, embeddingId: 'v', tags: [] },
        { id: 'new', classification: 'public', provenance: provAt('2026-01-01T00:00:00Z'), text: newer, embeddingId: 'v', tags: [] },
      ],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'public', [{ store: 'rag', priority: 1 }])],
    };
    // Budget for ~ one fragment.
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 350 });
    assert.ok(pkg.knowledge.includes('NEWER'), 'newer fragment must survive');
    assert.ok(!pkg.knowledge.includes('OLD '), 'older fragment must be dropped first');
  });

  console.log('\n# meta accounting');
  test('sourceSummary reports per-store counts of surviving sections', () => {
    const ctx: CandidateContext = {
      wikiPages: [
        { id: 'w', classification: 'public', provenance: PROV, title: 'p', slug: 'w', body: 'b', links: [] },
      ],
      kgSubgraph: {
        entities: [{ id: 'e', classification: 'public', provenance: PROV, type: 'T', label: 'L', attributes: {} }],
        edges: [],
      },
      ragFragments: [
        { id: 'r', classification: 'public', provenance: PROV, text: 'rag', embeddingId: 'v', tags: [] },
      ],
      preferences: [
        { id: 'p1', classification: 'public', provenance: PROV, scope: 'user', statement: 'pref', confidence: 1 },
      ],
      sorRecords: [{ source: 'lims', payload: { x: 1 } }],
      activeSkills: [skill('s1', 'public', [])],
    };
    const pkg = packer.pack(ctx, 'p', { tokenBudget: 100_000 });
    assert.equal(pkg.meta.sourceSummary.wiki, 1);
    assert.equal(pkg.meta.sourceSummary.kg, 1);
    assert.equal(pkg.meta.sourceSummary.rag, 1);
    assert.equal(pkg.meta.sourceSummary.preferences, 1);
    assert.equal(pkg.meta.sourceSummary.sor, 1);
    // Personality stays at zero by construction — never enters the package.
    assert.equal(pkg.meta.sourceSummary.personality, 0);
  });

  test('totalTokens accounts for system + user + knowledge', () => {
    const ctx: CandidateContext = {
      wikiPages: [],
      kgSubgraph: { entities: [], edges: [] },
      ragFragments: [],
      preferences: [],
      sorRecords: [],
      activeSkills: [skill('s1', 'public', [])],
    };
    const pkg = packer.pack(ctx, 'user prompt here', { tokenBudget: 100_000 });
    assert.ok(pkg.meta.totalTokens > 0, 'token budget includes the prompts');
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Packer tests passed.');
}

main();
