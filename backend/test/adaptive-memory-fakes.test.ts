/**
 * Smoke test for the in-memory adapter fakes.
 *
 * These fakes are the substrate for Picker/Packer/Agent integration tests.
 * Validating their interface here keeps regressions in the fakes from masquerading
 * as Picker/Packer bugs later.
 *
 * Run with: tsx test/adaptive-memory-fakes.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  KGFake,
  PreferencesFake,
  RAGFake,
  SORFake,
  WikiFake,
} from '../src/adaptive-memory/adapters/fakes';
import type {
  KGEdge,
  KGEntity,
  Preference,
  Provenance,
  RAGFragment,
  WikiPage,
} from '../src/memory/types';

const PROV: Provenance = {
  sourceSessions: [],
  sourceEntries: [],
  createdBy: 'agent',
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
};

let failures = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

async function main(): Promise<void> {
  console.log('\n# WikiFake');
  const wiki = new WikiFake();
  const page: WikiPage = {
    id: 'sofa',
    classification: 'private',
    provenance: PROV,
    title: 'Mid-century Sofa',
    slug: 'mid-century-sofa',
    body: 'A walnut-frame mid-century sofa. See also [walnut wood](../topics/walnut-wood.md).',
    links: ['walnut-wood'],
  };
  wiki.seed('p', page);

  await test('WikiFake.getPage returns whole page', async () => {
    const got = await wiki.getPage('p', 'mid-century-sofa');
    assert.ok(got);
    assert.equal(got.body, page.body);
    assert.deepEqual(got.links, ['walnut-wood']);
  });
  await test('WikiFake.getPage returns null on miss', async () => {
    assert.equal(await wiki.getPage('p', 'nope'), null);
  });
  await test('WikiFake.search ranks hits by keyword overlap', async () => {
    const hits = await wiki.search('p', ['sofa', 'walnut'], { limit: 5 });
    assert.equal(hits[0].slug, 'mid-century-sofa');
    assert.ok(hits[0].score >= 2);
  });
  await test('WikiFake.putPage round-trips classification + provenance', async () => {
    const r = await wiki.putPage('p', {
      title: 'Brand X',
      body: 'body',
      sources: [],
      classification: 'public',
      provenance: PROV,
    });
    assert.equal(r.slug, 'brand-x');
    const got = await wiki.getPage('p', 'brand-x');
    assert.equal(got?.classification, 'public');
  });
  await test('WikiFake.delete is idempotent', async () => {
    const first = await wiki.delete('p', 'brand-x');
    const second = await wiki.delete('p', 'brand-x');
    assert.equal(first.noop, false);
    assert.equal(second.noop, true);
  });

  console.log('\n# KGFake');
  const kg = new KGFake();
  const entities: KGEntity[] = [
    { id: 'sofa', classification: 'private', provenance: PROV, type: 'Product', label: 'Sofa', attributes: {} },
    { id: 'walnut', classification: 'private', provenance: PROV, type: 'Material', label: 'Walnut', attributes: {} },
    { id: 'velvet', classification: 'public', provenance: PROV, type: 'Material', label: 'Velvet', attributes: {} },
    { id: 'orphan', classification: 'private', provenance: PROV, type: 'Misc', label: 'Orphan', attributes: {} },
  ];
  for (const e of entities) kg.seedEntity('p', e);
  const edges: KGEdge[] = [
    { id: 'e1', classification: 'private', provenance: PROV, subject: 'sofa', predicate: 'made_of', object: 'walnut' },
    { id: 'e2', classification: 'private', provenance: PROV, subject: 'sofa', predicate: 'upholstered_with', object: 'velvet' },
  ];
  for (const edge of edges) kg.seedEdge('p', edge);

  await test('KGFake.subgraph(depth=0) returns only the root entity', async () => {
    const r = await kg.subgraph('p', 'sofa', 0);
    assert.deepEqual(r.entities.map((e) => e.id).sort(), ['sofa']);
    assert.equal(r.edges.length, 0);
  });
  await test('KGFake.subgraph(depth=1) expands neighbours', async () => {
    const r = await kg.subgraph('p', 'sofa', 1);
    assert.deepEqual(r.entities.map((e) => e.id).sort(), ['sofa', 'velvet', 'walnut']);
    assert.equal(r.edges.length, 2);
  });
  await test('KGFake.prune removes entities and their edges', async () => {
    const r = await kg.prune('p', ['walnut']);
    assert.equal(r.removed, 1);
    const after = await kg.subgraph('p', 'sofa', 1);
    assert.ok(!after.entities.some((e) => e.id === 'walnut'));
    assert.ok(!after.edges.some((e) => e.subject === 'walnut' || e.object === 'walnut'));
  });

  console.log('\n# RAGFake');
  const rag = new RAGFake();
  const frags: RAGFragment[] = [
    { id: 'r1', classification: 'public', provenance: PROV, text: 'walnut frames durability', embeddingId: 'v1', tags: ['furniture'] },
    { id: 'r2', classification: 'private', provenance: PROV, text: 'private supplier notes', embeddingId: 'v2', tags: ['vendor'] },
    { id: 'r3', classification: 'secret', provenance: PROV, text: 'secret pricing', embeddingId: 'v3', tags: ['pricing'] },
  ];
  for (const f of frags) rag.seed('p', f);

  await test('RAGFake.query filters by classification', async () => {
    const hits = await rag.query('p', 'walnut frames', {
      topK: 5,
      classificationFilter: ['public', 'private'],
    });
    assert.deepEqual(hits.map((f) => f.id).sort(), ['r1']);
  });
  await test('RAGFake.query excludes secret when secret not requested', async () => {
    const hits = await rag.query('p', 'pricing', {
      topK: 5,
      classificationFilter: ['public', 'private'],
    });
    assert.equal(hits.length, 0);
  });
  await test('RAGFake.query includes secret when requested', async () => {
    const hits = await rag.query('p', 'pricing', {
      topK: 5,
      classificationFilter: ['public', 'private', 'secret'],
    });
    assert.deepEqual(hits.map((f) => f.id), ['r3']);
  });

  console.log('\n# SORFake');
  const sor = new SORFake();
  sor.register('p', 'lims', 'Lab info', (q) => ({ echoed: q }));

  await test('SORFake.listAvailable returns registered connectors', async () => {
    const c = await sor.listAvailable('p');
    assert.equal(c.length, 1);
    assert.equal(c[0].name, 'lims');
  });
  await test('SORFake.read delegates to the connector', async () => {
    const r = await sor.read('p', 'lims', { batch: 7 });
    assert.equal(r.source, 'lims');
    assert.deepEqual(r.payload, { echoed: { batch: 7 } });
  });
  await test('SORFake.read rejects unknown connector', async () => {
    await assert.rejects(() => sor.read('p', 'nope', {}), /unknown SOR connector/);
  });

  console.log('\n# PreferencesFake');
  const prefs = new PreferencesFake();
  const pref: Preference = {
    id: 'pref1',
    classification: 'private',
    provenance: PROV,
    scope: 'user',
    statement: 'prefers walnut over oak',
    confidence: 0.9,
  };
  prefs.seed('p', pref);

  await test('PreferencesFake.matching returns prefs whose statement keyword is in the intent', async () => {
    const hits = await prefs.matching('p', 'recommend a walnut frame');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'pref1');
  });
  await test('PreferencesFake.matching returns [] when nothing matches', async () => {
    const hits = await prefs.matching('p', 'unrelated query');
    assert.equal(hits.length, 0);
  });

  await new Promise((r) => setTimeout(r, 100));
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll fake-adapter tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
