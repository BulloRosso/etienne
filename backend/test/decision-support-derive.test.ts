/**
 * Tests for DecisionSupportService.deriveDecisionFromChat.
 *
 * Validates the LLM → DecisionSuggestion parsing surface:
 *   - well-formed <decision_graph> tag is parsed and returned
 *   - response WITHOUT a <decision_graph> tag returns the empty
 *     suggestion + the full text as the assistantReply
 *   - malformed JSON inside the tag does not crash; returns empty
 *     suggestion + the text-before-tag as the assistantReply
 *   - the prompt sent to the LLM includes the ontology context
 *     section so the model can ground entity IDs
 *
 * Run with: npx tsx backend/test/decision-support-derive.test.ts
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

const PROJECT = 'test-derive';

const VALID_LLM_RESPONSE = `Looking at the situation, the coolant temperature is rising while QA-INSP is logging surface defects on the same parts. This is a textbook coolant-degradation pattern.

<decision_graph>
{
  "title": "Coolant degradation response",
  "description": "Notify operator when coolant + surface defects coincide",
  "reasoning": "Both signals together strongly indicate degraded coolant.",
  "conditions": [
    {
      "id": "cond-1",
      "targetEntityType": "Machine",
      "targetEntityId": "CNC-5AX",
      "property": "coolant_temperature",
      "operator": "gt",
      "value": "65",
      "description": "Coolant above threshold",
      "zeromqEvent": "cnc-5ax/telemetry/coolant_temp_high"
    }
  ],
  "actions": [
    {
      "id": "act-1",
      "name": "Notify operator",
      "description": "Push notification",
      "targetEntityType": "Operator",
      "targetEntityId": "shift-lead",
      "actionType": "notify",
      "parameters": { "priority": "high" },
      "preconditions": ["cond-1"],
      "status": "pending",
      "zeromqEmit": "line/notifications/operator"
    }
  ],
  "nodes": [
    { "id": "n1", "type": "trigger", "label": "fire" },
    { "id": "n2", "type": "condition", "label": "check", "conditionId": "cond-1" },
    { "id": "n3", "type": "action", "label": "notify", "actionId": "act-1" }
  ],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2" }]
}
</decision_graph>`;

const NO_TAG_RESPONSE = "I think we should investigate the coolant. No structured decision needed yet.";

const MALFORMED_RESPONSE = `Here is a graph:

<decision_graph>
{ "title": "broken", "this is not valid json" }
</decision_graph>`;

async function setup(llmResponse: string) {
  const workspace = mkdtempSync(join(tmpdir(), 'dss-derive-'));
  process.env.WORKSPACE_ROOT = workspace;

  const kg = new FakeKnowledgeGraphService();
  const llm = new FakeLlmService(llmResponse);
  const ruleEngine = new FakeRuleEngineService();
  const eventRouter = new FakeEventRouterService();

  // Seed an ontology entity so buildOntologyContext has something real to
  // include in the system prompt — exercises that code path.
  await kg.addEntity(PROJECT, {
    id: 'CNC-5AX',
    type: 'Machine',
    properties: { description: '5-axis mill, coolant-cooled' },
  });

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

  return { svc, llm, kg };
}

async function main(): Promise<void> {
  // 1. Valid LLM response is parsed into a DecisionSuggestion.
  {
    const { svc, llm } = await setup(VALID_LLM_RESPONSE);
    const { suggestion, assistantReply } = await svc.deriveDecisionFromChat(
      PROJECT,
      [{ role: 'user', content: 'coolant is hot, what do we do?' }],
      'Should we notify someone?',
    );

    assert.equal(suggestion.title, 'Coolant degradation response');
    assert.equal(suggestion.conditions.length, 1);
    assert.equal(suggestion.conditions[0]!.targetEntityId, 'CNC-5AX');
    assert.equal(suggestion.conditions[0]!.operator, 'gt');
    assert.equal(suggestion.actions.length, 1);
    assert.equal(suggestion.actions[0]!.zeromqEmit, 'line/notifications/operator');
    // Reply is the prose before the tag.
    assert.ok(
      assistantReply.startsWith('Looking at the situation'),
      'assistantReply should be the prose before the <decision_graph> tag',
    );
    assert.ok(
      !assistantReply.includes('<decision_graph>'),
      'assistantReply should not include the tag itself',
    );
    // System prompt must carry the ontology context — verify the seeded
    // entity ID and type appear in the system message.
    const sys = llm.lastMessages![0]!;
    assert.equal(sys.role, 'system');
    assert.ok(/Machine/.test(sys.content), 'system prompt mentions Machine type');
    assert.ok(/CNC-5AX/.test(sys.content), 'system prompt grounds CNC-5AX entity ID');
    console.log('  PASS  valid response parses into DecisionSuggestion + grounded prompt');
  }

  // 2. Response without a <decision_graph> tag returns empty suggestion
  //    and the full text as the reply.
  {
    const { svc } = await setup(NO_TAG_RESPONSE);
    const { suggestion, assistantReply } = await svc.deriveDecisionFromChat(
      PROJECT,
      [],
      'should we act?',
    );
    assert.deepEqual(suggestion.conditions, [], 'empty suggestion has no conditions');
    assert.deepEqual(suggestion.actions, [], 'empty suggestion has no actions');
    assert.equal(assistantReply, NO_TAG_RESPONSE, 'full response returned as reply');
    console.log('  PASS  no-tag response returns empty suggestion + full reply');
  }

  // 3. Malformed JSON inside the tag does not throw.
  {
    const { svc } = await setup(MALFORMED_RESPONSE);
    const { suggestion, assistantReply } = await svc.deriveDecisionFromChat(
      PROJECT,
      [],
      'try this',
    );
    assert.deepEqual(suggestion.conditions, [], 'parse failure → empty suggestion');
    assert.deepEqual(suggestion.actions, []);
    assert.ok(
      assistantReply.startsWith('Here is a graph'),
      'reply is the text before the tag, not the malformed JSON',
    );
    console.log('  PASS  malformed graph JSON is swallowed without crashing');
  }

  console.log('\n[32m✓ decision-support-derive.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
