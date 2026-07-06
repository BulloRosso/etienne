/**
 * Seed the `tendertrace-stadtwerke` example project — TenderTrace
 * (requirements tracking) mid-story.
 *
 * The narrative (spec requirements-docs/requirements-tracking/
 * requirements-tracking.md §2): Lena, bid manager at NovaSys GmbH, wins
 * tender T-2026-014 "Kundenselfservice-Portal Stadtwerke Musterstadt";
 * Sara takes over after award. Today is 2026-07-06. The replay:
 *
 *   2026-04-01  tender documents registered (3 German docs)
 *   2026-04-02  extraction proposals submitted (24 cards)
 *   2026-04-07  Lena reviews: 22 approved → REQ-001..REQ-022,
 *               1 rejected (client duty), 1 still pending today
 *   2026-04-12  service catalog published (5 entries), verdicts + mappings
 *   2026-04-30  baseline v1.0 frozen
 *   2026-05-12  Jira board linked (PORTAL-231 → export requirement, …)
 *   2026-06-02  Jour-Fixe KW23 minutes → drift: export formats
 *               (change_order) + load clarification (in_scope) + confirmation
 *   2026-06-18  Cloud email → CONFLICT card against the On-Premises
 *               requirement — left UNDECIDED (the blocking card)
 *   2026-06-20  Sara accepts the meter-reading requirement (Abnahme)
 *   today       deviation report + Nachtrag 01 "Exportformate"
 *
 * All product state flows through the MCP group at
 * http://localhost:6060/mcp/requirements-tracking (headers:
 * Authorization test123 + X-Project-Name). Mutating tools accept
 * `_seed {at, by}` to backdate the replay.
 *
 * Run:
 *   npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
 *
 * Dry run (no network; validates fixture integrity incl. verbatim quotes):
 *   SEED_DRY_RUN=1 npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { apiFetch, ApiError, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { McpClient } from './lib/mcp-client';

import { CLAUDE_MD, MISSION_BRIEF, PROJECT_NAME } from './fixtures/mission';
import {
  ALL_DOC_FIXTURES,
  ARTIFACTS,
  TENDER_DOCS,
  docByKey,
  type TenderDocFixture,
} from './fixtures/tender-docs';
import {
  EXTRACTION_FIXTURES,
  MANUAL_RELATIONS,
  buildExtractionPayload,
  extractionFixtureByKey,
} from './fixtures/requirements';
import { DRIFT_FIXTURES } from './fixtures/drift';
import { MANUAL_LINKS, TRACKER_ISSUES } from './fixtures/issues';
import { MAPPINGS, SERVICES, VERDICTS, serviceFixtureByKey } from './fixtures/catalog';
import { RESPONSE_SECTIONS } from './fixtures/response';
import { DOCUMENTATION_MD, USER_INTERFACE_JSON } from './fixtures/documentation';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:6060';
const MCP_URL = `${BACKEND_BASE}/mcp/requirements-tracking`;
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
const DRY_RUN = process.env.SEED_DRY_RUN === '1';

const PAGES = [
  'dashboard',
  'workspace',
  'review-queue',
  'compliance-matrix',
  'response-builder',
  'service-catalog',
  'catalog-import',
  'drift-inbox',
  'requirement-thread',
  'link-review',
  'deviation-report',
  'claims',
  'quick-capture',
  'admin-audit',
];

// ─── captured state (filled while replaying) ────────────────────────────────

/** docKey → docId (D-01/A-01 style, assigned by the backend) */
const docIds = new Map<string, string>();
/** extraction fixtureKey → proposal id */
const extractionProposalIds = new Map<string, string>();
/** extraction fixtureKey → captured REQ id (assigned at approval!) */
const reqIds = new Map<string, string>();
/** service fixtureKey → captured SVC id */
const svcIds = new Map<string, string>();
/** drift fixtureKey → proposal id */
const driftProposalIds = new Map<string, string>();

function reqIdOf(fixtureKey: string): string {
  const id = reqIds.get(fixtureKey);
  if (!id) throw new Error(`No captured requirement id for fixture '${fixtureKey}'`);
  return id;
}
function svcIdOf(serviceKey: string): string {
  const id = svcIds.get(serviceKey);
  if (!id) throw new Error(`No captured service id for fixture '${serviceKey}'`);
  return id;
}
function docIdOf(docKey: string): string {
  const id = docIds.get(docKey);
  if (!id) throw new Error(`No captured document id for fixture '${docKey}'`);
  return id;
}

// ─── console helpers ────────────────────────────────────────────────────────

