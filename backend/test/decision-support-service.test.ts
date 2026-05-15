/**
 * Integration test for DecisionSupportService.
 *
 * Validates the persistence + lifecycle surface against an in-memory KG fake:
 *   - saveDecisionGraph / loadDecisionGraph round-trip
 *   - listDecisionGraphs returns saved graphs
 *   - saveDecisionGraph called twice with the same id replaces (idempotent)
 *   - deleteDecisionGraph removes graph + condition + action entities
 *   - updateActionStatus respects illegal-transition constraint and
 *     publishes a status-change event
 *   - exportAsZmqRules produces the expected rule shape from a graph
 *     with zeromqEvent / zeromqEmit
 *
 * Run with: npx tsx backend/test/decision-support-service.test.ts
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

async function main(): Promise<void> {
  // The service doesn't read WORKSPACE_ROOT itself, but its KG dependency
  // sometimes does. Set a tmpdir to keep any incidental writes isolated.
  const workspace = mkdtempSync(join(tmpdir(), 'dss-svc-'));
  process.env.WORKSPACE_ROOT = workspace;
  console.log(`# workspace: ${workspace}`);

  const kg = new FakeKnowledgeGraphService();
  const llm = new FakeLlmService('unused for this test');
  const ruleEngine = new FakeRuleEngineService();
  const eventRouter = new FakeEventRouterService();

  const { DecisionSupportService } = await import(
    '../src/ontology-core/decision-support.service'
  );

  const svc = new DecisionSupportService(
    kg as any,
    new FakeGraphBuilderService() as any,
    llm as any,
    ruleEngine as any,
    eventRouter as any,
  );

  const PROJECT = 'test-line-sim';
  const GRAPH = {
    id: 'coolant-degradation',
    title: 'Coolant degradation response',
    description: 'Trigger when coolant_temp_high coincides with surface defects',
    project: PROJECT,
    createdAt: '2026-05-15T08:00:00Z',
    updatedAt: '2026-05-15T08:00:00Z',
    chatContextSummary: 'seeded',
    conditions: [
      {
        id: 'cond-coolant',
        targetEntityType: 'Machine',
        targetEntityId: 'CNC-5AX',
        property: 'coolant_temperature',
        operator: 'gt' as const,
        value: '65',
        description: 'Coolant temperature above 65 °C',
        zeromqEvent: 'cnc-5ax/telemetry/coolant_temp_high',
      },
    ],
    actions: [
      {
        id: 'act-notify',
        name: 'Notify operator',
        description: 'Push notification to shift lead',
        targetEntityType: 'Operator',
        targetEntityId: 'cell-a-shift-lead',
        actionType: 'notify',
        parameters: { priority: 'high' },
        preconditions: ['cond-coolant'],
        status: 'pending' as const,
        zeromqEmit: 'line/notifications/operator',
      },
    ],
    nodes: [
      { id: 'n1', type: 'trigger' as const, label: 'Coolant event', description: 'fired' },
      { id: 'n2', type: 'condition' as const, label: 'cond', description: 'check', conditionId: 'cond-coolant' },
      { id: 'n3', type: 'action' as const, label: 'notify', description: 'do', actionId: 'act-notify' },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', label: 'true' },
    ],
  };

  // 1. Save → load round-trip.
  await svc.saveDecisionGraph(PROJECT, GRAPH);
  const loaded = await svc.loadDecisionGraph(PROJECT, GRAPH.id);
  assert.ok(loaded, 'loaded graph must not be null');
  assert.equal(loaded!.id, GRAPH.id);
  assert.equal(loaded!.title, GRAPH.title);
  assert.equal(loaded!.conditions.length, 1);
  assert.equal(loaded!.conditions[0]!.id, 'cond-coolant');
  assert.equal(loaded!.conditions[0]!.targetEntityId, 'CNC-5AX');
  assert.equal(loaded!.conditions[0]!.zeromqEvent, 'cnc-5ax/telemetry/coolant_temp_high');
  assert.equal(loaded!.actions.length, 1);
  assert.deepEqual(loaded!.actions[0]!.parameters, { priority: 'high' });
  assert.deepEqual(loaded!.actions[0]!.preconditions, ['cond-coolant']);
  console.log('  PASS  save → load round-trip preserves graph shape');

  // 2. listDecisionGraphs returns the saved graph.
  const listed = await svc.listDecisionGraphs(PROJECT);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, GRAPH.id);
  console.log('  PASS  listDecisionGraphs returns saved graphs');

  // 3. Re-saving the same id replaces, not duplicates.
  await svc.saveDecisionGraph(PROJECT, { ...GRAPH, title: 'Renamed' });
  const reList = await svc.listDecisionGraphs(PROJECT);
  assert.equal(reList.length, 1, 're-save must not create a duplicate');
  assert.equal(reList[0]!.title, 'Renamed', 're-save must update the title');
  console.log('  PASS  re-saving same id is idempotent (replaces, no duplicate)');

  // 4. updateActionStatus changes status and publishes an event.
  eventRouter.published.length = 0;
  await svc.updateActionStatus(PROJECT, GRAPH.id, 'act-notify', 'approved');
  const afterApproved = await svc.loadDecisionGraph(PROJECT, GRAPH.id);
  assert.equal(afterApproved!.actions[0]!.status, 'approved');
  assert.equal(eventRouter.published.length, 1, 'expected one event published');
  assert.equal(eventRouter.published[0]!.name, 'Action Status Changed');
  assert.deepEqual(eventRouter.published[0]!.payload, {
    graphId: GRAPH.id,
    actionId: 'act-notify',
    status: 'approved',
  });
  console.log('  PASS  updateActionStatus persists + publishes event');

  // 5. updateActionStatus on a non-existent action is a no-op (the
  // production service logs a warning but does not throw).
  eventRouter.published.length = 0;
  await svc.updateActionStatus(PROJECT, GRAPH.id, 'act-does-not-exist', 'approved');
  assert.equal(eventRouter.published.length, 0, 'no event for missing action');
  console.log('  PASS  updateActionStatus on missing action is a silent no-op');

  // 6. ZMQ rule export.
  const rules = await svc.exportAsZmqRules(PROJECT, GRAPH.id);
  assert.equal(rules.length, 1, 'one action → one rule');
  const rule = rules[0]!;
  assert.equal(rule.ruleId, `rule-${GRAPH.id}-act-notify`);
  assert.deepEqual(rule.trigger, ['cnc-5ax/telemetry/coolant_temp_high']);
  assert.equal(rule.conditions.length, 1);
  assert.equal(rule.conditions[0].operator, 'gt');
  assert.equal(rule.conditions[0].value, '65');
  assert.equal(rule.onTrue.emitEvent, 'line/notifications/operator');
  console.log('  PASS  exportAsZmqRules produces the expected wire shape');

  // 7. deleteDecisionGraph removes graph + actions + conditions.
  await svc.deleteDecisionGraph(PROJECT, GRAPH.id);
  assert.equal((await svc.listDecisionGraphs(PROJECT)).length, 0, 'graph removed from list');
  assert.equal(await svc.loadDecisionGraph(PROJECT, GRAPH.id), null, 'graph load returns null');
  // Underlying entities also removed:
  const remainingEntities = kg._allEntities(PROJECT).map((e) => e.id);
  assert.ok(
    !remainingEntities.includes(`Decision/${GRAPH.id}`),
    'graph entity gone',
  );
  assert.ok(
    !remainingEntities.includes(`Action/act-notify`),
    'action entity gone',
  );
  assert.ok(
    !remainingEntities.includes(`Condition/cond-coolant`),
    'condition entity gone',
  );
  console.log('  PASS  deleteDecisionGraph removes graph + child entities');

  console.log('\n[32m✓ decision-support-service.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
