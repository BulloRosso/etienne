/**
 * Seed the `long-horizon-commitments` example project.
 *
 *   1. Authenticate against the OAuth server (:5950).
 *   2. Create the project via POST /api/projects/create — this auto-provisions
 *      every standard skill including `wiki` and `dreaming`.
 *  2b. Provision MCP servers (kg, workflows, scrapbook) via POST
 *      /api/claude/mcp/config/save.
 *   3. Write wiki/_meta/mission.md directly.
 *   4. Write ~18 wiki pages via the provisioned `wiki-add.ts` script.
 *   5. POST KG entities + relationships (vessels, decisions, assumptions,
 *      gates, projections, regulations).
 *   6. Write ~18 RAG documents under the project's documents/ folder
 *      and POST each path to /api/workspace/<project>/rag/index-document.
 *   7. Write three JSONL session histories + update chat.sessions.json.
 *   8. Enable dreaming + POST /run-now.
 *   9. Wait for workspace/<project>/dreaming/dream-YYYY-MM-DD.dreams.json.
 *  10. Install design-support + scrapbook + stateful-workflows optional
 *      skills and scaffold the runtime dirs.
 *  11. POST the design-support typed graph (mission + working + hypothesis
 *      nodes; servesMission / dependsOn / entails / contradicts / evidenceFor
 *      / testedBy edges).
 *  12. Create one workflow per hypothesis and drive it to its target state
 *      (incl. one Refuted→cascade [hypothesis-eua-price-stable] and one
 *      mission-derived [hypothesis-meridian-off-strategy]); + the
 *      mission-derivation singleton.
 *  12b. Create the fleet scrapbook (.scbk metadata) + the mission-aligned
 *      projection (root → Assumptions-expired / Gates-approaching /
 *      Projection-breached / Drift → leaves).
 *  13. Write documentation.md + register it (along with the quarterly
 *      packet path) in .etienne/user-interface.json previewDocuments so
 *      both auto-open in the preview pane.
 *  13b. Assign the long-horizon-commitments application type — writes
 *      .etienne/application-type.json so the MinimalisticSidebar's
 *      ApplicationSection renders the 6-item Fleet commitments menu.
 *  13c. Write the canonical Q2 2026 quarterly packet at
 *      out/quarterly-packets/2026-Q2.quarterly.json. The frontend renders
 *      this through QuarterlyViewer (registered against .quarterly.json
 *      in viewerRegistry.jsx).
 *  13d. Write the canonical nightly fleet-alignment report at
 *      out/nightly-alignment/2026-05-26.alignment.json. The frontend
 *      renders this through the alignment MCP UI previewer
 *      (backend/src/mcpserver/alignment-tools.ts; previewer-metadata.json
 *      viewer=alignment, ext=.alignment.json). The curator cron overwrites
 *      this each night; the seed fixture gives a fresh project something
 *      to preview immediately.
 *  14. Seed three event rules: rag-auto-index, assumption-expired-triggers-
 *      review, gate-approaching-triggers-redteam.
 *  15. Register the nightly curator cron (the no-silent-default heartbeat).
 *
 * Run with:
 *
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-long-horizon-commitments/seed-long-horizon-commitments.ts
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
  DOCUMENTATION_MD,
} from './fixtures/hypotheses';
import { QUARTERLY_PACKET_Q2_2026 } from './fixtures/quarterly-packet';

const QUARTERLY_PACKET_REL = 'out/quarterly-packets/2026-Q2.quarterly.json';
const ALIGNMENT_REPORT_REL = 'out/nightly-alignment/2026-05-26.alignment.json';
const ALIGNMENT_FIXTURE_FILENAME = '2026-05-26.alignment.json';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  'C:/Data/GitHub/claude-multitenant/workspace';

const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

const REPO_ROOT = join(WORKSPACE_ROOT, '..');
const SKILL_REPO = join(REPO_ROOT, 'skill-repository', 'standard', 'optional');
const DS_OPTIONAL_SKILLS = ['design-support', 'scrapbook', 'stateful-workflows'];

const NOW = '2026-05-24T09:00:00Z';
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
  const hasContent =
    existsSync(join(PROJECT_ROOT, 'wiki')) ||
    existsSync(join(PROJECT_ROOT, '.claude'));
  if (hasContent) {
    throw new Error(
      `project ${PROJECT_NAME} already seeded at ${PROJECT_ROOT}.\n` +
        `delete it (and the corresponding entries in Chroma + Quadstore) before re-running.`,
    );
  }

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
  // Wait for the wiki skill's wiki-add.ts to exist before we try to invoke it.
  const wikiAdd = join(PROJECT_ROOT, '.claude', 'skills', 'wiki', 'scripts', 'wiki-add.ts');
  const deadline = Date.now() + 20_000;
  while (!existsSync(wikiAdd) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!existsSync(wikiAdd)) {
    throw new Error(`wiki skill not provisioned after 20s: ${wikiAdd}`);
  }
  ok('wiki skill provisioned (.claude/skills/wiki/)');

  // Borrow wiki skill node_modules from wiki-test if needed.
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

async function step2b_provisionMcpServers(ctx: ApiContext): Promise<void> {
  header('2b. Provision MCP servers (.mcp.json + settings.json)');
  const mcpServers = {
    kg: {
      type: 'http',
      url: 'http://localhost:6060/mcp/knowledge-graph',
      headers: { Authorization: 'test123' },
      description: 'Knowledge Graph Tools',
    },
    workflows: {
      type: 'http',
      url: 'http://localhost:6060/mcp/workflows',
      headers: { Authorization: 'Bearer test123' },
      description: 'Workflow Tools',
    },
    scrapbook: {
      type: 'http',
      url: 'http://localhost:6060/mcp/scrapbook',
      headers: { Authorization: 'test123' },
      description: 'Scrapbook tools for mindmap',
    },
    rag: {
      type: 'http',
      url: 'http://localhost:6060/mcp/rag',
      headers: { Authorization: 'test123' },
      description: 'RAG semantic search across documents/ and wiki/',
    },
  };
  await apiFetch(ctx, `/api/claude/mcp/config/save`, {
    method: 'POST',
    body: JSON.stringify({ projectName: PROJECT_NAME, mcpServers }),
  });
  const mcpPath = join(PROJECT_ROOT, '.mcp.json');
  if (!existsSync(mcpPath)) {
    throw new Error(`.mcp.json not written at ${mcpPath}`);
  }
  ok(`mcp servers provisioned: ${Object.keys(mcpServers).join(', ')}`);
}

async function step3_writeMission(): Promise<void> {
  header('3. Write wiki/_meta/mission.md');
  const dir = join(PROJECT_ROOT, 'wiki', '_meta');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mission.md'), MISSION_MD, 'utf8');
  ok('mission.md written');
}

async function step4_seedWiki(ctx: ApiContext): Promise<{ writtenSlugs: string[]; stubsCreated: number; ragIndexed: number }> {
  header('4. Seed wiki pages via provisioned wiki-add.ts + index into RAG');
  const writtenSlugs: string[] = [];
  let stubsCreated = 0;
  let ragIndexed = 0;
  let ragSkipped = 0;

  for (const draft of WIKI_PAGES) {
    const baseInput = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-long-horizon-commitments.ts' }],
      body: draft.body,
      classification: draft.classification ?? ('private' as const),
      provenance: { ...PROV },
    };
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

    // Backfill into RAG. Without this, a fresh seed leaves wiki content
    // reachable only via filesystem grep (wiki-search). Going forward, edits
    // flow through the rag-index-wiki-* rules — but on initial seed we beat
    // those by writing files faster than the watcher's debounce window.
    // Reindex (not index) so a re-run of the seed replaces previous chunks
    // rather than duplicating them.
    const slug = result.slug ?? draft.slug;
    const docPath = `wiki/${draft.bucket}/${slug}.md`;
    try {
      await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/reindex-document`, {
        method: 'POST',
        body: JSON.stringify({ documentPath: docPath }),
      });
      ragIndexed += 1;
    } catch (err) {
      if (err instanceof ApiError) {
        warn(`rag reindex failed for ${docPath}: HTTP ${err.status} (page still on disk; live rule will retry)`);
        ragSkipped += 1;
        continue;
      }
      throw err;
    }
  }
  ok(
    `wiki: ${writtenSlugs.length} pages written + ${stubsCreated} auto-stubs created; rag: ${ragIndexed} indexed${ragSkipped ? `, ${ragSkipped} skipped` : ''}`,
  );
  return { writtenSlugs, stubsCreated, ragIndexed };
}

async function step5_seedKG(ctx: ApiContext): Promise<void> {
  header('5. Seed knowledge graph (vessels, decisions, assumptions, gates, projections)');
  let entityCount = 0;
  for (const e of KG_ENTITIES) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/entities`, {
      method: 'POST',
      body: JSON.stringify(e),
    });
    entityCount += 1;
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
  header('6. Seed RAG documents (charter / reg / retrofit / survey / valuation / analyst / memo)');
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
      if (indexed % 5 === 0) info(`indexed ${indexed}/${RAG_DOCS.length}…`);
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

  const timeoutMs = 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(expectedFile)) {
      const s = await stat(expectedFile);
      if (s.size === lastSize && s.size > 0) break;
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

  for (const d of ['mission/history', 'reports', 'design-support', '.attachments/design']) {
    await mkdir(join(PROJECT_ROOT, d), { recursive: true });
  }
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
  ok(`ds graph: ${rc} relationships (incl. entails / dependsOn / contradicts / evidenceFor / testedBy)`);
}

interface InitialRationaleDraft {
  reasoning: string;
  evidenceDocuments: string[];
}

async function writeWorkflowFile(
  workflowId: string,
  name: string,
  machineConfig: unknown,
  extras: {
    assumptionWikiSlugs?: string[];
    initialRationale?: InitialRationaleDraft;
  } = {},
): Promise<void> {
  const wfDir = join(PROJECT_ROOT, 'workflows');
  await mkdir(wfDir, { recursive: true });
  const initial = (machineConfig as { initial: string }).initial;
  const file: Record<string, unknown> = {
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
  if (extras.assumptionWikiSlugs && extras.assumptionWikiSlugs.length > 0) {
    file.assumptionWikiSlugs = extras.assumptionWikiSlugs;
  }
  if (extras.initialRationale) {
    file.initialRationale = {
      reasoning: extras.initialRationale.reasoning,
      evidenceDocuments: extras.initialRationale.evidenceDocuments,
      recordedAt: NOW,
      recordedBy: 'seed',
    };
  }
  await writeFile(join(wfDir, `${workflowId}.workflow.json`), JSON.stringify(file, null, 2), 'utf8');
}

async function step12_seedHypothesisWorkflows(ctx: ApiContext): Promise<void> {
  header('12. Create hypothesis workflows + advance to target states');
  const machinePath = join(
    PROJECT_ROOT, '.claude', 'skills', 'design-support', 'references', 'hypothesis-machine.json',
  );
  const machineConfig = JSON.parse(await readFile(machinePath, 'utf8'));

  for (const h of HYPOTHESES) {
    await writeWorkflowFile(
      h.workflowId,
      `Hypothesis: ${h.statement.slice(0, 48)}`,
      machineConfig,
      {
        assumptionWikiSlugs: h.assumptionWikiSlugs,
        initialRationale: h.initialRationale,
      },
    );
    info(`workflow ${h.workflowId} (target: ${h.targetState})`);
    for (const ev of h.eventPath) {
      const transitionRationale = h.transitionRationale?.[ev];
      const body: Record<string, unknown> = {
        event: ev,
        data: { hypothesisId: h.id, source: 'seed' },
      };
      if (transitionRationale) {
        body.rationale = {
          reasoning: transitionRationale.reasoning,
          evidenceDocuments: transitionRationale.evidenceDocuments,
          recordedAt: NOW,
          recordedBy: 'seed',
        };
        body.decidedBy = 'human';
      }
      try {
        await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/workflows/${h.workflowId}/event`, {
          method: 'POST',
          body: JSON.stringify(body),
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

  const mdPath = join(
    PROJECT_ROOT, '.claude', 'skills', 'design-support', 'references', 'mission-derivation-machine.json',
  );
  const mdConfig = JSON.parse(await readFile(mdPath, 'utf8'));
  await writeWorkflowFile('mission-derivation', 'Mission derivation', mdConfig);
  ok(`${HYPOTHESES.length} hypothesis workflows + mission-derivation created`);
}

async function step12b_seedScrapbookProjection(ctx: ApiContext): Promise<void> {
  header('12b. Create scrapbook + quarterly-packet projection');
  const graphName = 'fleet';
  const sbName = 'Long-Horizon Commitments — Quarterly Packet';

  const scbk = { name: sbName, graphName, createdAt: NOW, version: 1 };
  await writeFile(
    join(PROJECT_ROOT, `scrapbook.${graphName}.scbk`),
    JSON.stringify(scbk, null, 2),
    'utf8',
  );
  info(`scrapbook.${graphName}.scbk written`);

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
    label: 'Q2 2026 quarterly packet',
    description: 'Mission-aligned projection of the fleet commitment graph. [kg:mv-1]',
    priority: 10,
    attentionWeight: 1.0,
  });
  if (!rootId) {
    warn('scrapbook root not created (API unreachable) — .scbk present; skill will project on first run');
    return;
  }

  const cat = async (label: string, desc: string, prio: number, att: number) =>
    mk({ type: 'Category', label, description: desc, priority: prio, attentionWeight: att, parentId: rootId });
  const expired = await cat(
    'Assumptions expired (3)',
    'Assumptions that have aged out and need a human re-decision. [kg:mac-no-unactioned-packets]',
    10, 0.9,
  );
  const gates = await cat(
    'Gates approaching (1)',
    'Scheduled revalidation windows within 18 months. [kg:mc-revalidate-before-gate]',
    10, 0.8,
  );
  const breached = await cat(
    'Projection breached (1)',
    'Actuals left the original uncertainty cone. [kg:mac-preserve-projection]',
    9, 0.7,
  );
  const drift = await cat(
    'Drift (1)',
    'Vessels drifted from the stated fleet strategy. [kg:mac-one-off-strategy]',
    9, 0.7,
  );

  const child = async (
    parent: string | null,
    type: string,
    label: string,
    desc: string,
    prio: number,
    att: number,
    wikiSlug?: string,
  ) => {
    if (!parent) return;
    await mk({ type, label, description: desc, priority: prio, attentionWeight: att, parentId: parent, ...(wikiSlug ? { wikiSlug } : {}) });
  };

  // Expired-assumptions leaves (the article's red items).
  await child(expired, 'Assumption', 'Fuel spread narrows (expired)',
    'Underpins 2018 no-scrubber. [kg:assumption-fuel-spread-narrows]', 10, 0.9, 'commitment-lifeline-meridian');
  await child(expired, 'Assumption', 'Rates below plan (expired)',
    'Underpins 2023 refinancing. [kg:assumption-rates-below-plan]', 10, 0.8, 'commitment-lifeline-meridian');
  await child(expired, 'Assumption', 'EUA price stable (expired)',
    'Underpins 2025 comply-via-allowances. [kg:assumption-eua-price-stable]', 10, 0.9, 'eu-ets-and-fueleu');
  // Gates leaf.
  await child(gates, 'Gate', 'Meridian dry-dock window 2027 (~14 months)',
    'Three deferred items parked. [kg:gate-meridian-drydock-2027]', 10, 0.9, 'dry-dock-windows');
  // Breached projection leaf.
  await child(breached, 'Projection', 'Meridian lifetime earnings — review requested',
    'Left the cone in 2023. Agent will not re-baseline. [kg:projection-meridian-lifetime-earnings]', 10, 0.8, 'projection-vs-reality');
  // Drift leaf.
  await child(drift, 'Vessel', 'Meridian — 38% alignment (off-strategy)',
    'Drifted from "charter-ready through 2035". [kg:meridian]', 10, 0.8, 'meridian');

  ok(`scrapbook "${sbName}" created with quarterly-packet projection`);
}

async function step13_documentationAndUi(): Promise<void> {
  header('13. Write documentation.md + register as auto-open');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');

  const uiPath = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  let ui: any = { ...USER_INTERFACE_JSON };
  if (existsSync(uiPath)) {
    try {
      const cur = JSON.parse(await readFile(uiPath, 'utf8'));
      const previews: string[] = Array.isArray(cur.previewDocuments) ? cur.previewDocuments : [];
      // Quarterly packet first (it's the load-bearing artefact), then docs.
      if (!previews.includes(QUARTERLY_PACKET_REL)) previews.unshift(QUARTERLY_PACKET_REL);
      if (!previews.includes('documentation.md')) {
        // Put documentation.md right after the packet, not before it.
        const filtered = previews.filter((p) => p !== 'documentation.md');
        const packetIdx = filtered.indexOf(QUARTERLY_PACKET_REL);
        filtered.splice(packetIdx + 1, 0, 'documentation.md');
        ui = { ...cur, previewDocuments: filtered };
      } else {
        ui = { ...cur, previewDocuments: previews };
      }
    } catch {
      /* keep fixture default, but inject the packet path */
      ui = { ...USER_INTERFACE_JSON, previewDocuments: [QUARTERLY_PACKET_REL, 'documentation.md'] };
    }
  } else {
    ui = { ...USER_INTERFACE_JSON, previewDocuments: [QUARTERLY_PACKET_REL, 'documentation.md'] };
  }
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  ok(`documentation.md + ${QUARTERLY_PACKET_REL} registered in user-interface.json`);
}