function header(s: string) {
  console.log(`\n\x1b[1m▸ ${s}\x1b[0m`);
}
function ok(s: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${s}`);
}
function info(s: string) {
  console.log(`  \x1b[2m·\x1b[0m ${s}`);
}
function warn(s: string) {
  console.log(`  \x1b[33m!\x1b[0m ${s}`);
}

// ─── fixture integrity validation (also the SEED_DRY_RUN=1 payload) ────────

/**
 * Mirror of IngestionService.sectionize: split markdown at #/##/###/####
 * heading lines; sections are numbered 1..n in order of appearance.
 */
function sectionizeLikeBackend(markdown: string): string[] {
  const sections: string[] = [];
  let current: string | null = null;
  for (const line of markdown.split('\n')) {
    if (/^#{1,4}\s+/.test(line)) {
      if (current !== null && current.trim().length > 0) sections.push(current);
      current = '';
    }
    if (current === null) current = '';
    current += `${line}\n`;
  }
  if (current !== null && current.trim().length > 0) sections.push(current);
  return sections;
}

function validateFixtures(): void {
  header('0. Validate fixture integrity (verbatim quotes, section refs, counts)');
  const errors: string[] = [];
  const sectionsByDoc = new Map<string, string[]>();
  for (const doc of ALL_DOC_FIXTURES) {
    sectionsByDoc.set(doc.key, sectionizeLikeBackend(doc.markdown));
  }

  // 1. extraction quotes: verbatim in the doc AND inside the claimed section
  const seenKeys = new Set<string>();
  for (const fixture of EXTRACTION_FIXTURES) {
    if (seenKeys.has(fixture.fixtureKey)) {
      errors.push(`duplicate fixtureKey '${fixture.fixtureKey}'`);
    }
    seenKeys.add(fixture.fixtureKey);
    const doc = docByKey(fixture.docKey);
    if (!doc.markdown.includes(fixture.quote)) {
      errors.push(`quote of '${fixture.fixtureKey}' is NOT a verbatim substring of ${fixture.docKey}`);
      continue;
    }
    const sections = sectionsByDoc.get(fixture.docKey)!;
    const section = sections[fixture.sectionNo - 1];
    if (!section) {
      errors.push(
        `'${fixture.fixtureKey}' claims section ${fixture.sectionNo} but ${fixture.docKey} has only ${sections.length}`,
      );
    } else if (!section.includes(fixture.quote)) {
      errors.push(
        `quote of '${fixture.fixtureKey}' is in ${fixture.docKey} but not inside claimed section ${fixture.sectionNo}`,
      );
    }
  }

  // 2. counts & required keys
  if (EXTRACTION_FIXTURES.length !== 24) {
    errors.push(`expected 24 extraction fixtures, found ${EXTRACTION_FIXTURES.length}`);
  }
  const byModality = { mandatory: 0, target: 0, optional: 0 } as Record<string, number>;
  for (const f of EXTRACTION_FIXTURES) byModality[f.modality] += 1;
  if (byModality.mandatory !== 14 || byModality.target !== 6 || byModality.optional !== 4) {
    errors.push(
      `modality split expected 14/6/4, got ${byModality.mandatory}/${byModality.target}/${byModality.optional}`,
    );
  }
  const pending = EXTRACTION_FIXTURES.filter((f) => f.decision === 'pending');
  const rejected = EXTRACTION_FIXTURES.filter((f) => f.decision === 'rejected');
  if (pending.length !== 1) errors.push(`expected exactly 1 pending extraction, got ${pending.length}`);
  if (rejected.length !== 1) errors.push(`expected exactly 1 rejected extraction, got ${rejected.length}`);
  for (const key of ['export-pdf', 'onprem', 'response-time', 'failover-switch', 'failover-notify', 'training']) {
    if (!seenKeys.has(key)) errors.push(`required fixtureKey '${key}' missing`);
  }
  const ambiguous = EXTRACTION_FIXTURES.filter((f) => f.ambiguities.length > 0);
  if (ambiguous.length < 2 || ambiguous.length > 4) {
    errors.push(`expected 2-4 fixtures with ambiguities, got ${ambiguous.length}`);
  }

  // 3. the failover pair shares one quote (derived_from_same_clause demo)
  const fs = extractionFixtureByKey('failover-switch');
  const fn = extractionFixtureByKey('failover-notify');
  if (fs.quote !== fn.quote) errors.push('failover-switch / failover-notify must share ONE quote');

  // 4. drift: quotes verbatim in artifact fixtures, before_ears_text matches
  for (const drift of DRIFT_FIXTURES) {
    const artifact = docByKey(drift.artifactKey);
    if (!artifact.markdown.includes(drift.evidence.quote)) {
      errors.push(`drift '${drift.fixtureKey}' quote is NOT verbatim in artifact '${drift.artifactKey}'`);
    }
    for (const key of drift.affectedKeys) {
      if (!seenKeys.has(key)) errors.push(`drift '${drift.fixtureKey}' references unknown fixture '${key}'`);
    }
    const payload: any = drift.buildPayload((key) => `REQ-DRYRUN-${key}`);
    if (payload.diff && drift.affectedKeys[0]) {
      const affected = extractionFixtureByKey(drift.affectedKeys[0]);
      if (payload.diff.before_ears_text !== affected.earsText) {
        errors.push(`drift '${drift.fixtureKey}' before_ears_text does not match '${drift.affectedKeys[0]}' ears_text`);
      }
    }
  }
  const undecidedDrift = DRIFT_FIXTURES.filter((d) => d.decision === null);
  if (undecidedDrift.length !== 1 || undecidedDrift[0].classification !== 'CONFLICT') {
    errors.push('exactly one drift fixture (the CONFLICT card) must stay undecided');
  }

  // 5. cross-references: relations, links, verdicts, mappings, response sections
  for (const rel of MANUAL_RELATIONS) {
    for (const key of [rel.fromKey, rel.toKey]) {
      if (!seenKeys.has(key)) errors.push(`relation references unknown fixture '${key}'`);
    }
  }
  const issueKeys = new Set(TRACKER_ISSUES.map((i) => i.key));
  for (const link of MANUAL_LINKS) {
    if (!seenKeys.has(link.fixtureKey)) errors.push(`link references unknown fixture '${link.fixtureKey}'`);
    if (!issueKeys.has(link.issueKey)) errors.push(`link references unknown issue '${link.issueKey}'`);
  }
  if (!MANUAL_LINKS.some((l) => l.issueKey === 'PORTAL-231' && l.fixtureKey === 'export-pdf')) {
    errors.push('PORTAL-231 → export-pdf link missing (stale-link demo)');
  }
  const portal310 = TRACKER_ISSUES.find((i) => i.key === 'PORTAL-310');
  if (!portal310) errors.push('PORTAL-310 missing');
  else if (MANUAL_LINKS.some((l) => l.issueKey === 'PORTAL-310')) {
    errors.push('PORTAL-310 must stay UNLINKED (shadow-scope demo)');
  }
  const serviceKeys = new Set(SERVICES.map((s) => s.key));
  for (const verdict of VERDICTS) {
    if (!seenKeys.has(verdict.requirementKey)) errors.push(`verdict references unknown fixture '${verdict.requirementKey}'`);
    for (const svc of verdict.evidenceServiceKeys) {
      if (!serviceKeys.has(svc)) errors.push(`verdict references unknown service '${svc}'`);
    }
    const fixture = EXTRACTION_FIXTURES.find((f) => f.fixtureKey === verdict.requirementKey);
    if (fixture && fixture.decision !== 'approved') {
      errors.push(`verdict on '${verdict.requirementKey}' but that fixture is not approved`);
    }
  }
  for (const mapping of MAPPINGS) {
    if (!seenKeys.has(mapping.requirementKey)) errors.push(`mapping references unknown fixture '${mapping.requirementKey}'`);
    if (!serviceKeys.has(mapping.serviceKey)) errors.push(`mapping references unknown service '${mapping.serviceKey}'`);
  }
  for (const section of RESPONSE_SECTIONS) {
    for (const key of section.allocatedKeys) {
      if (!seenKeys.has(key)) errors.push(`response section '${section.key}' allocates unknown fixture '${key}'`);
      const fixture = EXTRACTION_FIXTURES.find((f) => f.fixtureKey === key);
      if (fixture && fixture.decision !== 'approved') {
        errors.push(`response section '${section.key}' allocates non-approved fixture '${key}'`);
      }
    }
  }
  const withBody = RESPONSE_SECTIONS.filter((s) => s.buildBody);
  if (withBody.length !== 1) errors.push(`expected exactly 1 response section with a saved body, got ${withBody.length}`);
  else {
    const body = withBody[0].buildBody!((k) => `REQ-DRYRUN-${k}`, (k) => `SVC-DRYRUN-${k}`);
    if (!/<!-- trace: /.test(body)) errors.push('saved response body is missing trace markers');
    if (!body.includes('[MISSING: Referenzkunde für Kapitel 3 — Vertrieb]')) {
      errors.push('saved response body is missing the [MISSING: …] placeholder');
    }
  }
  if (!portal310?.comments.some((c) => c.body.includes('Wurde von Herrn Weber im Workshop am 12.06. mündlich gewünscht.'))) {
    errors.push('PORTAL-310 is missing the workshop comment');
  }
  const kpModul = serviceFixtureByKey('kundenportal-modul');
  for (const excluded of ['XML-Export', 'Anbindung externer Cloud-Speicher']) {
    if (!kpModul.scope.excluded.includes(excluded)) {
      errors.push(`Kundenportal-Modul scope.excluded missing '${excluded}'`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`  \x1b[31m✗\x1b[0m ${error}`);
    throw new Error(`fixture validation failed with ${errors.length} error(s)`);
  }
  ok(
    `24 extraction fixtures (14 mandatory / 6 target / 4 optional; 1 pending, 1 rejected), ` +
      `${DRIFT_FIXTURES.length} drift cards, ${TRACKER_ISSUES.length} issues, ${SERVICES.length} services — all quotes verbatim`,
  );
}

// ─── steps ──────────────────────────────────────────────────────────────────

async function step1_authenticate(): Promise<ApiContext> {
  header('1. Authenticate');
  const auth = await login();
  ok(`authenticated as ${auth.user.username} (${auth.user.role})`);
  return { accessToken: auth.accessToken };
}

async function step2_createProject(ctx: ApiContext): Promise<void> {
  header('2. Create project');
  try {
    const r = await apiFetch<{ success: boolean; warnings?: string[] }>(
      ctx,
      '/api/projects/create',
      {
        method: 'POST',
        body: JSON.stringify({ projectName: PROJECT_NAME, missionBrief: MISSION_BRIEF, language: 'de' }),
      },
    );
    if (!r.success) throw new Error('project create returned success=false');
    ok(`project created: ${PROJECT_NAME}`);
    for (const w of r.warnings ?? []) warn(`warning: ${w}`);
  } catch (err) {
    if (err instanceof ApiError) {
      warn(`project create → HTTP ${err.status}; trying provision-standard fallback`);
      try {
        await apiFetch(ctx, `/api/skills/${PROJECT_NAME}/provision-standard`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        ok('standard skills provisioned via fallback');
      } catch (fallbackErr) {
        warn(
          `provision-standard fallback also failed (${
            fallbackErr instanceof ApiError ? `HTTP ${fallbackErr.status}` : fallbackErr
          }) — continuing; the MCP layer creates project state on demand`,
        );
      }
    } else {
      throw err;
    }
  }
  await mkdir(PROJECT_ROOT, { recursive: true });
}

async function step2b_provisionMcpServers(ctx: ApiContext): Promise<void> {
  header('2b. Provision MCP servers (.mcp.json)');
  const mcpServers = {
    'requirements-tracking': {
      type: 'http',
      url: `${BACKEND_BASE}/mcp/requirements-tracking`,
      headers: { Authorization: 'test123' },
      description: 'TenderTrace requirements tracking',
    },
    kg: {
      type: 'http',
      url: `${BACKEND_BASE}/mcp/knowledge-graph`,
      headers: { Authorization: 'test123' },
      description: 'Knowledge Graph Tools',
    },
  };
  await apiFetch(ctx, '/api/claude/mcp/config/save', {
    method: 'POST',
    body: JSON.stringify({ projectName: PROJECT_NAME, mcpServers }),
  });
  ok(`mcp servers provisioned: ${Object.keys(mcpServers).join(', ')}`);
}

async function step3_writeMissionAndClaudeMd(): Promise<void> {
  header('3. Write .claude/CLAUDE.md + mission file');
  await mkdir(join(PROJECT_ROOT, '.claude'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.claude', 'CLAUDE.md'), CLAUDE_MD, 'utf8');
  const missionDir = join(PROJECT_ROOT, 'wiki', '_meta');
  await mkdir(missionDir, { recursive: true });
  await writeFile(
    join(missionDir, 'mission.md'),
    `# Mission — ${PROJECT_NAME}\n\n${MISSION_BRIEF}\n`,
    'utf8',
  );
  ok('.claude/CLAUDE.md + wiki/_meta/mission.md written');
}

async function step4_initTender(rt: RtCall): Promise<void> {
  header('4. rt_init_tender');
  await rt('rt_init_tender', {
    key: 'T-2026-014',
    title: 'Kundenselfservice-Portal Stadtwerke Musterstadt',
    phase: 'implementation',
    language: 'de',
  });
  ok('tender T-2026-014 initialized (phase: implementation, language: de)');
}

async function registerDoc(rt: RtCall, doc: TenderDocFixture): Promise<string> {
  const result = await rt<{ success: boolean; document: { id: string; parseStatus: string } }>(
    'rt_register_document',
    {
      text: doc.markdown,
      title: doc.title,
      kind: doc.kind,
      ...(doc.artifactType ? { artifactType: doc.artifactType } : {}),
      ...(doc.artifactDate ? { artifactDate: doc.artifactDate } : {}),
      ...(doc.artifactParties ? { artifactParties: doc.artifactParties } : {}),
    },
  );
  const id = result?.document?.id;
  if (!id) throw new Error(`rt_register_document returned no document id for '${doc.title}'`);
  if (result.document.parseStatus !== 'parsed') {
    warn(`document ${id} parseStatus=${result.document.parseStatus}`);
  }
  docIds.set(doc.key, id);
  return id;
}

async function step5_registerTenderDocs(rt: RtCall): Promise<void> {
  header('5. Register the 3 tender documents (2026-04-01)');
  for (const doc of TENDER_DOCS) {
    const id = await registerDoc(rt, doc);
    info(`${id} ← ${doc.title}`);
  }
  ok(`${TENDER_DOCS.length} tender documents registered + parsed`);
}

async function step6_extractionProposals(rt: RtCall): Promise<void> {
  header('6. Extraction proposals: submit (2026-04-02) then decide (2026-04-07)');

  // 6a. submit all 24 — backdated to early April, submitted by the agent
  for (let i = 0; i < EXTRACTION_FIXTURES.length; i++) {
    const fixture = EXTRACTION_FIXTURES[i];
    const docId = docIdOf(fixture.docKey);
    const doc = docByKey(fixture.docKey);
    const payload = buildExtractionPayload(fixture, docId, doc.title, i);
    const submittedAt = new Date(Date.parse('2026-04-02T09:00:00Z') + i * 60_000).toISOString();
    const result = await rt<{ success: boolean; proposalId?: string; error?: string }>(
      'submit_proposal',
      {
        kind: 'extraction',
        payload,
        evidence: {
          quote: fixture.quote,
          location: `${doc.title}, Abschnitt ${fixture.sectionHeading}`,
        },
        affectedRequirementIds: [],
        confidence: fixture.confidence,
        sourceArtifactId: docId,
        _seed: { at: submittedAt, by: 'agent' },
      },
    );
    if (!result.success || !result.proposalId) {
      throw new Error(`submit_proposal failed for '${fixture.fixtureKey}': ${result.error ?? 'no proposalId'}`);
    }
    extractionProposalIds.set(fixture.fixtureKey, result.proposalId);
  }
  ok(`${EXTRACTION_FIXTURES.length} extraction proposals submitted`);

  // 6b. decide in fixture order — REQ ids are assigned sequentially HERE
  let approved = 0;
  let decisionIndex = 0;
  for (const fixture of EXTRACTION_FIXTURES) {
    if (fixture.decision === 'pending') {
      info(`${fixture.fixtureKey}: left PENDING (review-queue card)`);
      continue;
    }
    const decidedAt = new Date(
      Date.parse('2026-04-07T09:00:00Z') + decisionIndex * 180_000,
    ).toISOString();
    decisionIndex += 1;
    const proposalId = extractionProposalIds.get(fixture.fixtureKey)!;
    const result = await rt<{ success: boolean; effect?: { requirementId?: string }; error?: string }>(
      'rt_decide_proposal',
      {
        proposalId,
        decision: fixture.decision === 'approved' ? 'approved' : 'rejected',
        ...(fixture.decision === 'rejected'
          ? { resolutionNote: 'Mitwirkungsleistung des Auftraggebers — keine Anforderung an den Auftragnehmer.' }
          : {}),
        actor: 'lena',
        _seed: { at: decidedAt, by: 'lena' },
      },
    );
    if (!result.success) {
      throw new Error(`rt_decide_proposal failed for '${fixture.fixtureKey}': ${result.error ?? 'unknown'}`);
    }
    if (fixture.decision === 'approved') {
      const reqId = result.effect?.requirementId;
      if (!reqId) throw new Error(`no effect.requirementId captured for '${fixture.fixtureKey}'`);
      reqIds.set(fixture.fixtureKey, reqId);
      approved += 1;
    }
  }
  ok(`decided: ${approved} approved (REQ ids captured), 1 rejected, 1 pending`);

  // 6c. manual requirement↔requirement relations (spec §3.6)
  for (const relation of MANUAL_RELATIONS) {
    await rt('rt_create_relation', {
      kind: relation.kind,
      fromRequirementId: reqIdOf(relation.fromKey),
      toRequirementId: reqIdOf(relation.toKey),
      _seed: { at: '2026-04-10T10:00:00Z', by: 'lena' },
    });
    info(`${relation.kind}: ${relation.fromKey} → ${relation.toKey}`);
  }
  ok(`${MANUAL_RELATIONS.length} manual relations created (+ auto derived_from_same_clause for the failover pair)`);
}

async function step7_freezeBaseline(rt: RtCall): Promise<void> {
  header('7. Freeze baseline v1.0 (2026-04-30, lena)');
  const result = await rt<{ blocked?: boolean; blockers?: unknown[] }>('rt_freeze_baseline', {
    label: 'v1.0',
    actor: 'lena',
    _seed: { at: '2026-04-30T16:00:00Z', by: 'lena' },
  });
  if (result?.blocked) {
    throw new Error(`baseline freeze blocked: ${JSON.stringify(result.blockers)}`);
  }
  ok('baseline v1.0 frozen');
}

async function step8_catalog(rt: RtCall): Promise<void> {
  header('8. Service catalog: publish 5 entries + verdicts + mappings');

  for (const service of SERVICES) {
    const draft = await rt<{ success: boolean; serviceId: string; version: { versionNo: number } }>(
      'rt_save_service_draft',
      {
        title: service.title,
        kind: service.kind,
        bodyMarkdown: service.bodyMarkdown,
        tags: service.tags,
        scope: service.scope,
      },
    );
    if (!draft.success || !draft.serviceId) {
      throw new Error(`rt_save_service_draft failed for '${service.key}'`);
    }
    svcIds.set(service.key, draft.serviceId);
    const published = await rt<{ success: boolean; error?: string }>('rt_publish_service_version', {
      serviceId: draft.serviceId,
      versionNo: draft.version?.versionNo ?? 1,
      actor: 'lena',
      _seed: { at: '2026-04-12T09:00:00Z', by: 'lena' },
    });
    if (!published.success) {
      throw new Error(`publish failed for '${service.key}': ${published.error ?? 'unknown'}`);
    }
    info(`${draft.serviceId} v1 ← ${service.title}`);
  }
  ok(`${SERVICES.length} services published (v1)`);

  // mapping proposals (Gate 1) + one manual mapping
  let mappingCount = 0;
  for (const mapping of MAPPINGS) {
    const serviceId = svcIdOf(mapping.serviceKey);
    if (mapping.via === 'manual') {
      await rt('rt_create_mapping', {
        requirementId: reqIdOf(mapping.requirementKey),
        serviceVersionId: `${serviceId}/v/1`,
        coverage: mapping.coverage,
        _seed: { at: '2026-04-14T11:00:00Z', by: 'lena' },
      });
    } else {
      const proposal = await rt<{ success: boolean; proposalId?: string; error?: string }>(
        'submit_proposal',
        {
          kind: 'mapping',
          payload: {
            requirement_id: reqIdOf(mapping.requirementKey),
            service_id: serviceId,
            service_version_no: 1,
            coverage: mapping.coverage,
            rationale: mapping.rationale,
            service_evidence: [],
            gap_or_exclusion:
              mapping.coverage === 'partial'
                ? 'XML-Export ist im Service-Scope explizit ausgeschlossen.'
                : null,
            confidence: 0.9,
          },
          confidence: 0.9,
          _seed: { at: '2026-04-13T10:00:00Z', by: 'agent' },
        },
      );
      if (!proposal.success || !proposal.proposalId) {
        throw new Error(`mapping proposal failed for '${mapping.requirementKey}': ${proposal.error ?? ''}`);
      }
      const decided = await rt<{ success: boolean; error?: string }>('rt_decide_proposal', {
        proposalId: proposal.proposalId,
        decision: 'approved',
        actor: 'lena',
        _seed: { at: '2026-04-14T09:30:00Z', by: 'lena' },
      });
      if (!decided.success) {
        throw new Error(`mapping decision failed for '${mapping.requirementKey}': ${decided.error ?? ''}`);
      }
    }
    mappingCount += 1;
  }
  ok(`${mappingCount} mappings approved (${MAPPINGS.filter((m) => m.via === 'manual').length} manual)`);

  // compliance verdicts (Gate 2)
  for (const verdict of VERDICTS) {
    const proposal = await rt<{ success: boolean; proposalId?: string; error?: string }>(
      'submit_proposal',
      {
        kind: 'compliance',
        payload: {
          requirement_id: reqIdOf(verdict.requirementKey),
          verdict: verdict.verdict,
          justification: verdict.justification,
          evidence_refs: verdict.evidenceServiceKeys.map((key) => ({
            service_id: svcIdOf(key),
            version_no: 1,
          })),
          deviation: verdict.deviation,
          risk_note: verdict.risk_note,
          internal_question: verdict.internal_question,
          confidence: verdict.confidence,
        },
        confidence: verdict.confidence,
        _seed: { at: '2026-04-14T14:00:00Z', by: 'agent' },
      },
    );
    if (!proposal.success || !proposal.proposalId) {
      throw new Error(`compliance proposal failed for '${verdict.requirementKey}': ${proposal.error ?? ''}`);
    }
    const decided = await rt<{ success: boolean; error?: string }>('rt_decide_proposal', {
      proposalId: proposal.proposalId,
      decision: 'approved',
      actor: 'lena',
      _seed: { at: '2026-04-15T09:00:00Z', by: 'lena' },
    });
    if (!decided.success) {
      throw new Error(`verdict decision failed for '${verdict.requirementKey}': ${decided.error ?? ''}`);
    }
    info(`${verdict.verdict} → ${verdict.requirementKey}`);
  }
  ok(`${VERDICTS.length} compliance verdicts approved (incl. PARTIAL export-pdf + NEEDS_INPUT audit-log)`);
}

async function step9_responseSections(rt: RtCall): Promise<void> {
  header('9. Response sections');
  for (const section of RESPONSE_SECTIONS) {
    const created = await rt<{ success: boolean; section?: { id: string } }>(
      'rt_create_response_section',
      {
        title: section.title,
        instructions: section.instructions,
        allocatedRequirementIds: section.allocatedKeys.map((key) => reqIdOf(key)),
      },
    );
    const sectionId = created?.section?.id;
    if (!sectionId) throw new Error(`rt_create_response_section failed for '${section.key}'`);
    if (section.buildBody) {
      await rt('rt_save_section', {
        sectionId,
        markdown: section.buildBody(reqIdOf, svcIdOf),
      });
      info(`${section.title} — body saved (trace markers + [MISSING] placeholder)`);
    } else {
      info(section.title);
    }
  }
  ok(`${RESPONSE_SECTIONS.length} response sections created`);
}

async function step10_registerArtifacts(rt: RtCall): Promise<void> {
  header('10. Register implementation artifacts (KW23 minutes + Cloud email)');
  for (const artifact of ARTIFACTS) {
    const id = await registerDoc(rt, artifact);
    info(`${id} ← ${artifact.title} (${artifact.artifactType}, ${artifact.artifactDate})`);
  }
  ok(`${ARTIFACTS.length} artifacts registered + parsed`);
}

async function step11_trackerAndLinks(rt: RtCall): Promise<void> {
  header('11. Seed tracker + create links (BEFORE drift decisions — stale-link demo)');
  await rt('rt_seed_tracker', { issues: TRACKER_ISSUES });
  ok(`${TRACKER_ISSUES.length} mock Jira issues seeded (PORTAL-201..PORTAL-310)`);

  for (const link of MANUAL_LINKS) {
    await rt('rt_create_link', {
      requirementId: reqIdOf(link.fixtureKey),
      issueKey: link.issueKey,
      relationship: link.relationship,
      _seed: { at: '2026-05-12T09:00:00Z', by: 'sara' },
    });
    info(`${link.issueKey} ${link.relationship} ${link.fixtureKey} (${reqIdOf(link.fixtureKey)})`);
  }
  ok(`${MANUAL_LINKS.length} requirement↔issue links created`);
}

async function step12_drift(rt: RtCall): Promise<void> {
  header('12. Drift timeline (KW23 minutes + Cloud email)');
  for (const drift of DRIFT_FIXTURES) {
    const artifactId = docIdOf(drift.artifactKey);
    const artifact = docByKey(drift.artifactKey);
    const submittedAt = `${artifact.artifactDate}T16:00:00Z`;
    const proposal = await rt<{ success: boolean; proposalId?: string; error?: string }>(
      'submit_proposal',
      {
        kind: 'drift',
        payload: drift.buildPayload(reqIdOf),
        evidence: drift.evidence,
        affectedRequirementIds: drift.affectedKeys.map((key) => reqIdOf(key)),
        classification: drift.classification,
        ...(drift.decisionStatus ? { decisionStatus: drift.decisionStatus } : {}),
        ...(drift.scopeAssessment ? { scopeAssessment: drift.scopeAssessment } : {}),
        ...(drift.scopeRationale ? { scopeRationale: drift.scopeRationale } : {}),
        confidence: drift.confidence,
        sourceArtifactId: artifactId,
        _seed: { at: submittedAt, by: 'agent' },
      },
    );
    if (!proposal.success || !proposal.proposalId) {
      throw new Error(`drift proposal failed for '${drift.fixtureKey}': ${proposal.error ?? ''}`);
    }
    driftProposalIds.set(drift.fixtureKey, proposal.proposalId);

    if (drift.decision === null) {
      info(`${drift.fixtureKey} (${drift.classification}) → PENDING — the blocking conflict card`);
      continue;
    }
    const decided = await rt<{ success: boolean; effect?: any; error?: string }>(
      'rt_decide_proposal',
      {
        proposalId: proposal.proposalId,
        decision: drift.decision,
        actor: drift.decidedBy ?? 'sara',
        _seed: { at: drift.decidedAt!, by: drift.decidedBy ?? 'sara' },
      },
    );
    if (!decided.success) {
      throw new Error(`drift decision failed for '${drift.fixtureKey}': ${decided.error ?? ''}`);
    }
    info(`${drift.fixtureKey} (${drift.classification}) → ${drift.decision}`);
  }
  ok('drift cards seeded: change_order + in_scope + noted; CONFLICT card left pending');

  // Shadow-scope card for PORTAL-310 — left UNDECIDED.
  const shadow = await rt<{ success: boolean; proposalId?: string; error?: string }>(
    'submit_proposal',
    {
      kind: 'shadow_scope',
      payload: {
        issue_key: 'PORTAL-310',
        classification: 'undocumented_scope_candidate',
        links: [
          {
            requirement_id: reqIdOf('export-pdf'),
            relationship: 'related',
            matches_current: true,
            rationale:
              'Das Ticket validiert den XML-Export, der seit dem Change-Order-Diff Teil der Exportanforderung ist — die XSD-Validierung selbst hat keine vertragliche Grundlage.',
            issue_evidence: 'XML-Export gegen Kunden-XSD validieren',
            confidence: 0.7,
          },
        ],
        functionality_summary:
          'Validierung des XML-Exports gegen das XSD-Schema der Stadtwerke inkl. Fehlerreport — mündlich im Workshop am 12.06. gewünscht, in keiner Anforderung dokumentiert.',
        origin_evidence: [
          {
            quote: 'Wurde von Herrn Weber im Workshop am 12.06. mündlich gewünscht.',
            location: 'PORTAL-310, Kommentar t.brandt vom 24.06.2026',
          },
        ],
        internal_rationale: null,
        assignee_question: null,
      },
      confidence: 0.7,
      _seed: { at: '2026-06-25T08:30:00Z', by: 'agent' },
    },
  );
  if (!shadow.success) {
    throw new Error(`shadow_scope proposal failed: ${shadow.error ?? 'unknown'}`);
  }
  ok('shadow-scope card for PORTAL-310 submitted — left pending');

  await rt('rt_sync_tracker', {});
  info('tracker mirror re-synced (derived implementation statuses updated)');
}

async function step13_acceptRequirement(rt: RtCall): Promise<void> {
  header('13. Manual acceptance (Abnahme) — meter-reading, by sara');
  const result = await rt<{ success: boolean; error?: string }>('rt_accept_requirement', {
    reqId: reqIdOf('meter-reading'),
    actor: 'sara',
    _seed: { at: '2026-06-20T10:00:00Z', by: 'sara' },
  });
  if (!result.success) {
    warn(`rt_accept_requirement failed: ${result.error ?? 'unknown'} — continuing`);
    return;
  }
  ok(`requirement ${reqIdOf('meter-reading')} accepted (Abnahme, sara)`);
}

async function step14_deviationReport(rt: RtCall): Promise<void> {
  header('14. Deviation report since baseline v1.0');
  try {
    const result = await rt<{ success: boolean; report?: { id?: string } }>(
      'rt_generate_deviation_report',
      { sinceBaseline: 'v1.0', actor: 'sara' },
    );
    ok(`deviation report generated${result?.report?.id ? `: ${result.report.id}` : ''}`);
  } catch (err) {
    warn(`deviation report failed (${err instanceof Error ? err.message : err}) — LLM narrative needs an API key; continuing`);
  }
}

async function step15_claim(rt: RtCall): Promise<void> {
  header('15. Claim: Nachtrag 01 — Exportformate');
  const created = await rt<{ success: boolean; claim?: { id: string } }>('rt_create_claim', {
    title: 'Nachtrag 01 — Exportformate',
  });
  const claimId = created?.claim?.id;
  if (!claimId) throw new Error('rt_create_claim returned no claim id');

  const changeOrderProposalId = driftProposalIds.get('drift-export-formats');
  if (!changeOrderProposalId) throw new Error('change-order proposal id not captured');
  const added = await rt<{ success: boolean; error?: string }>('rt_add_claim_items', {
    claimId,
    proposalIds: [changeOrderProposalId],
  });
  if (!added.success) throw new Error(`rt_add_claim_items failed: ${added.error ?? 'unknown'}`);

  await rt('rt_set_claim_pricing', {
    claimId,
    pricing: { [changeOrderProposalId]: '12.500 EUR' },
  });

  try {
    const generated = await rt<{ success: boolean; error?: string }>('rt_generate_claim', { claimId });
    if (generated.success) ok(`claim ${claimId} generated (1 item, priced)`);
    else warn(`rt_generate_claim: ${generated.error ?? 'failed'} — narrative needs an LLM key; claim data is seeded`);
  } catch (err) {
    warn(`rt_generate_claim failed (${err instanceof Error ? err.message : err}) — claim data is seeded`);
  }
}

async function step16_pageSentinels(): Promise<void> {
  header('16. Write the 14 page sentinels (out/tendertrace/pages/)');
  const dir = join(PROJECT_ROOT, 'out', 'tendertrace', 'pages');
  await mkdir(dir, { recursive: true });
  for (const page of PAGES) {
    await writeFile(
      join(dir, `${page}.tendertrace.json`),
      JSON.stringify({ schema: 'tendertrace.v1', page }, null, 2),
      'utf8',
    );
  }
  ok(`${PAGES.length} sentinels written: ${PAGES.join(', ')}`);
}

async function step17_documentationAndUi(): Promise<void> {
  header('17. Write documentation.md + .etienne/user-interface.json + application type');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });
  await writeFile(
    join(etienne, 'user-interface.json'),
    JSON.stringify(USER_INTERFACE_JSON, null, 2),
    'utf8',
  );
  await writeFile(
    join(etienne, 'application-type.json'),
    JSON.stringify({ id: 'requirements-tracking' }, null, 2),
    'utf8',
  );
  ok('documentation.md + user-interface.json + application-type.json (requirements-tracking) written');
}

function step18_summary(): void {
  header('18. Summary');
  info(`documents:  ${[...docIds.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  info(`requirements (${reqIds.size} approved):`);
  for (const [key, id] of reqIds) info(`  ${id}  ← ${key}`);
  info(`services:   ${[...svcIds.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  info(`drift:      ${[...driftProposalIds.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  project:  ${PROJECT_ROOT}`);
  console.log(`  open:     out/tendertrace/pages/drift-inbox.tendertrace.json (auto-opens)`);
  console.log(`  pending:  1 conflict card (Cloud vs. On-Premises), 1 extraction card (SEPA),`);
  console.log(`            1 shadow-scope card (PORTAL-310), 1 stale link (PORTAL-231)`);
}

// ─── MCP wiring ─────────────────────────────────────────────────────────────

type RtCall = <T = any>(tool: string, args: Record<string, unknown>) => Promise<T>;

function makeRtCall(client: McpClient): RtCall {
  return async <T = any>(tool: string, args: Record<string, unknown>): Promise<T> => {
    return client.callTool<T>(tool, { projectName: PROJECT_NAME, ...args });
  };
}

// ─── entry ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\x1b[1mSeeding ${PROJECT_NAME}\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);
  console.log(`mcp:       ${MCP_URL}`);

  validateFixtures();
  if (DRY_RUN) {
    console.log(`\n\x1b[32m✓ dry run passed\x1b[0m — no network calls made (unset SEED_DRY_RUN to seed)`);
    return;
  }

  if (existsSync(PROJECT_ROOT) && process.env.SEED_FORCE !== '1') {
    console.error(
      `\n\x1b[31m✗ project directory already exists:\x1b[0m ${PROJECT_ROOT}\n` +
        `  Delete it (plus matching Chroma/Quadstore entries) and re-run,\n` +
        `  or set SEED_FORCE=1 to seed on top anyway.`,
    );
    process.exit(1);
  }

  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step2b_provisionMcpServers(ctx);
  await step3_writeMissionAndClaudeMd();

  const client = new McpClient(MCP_URL, {
    Authorization: 'test123',
    'X-Project-Name': PROJECT_NAME,
  });
  await client.connect();
  const rt = makeRtCall(client);

  try {
    await step4_initTender(rt);
    await step5_registerTenderDocs(rt);
    await step6_extractionProposals(rt);
    await step7_freezeBaseline(rt);
    await step8_catalog(rt);
    await step9_responseSections(rt);
    await step10_registerArtifacts(rt);
    await step11_trackerAndLinks(rt);
    await step12_drift(rt);
    await step13_acceptRequirement(rt);
    await step14_deviationReport(rt);
    await step15_claim(rt);
  } finally {
    await client.close();
  }

  await step16_pageSentinels();
  await step17_documentationAndUi();
  step18_summary();
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
