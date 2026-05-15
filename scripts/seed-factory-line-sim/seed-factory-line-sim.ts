/**
 * Seed the `factory-line-sim` example project.
 *
 * Pipeline:
 *   1.  Authenticate (OAuth :5950)
 *   2.  Create project (POST /api/projects/create — auto-provisions skills)
 *   3.  Write .claude/CLAUDE.md + .claude/settings.json
 *   4.  Write the line-quality-insights skill
 *   5.  Write wiki/_meta/mission.md
 *   6.  Seed wiki pages via the provisioned wiki-add.ts
 *   7.  Seed RAG documents
 *   8.  Write production-orders/, status/, quality-reports/ (real .xlsx)
 *   9.  Write linedashboard/ (HTML + JSON + placeholder PNGs)
 *   10. Write decision-graphs/ + persist via /api/decision-support/graphs
 *   11. Write insights/ seed report
 *   12. Write event-simulator/ standalone TS service
 *   13. Write .etienne/ (chat sessions, event-handling, prompts)
 *   14. Add 2 quick-action chips (workspace-level store)
 *   15. Enable dreaming + trigger run-now
 *   16. Wait for the dream artefact
 *
 * Run with:
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-factory-line-sim/seed-factory-line-sim.ts
 */

import { existsSync, cpSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';

import { apiFetch, ApiError, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { addWikiPage } from './lib/wiki-shell';

import { MISSION_BRIEF, MISSION_MD, PROJECT_NAME, TODAY } from './fixtures/mission';
import { WIKI_PAGES } from './fixtures/wiki-pages';
import { RAG_DOCS } from './fixtures/rag-docs';
import { PRODUCTION_ORDERS } from './fixtures/production-orders';
import { STATUS_REPORTS } from './fixtures/status-reports';
import { QUALITY_REPORTS } from './fixtures/quality-reports';
import {
  CATEGORIES_JSON,
  JOBS_JSON,
  MACHINES_JSON,
  KEYWORDS_JSON,
  LINE_DASHBOARD_DAYS,
} from './fixtures/dashboard-data';
import { DECISION_GRAPHS } from './fixtures/decision-graph';
import { ONTOLOGY_ENTITIES, ONTOLOGY_RELATIONSHIPS } from './fixtures/ontology';
import { SESSIONS } from './fixtures/chats';
import {
  CLAUDE_MD,
  SETTINGS_JSON,
  SKILL_MD,
  SEED_INSIGHT_MD,
  SEED_INSIGHT_FILENAME,
  QUICK_ACTION_INSIGHT,
  QUICK_ACTION_DASHBOARD,
  QUICK_ACTION_DOCUMENTATION,
  EVENT_HANDLING_JSON,
  PROMPTS_JSON,
} from './fixtures/skill-and-misc';
import { DOCUMENTATION_MD } from './fixtures/documentation';
import {
  PACKAGE_JSON, TSCONFIG_JSON, ENV_EXAMPLE,
  README_MD as SIM_README,
  SIMULATOR_TS, EVENTS_TS, SCENARIOS_TS, API_CLIENT_TS,
} from './fixtures/event-simulator-files';
import { buildPlaceholderPngs } from './fixtures/placeholder-png';
import { writeXlsx } from './fixtures/xlsx-writer';
import { README_MD as PROJECT_README } from './fixtures/readme';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || join(REPO_ROOT, 'workspace');
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
const ASSETS_ROOT = join(REPO_ROOT, 'scripts', 'seed-factory-line-sim', 'assets');

const NOW = `${TODAY}T08:00:00Z`;
const PROV = {
  sourceSessions: [] as string[],
  sourceEntries: [] as string[],
  createdBy: 'user' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

function header(s: string) { console.log(`\n\x1b[1m▸ ${s}\x1b[0m`); }
function ok(s: string)     { console.log(`  \x1b[32m✓\x1b[0m ${s}`); }
function info(s: string)   { console.log(`  \x1b[2m·\x1b[0m ${s}`); }
function warn(s: string)   { console.log(`  \x1b[33m!\x1b[0m ${s}`); }

// ── steps ──────────────────────────────────────────────────────────────

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
      ctx, '/api/projects/create',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!r.success) throw new Error(`project create returned success=false`);
    ok(`project created: ${PROJECT_NAME}`);
    for (const w of r.warnings ?? []) warn(`warning: ${w}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && err.body.includes('already exists')) {
      info('project entry already present — provisioning standard skills directly');
      const r = await apiFetch<{ success: boolean; message: string }>(
        ctx, `/api/skills/${PROJECT_NAME}/provision-standard`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (!r.success) throw new Error(`provision-standard failed: ${r.message}`);
      ok(r.message);
    } else {
      throw err;
    }
  }

  const wikiAdd = join(PROJECT_ROOT, '.claude', 'skills', 'wiki', 'scripts', 'wiki-add.ts');
  const deadline = Date.now() + 20_000;
  while (!existsSync(wikiAdd) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!existsSync(wikiAdd)) {
    throw new Error(`wiki skill not provisioned after 20s: ${wikiAdd}`);
  }
  ok('wiki skill provisioned (.claude/skills/wiki/)');

  // Borrow wiki skill node_modules from the wiki-test project (same trick
  // as seed-desalination — provision-standard ships sources, not deps).
  const skillDir = join(PROJECT_ROOT, '.claude', 'skills', 'wiki');
  const skillNodeModules = join(skillDir, 'node_modules');
  if (!existsSync(skillNodeModules)) {
    const donor = join(WORKSPACE_ROOT, 'wiki-test', '.claude', 'skills', 'wiki', 'node_modules');
    if (existsSync(donor)) {
      if (platform() === 'win32') {
        cpSync(donor, skillNodeModules, { recursive: true });
      } else {
        symlinkSync(donor, skillNodeModules, 'dir');
      }
      ok(`wiki skill node_modules borrowed from workspace/wiki-test/`);
    } else {
      throw new Error(
        `wiki skill needs node_modules but no donor found at ${donor}. ` +
          `Run: (cd ${skillDir} && npm install) and re-run.`,
      );
    }
  }
}

async function step3_claudeFiles(): Promise<void> {
  header('3. Write .claude/ role + settings');
  const dir = join(PROJECT_ROOT, '.claude');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'CLAUDE.md'), CLAUDE_MD, 'utf8');
  await writeFile(join(dir, 'settings.json'), JSON.stringify(SETTINGS_JSON, null, 2), 'utf8');
  ok('.claude/CLAUDE.md and settings.json written');
}

async function step4_skill(): Promise<void> {
  header('4. Write line-quality-insights skill');
  const dir = join(PROJECT_ROOT, '.claude', 'skills', 'line-quality-insights');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), SKILL_MD, 'utf8');
  ok('.claude/skills/line-quality-insights/SKILL.md written');
}

async function step5_writeMission(): Promise<void> {
  header('5. Write wiki/_meta/mission.md');
  const dir = join(PROJECT_ROOT, 'wiki', '_meta');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mission.md'), MISSION_MD, 'utf8');
  ok('mission.md written');
}

async function step6_seedWiki(): Promise<void> {
  header('6. Seed wiki pages via provisioned wiki-add.ts');
  for (const draft of WIKI_PAGES) {
    const baseInput = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-factory-line-sim.ts' }],
      body: draft.body,
      classification: draft.classification ?? ('private' as const),
      provenance: { ...PROV },
    };
    let result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'create' });
    if (!result.ok && /already exists/.test(result.error ?? '')) {
      result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'update' });
    }
    if (!result.ok) throw new Error(`wiki-add failed for ${draft.slug}: ${result.error ?? 'unknown'}`);
    info(`${draft.bucket}/${result.slug} (${result.mode})`);
  }
  ok(`wiki: ${WIKI_PAGES.length} pages written`);
}

async function step7_seedRag(ctx: ApiContext): Promise<void> {
  header('7. Seed RAG documents');
  const dir = join(PROJECT_ROOT, 'documents');
  await mkdir(dir, { recursive: true });
  let indexed = 0;
  for (const doc of RAG_DOCS) {
    await writeFile(join(dir, doc.filename), doc.body, 'utf8');
    try {
      await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/index-document`, {
        method: 'POST',
        body: JSON.stringify({ documentPath: `documents/${doc.filename}` }),
      });
      indexed++;
    } catch (err) {
      warn(`index failed for ${doc.filename}: ${err instanceof Error ? err.message : err}`);
    }
  }
  ok(`rag: ${indexed}/${RAG_DOCS.length} documents indexed`);
}

