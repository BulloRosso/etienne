/**
 * Seed the `requirements-hv` example project.
 *
 * Worked example for *Agents that help humans decide — Part 3*: turning
 * ~900 pages of German grid-connection requirements (NSÜN's NU-525-Lot-3
 * HVDC converter station bid) into a complete, traceable, German
 * technical specification — by parsing the source pack into atomic EARS
 * requirements, mapping each one to a slot in the deliverable, drafting
 * from the firm's English-language reuse base, and stopping there so an
 * engineer signs every promise.
 *
 * Pipeline:
 *   1.  Authenticate against the OAuth server (:5950).
 *   2.  Create the project via POST /api/projects/create — auto-provisions
 *       every standard skill (wiki, dreaming, …).
 *   2b. Provision MCP servers (kg, workflows, scrapbook) via
 *       POST /api/claude/mcp/config/save.
 *   3.  Write wiki/_meta/mission.md directly.
 *   4.  Write ~18 wiki pages via the provisioned `wiki-add.ts` script.
 *   5.  POST KG entities + relationships (40 EARS requirements, source
 *       volumes, late-clarifications memo, reuse sources, standards,
 *       responsible engineers, customer; override + cascadesTo + type-
 *       test-evidence edges).
 *   6.  Write ~17 RAG documents under documents/ and POST each path to
 *       /api/workspace/<project>/rag/index-document.
 *   7.  Write three JSONL session histories + update chat.sessions.json.
 *   8.  Enable dreaming + POST /run-now.
 *   9.  Wait for workspace/<project>/dreaming/dream-YYYY-MM-DD.dreams.json.
 *   10. Write the coverage dashboard at
 *       out/coverage/current.coverage.json (rendered in the preview pane;
 *       analogous to the long-horizon seed's quarterly packet).
 *   11. Write documentation.md + register it (along with the coverage
 *       dashboard) in .etienne/user-interface.json previewDocuments so
 *       both auto-open.
 *   11b. Assign the `requirements-hv` application type — writes
 *       .etienne/application-type.json so the MinimalisticSidebar's
 *       ApplicationSection renders the 5-item article-aligned menu.
 *   12. Seed three event rules:
 *       - rag-auto-index-documents (enabled — always on)
 *       - late-clarification-amends-requirement (seeded DISABLED — the
 *         2026-04-18 memo is already loaded at seed time, so an always-
 *         on KG rule would re-fire indefinitely; operator enables once
 *         they want the live wire on subsequent memos)
 *       - reuse-mismatch-detected (seeded DISABLED — the Reefnet/Annex-C
 *         mismatch is already present at seed time; same re-fire reason)
 *   13. Register the nightly curator cron — the no-silent-default
 *       heartbeat: walk the coverage matrix, refuse to advance any row
 *       on the agent's authority, freeze the bid if a row's responsible
 *       engineer hasn't acted past their gate.
 *
 * Steps 10-12 from the long-horizon seed (design-support graph + hypothesis
 * workflows + scrapbook projection) are intentionally dropped. Part 3's
 * pattern is document-transformation, not hypothesis-driven design — the
 * coverage dashboard plays the role those steps played in the other seed.
 *
 * Run with:
 *
 *   cd c:\\Data\\GitHub\\claude-multitenant
 *   npx tsx scripts/seed-requirements-hv/seed-requirements-hv.ts
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
import { COVERAGE_DASHBOARD, COVERAGE_DASHBOARD_REL } from './fixtures/coverage-dashboard';
import { DOCUMENTATION_MD, USER_INTERFACE_JSON } from './fixtures/documentation';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  'C:/Data/GitHub/claude-multitenant/workspace';

const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

const NOW = '2026-05-25T09:00:00Z';
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

async function step4_seedWiki(): Promise<{ writtenSlugs: string[]; stubsCreated: number; bucketsTouched: Set<string> }> {
  header('4. Seed wiki pages via provisioned wiki-add.ts');
  const writtenSlugs: string[] = [];
  const bucketsTouched = new Set<string>();
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
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-requirements-hv.ts' }],
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
    bucketsTouched.add(draft.bucket);
    stubsCreated += result.stubsCreated?.length ?? 0;
    info(`${draft.bucket}/${result.slug} (${result.mode})`);
  }
  ok(
    `wiki: ${writtenSlugs.length} pages written + ${stubsCreated} auto-stubs created`,
  );
  return { writtenSlugs, stubsCreated, bucketsTouched };
}

/**
 * Index every newly-written wiki page into RAG so the chat assistant can
 * cite them via `[[wiki:<slug>]]` chips. Step 6 already indexes documents/;
 * this is the analogous pass for wiki/. We pass each page through the same
 * `/rag/index-document` endpoint (the RAG service is content-agnostic — it
 * detects wiki pages by path prefix and extracts slug/title/section into
 * the chunk metadata).
 */
