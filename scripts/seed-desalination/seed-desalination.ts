/**
 * Seed the `desalination-devices` example project.
 *
 *   1. Authenticate against the OAuth server (:5950).
 *   2. Create the project via POST /api/projects/create — this auto-provisions
 *      every standard skill including `wiki` and `dreaming`.
 *   3. Write wiki/_meta/mission.md directly.
 *   4. Write 25 wiki pages via the provisioned `wiki-add.ts` script.
 *   5. POST KG entities + relationships.
 *   6. Write 40 RAG documents under the project's documents/ folder
 *      and POST each path to /api/workspace/<project>/rag/index-document.
 *   7. Write three JSONL session histories + update chat.sessions.json.
 *   8. Enable dreaming + POST /run-now.
 *   9. Wait for workspace/<project>/dreaming/dream-YYYY-MM-DD.dreams.json.
 *  10. Install design-support + scrapbook + stateful-workflows optional skills
 *      and scaffold the runtime dirs.
 *  11. POST the design-support typed graph (mission + working + hypothesis
 *      nodes; entails / dependsOn / testedBy / evidenceFor edges).
 *  12. Create one workflow per hypothesis and drive it to its target state
 *      (incl. one Refuted→cascade and one mission-derived); + the
 *      mission-derivation singleton.
 *  12b. Create the named scrapbook (.scbk metadata so the open dialog lists
 *      it) + the mission-aligned projection (root → Engineering/Compliance/
 *      Economics → decisions + hypotheses tagged by lifecycle state).
 *  13. Write documentation.md + register it auto-open in user-interface.json.
 *  14. Seed the critic-mission-contradiction event rule + prompt.
 *  15. Register the nightly curator cron.
 *
 * Run with:
 *
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-desalination/seed-desalination.ts
 */