async function step8_writeOperationalData(): Promise<void> {
  header('8. Write production-orders/, status/, quality-reports/');

  const ordersDir = join(PROJECT_ROOT, 'production-orders');
  await mkdir(ordersDir, { recursive: true });
  for (const o of PRODUCTION_ORDERS) {
    await writeFile(join(ordersDir, `${o.order_id}.json`), JSON.stringify(o, null, 2), 'utf8');
  }
  ok(`production-orders: ${PRODUCTION_ORDERS.length} files`);

  const statusDir = join(PROJECT_ROOT, 'status');
  await mkdir(statusDir, { recursive: true });
  for (const r of STATUS_REPORTS) {
    await writeFile(
      join(statusDir, `status_${r.machine_id}_${r.date}.json`),
      JSON.stringify(r, null, 2), 'utf8',
    );
  }
  ok(`status: ${STATUS_REPORTS.length} files`);

  const qualityDir = join(PROJECT_ROOT, 'quality-reports');
  await mkdir(qualityDir, { recursive: true });
  for (const file of QUALITY_REPORTS) {
    const headers = [
      'production_order_id', 'part_number', 'machine_id', 'item_id',
      'defect_type', 'defect_severity', 'measurement_value',
      'specification_min', 'specification_max',
      'inspector_id', 'timestamp', 'notes',
    ];
    const rows: Array<Array<string | number | null>> = [headers];
    for (const r of file.rows) {
      rows.push([
        r.production_order_id, r.part_number, r.machine_id, r.item_id,
        r.defect_type, r.defect_severity,
        r.measurement_value, r.specification_min, r.specification_max,
        r.inspector_id, r.timestamp, r.notes,
      ]);
    }
    const buf = await writeXlsx(rows);
    await writeFile(join(qualityDir, file.filename), buf);
    info(`${file.filename} (${file.rows.length} rows)`);
  }
  ok(`quality-reports: ${QUALITY_REPORTS.length} xlsx files`);
}

