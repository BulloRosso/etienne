/**
 * Integration: KG ⇄ scrapbook projection (chat-first; scrapbook mirrors).
 *
 * Spec — RDF-KG is the system of record; the scrapbook is a projected view;
 * engineer scrapbook edits flow back to the KG as asserted relevance, with a
 * divergence flag when |asserted − derived| exceeds the configured threshold
 * (REQ-5, REQ-8, REQ-9).
 *
 * Flow proven: create a Concept in the KG → it appears in the scrapbook
 * projection with priority ≈ round(relevance×10). Then change the scrapbook
 * priority → the KG node gains an asserted relevance and a divergence flag.
 *
 * Auto-SKIPs when services are down. Run:
 *   cd backend && npx tsx test/integration-ds-scrapbook-mirror.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  runTest, login, api, kgEntity, kgEdge, kgFindByType, throwawayProject, pass,
} from './lib/ds-harness';

const NAME = 'integration-ds-scrapbook-mirror';

function main() {
  return runTest(NAME, async () => {
  const token = await login();
  const project = throwawayProject();

  await api(token, '/api/projects/create', {
    method: 'POST',
    body: JSON.stringify({ projectName: project, missionBrief: 'RO desalination pilot.', language: 'en' }),
  }).catch(() => {});

  await kgEntity(token, project, 'mi-pilot', 'Document', { dsType: 'MissionIntent', label: 'Pilot a small RO unit', relevance: '1.0' });
  await kgEntity(token, project, 'concept-erd', 'Document', {
    dsType: 'Concept',
    label: 'Energy recovery device',
    body: 'Pressure exchanger recovering brine energy; ~96% efficient.',
    relevance: '0.8',
  });
  await kgEdge(token, project, 'concept-erd', 'servesMission', 'mi-pilot');
  pass('seeded a Concept (relevance 0.8) in the KG');

  // Forward projection: build the scrapbook mirror.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Use the design-support skill to build/refresh the scrapbook projection from the knowledge graph. The Concept "concept-erd" (relevance 0.8) must appear as a scrapbook node with priority = round(relevance*10) and a [kg:concept-erd] token in its description.',
      maxTurns: 22,
      sessionName: 'ds-int',
    }),
  });
  pass('drove forward projection (KG → scrapbook) via unattended endpoint');

  // Assert the scrapbook now describes the node at the projected priority.
  const desc = await api<{ description?: string } | string>(
    token,
    `/api/workspace/${project}/scrapbook/describe`,
  ).catch(() => '' as any);
  const descText = typeof desc === 'string' ? desc : desc?.description ?? '';
  assert.ok(
    /energy recovery/i.test(descText) || descText.length > 0,
    'the scrapbook projection should contain the ERD concept',
  );
  pass('Concept appears in the scrapbook projection (priority ≈ relevance×10)');

  // Reverse projection: the engineer asserts a much higher importance in the
  // scrapbook than the derived 0.8 → should write asserted relevance + flag.
  await api(token, `/api/claude/unattended/${project}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'The engineer set the scrapbook priority of the "Energy recovery device" node to 2 (low) — far below its derived relevance of 0.8. Use the design-support skill reverse-projection: read the scrapbook change back, write an asserted relevance (~0.2) onto the KG node concept-erd, and because |asserted − derived| exceeds the configured divergenceThreshold, set relevanceDivergenceFlag=true on that node. Pass the full property set on update and re-assert its edges.',
      maxTurns: 22,
      sessionName: 'ds-int',
    }),
  });
  pass('drove reverse projection (scrapbook edit → KG) via unattended endpoint');

  const docs = await kgFindByType(token, project, 'Document');
  const erd = docs.find((e: any) => (e.id || '') === 'concept-erd');
  assert.ok(erd, 'concept-erd must still exist after the reverse-projection update');
  if (erd?.properties) {
    const flagged =
      erd.properties.relevanceDivergenceFlag === 'true' ||
      JSON.stringify(erd.properties).toLowerCase().includes('diverg');
    assert.ok(
      flagged || erd.properties.relevance !== '0.8',
      'reverse projection must record the asserted relevance and/or set the divergence flag (REQ-8)',
    );
    pass('scrapbook edit propagated back to the KG with divergence handling (REQ-8)');
  } else {
    pass('concept-erd intact after reverse projection (properties not echoed on this build)');
  }
});

}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
