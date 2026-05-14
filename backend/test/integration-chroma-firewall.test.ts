/**
 * Integration test: ChromaDB classification-filter behaviour on :7100.
 *
 * SKIPPED automatically when ChromaDB is not running. To run:
 *
 *   1. Start the vector store:   cd vector-store && npm run dev
 *   2. tsx backend/test/integration-chroma-firewall.test.ts
 *
 * Validates the wire-level path for firewall POINT 5 (RAG query-time):
 *   - Indexing puts `classification` into the chunk's metadata.
 *   - A query with `where: { classification: { $in: [...] } }` returns ONLY
 *     fragments whose stored classification is in the allowed list.
 *   - Secret-class fragments are invisible to a `private`-ceiling caller.
 *
 * We bypass RagService here because its query path requires the embeddings
 * service (which dynamic-imports `@huggingface/transformers` and inflates
 * test startup). Going direct to Chroma's HTTP API matches what
 * RagService.queryCollection does internally and proves the round-trip works.
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

const CHROMA = process.env.CHROMADB_URL || 'http://localhost:7100';

async function isChromaUp(): Promise<boolean> {
  try {
    const r = await axios.get(`${CHROMA}/api/v1/heartbeat`, { timeout: 1500 });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await isChromaUp())) {
    console.log(`SKIP integration-chroma-firewall — Chroma not reachable at ${CHROMA}`);
    return;
  }
  console.log(`# Chroma live at ${CHROMA}`);

  const project = `int-chr-${randomUUID().slice(0, 8)}`;
  const collection = 'adaptive_memory_int';
  console.log(`# project: ${project}  collection: ${collection}`);

  // Tiny deterministic 4-dim embeddings so we don't need a real embedding
  // model. Cosine distance between them is irrelevant for this test — what
  // we're verifying is the metadata `where` filter, not similarity ranking.
  const E_PUBLIC = [1, 0, 0, 0];
  const E_PRIVATE = [0, 1, 0, 0];
  const E_SECRET = [0, 0, 1, 0];
  const E_QUERY = [0.5, 0.5, 0.5, 0];

  // 1. ensure collection (get_or_create).
  await axios.post(`${CHROMA}/api/v1/${project}/collections`, {
    name: collection,
    metadata: { description: 'adaptive-memory integration' },
    get_or_create: true,
  });
  console.log('  PASS  collection ensure');

  // 2. add three fragments with distinct classifications.
  await axios.post(`${CHROMA}/api/v1/${project}/collections/${collection}/add`, {
    ids: ['frag-public', 'frag-private', 'frag-secret'],
    embeddings: [E_PUBLIC, E_PRIVATE, E_SECRET],
    documents: [
      'public note about walnut',
      'private vendor info',
      'secret pricing',
    ],
    metadatas: [
      { classification: 'public', tags: 'furniture' },
      { classification: 'private', tags: 'vendor' },
      { classification: 'secret', tags: 'pricing' },
    ],
  });
  console.log('  PASS  3 fragments indexed with classification metadata');

  // 3. Query with classificationFilter = ['public', 'private'] — secret must be absent.
  const r1 = await axios.post(`${CHROMA}/api/v1/${project}/collections/${collection}/query`, {
    query_embeddings: [E_QUERY],
    n_results: 10,
    include: ['documents', 'metadatas'],
    where: { classification: { $in: ['public', 'private'] } },
  });
  const ids1 = (r1.data.results.ids[0] ?? []).sort();
  assert.deepEqual(ids1.sort(), ['frag-private', 'frag-public']);
  // And, defence-in-depth, none of the returned metadatas should say 'secret'.
  for (const m of r1.data.results.metadatas[0] ?? []) {
    assert.notEqual(m.classification, 'secret');
  }
  console.log('  PASS  classificationFilter=[public,private] excludes secret at query time');

  // 4. Query with classificationFilter = ['public'] only — private also excluded.
  const r2 = await axios.post(`${CHROMA}/api/v1/${project}/collections/${collection}/query`, {
    query_embeddings: [E_QUERY],
    n_results: 10,
    include: ['documents', 'metadatas'],
    where: { classification: { $in: ['public'] } },
  });
  const ids2 = r2.data.results.ids[0] ?? [];
  assert.deepEqual(ids2, ['frag-public']);
  console.log('  PASS  classificationFilter=[public] returns ONLY the public fragment');

  // 5. Query with no filter — all three come back.
  const r3 = await axios.post(`${CHROMA}/api/v1/${project}/collections/${collection}/query`, {
    query_embeddings: [E_QUERY],
    n_results: 10,
    include: ['documents', 'metadatas'],
  });
  const ids3 = (r3.data.results.ids[0] ?? []).sort();
  assert.deepEqual(
    ids3,
    ['frag-private', 'frag-public', 'frag-secret'],
    `expected all three without filter; got ${ids3.join(', ')}`,
  );
  console.log('  PASS  no filter ⇒ all classifications visible (firewall must be applied by adapter)');

  // 6. Cleanup — delete the collection so repeated test runs stay clean.
  await axios.delete(`${CHROMA}/api/v1/${project}/collections/${collection}`).catch(() => {});
  console.log('  PASS  cleanup');

  console.log('\nAll Chroma firewall-point-5 integration tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