async function step9_writeDashboards(): Promise<void> {
  header('9. Write linedashboard/ (HTML + JSON + placeholder PNGs)');
  const dir = join(PROJECT_ROOT, 'linedashboard');
  await mkdir(dir, { recursive: true });

  // HTMLs from the assets/ folder.
  for (const name of ['cnc-dashboard.html', 'line-timeline.html']) {
    const src = await readFile(join(ASSETS_ROOT, name), 'utf8');
    await writeFile(join(dir, name), src, 'utf8');
  }
  // Cross-cutting dashboard JSONs.
  await writeFile(join(dir, 'categories.json'), JSON.stringify(CATEGORIES_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'jobs.json'), JSON.stringify(JOBS_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'machines.json'), JSON.stringify(MACHINES_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'keywords.json'), JSON.stringify(KEYWORDS_JSON, null, 2), 'utf8');
  // Per-day timeline JSONs.
  for (const day of LINE_DASHBOARD_DAYS) {
    await writeFile(
      join(dir, `machines_line_${day.date}.linedashboard.json`),
      JSON.stringify(day, null, 2), 'utf8',
    );
  }
  // Index of available days for the line-timeline HTML.
  await writeFile(
    join(dir, 'line-timeline-index.json'),
    JSON.stringify({ days: LINE_DASHBOARD_DAYS.map((d) => d.date) }, null, 2),
    'utf8',
  );
  // Machine images. Prefer real PNGs from scripts/seed-factory-line-sim/assets/images/
  // when present; fall back to the generated placeholders otherwise. Per-file
  // fallback so the user can supply 1 of 3 real images and still get
  // placeholders for the rest.
  const imagesDir = join(dir, 'images');
  await mkdir(imagesDir, { recursive: true });
  const assetImagesDir = join(ASSETS_ROOT, 'images');
  let realCount = 0;
  let placeholderCount = 0;
  for (const png of buildPlaceholderPngs()) {
    const realSrc = join(assetImagesDir, png.filename);
    if (existsSync(realSrc)) {
      await writeFile(join(imagesDir, png.filename), await readFile(realSrc));
      realCount++;
    } else {
      await writeFile(join(imagesDir, png.filename), png.buffer);
      placeholderCount++;
    }
  }
  ok(`linedashboard: 2 HTMLs + ${4 + LINE_DASHBOARD_DAYS.length + 1} JSONs + ${realCount} real + ${placeholderCount} placeholder PNGs`);
}