async function step4b_indexWikiForRag(
  ctx: ApiContext,
  bucketsTouched: Set<string>,
): Promise<void> {
  header('4b. Index seeded wiki pages into RAG (so [[wiki:…]] citations resolve)');
  const wikiRoot = join(PROJECT_ROOT, 'wiki');
  let indexed = 0;
  let skipped = 0;
  for (const bucket of bucketsTouched) {
    const dir = join(wikiRoot, bucket);
    let entries: string[] = [];
    try {
      entries = await (await import('node:fs/promises')).readdir(dir, { recursive: true } as any) as unknown as string[];
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (typeof rel !== 'string' || !rel.endsWith('.md')) continue;
      const documentPath = `wiki/${bucket}/${rel.replace(/\\/g, '/')}`;
      try {
        await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/index-document`, {
          method: 'POST',
          body: JSON.stringify({ documentPath }),
        });
        indexed += 1;
      } catch (err) {
        if (err instanceof ApiError) {
          warn(`wiki index failed for ${documentPath}: HTTP ${err.status}`);
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
  }
  ok(`rag: ${indexed} wiki page(s) indexed${skipped ? `, ${skipped} skipped` : ''}`);
}

async function step5_seedKG(ctx: ApiContext): Promise<void> {
  header('5. Seed knowledge graph (EARS requirements, source volumes, reuse sources, standards, engineers)');
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
  ok(`kg: ${relCount} relationships (incl. overrides / cascadesTo / typeTestEvidence / draftedFrom)`);
}

async function step6_seedRag(ctx: ApiContext): Promise<void> {
  header('6. Seed RAG documents (source-volume excerpts, clarifications memo, reuse base, type-tests, handover notes)');
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

async function step10_writeCoverageDashboard(): Promise<void> {
  header('10. Write the coverage dashboard (.coverage.json) — the load-bearing artefact');
  const dir = join(PROJECT_ROOT, 'out', 'coverage');
  await mkdir(dir, { recursive: true });
  const path = join(PROJECT_ROOT, COVERAGE_DASHBOARD_REL);
  await writeFile(path, JSON.stringify(COVERAGE_DASHBOARD, null, 2), 'utf8');
  ok(`coverage dashboard written: ${COVERAGE_DASHBOARD_REL} (${COVERAGE_DASHBOARD.rows.length} rows)`);

  // Sentinel for the compliance-matrix MCP App previewer.
  // The `.compliance.json` extension routes through previewer-metadata.json
  // → mcpGroup 'compliance-matrix' → tool 'render_compliance_matrix'. The
  // file payload is small (the cockpit hits the tool with the project name
  // and reads coverage + wiki team page server-side), but it must exist for
  // the file-tree-driven preview path to open it.
  const complianceDir = join(PROJECT_ROOT, 'out', 'compliance');
  await mkdir(complianceDir, { recursive: true });
  const compliancePath = join(complianceDir, 'current.compliance.json');
  const sentinel = {
    schema: 'compliance-matrix.v1',
    generatedAt: COVERAGE_DASHBOARD.generatedAt,
    project: COVERAGE_DASHBOARD.project,
    coverageRef: COVERAGE_DASHBOARD_REL,
    teamRef: 'wiki/topics/team.md',
  };
  await writeFile(compliancePath, JSON.stringify(sentinel, null, 2), 'utf8');
  ok(`compliance-matrix sentinel written: out/compliance/current.compliance.json`);
}

async function step11_documentationAndUi(): Promise<void> {
  header('11. Write documentation.md + register as auto-open');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');

  const uiPath = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  // Coverage dashboard first (the load-bearing artefact), then docs.
  const previewDefaults = [COVERAGE_DASHBOARD_REL, 'documentation.md'];
  let ui: any = { ...USER_INTERFACE_JSON, previewDocuments: previewDefaults };
  if (existsSync(uiPath)) {
    try {
      const cur = JSON.parse(await readFile(uiPath, 'utf8'));
      const previews: string[] = Array.isArray(cur.previewDocuments) ? cur.previewDocuments : [];
      if (!previews.includes(COVERAGE_DASHBOARD_REL)) previews.unshift(COVERAGE_DASHBOARD_REL);
      if (!previews.includes('documentation.md')) {
        const filtered = previews.filter((p) => p !== 'documentation.md');
        const idx = filtered.indexOf(COVERAGE_DASHBOARD_REL);
        filtered.splice(idx + 1, 0, 'documentation.md');
        ui = { ...cur, previewDocuments: filtered };
      } else {
        ui = { ...cur, previewDocuments: previews };
      }
    } catch {
      ui = { ...USER_INTERFACE_JSON, previewDocuments: previewDefaults };
    }
  }
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  ok(`documentation.md + ${COVERAGE_DASHBOARD_REL} registered in user-interface.json`);
}

async function step11b_assignApplicationType(): Promise<void> {
  header('11b. Assign requirements-hv application type (sidebar menu)');
  // Writes the marker file directly (same pattern as the long-horizon seed):
  // ApplicationTypesService reads this on demand from
  // /api/application-types/effective/<project>.
  const markerPath = join(PROJECT_ROOT, '.etienne', 'application-type.json');
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  await writeFile(markerPath, JSON.stringify({ id: 'requirements-hv' }, null, 2), 'utf8');
  ok('application-type marker written (.etienne/application-type.json)');
}

async function step12_seedEventRules(): Promise<void> {
  header('12. Seed event rules: rag-auto-index + late-clarification-amends + reuse-mismatch');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  const ehPath = join(etienne, 'event-handling.json');
  let eh: { rules: any[] } = { rules: [] };
  if (existsSync(ehPath)) {
    try { eh = JSON.parse(await readFile(ehPath, 'utf8')); } catch { eh = { rules: [] }; }
  }
  if (!Array.isArray(eh.rules)) eh.rules = [];

  // Rule 1: auto-index new documents (always-on).
  if (!eh.rules.some((r) => r.id === 'rag-auto-index-documents')) {
    eh.rules.push({
      id: 'rag-auto-index-documents',
      name: 'Auto-index documents for RAG search',
      enabled: true,
      condition: {
        type: 'simple',
        event: {
          group: 'Filesystem',
          name: 'File Created',
          'payload.path': '*/documents/*',
        },
      },
      action: { type: 'prompt', promptId: 'rag-auto-index' },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // Rule 2: a new late-clarification amends a requirement → surface as override.
  // Seeded DISABLED on purpose. The 2026-04-18 memo is already in the KG with
  // its override edges, so an always-on KG rule would re-fire indefinitely
  // against existing state (same failure mode the long-horizon seed's
  // assumption-expired rule documents). Operator enables once they want the
  // live wire for subsequent memos.
  if (!eh.rules.some((r) => r.id === 'late-clarification-amends-requirement')) {
    eh.rules.push({
      id: 'late-clarification-amends-requirement',
      name: 'Late clarification amends a requirement: surface override chip + add to clarify queue',
      enabled: false,
      condition: {
        type: 'knowledge-graph',
        sparqlQuery:
          'PREFIX kg: <http://example.org/kg/> SELECT ?memo ?req WHERE { ?memo kg:domainType "LateClarification" . ?memo kg:overrides ?req } LIMIT 1',
      },
      action: { type: 'prompt', promptId: 'late-clarification-interrupt' },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // Rule 3: reuse mismatch detected on a cluster head → flag the cascade.
  // Also seeded DISABLED — the Reefnet/Annex-C mismatch is already in the KG.
  if (!eh.rules.some((r) => r.id === 'reuse-mismatch-detected')) {
    eh.rules.push({
      id: 'reuse-mismatch-detected',
      name: 'Reuse mismatch detected: flag the cluster head + cascade dependents',
      enabled: false,
      condition: {
        type: 'knowledge-graph',
        sparqlQuery:
          'PREFIX kg: <http://example.org/kg/> SELECT ?reuse ?req WHERE { ?reuse kg:doesNotMeet ?req } LIMIT 1',
      },
      action: { type: 'prompt', promptId: 'reuse-mismatch-interrupt' },
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

  if (!pr.prompts.some((p) => p.id === 'late-clarification-interrupt')) {
    pr.prompts.push({
      id: 'late-clarification-interrupt',
      title: 'Late clarification amends a requirement',
      content:
        'A new late-clarification memo has been ingested and amends at least one requirement that is already in the coverage matrix. Walk the override edge in the knowledge graph: for each amended requirement, surface the original clause text, the amended text, and the cited reason. Flag the requirement with an *override* chip on the coverage dashboard. If the current draft was pulled from a reuse passage that answered the ORIGINAL clause, additionally flag the row with *override-stale-draft* and ping the responsible engineer. Do NOT silently merge the override into the original clause. Do NOT auto-advance the row\'s state.',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  if (!pr.prompts.some((p) => p.id === 'reuse-mismatch-interrupt')) {
    pr.prompts.push({
      id: 'reuse-mismatch-interrupt',
      title: 'Reuse mismatch detected on a cluster head',
      content:
        'A reuse-source-to-requirement match has been flagged as mismatched (the reuse passage does not meet the requirement). For the cluster head: surface the gap (what the reuse delivered vs. what the requirement requires) and the responsible engineer. For each requirement that `cascadesTo` from the head: flag with a *reuse-mismatch* chip on the coverage dashboard. List the three available paths (re-tune from a different reuse, formally deviate, clarify with the customer). Do NOT recommend one; convene the conversation with the responsible engineer.',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  await writeFile(prPath, JSON.stringify(pr, null, 2), 'utf8');
  ok('event rules + prompts seeded (rag-auto-index + late-clarification-amends + reuse-mismatch)');
}

async function step13_registerCuratorCron(ctx: ApiContext): Promise<void> {
  header('13. Register nightly curator cron (the no-silent-default heartbeat)');
  try {
    await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'requirements-hv-curator',
        name: 'Requirements-HV nightly curator',
        prompt:
          'Run the requirements-hv curator: (1) walk the coverage matrix and surface any row whose responsible engineer has been idle past their gate; (2) re-check every *drafted* row against the late-clarifications memo for newly applicable overrides; (3) re-check every *reuse-mismatch* cluster for newly available reuse sources; (4) refuse to advance any row on the agent\'s authority. Append a one-line summary to design-support/curator-log.md. Never bulk-commit. Never silently merge an override.',
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
  const wikiResult = await step4_seedWiki();
  await step5_seedKG(ctx);
  await step6_seedRag(ctx);
  await step4b_indexWikiForRag(ctx, wikiResult.bucketsTouched);
  await step7_seedChats();
  const runId = await step8_enableAndRunDreaming(ctx);
  const dreamPath = await step9_waitForDream(runId);

  await step10_writeCoverageDashboard();
  await step11_documentationAndUi();
  await step11b_assignApplicationType();
  await step12_seedEventRules();
  await step13_registerCuratorCron(ctx);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${dreamPath}`);
  console.log(`  coverage: workspace/${PROJECT_NAME}/${COVERAGE_DASHBOARD_REL}`);
  console.log(`  docs:     workspace/${PROJECT_NAME}/documentation.md (auto-opens in the UI)`);
  console.log(`  ui:       open the project and click "Open the coverage dashboard" in the left rail`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
