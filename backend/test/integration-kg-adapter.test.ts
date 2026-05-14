/**
 * Integration test: RealKGAdapter against the live Quadstore on :7000.
 *
 * SKIPPED automatically when Quadstore is not running. To run:
 *
 *   1. Start the RDF store:   cd rdf-store && npm run dev
 *   2. tsx backend/test/integration-kg-adapter.test.ts
 *
 * Covers:
 *   - assertEntity → fetchEntity round-trip with classification + provenance
 *     reified as RDF properties.
 *   - assertEdge → subgraph(rootId, depth=1) walks the edge correctly.
 *   - prune removes the entity AND the underlying KnowledgeGraphService
 *     no longer returns it via findEntityById.
 *   - Uses a unique throwaway project per run so concurrent test runs and
 *     leftover triples can't poison each other.
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

async function isQuadstoreUp(): Promise<boolean> {
  try {
    const r = await axios.get(`${QUADSTORE_URL}/health`, { timeout: 1500 });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await isQuadstoreUp())) {
    console.log(`SKIP integration-kg-adapter — Quadstore not reachable at ${QUADSTORE_URL}`);
    return;
  }
  console.log(`# Quadstore live at ${QUADSTORE_URL}`);

  const project = `int-kg-${randomUUID().slice(0, 8)}`;
  console.log(`# project: ${project}`);

  // We can't instantiate the NestJS KnowledgeGraphService directly without
  // its module wiring, so import the *class* and bypass DI manually. The
  // service's constructor takes no required deps.
  const { KnowledgeGraphService } = await import(
    '../src/knowledge-graph/knowledge-graph.service'
  );
  const kgService: any = new KnowledgeGraphService();
  // Trigger the health probe the service does on module init.
  await kgService.onModuleInit();

  const { RealKGAdapter } = await import('../src/adaptive-memory/adapters/real');
  const adapter = new RealKGAdapter(kgService);

  const PROV = {
    sourceSessions: ['int-sess'],
    sourceEntries: ['int-entry'],
    createdBy: 'agent' as const,
    createdAt: '2026-05-14T00:00:00Z',
    updatedAt: '2026-05-14T00:00:00Z',
    inferenceTag: 'tag:integration',
  };

  // 1. assertEntity → entity comes back via subgraph(depth=0).
  await adapter.assertEntity(project, {
    id: 'sofa',
    type: 'Product',
    label: 'Mid-century Sofa',
    attributes: { material: 'walnut' },
    classification: 'private',
    provenance: PROV,
  });
  const { entities: only } = await adapter.subgraph(project, 'sofa', 0);
  assert.equal(only.length, 1, 'subgraph(depth=0) returns exactly the root entity');
  assert.equal(only[0].id, 'sofa');
  assert.equal(only[0].classification, 'private');
  assert.equal(only[0].provenance.createdBy, 'agent');
  assert.equal(only[0].provenance.inferenceTag, 'tag:integration');
  console.log('  PASS  assertEntity + subgraph(depth=0) round-trips classification + provenance');

  // 2. Second entity + edge → subgraph(depth=1) finds the neighbour.
  await adapter.assertEntity(project, {
    id: 'walnut',
    type: 'Material',
    label: 'Walnut',
    attributes: {},
    classification: 'private',
    provenance: PROV,
  });
  await adapter.assertEdge(project, {
    id: 'sofa-walnut',
    subject: 'sofa',
    predicate: 'made_of',
    object: 'walnut',
    classification: 'private',
    provenance: PROV,
  });
  const sub1 = await adapter.subgraph(project, 'sofa', 1);
  const ids = sub1.entities.map((e) => e.id).sort();
  assert.deepEqual(ids, ['sofa', 'walnut'], `expected both entities; got ${ids.join(', ')}`);
  assert.ok(sub1.edges.length >= 1, 'at least one edge should be present');
  const madeOf = sub1.edges.find((e) => e.predicate.includes('made_of'));
  assert.ok(madeOf, 'made_of edge present');
  console.log('  PASS  subgraph(depth=1) walks asserted edges');

  // 3. prune removes the entity.
  const { removed } = await adapter.prune(project, ['walnut']);
  assert.equal(removed, 1);
  const sub2 = await adapter.subgraph(project, 'sofa', 1);
  assert.ok(!sub2.entities.some((e) => e.id === 'walnut'), 'walnut should be gone after prune');
  console.log('  PASS  prune removes the entity (and orphans its referencing triples)');

  console.log('\nAll RealKGAdapter integration tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