async function step9b_bootstrapOntology(ctx: ApiContext): Promise<void> {
  header('9b. Bootstrap ontology entities + relationships');
  // Must run BEFORE the decision graphs are persisted, so the graphs'
  // targetEntityId fields resolve to real entities (no "Missing
  // Entities" in the Decision Support Studio).
  try {
    const r = await apiFetch<{ success: boolean; entitiesCreated: number; relationshipsCreated: number }>(
      ctx,
      `/api/decision-support/ontology-bootstrap/${PROJECT_NAME}`,
      {
        method: 'POST',
        body: JSON.stringify({
          entities: ONTOLOGY_ENTITIES,
          relationships: ONTOLOGY_RELATIONSHIPS,
        }),
      },
    );
    ok(`ontology bootstrapped: ${r.entitiesCreated} entities, ${r.relationshipsCreated} relationships`);
  } catch (err) {
    warn(`ontology-bootstrap failed (${err instanceof Error ? err.message : err}); decision graphs may show "missing entities"`);
  }
}

async function step10_decisionGraphs(ctx: ApiContext): Promise<void> {
  header(`10. Write + persist ${DECISION_GRAPHS.length} decision graphs`);
  const dir = join(PROJECT_ROOT, 'decision-graphs');
  await mkdir(dir, { recursive: true });

  let persisted = 0;
  for (const graph of DECISION_GRAPHS) {
    // File on disk is the source of truth (survives backend restarts).
    await writeFile(
      join(dir, `${graph.id}.json`),
      JSON.stringify(graph, null, 2), 'utf8',
    );
    // Persist via API so the Decision Support Studio shows it immediately.
    try {
      await apiFetch(ctx, `/api/decision-support/graphs`, {
        method: 'POST',
        body: JSON.stringify({ project: PROJECT_NAME, graph }),
      });
      persisted++;
      info(`persisted ${graph.id}`);
    } catch (err) {
      warn(`could not persist ${graph.id} via API (${err instanceof Error ? err.message : err}). File on disk.`);
    }
  }
  ok(`decision graphs: ${DECISION_GRAPHS.length} written, ${persisted} persisted via API`);
}

async function step11_writeInsight(): Promise<void> {
  header('11. Write seed insights/ report');
  const dir = join(PROJECT_ROOT, 'insights');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, SEED_INSIGHT_FILENAME), SEED_INSIGHT_MD, 'utf8');
  ok(`insights/${SEED_INSIGHT_FILENAME}`);
}

/**
 * Write documentation.md to the project root and register it as an
 * auto-open document in .etienne/user-interface.json. The frontend
 * reads `previewDocuments` on project open and auto-opens each entry
 * in the preview pane.
 */
