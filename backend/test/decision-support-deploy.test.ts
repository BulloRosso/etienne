/**
 * Tests for DecisionSupportService.deployAsRules.
 *
 *   - deployAsRules on an unknown graphId throws
 *   - one action → one EventRule pushed to the rule engine
 *   - rule.enabled mirrors action.status === 'approved'
 *     (only approved actions become live rules)
 *   - rule.condition.event.name uses the precondition's zeromqEvent if
 *     present, falling back to the action.name
 *   - saveRules is called once per project after the batch
 *
 * Run with: npx tsx backend/test/decision-support-deploy.test.ts
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

const PROJECT = 'test-deploy';

function makeGraphWithTwoActions() {
  return {
    id: 'g-deploy-test',
    title: 'Deploy test',
    description: '',
    project: PROJECT,
    createdAt: '2026-05-15T08:00:00Z',
    updatedAt: '2026-05-15T08:00:00Z',
    conditions: [
      {
        id: 'c-with-zmq',
        targetEntityType: 'Machine',
        targetEntityId: 'CNC-5AX',
        property: 'temp',
        operator: 'gt' as const,
        value: '65',
        description: 'has zmq event',
        zeromqEvent: 'cnc-5ax/telemetry/coolant_temp_high',
      },
      {
        id: 'c-no-zmq',
        targetEntityType: 'Machine',
        targetEntityId: 'QA-INSP',
        property: 'reject_rate',
        operator: 'gt' as const,
        value: '10',
        description: 'no zmq event',
      },
    ],
    actions: [
      {
        id: 'a-approved',
        name: 'Approved action',
        description: 'live rule',
        targetEntityType: 'Operator',
        targetEntityId: 'op-1',
        actionType: 'notify',
        parameters: {},
        preconditions: ['c-with-zmq'],
        status: 'approved' as const,
        zeromqEmit: 'line/notifications/approved',
      },
      {
        id: 'a-pending',
        name: 'Pending action',
        description: 'shadow rule',
        targetEntityType: 'Operator',
        targetEntityId: 'op-2',
        actionType: 'notify',
        parameters: {},
        preconditions: ['c-no-zmq'],
        status: 'pending' as const,
      },
    ],
    nodes: [], edges: [],
  };
}

async function setup() {
  const workspace = mkdtempSync(join(tmpdir(), 'dss-deploy-'));
  process.env.WORKSPACE_ROOT = workspace;
  const kg = new FakeKnowledgeGraphService();
  const ruleEngine = new FakeRuleEngineService();
  const { DecisionSupportService } = await import(
    '../src/ontology-core/decision-support.service'
  );
  const svc = new DecisionSupportService(
    kg as any,
    new FakeGraphBuilderService() as any,
    new FakeLlmService('') as any,
    ruleEngine as any,
    new FakeEventRouterService() as any,
  );
  return { svc, kg, ruleEngine };
}

async function main(): Promise<void> {
  // 1. Unknown graphId throws.
  {
    const { svc } = await setup();
    await assert.rejects(
      () => svc.deployAsRules(PROJECT, 'does-not-exist'),
      /not found/i,
      'expected deploy of unknown graph to throw',
    );
    console.log('  PASS  deployAsRules on missing graph throws');
  }

  // 2. Two actions → two rules; saveRules called exactly once.
  {
    const { svc, ruleEngine } = await setup();
    await svc.saveDecisionGraph(PROJECT, makeGraphWithTwoActions());
    const result = await svc.deployAsRules(PROJECT, 'g-deploy-test');

    assert.equal(result.ruleCount, 2);
    assert.equal(result.ruleIds.length, 2);
    assert.equal(ruleEngine.rulesAdded.length, 2, 'two addRule calls');
    assert.equal(ruleEngine.savedFor.length, 1, 'one saveRules call');
    assert.equal(ruleEngine.savedFor[0], PROJECT, 'saveRules called for the right project');
    console.log('  PASS  two actions → two rules + single saveRules');
  }

  // 3. Rule.enabled reflects action.status === 'approved'.
  {
    const { svc, ruleEngine } = await setup();
    await svc.saveDecisionGraph(PROJECT, makeGraphWithTwoActions());
    await svc.deployAsRules(PROJECT, 'g-deploy-test');

    const rules = ruleEngine.rulesAdded.map((r) => r.rule);
    const approvedRule = rules.find((r) => /Approved action/.test(r.name));
    const pendingRule = rules.find((r) => /Pending action/.test(r.name));
    assert.ok(approvedRule, 'approved rule present');
    assert.ok(pendingRule, 'pending rule present');
    assert.equal(approvedRule.enabled, true, 'approved → enabled');
    assert.equal(pendingRule.enabled, false, 'pending → not enabled (shadow rule)');
    console.log('  PASS  rule.enabled mirrors action.status === approved');
  }

  // 4. trigger event uses precondition.zeromqEvent when present, falls back
  //    to action.name otherwise.
  {
    const { svc, ruleEngine } = await setup();
    await svc.saveDecisionGraph(PROJECT, makeGraphWithTwoActions());
    await svc.deployAsRules(PROJECT, 'g-deploy-test');

    const rules = ruleEngine.rulesAdded.map((r) => r.rule);
    const approvedRule = rules.find((r) => /Approved action/.test(r.name))!;
    const pendingRule = rules.find((r) => /Pending action/.test(r.name))!;

    assert.equal(
      approvedRule.condition.event.name,
      'cnc-5ax/telemetry/coolant_temp_high',
      'approved rule uses precondition zeromqEvent',
    );
    assert.equal(
      pendingRule.condition.event.name,
      'Pending action',
      'pending rule (no zmq event on precondition) falls back to action.name',
    );
    console.log('  PASS  trigger event uses zeromqEvent or falls back to action.name');
  }

  // 5. Rule name is consistently prefixed.
  {
    const { svc, ruleEngine } = await setup();
    await svc.saveDecisionGraph(PROJECT, makeGraphWithTwoActions());
    await svc.deployAsRules(PROJECT, 'g-deploy-test');
    for (const { rule } of ruleEngine.rulesAdded) {
      assert.ok(rule.name.startsWith('[Ontology] '), `rule name prefixed: ${rule.name}`);
      assert.equal(rule.condition.type, 'simple');
      assert.equal(rule.condition.event.group, 'Ontology');
      assert.equal(rule.action.type, 'prompt');
    }
    console.log('  PASS  rule envelope (name prefix, condition shape, action type) is consistent');
  }

  console.log('\n[32m✓ decision-support-deploy.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