import { existsSync, cpSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';

import { apiFetch, ApiError, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { addWikiPage } from './lib/wiki-shell';

import { MISSION_BRIEF, MISSION_MD, PROJECT_NAME } from './fixtures/mission';
import { WIKI_PAGES } from './fixtures/wiki-pages';
import { KG_ENTITIES, KG_RELATIONSHIPS } from './fixtures/kg';
import { RAG_DOCS } from './fixtures/rag-docs';
import { SESSIONS } from './fixtures/chats';
import {
  DS_MISSION_NODES,
  DS_MISSION_EDGES,
  DS_WORKING_NODES,
  DS_WORKING_EDGES,
  DS_HYPOTHESIS_EDGES,
  DS_TEST_NODES,
  DS_TEST_EDGES,
  HYPOTHESES,
  USER_INTERFACE_JSON,
  DOCUMENTATION_SOURCE_REL,
} from './fixtures/hypotheses';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  'C:/Data/GitHub/claude-multitenant/workspace';

const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

const REPO_ROOT = join(WORKSPACE_ROOT, '..');
const SKILL_REPO = join(REPO_ROOT, 'skill-repository', 'standard', 'optional');
const DS_OPTIONAL_SKILLS = ['design-support', 'scrapbook', 'stateful-workflows'];

const NOW = '2026-05-14T09:00:00Z';
const PROV = {
  sourceSessions: [] as string[],
  sourceEntries: [] as string[],
  createdBy: 'user' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

// ─── helpers ───────────────────────────────────────────────────────────────

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

// ─── steps ─────────────────────────────────────────────────────────────────

async function step1_authenticate(): Promise<ApiContext> {
  header('1. Authenticate');
  const auth = await login();
  ok(`authenticated as ${auth.user.username} (${auth.user.role})`);
  return { accessToken: auth.accessToken };
}

async function step2_createProject(ctx: ApiContext): Promise<void> {
  header('2. Create project (auto-provisions standard skills)');
  // Determine whether the project is meaningfully seeded already (has skills
  // and/or a wiki). An empty directory is fine — the backend re-creates it
  // continuously via worker scans, so we cannot keep it deleted long enough
  // to satisfy POST /api/projects/create.
  const hasContent =
    existsSync(join(PROJECT_ROOT, 'wiki')) ||
    existsSync(join(PROJECT_ROOT, '.claude'));
  if (hasContent) {
    throw new Error(
      `project ${PROJECT_NAME} already seeded at ${PROJECT_ROOT}.\n` +
        `delete it (and the corresponding entries in Chroma + Quadstore) before re-running.`,
    );
  }

  // Preferred path: POST /api/projects/create — auto-provisions every
  // standard skill AND writes the documented project structure.
  // Fallback path: when the workspace already contains an empty directory
  // for this project (which happens because backend workers touch the
  // workspace continuously), the create call returns 400 "already exists".
  // In that case we directly call provision-standard on the existing entry.
  const body = {
    projectName: PROJECT_NAME,
    missionBrief: MISSION_BRIEF,
    language: 'en',
  };
  try {
    const r = await apiFetch<{ success: boolean; warnings?: string[] }>(
      ctx,
      '/api/projects/create',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!r.success) throw new Error(`project create returned success=false`);
    ok(`project created: ${PROJECT_NAME}`);
    for (const w of r.warnings ?? []) warn(`warning: ${w}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && err.body.includes('already exists')) {
      info('project entry already present — provisioning standard skills directly');
      const r = await apiFetch<{ success: boolean; message: string }>(
        ctx,
        `/api/skills/${PROJECT_NAME}/provision-standard`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (!r.success) throw new Error(`provision-standard failed: ${r.message}`);
      ok(r.message);
    } else {
      throw err;
    }
  }
  // Standard-skills provisioning is async on some setups — poll for the
  // wiki skill's wiki-add.ts to actually exist before we try to invoke it.
  const wikiAdd = join(PROJECT_ROOT, '.claude', 'skills', 'wiki', 'scripts', 'wiki-add.ts');
  const deadline = Date.now() + 20_000;
  while (!existsSync(wikiAdd) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!existsSync(wikiAdd)) {
    throw new Error(`wiki skill not provisioned after 20s: ${wikiAdd}`);
  }
  ok('wiki skill provisioned (.claude/skills/wiki/)');

  // The wiki skill is its own ESM package and needs gray-matter at runtime.
  // SkillsService provisions the source files but not node_modules. Borrow
  // them from the wiki-test project if present (fast); otherwise instruct
  // the operator to run `npm install` in the skill directory.
  const skillDir = join(PROJECT_ROOT, '.claude', 'skills', 'wiki');
  const skillNodeModules = join(skillDir, 'node_modules');
  if (!existsSync(skillNodeModules)) {
    const donor = join(
      WORKSPACE_ROOT,
      'wiki-test',
      '.claude',
      'skills',
      'wiki',
      'node_modules',
    );
    if (existsSync(donor)) {
      if (platform() === 'win32') {
        cpSync(donor, skillNodeModules, { recursive: true });
      } else {
        symlinkSync(donor, skillNodeModules, 'dir');
      }
      ok(`wiki skill node_modules borrowed from workspace/wiki-test/`);
    } else {
      throw new Error(
        `wiki skill needs node_modules but no donor found at ${donor}.\n` +
          `Run: (cd ${skillDir} && npm install) and re-run this script.`,
      );
    }
  }
}

async function step3_writeMission(): Promise<void> {
  header('3. Write wiki/_meta/mission.md');
  const dir = join(PROJECT_ROOT, 'wiki', '_meta');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mission.md'), MISSION_MD, 'utf8');
  ok('mission.md written');
}

async function step4_seedWiki(): Promise<{ writtenSlugs: string[]; stubsCreated: number }> {
  header('4. Seed wiki pages via provisioned wiki-add.ts');
  const writtenSlugs: string[] = [];
  let stubsCreated = 0;

  for (const draft of WIKI_PAGES) {
    const baseInput = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-desalination.ts' }],
      body: draft.body,
      classification: draft.classification ?? ('private' as const),
      provenance: { ...PROV },
    };
    // The wiki skill auto-creates stub pages for any internal links found in a
    // page body. A later page in our fixture list may have its slug pre-claimed
    // by such a stub. Try create first; if the page exists as a stub, update
    // it to take ownership and lift it to its real status.
    let result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'create' });
    if (!result.ok && /already exists/.test(result.error ?? '')) {
      result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'update' });
    }
    if (!result.ok) {
      throw new Error(`wiki-add failed for ${draft.slug}: ${result.error ?? 'unknown'}`);
    }
    writtenSlugs.push(result.slug ?? draft.slug);
    stubsCreated += result.stubsCreated?.length ?? 0;
    info(`${draft.bucket}/${result.slug} (${result.mode})`);
  }
  ok(
    `wiki: ${writtenSlugs.length} pages written + ${stubsCreated} auto-stubs created`,
  );
  return { writtenSlugs, stubsCreated };
}

async function step5_seedKG(ctx: ApiContext): Promise<void> {
  header('5. Seed knowledge graph');
  let entityCount = 0;
  for (const e of KG_ENTITIES) {
    try {
      await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/entities`, {
        method: 'POST',
        body: JSON.stringify(e),
      });
      entityCount += 1;
    } catch (err) {
      // KG service strictly types `type` to a fixed union; a 4xx here means
      // the wire-level type field needs to be one of the allowed values.
      // The kg fixture already maps domain types onto allowed wire types
      // via properties.domainType, so this should not happen — surface it.
      throw err;
    }
  }
  ok(`kg: ${entityCount} entities`);

  let relCount = 0;
  for (const r of KG_RELATIONSHIPS) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/relationships`, {
      method: 'POST',
      body: JSON.stringify(r),
    });
    relCount += 1;
  }
  ok(`kg: ${relCount} relationships`);
}

async function step6_seedRag(ctx: ApiContext): Promise<void> {
  header('6. Seed RAG documents');
  const dir = join(PROJECT_ROOT, 'documents');
  await mkdir(dir, { recursive: true });
  let indexed = 0;
  let skipped = 0;
  for (const doc of RAG_DOCS) {
    const path = join(dir, doc.filename);
    await writeFile(path, doc.body, 'utf8');
    try {
      await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/index-document`, {
        method: 'POST',
        body: JSON.stringify({ documentPath: `documents/${doc.filename}` }),
      });
      indexed += 1;
      if (indexed % 10 === 0) info(`indexed ${indexed}/${RAG_DOCS.length}…`);
    } catch (err) {
      if (err instanceof ApiError) {
        warn(`index failed for ${doc.filename}: HTTP ${err.status} (file still written for retry)`);
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  ok(`rag: ${indexed}/${RAG_DOCS.length} documents indexed${skipped ? `, ${skipped} skipped` : ''}`);
}

async function step7_seedChats(): Promise<void> {
  header('7. Seed chat sessions');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  let totalTurns = 0;
  for (const session of SESSIONS) {
    const path = join(etienne, `chat.history-${session.sessionId}.jsonl`);
    const lines = session.turns.map((t) => JSON.stringify(t)).join('\n') + '\n';
    await writeFile(path, lines, 'utf8');
    totalTurns += session.turns.length;
    info(`chat.history-${session.sessionId}.jsonl (${session.turns.length} turns)`);
  }

  // Build chat.sessions.json with one entry per session, preserving the
  // existing shape: {timestamp, sessionId, summary}.
  const sessionsPath = join(etienne, 'chat.sessions.json');
  let existing: { sessions?: Array<{ sessionId: string; timestamp: string; summary?: string }> } = {};
  if (existsSync(sessionsPath)) {
    try {
      existing = JSON.parse(await readFile(sessionsPath, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const seeded = SESSIONS.map((s) => ({
    timestamp: s.timestamp,
    sessionId: s.sessionId,
    summary: s.summary,
  }));
  const merged = {
    sessions: [...(existing.sessions ?? []), ...seeded],
  };
  await writeFile(sessionsPath, JSON.stringify(merged, null, 2), 'utf8');
  ok(`sessions: ${SESSIONS.length} sessions written, ${totalTurns} turns total`);
}

async function step8_enableAndRunDreaming(ctx: ApiContext): Promise<string> {
  header('8. Enable dreaming + trigger run-now');
  // Must enable settings — dreaming.service.ts:188-192 refuses runs when
  // settings.enabled === false.
  await apiFetch(ctx, `/api/dreaming/${PROJECT_NAME}/settings`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      cronExpression: '0 22 * * *',
      timeZone: 'UTC',
      maxItems: 10,
      skillName: 'dreaming',
    }),
  });
  ok('dreaming settings enabled');

  const r = await apiFetch<{ runId: string; enqueued: boolean; reason?: string }>(
    ctx,
    `/api/dreaming/${PROJECT_NAME}/run-now`,
    { method: 'POST' },
  );
  if (!r.enqueued) {
    throw new Error(`dreaming run-now refused: ${r.reason ?? 'unknown'}`);
  }
  ok(`dreaming run enqueued: ${r.runId}`);
  return r.runId;
}

async function step9_waitForDream(runId: string): Promise<string> {
  header('9. Wait for dream file');
  const dreamingDir = join(PROJECT_ROOT, 'dreaming');
  const today = new Date().toISOString().slice(0, 10);
  const expectedFile = join(dreamingDir, `dream-${today}.dreams.json`);
  info(`expected: workspace/${PROJECT_NAME}/dreaming/dream-${today}.dreams.json`);

  const timeoutMs = 5 * 60 * 1000; // 5 minutes — dreaming is LLM-driven.
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(expectedFile)) {
      const s = await stat(expectedFile);
      if (s.size === lastSize && s.size > 0) {
        // file stopped growing → finalize completed
        break;
      }
      lastSize = s.size;
    }
    await new Promise((r) => setTimeout(r, 5_000));
    process.stdout.write('  · waiting…\r');
  }
  console.log('');

  if (!existsSync(expectedFile)) {
    throw new Error(
      `dream file not produced within ${timeoutMs / 1000}s. ` +
        `Check the dreaming worker logs and run-state for runId=${runId}.`,
    );
  }
  const raw = await readFile(expectedFile, 'utf8');
  let parsed: { items?: unknown[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* surfaced below */
  }
  const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
  ok(
    `dream file produced: workspace/${PROJECT_NAME}/dreaming/dream-${today}.dreams.json (${itemCount} items, ${raw.length} bytes)`,
  );
  return expectedFile;
}

async function step10_installDesignSupport(): Promise<void> {
  header('10. Install design-support + scrapbook + stateful-workflows skills');
  const skillsDir = join(PROJECT_ROOT, '.claude', 'skills');
  await mkdir(skillsDir, { recursive: true });
  for (const skill of DS_OPTIONAL_SKILLS) {
    const src = join(SKILL_REPO, skill);
    const dst = join(skillsDir, skill);
    if (!existsSync(src)) {
      throw new Error(`optional skill not found in repo: ${src}`);
    }
    cpSync(src, dst, { recursive: true });
    info(`installed ${skill}/`);
  }

  // The hypothesis/derivation onEntry prompt files must be reachable at
  // workspace/<project>/workflows/<promptFile> — that is where the workflow
  // entry-action runner resolves them.
  const wfDir = join(PROJECT_ROOT, 'workflows');
  await mkdir(wfDir, { recursive: true });
  const refDir = join(skillsDir, 'design-support', 'references');
  for (const f of [
    'hyp-proposed.prompt', 'hyp-sharpened.prompt', 'hyp-under-test.prompt',
    'hyp-provisional-support.prompt', 'hyp-provisional-refute.prompt',
    'hyp-stalled.prompt', 'hyp-supported.prompt', 'hyp-refuted.prompt',
    'hyp-demoted.prompt', 'hyp-superseded.prompt',
    'derivation-pending.prompt', 'derivation-triage.prompt',
  ]) {
    cpSync(join(refDir, f), join(wfDir, f));
  }

  // Scaffold the runtime dirs the skill writes into.
  for (const d of ['mission/history', 'reports', 'design-support', '.attachments/design']) {
    await mkdir(join(PROJECT_ROOT, d), { recursive: true });
  }
  // Project-level tunable config copy (engineer edits this one).
  cpSync(
    join(skillsDir, 'design-support', 'config.json'),
    join(PROJECT_ROOT, 'design-support', 'config.json'),
  );
  ok('design-support installed + runtime dirs scaffolded');
}

async function step11_seedDesignSupportGraph(ctx: ApiContext): Promise<void> {
  header('11. Seed design-support typed graph (mission + working + hypotheses)');
  const entities = [
    ...DS_MISSION_NODES,
    ...DS_WORKING_NODES,
    ...DS_TEST_NODES,
    // Hypothesis nodes derived from the HYPOTHESES fixture.
    ...HYPOTHESES.map((h) => ({
      id: h.id,
      type: 'Document' as const,
      properties: {
        dsType: 'Hypothesis',
        label: h.statement,
        statement: h.statement,
        confirmationCriteria: h.confirmationCriteria,
        refutationCriteria: h.refutationCriteria,
        predictions: h.predictions,
        missionDerived: String(h.missionDerived),
        workflowId: h.workflowId,
        evidenceWeight: '0',
        confidence: 'open',
        relevance: h.relevance,
        focus: h.focus,
        createdAt: NOW,
        updatedAt: NOW,
      },
    })),
  ];
  let ec = 0;
  for (const e of entities) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/entities`, {
      method: 'POST',
      body: JSON.stringify(e),
    });
    ec += 1;
  }
  ok(`ds graph: ${ec} entities`);

  const edges = [
    ...DS_MISSION_EDGES,
    ...DS_WORKING_EDGES,
    ...DS_HYPOTHESIS_EDGES,
    ...DS_TEST_EDGES,
  ];
  let rc = 0;
  for (const r of edges) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/relationships`, {
      method: 'POST',
      body: JSON.stringify(r),
    });
    rc += 1;
  }
  ok(`ds graph: ${rc} relationships (incl. entails / dependsOn / testedBy / evidenceFor)`);
}