async function step11b_documentation(): Promise<void> {
  header('11b. Write documentation.md + register as auto-open');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');

  const uiPath = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  let ui: any = {
    appBar: { title: 'Line 3 / MCH Werk D', fontColor: 'white', backgroundColor: '#1976d2' },
    welcomePage: { message: '', backgroundColor: '#f5f5f5', quickActions: [], showWelcomeMessage: true },
    previewDocuments: [],
    autoFilePreviewExtensions: [],
  };
  if (existsSync(uiPath)) {
    try { ui = JSON.parse(await readFile(uiPath, 'utf8')); } catch { /* keep default */ }
  }
  const previews: string[] = Array.isArray(ui.previewDocuments) ? ui.previewDocuments : [];
  if (!previews.includes('documentation.md')) previews.push('documentation.md');
  ui.previewDocuments = previews;
  await mkdir(join(PROJECT_ROOT, '.etienne'), { recursive: true });
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  ok('documentation.md written + registered in user-interface.json');
}

async function step12_writeEventSimulator(): Promise<void> {
  header('12. Write event-simulator/ standalone TS service');
  const dir = join(PROJECT_ROOT, 'event-simulator');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'package.json'), PACKAGE_JSON, 'utf8');
  await writeFile(join(dir, 'tsconfig.json'), TSCONFIG_JSON, 'utf8');
  await writeFile(join(dir, '.env.example'), ENV_EXAMPLE, 'utf8');
  await writeFile(join(dir, 'README.md'), SIM_README, 'utf8');
  await writeFile(join(dir, 'src', 'simulator.ts'), SIMULATOR_TS, 'utf8');
  await writeFile(join(dir, 'src', 'events.ts'), EVENTS_TS, 'utf8');
  await writeFile(join(dir, 'src', 'scenarios.ts'), SCENARIOS_TS, 'utf8');
  await writeFile(join(dir, 'src', 'api-client.ts'), API_CLIENT_TS, 'utf8');
  ok('event-simulator/ written (run `npm install && npm start` inside)');
}

async function step13_seedChats(): Promise<void> {
  header('13. Seed chat sessions, event-handling, prompts');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  let totalTurns = 0;
  for (const session of SESSIONS) {
    const path = join(etienne, `chat.history-${session.sessionId}.jsonl`);
    const lines = session.turns.map((t) => JSON.stringify(t)).join('\n') + '\n';
    await writeFile(path, lines, 'utf8');
    totalTurns += session.turns.length;
  }
  const sessionsPath = join(etienne, 'chat.sessions.json');
  let existing: { sessions?: Array<any> } = {};
  if (existsSync(sessionsPath)) {
    try { existing = JSON.parse(await readFile(sessionsPath, 'utf8')); } catch { /* empty */ }
  }
  const seeded = SESSIONS.map((s) => ({ timestamp: s.timestamp, sessionId: s.sessionId, summary: s.summary }));
  await writeFile(
    sessionsPath,
    JSON.stringify({ sessions: [...(existing.sessions ?? []), ...seeded] }, null, 2),
    'utf8',
  );
  await writeFile(join(etienne, 'event-handling.json'), JSON.stringify(EVENT_HANDLING_JSON, null, 2), 'utf8');
  await writeFile(join(etienne, 'prompts.json'), JSON.stringify(PROMPTS_JSON, null, 2), 'utf8');
  ok(`.etienne: ${SESSIONS.length} sessions (${totalTurns} turns) + event-handling + prompts`);
}

