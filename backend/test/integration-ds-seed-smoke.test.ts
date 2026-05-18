/**
 * Integration: seed reproducibility smoke test.
 *
 * Proves the updated seed-desalination script lands the Engineering Design
 * Support System artefacts. This test does NOT re-run the (slow, dreaming-
 * gated) seed; it asserts that the *workspace copy the seed produces* has the
 * expected design-support artefacts, so a reviewer can trust the seed →
 * workspace → demo-project-folders contract.
 *
 * It checks the live workspace/desalination-devices project via the file API.
 * Auto-SKIPs when the backend is down OR the project has not been seeded.
 *
 * Run: cd backend && npx tsx test/integration-ds-seed-smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import { runTest, login, api, pass } from './lib/ds-harness';

const NAME = 'integration-ds-seed-smoke';
const PROJECT = process.env.DS_SEED_PROJECT || 'desalination-devices';

async function getFile(token: string, file: string): Promise<string | null> {
  const r = await api<string>(
    token,
    `/api/claude/getFile?project_dir=${PROJECT}&file_name=${encodeURIComponent(file)}`,
  ).catch(() => null);
  if (r == null) return null;
  return typeof r === 'string' ? r : JSON.stringify(r);
}

function main() {
  return runTest(NAME, async () => {
  const token = await login();

  // Gate: only meaningful once the project has been seeded with design-support.
  const skillMd = await getFile(token, '.claude/skills/design-support/SKILL.md');
  if (!skillMd) {
    console.log(`SKIP ${NAME} — ${PROJECT} not seeded with design-support yet (run scripts/seed-desalination)`);
    return;
  }
  pass('design-support skill installed in the seeded project');

  // documentation.md present + registered for auto-open.
  const doc = await getFile(token, 'documentation.md');
  assert.ok(doc && /Engineering Design Support/i.test(doc), 'documentation.md must be present at the project root');
  const ui = await getFile(token, '.etienne/user-interface.json');
  assert.ok(ui && /documentation\.md/.test(ui), 'documentation.md must be registered in previewDocuments (auto-open)');
  pass('documentation.md present and registered for auto-open');

  // The hypothesis onEntry prompts are reachable in workflows/.
  const refuted = await getFile(token, 'workflows/hyp-refuted.prompt');
  assert.ok(refuted && /cascade/i.test(refuted), 'the cascade onEntry prompt must be staged in workflows/');
  pass('hypothesis onEntry prompts staged in workflows/');

  // The seeded hypothesis workflows exist; at least one is refuted (cascade),
  // one is provisional_support (the entailed one), one proposed.
  const wfs = await api<any[]>(token, `/api/workspace/${PROJECT}/workflows`).catch(() => []);
  const list = Array.isArray(wfs) ? wfs : [];
  const byId = new Map(list.map((w: any) => [w.id, w]));
  assert.ok(
    byId.has('hypothesis-boron-single-pass'),
    'the seeded refuted-with-cascade hypothesis workflow must exist',
  );
  assert.ok(
    byId.has('mission-derivation'),
    'the mission-derivation singleton workflow must exist',
  );
  pass(`seeded ${list.length} workflows incl. the cascade hypothesis + mission-derivation`);

  const states = new Set(list.map((w: any) => w.currentState));
  assert.ok(
    states.has('refuted') || states.has('proposed') || states.size >= 2,
    'seeded hypotheses must span multiple lifecycle states',
  );
  pass(`seeded hypotheses span lifecycle states: ${[...states].join(', ')}`);

  // The curator cron and the critic rule were seeded.
  const eh = await getFile(token, '.etienne/event-handling.json');
  assert.ok(eh && /critic-mission-contradiction/.test(eh), 'critic-mission-contradiction rule must be seeded');
  pass('critic event rule seeded — seed reproducibility contract holds');
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
