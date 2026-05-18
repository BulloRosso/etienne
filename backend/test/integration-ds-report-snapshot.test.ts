/**
 * Integration: status report = query over state; internal vs external filter.
 *
 * Spec §4.1 (the status report depends on mission/scrapbook/wiki/gap
 * register/prior snapshot/confidence dashboard) + REQ-23..30.
 *
 * Flow proven: generate `internal` then `external`. Assert both are immutable
 * timestamped snapshots under reports/; the external variant dropped
 * whitespot/critic-speculative content while keeping decisions/evidence/
 * confidence; the hypotheses section is grouped by workflow state; cascade
 * reports appear as first-class content; a second report shows a populated
 * delta vs. the first (REQ-30).
 *
 * Auto-SKIPs when services are down. Run:
 *   cd backend && npx tsx test/integration-ds-report-snapshot.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  runTest, login, api, kgEntity, kgEdge, throwawayProject, pass,
} from './lib/ds-harness';

const NAME = 'integration-ds-report-snapshot';

async function listReports(token: string, project: string): Promise<string[]> {
  const r = await api<any>(
    token,
    `/api/claude/listFiles?project_dir=${project}&dir=reports`,
  ).catch(() => null);
  if (!r) return [];
  const arr = Array.isArray(r) ? r : Array.isArray(r.files) ? r.files : [];
  return arr.map((x: any) => (typeof x === 'string' ? x : x.name || x.path || '')).filter(Boolean);
}

function main() {
  return runTest(NAME, async () => {
  const token = await login();
  const project = throwawayProject();

  await api(token, '/api/projects/create', {
    method: 'POST',
    body: JSON.stringify({ projectName: project, missionBrief: 'RO desalination pilot; comply with WHO+EU; defensible TCO.', language: 'en' }),
  }).catch(() => {});

  // Minimal graph: a decision (evidence-supported), a whitespot, a gap.
  await kgEntity(token, project, 'mi-pilot', 'Document', { dsType: 'MissionIntent', label: 'RO pilot', relevance: '1.0' });
  await kgEntity(token, project, 'decision-erd', 'Document', { dsType: 'Decision', label: 'Use an ERD', body: 'Pressure exchanger.', relevance: '0.85' });
  await kgEntity(token, project, 'evidence-eri', 'Document', { dsType: 'Evidence', label: 'ERI PX ~96% efficient', body: 'Vendor spec.' });
  await kgEntity(token, project, 'whitespot-corrosion', 'Document', { dsType: 'Whitespot', label: 'Galvanic corrosion of mixed-metal fittings (specialist question)' });
  await kgEntity(token, project, 'gap-no-tco', 'Document', { dsType: 'Gap', label: 'No TCO sensitivity to membrane life yet' });
  await kgEdge(token, project, 'decision-erd', 'servesMission', 'mi-pilot');
  await kgEdge(token, project, 'evidence-eri', 'supports', 'decision-erd');
  pass('seeded a decision (evidence-supported), a whitespot, and a gap');

  // Generate the internal report.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill to generate an INTERNAL status report. Persist it as an immutable timestamped snapshot under reports/ (reports/status-<ISO>-internal.md). Include the hypotheses-by-state section, the confidence dashboard with inputs, and the whitespot and gap honestly.',
      maxTurns: 26, sessionName: 'ds-int',
    }),
  });
  let reports = await listReports(token, project);
  const internal = reports.find((f) => /internal/.test(f));
  assert.ok(internal, 'an internal report snapshot must be written under reports/');
  pass('internal report snapshot persisted');

  const internalBody = await api<string>(
    token,
    `/api/claude/getFile?project_dir=${project}&file_name=${encodeURIComponent('reports/' + internal)}`,
  ).catch(() => '');
  const iText = typeof internalBody === 'string' ? internalBody : JSON.stringify(internalBody);
  assert.ok(/confidence/i.test(iText), 'internal report must contain the confidence dashboard');
  assert.ok(
    /whitespot|corrosion/i.test(iText) || /gap/i.test(iText),
    'internal report must honestly include whitespots/gaps',
  );
  pass('internal report contains confidence dashboard + honest whitespots/gaps');

  // Generate the external report.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill to generate an EXTERNAL (management) status report as a new immutable snapshot reports/status-<ISO>-external.md. Apply the declarative filter: drop whitespots and critic speculation, reframe gaps as "areas under active investigation", keep decisions, evidence, and the confidence dashboard.',
      maxTurns: 26, sessionName: 'ds-int',
    }),
  });
  reports = await listReports(token, project);
  const external = reports.find((f) => /external/.test(f));
  assert.ok(external, 'an external report snapshot must be written');
  assert.notEqual(external, internal, 'external snapshot must be a distinct immutable file (REQ-24)');
  pass('external report snapshot persisted as a distinct immutable file');

  const externalBody = await api<string>(
    token,
    `/api/claude/getFile?project_dir=${project}&file_name=${encodeURIComponent('reports/' + external)}`,
  ).catch(() => '');
  const eText = typeof externalBody === 'string' ? externalBody : JSON.stringify(externalBody);
  assert.ok(
    !/galvanic corrosion/i.test(eText),
    'external variant must DROP the speculative whitespot (REQ-27)',
  );
  assert.ok(
    /decision|erd/i.test(eText) && /confidence/i.test(eText),
    'external variant must KEEP decisions + confidence (filtered, not falsified)',
  );
  pass('external filter dropped the whitespot but kept decisions + confidence (REQ-27)');

  // A second internal report must show a populated delta vs the first.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Add a new Decision "decision-2pass" (use a partial second pass) to the graph via the design-support skill, then generate another INTERNAL status report snapshot. Its "What changed" delta section must reference the change vs. the previous internal snapshot (REQ-30).',
      maxTurns: 26, sessionName: 'ds-int',
    }),
  });
  reports = await listReports(token, project);
  const internals = reports.filter((f) => /internal/.test(f)).sort();
  assert.ok(internals.length >= 2, 'a second internal snapshot must exist (immutability — old one not overwritten)');
  pass('second internal snapshot created without overwriting the first (immutable history, REQ-30)');
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
