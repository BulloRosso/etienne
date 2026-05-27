/**
 * Standalone spec for the BM25 / hybrid-retrieval slice. No test framework
 * dependency — uses Node's built-in `node:test` + `node:assert/strict`.
 *
 * Run with:
 *   cd backend
 *   npx tsx src/rag/__tests__/bm25.spec.ts
 *
 * Or via ts-node:
 *   node -r ts-node/register/transpile-only src/rag/__tests__/bm25.spec.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Point Bm25Service at a throwaway workspace before importing it.
const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bm25-spec-'));
process.env.RAG_WORKSPACE_DIR = tmpWorkspace;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Bm25Service } from '../bm25.service';
import { fuseRRF } from '../hybrid-fusion';
import { parseScopeName } from '../scope-parser';
import { SearchResult } from '../rag.service';

// ── scope-parser ─────────────────────────────────────────────────────────

test('parseScopeName: project_<name> → rag_fts', () => {
  const m = parseScopeName('project_myapp', 384);
  assert.equal(m.project, 'myapp');
  assert.equal(m.collection, 'rag_384');
  assert.equal(m.ftsTable, 'rag_fts');
});

test('parseScopeName: global → _global / rag_fts', () => {
  const m = parseScopeName('global', 768);
  assert.equal(m.project, '_global');
  assert.equal(m.collection, 'rag_768');
  assert.equal(m.ftsTable, 'rag_fts');
});

test('parseScopeName: domain_<name> → rag_<domain>_fts (dimension-independent)', () => {
  const m = parseScopeName('domain_legal', 384);
  assert.equal(m.project, '_domains');
  assert.equal(m.collection, 'rag_legal_384');
  assert.equal(m.ftsTable, 'rag_legal_fts');
});

test('parseScopeName: fallback treats bare string as project name', () => {
  const m = parseScopeName('bareproject', 384);
  assert.equal(m.project, 'bareproject');
  assert.equal(m.ftsTable, 'rag_fts');
});

test('parseScopeName: empty domain throws', () => {
  assert.throws(() => parseScopeName('domain_', 384), /Domain name cannot be empty/);
});

// ── fuseRRF ──────────────────────────────────────────────────────────────

test('fuseRRF: same document on both sides outranks single-source hits', () => {
  const dense: SearchResult[] = [
    { id: 'A', content: 'a', similarity: 0.9, metadata: {} },
    { id: 'B', content: 'b', similarity: 0.8, metadata: {} },
  ];
  const sparse: SearchResult[] = [
    { id: 'C', content: 'c', similarity: 5, metadata: {} },
    { id: 'A', content: 'a', similarity: 4, metadata: {} },
  ];
  const fused = fuseRRF(dense, sparse, 60, 5);
  assert.equal(fused[0].id, 'A', 'A appears on both sides → top');
  // A's RRF = 1/61 + 1/62 ≈ 0.0326
  assert.ok(fused[0].similarity > 0.03 && fused[0].similarity < 0.04);
  // Dedup: A only appears once
  assert.equal(fused.filter((r) => r.id === 'A').length, 1);
});

test('fuseRRF: respects topK', () => {
  const dense: SearchResult[] = Array.from({ length: 30 }, (_, i) => ({
    id: `d${i}`,
    content: '',
    similarity: 1 - i / 30,
    metadata: {},
  }));
  const sparse: SearchResult[] = [];
  const fused = fuseRRF(dense, sparse, 60, 5);
  assert.equal(fused.length, 5);
});

test('fuseRRF: preserves content from dense when sparse lacks it', () => {
  const dense: SearchResult[] = [
    { id: 'X', content: 'dense-content', similarity: 0.9, metadata: { source: 'dense' } },
  ];
  const sparse: SearchResult[] = [
    { id: 'X', content: '', similarity: 1, metadata: {} },
  ];
  const fused = fuseRRF(dense, sparse, 60, 5);
  assert.equal(fused[0].content, 'dense-content');
});

test('fuseRRF: empty sparse degrades to dense ordering', () => {
  const dense: SearchResult[] = [
    { id: 'a', content: '', similarity: 0.9, metadata: {} },
    { id: 'b', content: '', similarity: 0.5, metadata: {} },
  ];
  const fused = fuseRRF(dense, [], 60, 5);
  assert.deepEqual(
    fused.map((r) => r.id),
    ['a', 'b'],
  );
});

// ── Bm25Service ──────────────────────────────────────────────────────────

function makeChunk(
  id: string,
  content: string,
  extra: Record<string, any> = {},
) {
  return {
    id,
    content,
    metadata: {
      documentId: extra.documentId ?? 'doc1',
      filepath: extra.filepath ?? 'docs/test.md',
      scope: extra.scope ?? 'project_test',
      wikiSlug: extra.wikiSlug ?? null,
      wikiTitle: extra.wikiTitle ?? null,
      ...extra,
    },
  };
}

test('Bm25Service: indexes and retrieves an exact identifier match', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj1', 'rag_fts', [
    makeChunk('c1', 'Bug PROJ-1234 in parseScopeName has been resolved.', {
      documentId: 'docA',
      filepath: 'docs/bug.md',
    }),
    makeChunk('c2', 'Today the weather is nice and sunny.', {
      documentId: 'docB',
      filepath: 'docs/weather.md',
    }),
  ]);

  const results = svc.search('proj1', 'rag_fts', 'PROJ-1234', 5);
  assert.ok(results.length >= 1, 'should find at least one result');
  assert.equal(results[0].id, 'c1', 'exact identifier should rank first');
  assert.equal(results[0].metadata.documentId, 'docA');
  svc.onModuleDestroy();
});

test('Bm25Service: prefix expansion finds a longer identifier', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj2', 'rag_fts', [
    makeChunk('c1', 'The function parseScopeName is called from many sites.', {
      documentId: 'docA',
    }),
    makeChunk('c2', 'Something unrelated about cooking.', { documentId: 'docB' }),
  ]);

  // Query is a prefix; sanitizer appends * so it should match parseScopeName.
  const results = svc.search('proj2', 'rag_fts', 'parseScope', 5);
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'c1');
  svc.onModuleDestroy();
});

test('Bm25Service: removeByDocumentId deletes only that document', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj3', 'rag_fts', [
    makeChunk('a1', 'apple banana cherry', { documentId: 'docA' }),
    makeChunk('a2', 'apple banana cherry', { documentId: 'docA' }),
    makeChunk('b1', 'apple banana cherry', { documentId: 'docB' }),
  ]);

  const removed = svc.removeByDocumentId('proj3', 'rag_fts', 'docA');
  assert.equal(removed, 2);

  const all = svc.search('proj3', 'rag_fts', 'apple', 10);
  assert.equal(all.length, 1, 'only docB rows should remain');
  assert.equal(all[0].metadata.documentId, 'docB');
  svc.onModuleDestroy();
});

test('Bm25Service: filepath filter restricts results', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj4', 'rag_fts', [
    makeChunk('c1', 'lorem ipsum dolor sit amet', {
      documentId: 'docA',
      filepath: 'wiki/topics/foo.md',
    }),
    makeChunk('c2', 'lorem ipsum dolor sit amet', {
      documentId: 'docB',
      filepath: 'wiki/topics/bar.md',
    }),
  ]);

  const filtered = svc.search('proj4', 'rag_fts', 'lorem', 10, [
    'wiki/topics/foo.md',
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].metadata.filepath, 'wiki/topics/foo.md');
  svc.onModuleDestroy();
});

test('Bm25Service: FTS5 operator chars in query do not throw', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj5', 'rag_fts', [
    makeChunk('c1', 'alpha beta gamma', { documentId: 'docA' }),
  ]);

  // Raw input with FTS5 operators that would normally blow up MATCH.
  const results = svc.search('proj5', 'rag_fts', 'alpha AND "beta" OR (gamma*)', 5);
  // Sanitizer should have stripped operators and matched on the remaining terms.
  assert.ok(results.length >= 1);
  svc.onModuleDestroy();
});

test('Bm25Service: empty / pure-operator query returns empty without throwing', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj6', 'rag_fts', [
    makeChunk('c1', 'alpha beta gamma', { documentId: 'docA' }),
  ]);

  const empty1 = svc.search('proj6', 'rag_fts', '', 5);
  assert.deepEqual(empty1, []);

  const empty2 = svc.search('proj6', 'rag_fts', '  AND OR NOT  ', 5);
  assert.deepEqual(empty2, []);

  svc.onModuleDestroy();
});

test('Bm25Service: wiki_slug column is searchable', () => {
  const svc = new Bm25Service();
  svc.indexChunks('proj7', 'rag_fts', [
    makeChunk('c1', 'Body text that never mentions the slug verbatim.', {
      documentId: 'docA',
      filepath: 'wiki/topics/luminous-flask.md',
      wikiSlug: 'luminous-flask',
      wikiTitle: 'The Luminous Flask',
    }),
    makeChunk('c2', 'Unrelated content about water bottles.', {
      documentId: 'docB',
      filepath: 'wiki/topics/water-bottle.md',
      wikiSlug: 'water-bottle',
      wikiTitle: 'Water Bottle',
    }),
  ]);

  // Slug as query term — should beat the unrelated chunk because wiki_slug is indexed.
  const results = svc.search('proj7', 'rag_fts', 'luminous-flask', 5);
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'c1');
  svc.onModuleDestroy();
});

// ── teardown ─────────────────────────────────────────────────────────────

test('cleanup tmp workspace', () => {
  fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  assert.ok(!fs.existsSync(tmpWorkspace));
});