async function step14_quickActions(ctx: ApiContext): Promise<void> {
  header('14. Add 3 quick-action chips (workspace store)');
  const current = await apiFetch<{ actions: any[] }>(ctx, '/api/quick-actions');
  const ourIds = new Set([
    QUICK_ACTION_INSIGHT.id,
    QUICK_ACTION_DASHBOARD.id,
    QUICK_ACTION_DOCUMENTATION.id,
  ]);
  const filtered = (current.actions ?? []).filter(
    (a: any) => !(a.project === 'factory-line-sim' && ourIds.has(a.id)),
  );
  const merged = [...filtered, QUICK_ACTION_DOCUMENTATION, QUICK_ACTION_DASHBOARD, QUICK_ACTION_INSIGHT];
  await apiFetch(ctx, '/api/quick-actions', {
    method: 'POST',
    body: JSON.stringify({ actions: merged }),
  });
  ok(`quick-actions: ${merged.length} total (added "${QUICK_ACTION_DOCUMENTATION.title}" + "${QUICK_ACTION_DASHBOARD.title}" + "${QUICK_ACTION_INSIGHT.title}")`);
}

async function step15_writeReadme(): Promise<void> {
  header('15. Write project README.md');
  await writeFile(join(PROJECT_ROOT, 'README.md'), PROJECT_README, 'utf8');
  ok('README.md written');
}

async function step16_dreamingRun(ctx: ApiContext): Promise<{ runId: string } | null> {
  header('16. Enable dreaming + trigger run-now');
  try {
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
    const r = await apiFetch<{ runId: string; enqueued: boolean; reason?: string }>(
      ctx, `/api/dreaming/${PROJECT_NAME}/run-now`, { method: 'POST' },
    );
    if (!r.enqueued) {
      warn(`dreaming run-now refused: ${r.reason ?? 'unknown'} — skipping wait`);
      return null;
    }
    ok(`dreaming run enqueued: ${r.runId}`);
    return { runId: r.runId };
  } catch (err) {
    warn(`could not enable dreaming (${err instanceof Error ? err.message : err}) — skipping`);
    return null;
  }
}

async function step17_waitForDream(runId: string): Promise<string | null> {
  header('17. Wait for dream artefact (up to 5 min)');
  const dreamingDir = join(PROJECT_ROOT, 'dreaming');
  const today = new Date().toISOString().slice(0, 10);
  const expected = join(dreamingDir, `dream-${today}.dreams.json`);
  info(`expected: workspace/${PROJECT_NAME}/dreaming/dream-${today}.dreams.json`);

  const deadline = Date.now() + 5 * 60 * 1000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(expected)) {
      const s = await stat(expected);
      if (s.size === lastSize && s.size > 0) break;
      lastSize = s.size;
    }
    await new Promise((r) => setTimeout(r, 5_000));
    process.stdout.write('  · waiting…\r');
  }
  console.log('');
  if (!existsSync(expected)) {
    warn(`dream file not produced within 5 min for runId=${runId}. The seed is otherwise complete.`);
    return null;
  }
  const raw = await readFile(expected, 'utf8');
  let parsed: { items?: unknown[] } = {};
  try { parsed = JSON.parse(raw); } catch { /* surfaced below */ }
  const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
  ok(`dream file produced (${itemCount} items, ${raw.length} bytes)`);
  return expected;
}

// ── entry ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\x1b[1mSeeding ${PROJECT_NAME}\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);
  console.log(`anchor TODAY: ${TODAY}`);

  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step3_claudeFiles();
  await step4_skill();
  await step5_writeMission();
  await step6_seedWiki();
  await step7_seedRag(ctx);
  await step8_writeOperationalData();
  await step9_writeDashboards();
  await step9b_bootstrapOntology(ctx);
  await step10_decisionGraphs(ctx);
  await step11_writeInsight();
  await step11b_documentation();
  await step12_writeEventSimulator();
  await step13_seedChats();
  await step14_quickActions(ctx);
  await step15_writeReadme();
  const dream = await step16_dreamingRun(ctx);
  if (dream) await step17_waitForDream(dream.runId);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${PROJECT_ROOT}`);
  console.log(`  dashboard: open linedashboard/cnc-dashboard.html in the IDE`);
  console.log(`  timeline:  open linedashboard/line-timeline.html`);
  console.log(`  simulator: cd workspace/${PROJECT_NAME}/event-simulator && npm install && npm start`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
