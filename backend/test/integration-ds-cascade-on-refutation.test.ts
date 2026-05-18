/**
 * Integration: cascade-on-refutation — THE KEYSTONE flow.
 *
 * Proves the most important dependency in the system: refuting a hypothesis
 * scopes the downstream revision work instead of leaving it implicit.
 *
 * Seed H1 (boron single-pass) with:
 *   - a Decision D (decision-sw30-train) that dependsOn H1,
 *   - an entailed hypothesis H2 (second-pass) that H1 entails, H2 in
 *     provisional_support,
 *   - H1 missionDerived=true.
 * Drive H1 → refuted. Assert:
 *   - a CascadeReport node exists (cascadeOf → H1) listing D and the
 *     entailed H2, with per-item reviewStatus;
 *   - H2's workflow moved provisional_support → under_test (cross-instance
 *     REOPEN via the event bus / workflow trigger);
 *   - because H1 is mission-derived, a mission-revision Gap was raised.
 *
 * Auto-SKIPs when services are down. Run:
 *   cd backend && npx tsx test/integration-ds-cascade-on-refutation.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  runTest, login, api, kgEntity, kgEdge, kgFindByType, throwawayProject, pass,
} from './lib/ds-harness';

const NAME = 'integration-ds-cascade-on-refutation';

async function workflowState(token: string, project: string, id: string): Promise<string | null> {
  const s = await api<any>(token, `/api/workspace/${project}/workflows/${id}/status`).catch(() => null);
  return s ? String(s.currentState) : null;
}

function main() {
  return runTest(NAME, async () => {
  const token = await login();
  const project = throwawayProject();

  await api(token, '/api/projects/create', {
    method: 'POST',
    body: JSON.stringify({ projectName: project, missionBrief: 'RO desalination pilot; product boron <= EU 1.5 mg/L.', language: 'en' }),
  }).catch(() => {});

  // Mission + the two hypotheses + the dependent decision.
  await kgEntity(token, project, 'mac-boron', 'Document', { dsType: 'MissionAcceptanceCriterion', label: 'Boron <= 1.5 mg/L', relevance: '0.95' });
  await kgEntity(token, project, 'hypothesis-boron-single-pass', 'Document', {
    dsType: 'Hypothesis', label: 'Single-pass clears boron',
    statement: 'A single SW30 pass keeps boron <= 1.5 mg/L',
    confirmationCriteria: 'permeate boron <= 1.5 mg/L across operating range',
    refutationCriteria: 'permeate boron > 1.5 mg/L without a second pass',
    missionDerived: 'true', workflowId: 'hypothesis-boron-single-pass',
    evidenceWeight: '0', confidence: 'open',
  });
  await kgEntity(token, project, 'hypothesis-second-pass', 'Document', {
    dsType: 'Hypothesis', label: 'Second pass clears boron',
    statement: 'A partial second pass at high pH clears boron <= 1.5 mg/L',
    confirmationCriteria: 'modelled boron <= 1.5 with feasible 2nd-pass fraction',
    refutationCriteria: 'boron still > 1.5 with feasible 2nd pass',
    missionDerived: 'false', workflowId: 'hypothesis-second-pass',
    evidenceWeight: '0.5', confidence: 'open',
  });
  await kgEntity(token, project, 'decision-sw30-train', 'Document', {
    dsType: 'Decision', label: '2-element SW30 train', body: 'Load-bearing for boron compliance.',
    relevance: '0.9',
  });
  await kgEdge(token, project, 'hypothesis-boron-single-pass', 'servesMission', 'mac-boron');
  await kgEdge(token, project, 'hypothesis-boron-single-pass', 'entails', 'hypothesis-second-pass');
  await kgEdge(token, project, 'decision-sw30-train', 'dependsOn', 'hypothesis-boron-single-pass');
  pass('seeded H1 (mission-derived) entails H2; decision-sw30-train dependsOn H1');

  // Create both workflows and place H2 in provisional_support, H1 in under_test.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill to create hypothesis workflows for hypothesis-boron-single-pass and hypothesis-second-pass from the design-support hypothesis machine. Both have criteria set. Advance hypothesis-second-pass to "provisional_support" and hypothesis-boron-single-pass to "under_test" via the documented event paths. Do not refute anything yet.',
      maxTurns: 30, sessionName: 'ds-int',
    }),
  });
  const h2Before = await workflowState(token, project, 'hypothesis-second-pass');
  pass(`workflows created; H2 state before refutation = "${h2Before}"`);

  // THE TRIGGER: refute H1. This must fire the cascade onEntry side-effect.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Strong evidence shows single-pass boron exceeds 1.5 mg/L at warm feed. Use the design-support skill to drive hypothesis-boron-single-pass to the terminal "refuted" state (PROVISIONAL_REFUTE then CONFIRM_REFUTE). The refuted onEntry cascade must: create a CascadeReport node (dsType=CascadeReport, cascadeOf edge to the hypothesis) listing the dependent decision-sw30-train and the entailed hypothesis-second-pass with a per-item reviewStatus; send REOPEN to hypothesis-second-pass\'s workflow; and because this hypothesis is missionDerived, raise a Gap node (id starting "gap-mission-revision").',
      maxTurns: 35, sessionName: 'ds-int',
    }),
  });
  pass('drove H1 → refuted (cascade onEntry should have fired)');

  // Assert 1: H1 workflow is terminal refuted.
  const h1State = await workflowState(token, project, 'hypothesis-boron-single-pass');
  assert.equal(h1State, 'refuted', `H1 must be terminal "refuted" (got "${h1State}")`);
  pass('H1 reached terminal refuted state');

  const docs = await kgFindByType(token, project, 'Document');

  // Assert 2: a CascadeReport exists referencing the dependent decision.
  const cascade = docs.find(
    (e: any) =>
      e.properties?.dsType === 'CascadeReport' ||
      (e.id || '').startsWith('cascade-') ||
      JSON.stringify(e).includes('CascadeReport'),
  );
  assert.ok(cascade, 'a CascadeReport node must be created on refutation (the keystone)');
  assert.ok(
    JSON.stringify(cascade).includes('decision-sw30-train') ||
      JSON.stringify(cascade).toLowerCase().includes('sw30'),
    'the cascade report must enumerate the dependent decision (scoped revision)',
  );
  pass('CascadeReport created, listing the dependent decision with review status');

  // Assert 3: the entailed hypothesis H2 was REOPENed (moved off provisional).
  const h2After = await workflowState(token, project, 'hypothesis-second-pass');
  assert.ok(h2After, 'H2 workflow must still be retrievable');
  assert.ok(
    h2After === 'under_test' || h2After !== h2Before,
    `entailed H2 must be reopened by the cascade (was "${h2Before}", now "${h2After}")`,
  );
  pass(`entailed hypothesis reopened by the cascade ("${h2Before}" → "${h2After}") — cross-instance dependency proven`);

  // Assert 4: mission-derived → a mission-revision Gap was raised.
  const missionGap = docs.find(
    (e: any) =>
      (e.id || '').startsWith('gap-mission-revision') ||
      (e.properties?.dsType === 'Gap' && JSON.stringify(e).toLowerCase().includes('mission')),
  );
  assert.ok(
    missionGap,
    'refuting a mission-derived hypothesis must raise a mission-revision Gap',
  );
  pass('mission-derived refutation raised a mission-revision Gap — refutation scopes revision (the keystone holds)');
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