async function step13c_writeQuarterlyPacket(): Promise<void> {
  header('13c. Write the canonical Q2 2026 quarterly packet (.quarterly.json)');
  const dir = join(PROJECT_ROOT, 'out', 'quarterly-packets');
  await mkdir(dir, { recursive: true });
  const path = join(PROJECT_ROOT, QUARTERLY_PACKET_REL);
  await writeFile(path, JSON.stringify(QUARTERLY_PACKET_Q2_2026, null, 2), 'utf8');
  ok(`packet written: ${QUARTERLY_PACKET_REL} (rendered by QuarterlyViewer)`);
}

async function step13d_writeNightlyAlignment(): Promise<void> {
  header('13d. Write the canonical nightly fleet-alignment report (.alignment.json)');
  // The frontend renders this through the alignment MCP UI previewer
  // (backend/src/mcpserver/alignment-tools.ts +
  // previewer-metadata.json viewer=alignment, ext=.alignment.json).
  // The curator cron will overwrite this each night; the seed fixture is
  // there so a fresh project has something to preview immediately.
  const dir = join(PROJECT_ROOT, 'out', 'nightly-alignment');
  await mkdir(dir, { recursive: true });
  const fixturePath = join(__dirname, 'fixtures', ALIGNMENT_FIXTURE_FILENAME);
  const content = await readFile(fixturePath, 'utf8');
  const destPath = join(PROJECT_ROOT, ALIGNMENT_REPORT_REL);
  await writeFile(destPath, content, 'utf8');
  ok(`alignment report written: ${ALIGNMENT_REPORT_REL} (rendered by the Fleet Alignment MCP UI)`);
}