/**
 * Write a workflow file directly to workspace/<project>/workflows/.
 * The engine reads these on demand; persistedSnapshot:null means XState
 * starts the machine at `initial`. We then drive real transitions via the
 * REST event endpoint so the onEntry side-effects actually fire.
 */
async function writeWorkflowFile(workflowId: string, name: string, machineConfig: unknown): Promise<void> {
  const wfDir = join(PROJECT_ROOT, 'workflows');
  await mkdir(wfDir, { recursive: true });
  const initial = (machineConfig as { initial: string }).initial;
  const file = {
    id: workflowId,
    name,
    description: `Hypothesis lifecycle for ${workflowId}`,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    machineConfig,
    persistedSnapshot: null,
    currentState: initial,
    history: [] as unknown[],
    tags: ['design-support', 'hypothesis'],
  };
  await writeFile(join(wfDir, `${workflowId}.workflow.json`), JSON.stringify(file, null, 2), 'utf8');
}

async function step12_seedHypothesisWorkflows(ctx: ApiContext): Promise<void> {
  header('12. Create hypothesis workflows + advance to target states');
  const machinePath = join(
    PROJECT_ROOT, '.claude', 'skills', 'design-support', 'references', 'hypothesis-machine.json',
  );
  const machineConfig = JSON.parse(await readFile(machinePath, 'utf8'));

  for (const h of HYPOTHESES) {
    await writeWorkflowFile(h.workflowId, `Hypothesis: ${h.statement.slice(0, 48)}`, machineConfig);
    info(`workflow ${h.workflowId} (target: ${h.targetState})`);
    // Drive the documented event path. Each event runs a real transition;
    // onEntry side-effects (e.g. the refuted cascade) fire via the backend.
    for (const ev of h.eventPath) {
      try {
        await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/workflows/${h.workflowId}/event`, {
          method: 'POST',
          body: JSON.stringify({ event: ev, data: { hypothesisId: h.id, source: 'seed' } }),
        });
      } catch (err) {
        if (err instanceof ApiError) {
          warn(`  ${h.workflowId} event ${ev} → HTTP ${err.status} (continuing)`);
          continue;
        }
        throw err;
      }
    }
  }

  // The mission-derivation singleton, parked in `closed`.
  const mdPath = join(
    PROJECT_ROOT, '.claude', 'skills', 'design-support', 'references', 'mission-derivation-machine.json',
  );
  const mdConfig = JSON.parse(await readFile(mdPath, 'utf8'));
  await writeWorkflowFile('mission-derivation', 'Mission derivation', mdConfig);
  ok(`${HYPOTHESES.length} hypothesis workflows + mission-derivation created`);
}

/**
 * Create the named scrapbook so it is discoverable in the open dialog (the
 * dialog scans for *.scbk metadata files) AND build the mission-aligned
 * projection of the design-support graph (root → Engineering/Compliance/
 * Economics → decisions + hypotheses tagged by lifecycle state, with
 * [kg:<id>] round-trip tokens).
 *
 * The .scbk file is written directly to disk (matching the shape
 * ScrapbookService.createScrapbook writes) so discoverability does not depend
 * on API reachability. The node projection is built via the scrapbook API;
 * if the API is unreachable the .scbk + root still make the scrapbook
 * openable and the design-support skill can rebuild the projection later.
 */
async function step12b_seedScrapbookProjection(ctx: ApiContext): Promise<void> {
  header('12b. Create scrapbook + mission-aligned projection');
  const graphName = 'design';
  const sbName = 'Desalination Pilot — Design Scrapbook';

  // 1. .scbk metadata (discoverability) — written directly to disk.
  const scbk = { name: sbName, graphName, createdAt: NOW, version: 1 };
  await writeFile(
    join(PROJECT_ROOT, `scrapbook.${graphName}.scbk`),
    JSON.stringify(scbk, null, 2),
    'utf8',
  );
  info(`scrapbook.${graphName}.scbk written`);

  // 2. Build the projection via the scrapbook API.
  const base = `/api/workspace/${PROJECT_NAME}/scrapbook/${graphName}/nodes`;
  const mk = async (body: Record<string, unknown>): Promise<string | null> => {
    try {
      const r = await apiFetch<{ id?: string }>(ctx, base, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return r?.id ?? null;
    } catch (err) {
      if (err instanceof ApiError) {
        warn(`scrapbook node POST → HTTP ${err.status} (projection skipped; .scbk still openable)`);
        return null;
      }
      throw err;
    }
  };

  const rootId = await mk({
    type: 'ProjectTheme',
    label: 'Desalination Pilot',
    description: 'Mission-aligned projection of the design-support knowledge graph. [kg:mv-1]',
    priority: 10,
    attentionWeight: 1.0,
  });
  if (!rootId) {
    warn('scrapbook root not created (API unreachable) — .scbk present; skill will project on first run');
    return;
  }

  const cat = async (label: string, desc: string, prio: number, att: number) =>
    mk({ type: 'Category', label, description: desc, priority: prio, attentionWeight: att, parentId: rootId });
  const eng = await cat('Engineering', 'Buildable system from COTS components. [kg:mi-buildable]', 10, 0.7);
  const cmp = await cat('Compliance', 'WHO GDWQ + EU DWD 2020/2184. [kg:mc-who-eu]', 10, 0.6);
  const eco = await cat('Economics', 'Defensible 10-year TCO. [kg:mc-tco]', 9, 0.5);

  const child = async (parent: string | null, type: string, label: string, desc: string, prio: number, att: number) => {
    if (!parent) return;
    await mk({ type, label, description: desc, priority: prio, attentionWeight: att, parentId: parent });
  };

  await child(eng, 'Decision', '2-element SW30 train (38% recovery)', 'Load-bearing for boron compliance; depends on hypothesis-boron-single-pass. [kg:decision-sw30-train]', 9, 0.7);
  await child(eng, 'Decision', 'Multimedia + cartridge pre-treatment', 'Targets SDI < 3. [kg:decision-multimedia-pretreat]', 9, 0.6);
  await child(eng, 'Concept', '⚠ Hypothesis: single-pass clears boron (REFUTED)', 'Refuted — see cascade report; entails second-pass; sw30-train depends on it. [kg:hypothesis-boron-single-pass]', 10, 0.8);
  await child(eng, 'Concept', 'Hypothesis: partial second pass clears boron (PROVISIONAL)', 'Reopened by the single-pass cascade. [kg:hypothesis-second-pass-clears-boron]', 9, 0.7);
  await child(eng, 'Concept', 'Hypothesis: pre-treatment sustains 5y membrane (UNDER TEST)', 'Under test. [kg:hypothesis-pretreat-5y-membrane]', 9, 0.6);
  await child(cmp, 'Constraint', 'Boron <= EU 1.5 mg/L', 'Acceptance criterion. [kg:mac-boron]', 10, 0.6);
  await child(cmp, 'OpenQuestion', 'Second pass needed at high feed pH?', 'Boron is the weak spot. [kg:openq-boron-second-pass]', 9, 0.6);
  await child(eco, 'Concept', 'Hypothesis: ERD pays back within 10y (SUPPORTED)', 'Supported; confidence frozen. [kg:hypothesis-erd-payback]', 8, 0.5);
  await child(eco, 'Concept', 'Hypothesis: solar-only feasible (STALLED)', 'Stalled — commit to a test or demote. [kg:hypothesis-solar-only-feasible]', 7, 0.3);

  ok(`scrapbook "${sbName}" created with mission-aligned projection (13 nodes)`);
}

async function step13_documentationAndUi(): Promise<void> {
  header('13. Write documentation.md + register as auto-open');
  const docSrc = join(PROJECT_ROOT, DOCUMENTATION_SOURCE_REL);
  const docBody = await readFile(docSrc, 'utf8');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), docBody, 'utf8');

  const uiPath = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  let ui: any = { ...USER_INTERFACE_JSON };
  if (existsSync(uiPath)) {
    try {
      const cur = JSON.parse(await readFile(uiPath, 'utf8'));
      const previews: string[] = Array.isArray(cur.previewDocuments) ? cur.previewDocuments : [];
      if (!previews.includes('documentation.md')) previews.unshift('documentation.md');
      ui = { ...cur, previewDocuments: previews };
    } catch {
      /* keep fixture default */
    }
  }
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  ok('documentation.md written + registered in user-interface.json');
}

async function step14_seedEventRules(): Promise<void> {
  header('14. Seed critic-mission-contradiction event rule + prompt');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  const ehPath = join(etienne, 'event-handling.json');
  let eh: { rules: any[] } = { rules: [] };
  if (existsSync(ehPath)) {
    try { eh = JSON.parse(await readFile(ehPath, 'utf8')); } catch { eh = { rules: [] }; }
  }
  if (!Array.isArray(eh.rules)) eh.rules = [];
  if (!eh.rules.some((r) => r.id === 'critic-mission-contradiction')) {
    eh.rules.push({
      id: 'critic-mission-contradiction',
      name: 'Critic: surface a node contradicting the current mission',
      // Seeded DISABLED on purpose. The seed drives a hypothesis to a
      // Refuted→cascade state, which creates a kg:contradicts edge to a
      // Mission node — making this knowledge-graph condition permanently
      // true. A knowledge-graph rule re-evaluates on EVERY event and its
      // prompt action's SDK session emits its own events, so left enabled
      // against an unresolved contradiction it re-fires indefinitely (the
      // rule-engine cooldown bounds the rate but never stops it). The
      // operator enables it intentionally once they want the critic live.
      enabled: false,
      condition: {
        type: 'knowledge-graph',
        sparqlQuery:
          'PREFIX kg: <http://example.org/kg/> SELECT ?node ?mission WHERE { ?node kg:contradicts ?mission . { ?mission kg:type "MissionIntent" } UNION { ?mission kg:type "MissionConstraint" } UNION { ?mission kg:type "MissionAcceptanceCriterion" } } LIMIT 1',
      },
      action: { type: 'prompt', promptId: 'critic-interrupt' },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  await writeFile(ehPath, JSON.stringify(eh, null, 2), 'utf8');

  const prPath = join(etienne, 'prompts.json');
  let pr: { prompts: any[] } = { prompts: [] };
  if (existsSync(prPath)) {
    try { pr = JSON.parse(await readFile(prPath, 'utf8')); } catch { pr = { prompts: [] }; }
  }
  if (!Array.isArray(pr.prompts)) pr.prompts = [];
  if (!pr.prompts.some((p) => p.id === 'critic-interrupt')) {
    pr.prompts.push({
      id: 'critic-interrupt',
      title: 'Critic: mission contradiction detected',
      content:
        'The design-support critic detected a node in the knowledge graph that CONTRADICTS the current mission. This is the one permitted pull-based exception. Invoke the design-support skill in `critic` mode: identify the contradicting node and the mission element it conflicts with, state the conflict to the engineer plainly and specifically, and record a Gap node. Do not resolve it unilaterally; do not push anything else.',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  await writeFile(prPath, JSON.stringify(pr, null, 2), 'utf8');
  ok('event rule + prompt seeded');
}

async function step15_registerCuratorCron(ctx: ApiContext): Promise<void> {
  header('15. Register nightly curator cron');
  try {
    await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'design-support-curator',
        name: 'Design-support nightly curator',
        prompt:
          'Run the design-support skill in curator mode: recompute relevance, decay+renormalize focus (conserve the budget), dedupe, refresh the gap/whitespot registers, fire STALL on stale under_test hypotheses, refresh the scrapbook projection, then bounded research/synthesize/critic post-steps. Append a summary to design-support/curator-log.md.',
        cronExpression: '0 3 * * *',
        timeZone: 'UTC',
        type: 'recurring',
      }),
    });
    ok('curator cron registered (0 3 * * * UTC)');
  } catch (err) {
    if (err instanceof ApiError) {
      warn(`curator cron registration → HTTP ${err.status} (register manually if needed)`);
      return;
    }
    throw err;
  }
}

// ─── entry ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\x1b[1mSeeding ${PROJECT_NAME}\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);

  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step3_writeMission();
  await step4_seedWiki();
  await step5_seedKG(ctx);
  await step6_seedRag(ctx);
  await step7_seedChats();
  const runId = await step8_enableAndRunDreaming(ctx);
  const dreamPath = await step9_waitForDream(runId);

  // Engineering Design Support System + hypothesis subsystem.
  await step10_installDesignSupport();
  await step11_seedDesignSupportGraph(ctx);
  await step12_seedHypothesisWorkflows(ctx);
  await step12b_seedScrapbookProjection(ctx);
  await step13_documentationAndUi();
  await step14_seedEventRules();
  await step15_registerCuratorCron(ctx);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${dreamPath}`);
  console.log(`  docs:     workspace/${PROJECT_NAME}/documentation.md (auto-opens in the UI)`);
  console.log(`  ui:       open the project and explore the scrapbook + status report`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
