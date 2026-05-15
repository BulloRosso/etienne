/**
 * Tests for the ontology entity-management surface of DecisionSupportService.
 *   - createOntologyEntity stamps createdAt automatically
 *   - updateOntologyEntity (rename) actually deletes the old id
 *   - deleteOntologyEntity removes the entity
 *   - getOntologyTypes filters out internal Decision/Action/Condition types
 *   - bootstrapOntology bulk-creates entities + relationships
 *   - getOntologyEntitiesWithGraphLinks returns missingEntities for ids
 *     referenced by a decision graph but not present in the ontology
 *
 * Run with: npx tsx backend/test/decision-support-ontology.test.ts
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FakeKnowledgeGraphService,
  FakeLlmService,
  FakeRuleEngineService,
  FakeEventRouterService,
  FakeGraphBuilderService,
} from './decision-support-fakes';

const PROJECT = 'test-ontology';

async function setup() {
  const workspace = mkdtempSync(join(tmpdir(), 'dss-onto-'));
  process.env.WORKSPACE_ROOT = workspace;
  const kg = new FakeKnowledgeGraphService();
  const { DecisionSupportService } = await import(
    '../src/ontology-core/decision-support.service'
  );
  const svc = new DecisionSupportService(
    kg as any,
    new FakeGraphBuilderService() as any,
    new FakeLlmService('') as any,
    new FakeRuleEngineService() as any,
    new FakeEventRouterService() as any,
  );
  return { svc, kg };
}

async function main(): Promise<void> {
  // 1. createOntologyEntity stamps createdAt when missing.
  {
    const { svc, kg } = await setup();
    await svc.createOntologyEntity(PROJECT, 'CNC-5AX', 'Machine', { description: '5-axis mill' });
    const e = await kg.findEntityById(PROJECT, 'CNC-5AX');
    assert.ok(e, 'entity exists');
    assert.equal(e!.type, 'Machine');
    assert.equal(e!.description, '5-axis mill');
    assert.ok(typeof e!.createdAt === 'string', 'createdAt auto-stamped');
    console.log('  PASS  createOntologyEntity stamps createdAt');
  }

  // 2. createOntologyEntity preserves an existing createdAt.
  {
    const { svc, kg } = await setup();
    const fixed = '2026-05-15T08:00:00Z';
    await svc.createOntologyEntity(PROJECT, 'CNC-5AX', 'Machine', { createdAt: fixed });
    const e = await kg.findEntityById(PROJECT, 'CNC-5AX');
    assert.equal(e!.createdAt, fixed, 'existing createdAt preserved');
    console.log('  PASS  createOntologyEntity preserves existing createdAt');
  }

  // 3. updateOntologyEntity (rename) deletes the old id.
  {
    const { svc, kg } = await setup();
    await svc.createOntologyEntity(PROJECT, 'OLD-ID', 'Machine', {});
    await svc.updateOntologyEntity(PROJECT, 'OLD-ID', 'NEW-ID', 'Machine', { description: 'renamed' });
    assert.equal(await kg.findEntityById(PROJECT, 'OLD-ID'), null, 'old id removed');
    const moved = await kg.findEntityById(PROJECT, 'NEW-ID');
    assert.ok(moved, 'new id exists');
    assert.equal(moved!.description, 'renamed');
    console.log('  PASS  updateOntologyEntity rename removes old id');
  }

  // 4. deleteOntologyEntity removes the entity.
  {
    const { svc, kg } = await setup();
    await svc.createOntologyEntity(PROJECT, 'TODELETE', 'Machine', {});
    await svc.deleteOntologyEntity(PROJECT, 'TODELETE');
    assert.equal(await kg.findEntityById(PROJECT, 'TODELETE'), null);
    console.log('  PASS  deleteOntologyEntity removes the entity');
  }

  // 5. getOntologyTypes filters out internal Decision/Action/Condition prefixes.
  {
    const { svc, kg } = await setup();
    await kg.addEntity(PROJECT, { id: 'CNC-5AX', type: 'Machine', properties: {} });
    await kg.addEntity(PROJECT, { id: 'OP-1', type: 'Operator', properties: {} });
    await kg.addEntity(PROJECT, { id: 'Decision/g1', type: 'DecisionGraph', properties: {} });
    await kg.addEntity(PROJECT, { id: 'Action/a1', type: 'ActionDef', properties: {} });
    const types = await svc.getOntologyTypes(PROJECT);
    assert.ok(types.includes('Machine'), 'Machine kept');
    assert.ok(types.includes('Operator'), 'Operator kept');
    assert.ok(!types.includes('DecisionGraph'), 'DecisionGraph filtered');
    assert.ok(!types.includes('ActionDef'), 'ActionDef filtered');
    console.log('  PASS  getOntologyTypes filters internal prefixes');
  }

  // 6. bootstrapOntology bulk-creates entities + relationships.
  {
    const { svc, kg } = await setup();
    const result = await svc.bootstrapOntology(
      PROJECT,
      [
        { id: 'CNC-5AX', type: 'Machine', properties: { sequence: '1' } },
        { id: 'DEBURR-HAND', type: 'Machine', properties: { sequence: '2' } },
        { id: 'QA-INSP', type: 'Machine', properties: { sequence: '3' } },
      ],
      [
        { subject: 'CNC-5AX', predicate: 'precedes', object: 'DEBURR-HAND' },
        { subject: 'DEBURR-HAND', predicate: 'precedes', object: 'QA-INSP' },
      ],
    );
    assert.equal(result.entitiesCreated, 3);
    assert.equal(result.relationshipsCreated, 2);
    assert.equal((await kg.findEntitiesByType(PROJECT, 'Machine')).length, 3);
    assert.equal(kg._allRelationships(PROJECT).length, 2);
    console.log('  PASS  bootstrapOntology bulk-creates entities + relationships');
  }

  // 7. Missing-entity detection: a decision graph that targets an id
  //    no longer present in the ontology surfaces in missingEntities.
  {
    const { svc, kg } = await setup();
    await kg.addEntity(PROJECT, { id: 'CNC-5AX', type: 'Machine', properties: {} });
    await svc.saveDecisionGraph(PROJECT, {
      id: 'g-missing-target',
      title: 't', description: 'd', project: PROJECT,
      createdAt: '2026-05-15T08:00:00Z', updatedAt: '2026-05-15T08:00:00Z',
      conditions: [
        { id: 'c1', targetEntityType: 'Machine', targetEntityId: 'GHOST-MACHINE',
          property: 'foo', operator: 'eq', value: 'bar', description: '' },
      ],
      actions: [
        { id: 'a1', name: 'n', description: 'd', targetEntityType: 'Operator',
          targetEntityId: 'GHOST-OPERATOR', actionType: 'notify', parameters: {},
          preconditions: ['c1'], status: 'pending' },
      ],
      nodes: [], edges: [],
    });
    const map = await svc.getOntologyEntitiesWithGraphLinks(PROJECT);
    const missingIds = map.missingEntities.map((m) => m.id).sort();
    assert.deepEqual(missingIds, ['GHOST-MACHINE', 'GHOST-OPERATOR']);
    // The non-missing CNC-5AX entity should NOT be in missingEntities.
    assert.ok(map.entities.some((e) => e.id === 'CNC-5AX'), 'CNC-5AX is in entities');
    assert.ok(!map.missingEntities.some((m) => m.id === 'CNC-5AX'), 'CNC-5AX not in missing');
    console.log('  PASS  getOntologyEntitiesWithGraphLinks surfaces missing referenced ids');
  }

  console.log('\n[32m✓ decision-support-ontology.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