async function step13b_assignApplicationType(): Promise<void> {
  header('13b. Assign long-horizon-commitments application type (sidebar menu)');
  // The backend's ApplicationTypesService reads this marker file on demand
  // from /api/application-types/effective/<project>. Writing it directly
  // avoids a round-trip through POST /api/application-types/set and matches
  // what ApplicationTypesService.applyApplicationTypeToDir does internally
  // (write { id } as JSON at .etienne/application-type.json + provision any
  // bundled subagents — this type ships none, so no subagent step needed).
  const markerPath = join(PROJECT_ROOT, '.etienne', 'application-type.json');
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  await writeFile(markerPath, JSON.stringify({ id: 'long-horizon-commitments' }, null, 2), 'utf8');
  ok('application-type marker written (.etienne/application-type.json)');
}

async function step14_seedEventRules(): Promise<void> {
  header('14. Seed event rules: rag-auto-index + assumption-expired + gate-approaching');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  const ehPath = join(etienne, 'event-handling.json');
  let eh: { rules: any[] } = { rules: [] };
  if (existsSync(ehPath)) {
    try { eh = JSON.parse(await readFile(ehPath, 'utf8')); } catch { eh = { rules: [] }; }
  }
  if (!Array.isArray(eh.rules)) eh.rules = [];

  // Rules 1–9: full RAG indexing lifecycle (create/update/delete) for both
  // documents/ and wiki/{topics,sources}/. The rule-engine glob converter only
  // handles `*` (rule-engine.service.ts:359–364), so wiki paths need two rules
  // per event — one for topics, one for sources.
  const ragLifecycleRules: Array<{ id: string; name: string; eventName: string; pathGlob: string; promptId: string }> = [
    // documents/
    { id: 'rag-index-documents-created',  name: 'Auto-index documents (create) for RAG',  eventName: 'File Created',  pathGlob: '*/documents/*',          promptId: 'rag-auto-index' },
    { id: 'rag-index-documents-modified', name: 'Re-index documents (modify) for RAG',    eventName: 'File Modified', pathGlob: '*/documents/*',          promptId: 'rag-auto-reindex' },
    { id: 'rag-index-documents-deleted',  name: 'Delete documents from RAG (on delete)',  eventName: 'File Deleted',  pathGlob: '*/documents/*',          promptId: 'rag-auto-delete' },
    // wiki/topics/
    { id: 'rag-index-wiki-topics-created',  name: 'Auto-index wiki topics for RAG',          eventName: 'File Created',  pathGlob: '*/wiki/topics/*.md',  promptId: 'rag-auto-index' },
    { id: 'rag-index-wiki-topics-modified', name: 'Re-index wiki topics for RAG',            eventName: 'File Modified', pathGlob: '*/wiki/topics/*.md',  promptId: 'rag-auto-reindex' },
    { id: 'rag-index-wiki-topics-deleted',  name: 'Delete wiki topics from RAG (on delete)', eventName: 'File Deleted',  pathGlob: '*/wiki/topics/*.md',  promptId: 'rag-auto-delete' },
    // wiki/sources/
    { id: 'rag-index-wiki-sources-created',  name: 'Auto-index wiki sources for RAG',          eventName: 'File Created',  pathGlob: '*/wiki/sources/*.md', promptId: 'rag-auto-index' },
    { id: 'rag-index-wiki-sources-modified', name: 'Re-index wiki sources for RAG',            eventName: 'File Modified', pathGlob: '*/wiki/sources/*.md', promptId: 'rag-auto-reindex' },
    { id: 'rag-index-wiki-sources-deleted',  name: 'Delete wiki sources from RAG (on delete)', eventName: 'File Deleted',  pathGlob: '*/wiki/sources/*.md', promptId: 'rag-auto-delete' },
  ];

  // Drop the legacy single-event rule from prior seeds so it doesn't sit next
  // to the new fine-grained ones and double-fire on create events.
  eh.rules = eh.rules.filter((r) => r.id !== 'rag-auto-index-documents');

  for (const r of ragLifecycleRules) {
    if (eh.rules.some((existing) => existing.id === r.id)) continue;
    eh.rules.push({
      id: r.id,
      name: r.name,
      enabled: true,
      condition: {
        type: 'simple',
        event: {
          group: 'Filesystem',
          name: r.eventName,
          'payload.path': r.pathGlob,
        },
      },
      action: { type: 'prompt', promptId: r.promptId },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // Rule 2: assumption-expired triggers a quarterly-packet review entry.
  // Seeded DISABLED on purpose. Three assumptions are seeded with
  // ageingState=expired, so an always-on rule with a KG SPARQL condition on
  // that property would re-fire indefinitely against unresolved state (same
  // failure mode the desalination seed's critic-mission-contradiction rule
  // documents). Operator enables intentionally once they want the live wire.
  if (!eh.rules.some((r) => r.id === 'assumption-expired-triggers-review')) {
    eh.rules.push({
      id: 'assumption-expired-triggers-review',
      name: 'Assumption expired: add to current quarterly packet',
      enabled: false,
      condition: {
        type: 'knowledge-graph',
        sparqlQuery:
          'PREFIX kg: <http://example.org/kg/> SELECT ?assumption ?vessel WHERE { ?assumption kg:ageingState "expired" . ?assumption kg:vessel ?vessel } LIMIT 1',
      },
      action: { type: 'prompt', promptId: 'assumption-expired-interrupt' },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // Rule 3: gate within 18 months triggers the red-team workflow assembly.
  // Also seeded DISABLED — the Meridian gate is 14 months out, so this
  // condition is permanently true at seed time. Operator enables when
  // they want the live wire.
  if (!eh.rules.some((r) => r.id === 'gate-approaching-triggers-redteam')) {
    eh.rules.push({
      id: 'gate-approaching-triggers-redteam',
      name: 'Gate approaching (<=18mo): stand up red-team on deferred items',
      enabled: false,
      condition: {
        type: 'knowledge-graph',
        // Detection condition; the actual <=18mo windowing is interpreted
        // by the rule action prompt, which compares the dueDate against
        // today before standing up a workflow.
        sparqlQuery:
          'PREFIX kg: <http://example.org/kg/> SELECT ?gate ?dueDate WHERE { ?gate kg:domainType "Gate" . ?gate kg:dueDate ?dueDate } LIMIT 5',
      },
      action: { type: 'prompt', promptId: 'gate-approaching-interrupt' },
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

  // RAG lifecycle prompts — one per event type. Driven by the nine rules
  // above. Keep these self-contained in the seed so a fresh project doesn't
  // depend on workspace defaults.
  if (!pr.prompts.some((p) => p.id === 'rag-auto-index')) {
    pr.prompts.push({
      id: 'rag-auto-index',
      title: 'Auto-index document for RAG',
      content:
        "A new document was added at {{payload.path}}. Index it for semantic search by calling the rag_index_document tool with scope_name='project_{{projectName}}' and document_path='{{payload.path}}'.",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  if (!pr.prompts.some((p) => p.id === 'rag-auto-reindex')) {
    pr.prompts.push({
      id: 'rag-auto-reindex',
      title: 'Re-index changed document for RAG',
      content:
        "A document at {{payload.path}} was modified. Re-index it by calling the rag_reindex_document tool with scope_name='project_{{projectName}}' and document_path='{{payload.path}}'. The tool will remove the previous chunks for this path before indexing fresh, so the vector store stays in sync without accumulating duplicates.",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  if (!pr.prompts.some((p) => p.id === 'rag-auto-delete')) {
    pr.prompts.push({
      id: 'rag-auto-delete',
      title: 'Remove deleted document from RAG',
      content:
        "A document at {{payload.path}} was deleted from the filesystem. Remove its chunks from the index by calling the rag_delete_document tool with scope_name='project_{{projectName}}' and document_path='{{payload.path}}'. Do not re-create the file — the source of truth is the filesystem.",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  if (!pr.prompts.some((p) => p.id === 'assumption-expired-interrupt')) {
    pr.prompts.push({
      id: 'assumption-expired-interrupt',
      title: 'Assumption expired',
      content:
        'An assumption underpinning a fleet commitment has just moved to ageingState=expired. Add it to the current quarterly review packet with full provenance: which decision it underpins, the source document(s) that justify the expired state, and which dependent commitments need to be re-decided. Do not propose a re-decision yourself; convene the conversation for the human. Hard rule: do not silently roll the assumption forward to the next quarter, and do not mark any dependent commitment compliant on the dashboard.',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  if (!pr.prompts.some((p) => p.id === 'gate-approaching-interrupt')) {
    pr.prompts.push({
      id: 'gate-approaching-interrupt',
      title: 'Gate approaching — stand up red-team',
      content:
        'A scheduled fleet gate (dry-dock or special survey) is within 18 months. List the deferred items parked at this gate. For each irreversible decision among them, stand up a red-team workflow: agent A makes the case-for with evidence, the red-team agent makes the case-against attacking each pillar with a specific rebuttal, the human adjudicates on the record. Do not adjudicate yourself. If the prior quarterly packet for this commitment was not actioned, escalate before standing up the red-team — the freeze rule applies first.',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  await writeFile(prPath, JSON.stringify(pr, null, 2), 'utf8');
  ok('event rules + prompts seeded (assumption-expired + gate-approaching + rag-auto-index)');
}

async function step15_registerCuratorCron(ctx: ApiContext): Promise<void> {
  header('15. Register nightly curator cron (the no-silent-default heartbeat)');
  try {
    await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'fleet-commitments-curator',
        name: 'Fleet commitments nightly curator',
        prompt:
          'Run the fleet-commitments curator: (1) re-age every assumption in the knowledge graph based on the latest evidence; (2) score each vessel against the fleet strategy "compliant and charter-ready through 2035"; (3) list every gate within 18 months and the items parked at each; (4) freeze any commitment whose last quarterly packet went un-actioned past its gate. Never re-baseline a projection. Never mark an expired assumption fresh. Append a one-line summary to design-support/curator-log.md.',
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
  await step2b_provisionMcpServers(ctx);
  await step3_writeMission();
  await step4_seedWiki(ctx);
  await step5_seedKG(ctx);
  await step6_seedRag(ctx);
  await step7_seedChats();
  const runId = await step8_enableAndRunDreaming(ctx);
  const dreamPath = await step9_waitForDream(runId);

  await step10_installDesignSupport();
  await step11_seedDesignSupportGraph(ctx);
  await step12_seedHypothesisWorkflows(ctx);
  await step12b_seedScrapbookProjection(ctx);
  await step13_documentationAndUi();
  await step13b_assignApplicationType();
  await step13c_writeQuarterlyPacket();
  await step13d_writeNightlyAlignment();
  await step14_seedEventRules();
  await step15_registerCuratorCron(ctx);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${dreamPath}`);
  console.log(`  docs:     workspace/${PROJECT_NAME}/documentation.md (auto-opens in the UI)`);
  console.log(`  ui:       open the project and explore the quarterly packet + Meridian lifeline`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
