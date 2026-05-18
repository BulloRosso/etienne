/**
 * Integration: hypothesis workflow gate + state-as-single-source-of-truth.
 *
 * The optional hypothesis component. Proves: the workflow engine drives the
 * lifecycle; the onEntry-prompt gate enforces the anti-vagueness rule (cannot
 * leave `proposed` without confirmation AND refutation criteria); the
 * workflow state — not a KG property — is the lifecycle truth (REQ-18).
 *
 * Critical because the platform does NOT evaluate XState guards: this proves
 * the onEntry-prompt-gate workaround actually gates.
 *
 * Auto-SKIPs when services are down. Run:
 *   cd backend && npx tsx test/integration-ds-hypothesis-lifecycle.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  runTest, login, api, kgEntity, throwawayProject, pass,
} from './lib/ds-harness';

const NAME = 'integration-ds-hypothesis-lifecycle';

function main() {
  return runTest(NAME, async () => {
  const token = await login();
  const project = throwawayProject();

  await api(token, '/api/projects/create', {
    method: 'POST',
    body: JSON.stringify({ projectName: project, missionBrief: 'RO desalination pilot; comply with EU boron limit.', language: 'en' }),
  }).catch(() => {});

  // Seed a Hypothesis node WITHOUT criteria (the gate must block it).
  await kgEntity(token, project, 'hypothesis-boron-single-pass', 'Document', {
    dsType: 'Hypothesis',
    label: 'Single SW30 pass keeps boron <= 1.5 mg/L',
    statement: 'A single SW30 pass keeps product-water boron <= 1.5 mg/L for this feedwater',
    confirmationCriteria: '',
    refutationCriteria: '',
    workflowId: 'hypothesis-boron-single-pass',
    evidenceWeight: '0',
    confidence: 'open',
  });
  pass('seeded a Hypothesis node with EMPTY confirm/refute criteria');

  // Create the workflow (proposed) and attempt to advance with empty criteria.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill (hypothesis mode) to create the hypothesis workflow for hypothesis-boron-single-pass from the design-support hypothesis machine, then run its proposed-state entry logic. The criteria are empty, so the anti-vagueness gate MUST refuse to advance — the workflow must stay in "proposed". Do not invent criteria.',
      maxTurns: 22,
      sessionName: 'ds-int',
    }),
  });
  pass('created workflow + ran proposed-state gate with empty criteria');

  // Assert: workflow exists and is still in `proposed` (gate held).
  const status1 = await api<any>(
    token,
    `/api/workspace/${project}/workflows/hypothesis-boron-single-pass/status`,
  ).catch(() => null);
  assert.ok(status1, 'the hypothesis workflow must have been created');
  assert.equal(
    String(status1.currentState),
    'proposed',
    `anti-vagueness gate must keep the workflow in "proposed" while criteria are empty (got "${status1.currentState}")`,
  );
  pass('anti-vagueness gate held: workflow still in "proposed" with empty criteria');

  // Now supply criteria and let the gate pass.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'The engineer supplies criteria for hypothesis-boron-single-pass. Confirmation: "pilot permeate boron measured <= 1.5 mg/L across the expected feed pH/temperature range". Refutation: "permeate boron > 1.5 mg/L at any expected operating point without a second pass". Use the design-support skill to write these onto the Hypothesis node (full props, re-assert edges) and re-run the proposed-state gate, which should now SHARPEN the workflow.',
      maxTurns: 22,
      sessionName: 'ds-int',
    }),
  });
  pass('supplied criteria + re-ran the gate');

  const status2 = await api<any>(
    token,
    `/api/workspace/${project}/workflows/hypothesis-boron-single-pass/status`,
  ).catch(() => null);
  assert.ok(status2, 'workflow status must still be retrievable');
  assert.notEqual(
    String(status2.currentState),
    'proposed',
    `with both criteria present the gate must allow progress past "proposed" (still "${status2.currentState}")`,
  );
  pass(`gate released once criteria present (now "${status2.currentState}") — workflow state is the lifecycle truth (REQ-18)`);
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
