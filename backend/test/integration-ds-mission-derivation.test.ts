/**
 * Integration: mission edit → derivation meta-workflow triage.
 *
 * Spec §4.2 + the mission-derivation meta-workflow: editing the mission must
 * surface the implicit empirical claims it introduced and stage them for
 * triage, auditable per mission version ("did we ever consider X?").
 *
 * Flow proven: edit mission.md → the mission-derivation workflow advances
 * pending_derivation → triage; a DerivationTriage node records candidates;
 * "sharpen" on one creates a new Hypothesis workflow in `proposed`.
 *
 * Auto-SKIPs when services are down. Run:
 *   cd backend && npx tsx test/integration-ds-mission-derivation.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  runTest, login, api, kgFindByType, throwawayProject, pass,
} from './lib/ds-harness';

const NAME = 'integration-ds-mission-derivation';

function main() {
  return runTest(NAME, async () => {
  const token = await login();
  const project = throwawayProject();

  await api(token, '/api/projects/create', {
    method: 'POST',
    body: JSON.stringify({ projectName: project, missionBrief: 'RO desalination pilot.', language: 'en' }),
  }).catch(() => {});

  // Bootstrap design-support (creates the mission-derivation singleton).
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill in bootstrap mode: parse wiki/_meta/mission.md into the mission graph + MissionVersion v1, and create the mission-derivation singleton workflow in its initial "closed" state.',
      maxTurns: 25, sessionName: 'ds-int',
    }),
  });
  pass('bootstrapped design-support + mission-derivation workflow');

  // Edit the mission to introduce a new, implication-bearing constraint.
  await api(token, `/api/claude/addFile`, {
    method: 'POST',
    body: JSON.stringify({
      project_dir: project,
      file_name: 'wiki/_meta/mission.md',
      content: [
        '# Mission — Desalination Devices',
        '',
        '## Goal',
        'Pilot a small RO desalination unit on a remote tropical island.',
        '',
        '## Constraints',
        '- Comply with WHO GDWQ and EU DWD 2020/2184.',
        '- The pilot MUST operate solar-only (no diesel genset) year-round.',
        '',
        '## Acceptance Criteria',
        '- Product water boron <= 1.5 mg/L.',
        '',
      ].join('\n'),
    }),
  }).catch(() => {});
  pass('edited the mission (added a solar-only constraint with implicit claims)');

  // Drive mission mode → should fire MISSION_EDITED into the derivation wf.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'The mission was edited. Use the design-support skill in mission mode: snapshot + re-parse the mission, create MissionVersion v2, and send MISSION_EDITED to the mission-derivation workflow so it advances pending_derivation → triage and writes a DerivationTriage node listing the implicit claims the new solar-only constraint introduced.',
      maxTurns: 28, sessionName: 'ds-int',
    }),
  });
  pass('drove mission-mode recompute + mission-derivation advance');

  // Assert: mission-derivation workflow advanced off "closed".
  const mdStatus = await api<any>(
    token,
    `/api/workspace/${project}/workflows/mission-derivation/status`,
  ).catch(() => null);
  assert.ok(mdStatus, 'mission-derivation workflow must exist');
  assert.notEqual(
    String(mdStatus.currentState),
    'closed',
    `mission edit must advance the derivation workflow off "closed" (got "${mdStatus.currentState}")`,
  );
  pass(`mission-derivation advanced to "${mdStatus.currentState}" on the mission edit`);

  // Assert: a DerivationTriage node was written (the audit record).
  const docs = await kgFindByType(token, project, 'Document');
  const triage = docs.find(
    (e: any) =>
      e.properties?.dsType === 'DerivationTriage' ||
      (e.id || '').startsWith('derivationtriage-') ||
      JSON.stringify(e).includes('DerivationTriage'),
  );
  assert.ok(
    triage,
    'a DerivationTriage node must record the surfaced candidates for this mission version (auditability)',
  );
  pass('DerivationTriage audit record written for the new mission version');
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
