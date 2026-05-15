/**
 * Incremental updater for the existing factory-line-sim project.
 *
 * Use this when you've changed fixtures and want the workspace project
 * refreshed WITHOUT a full re-seed (which requires deleting the project
 * directory — tricky when the backend has Quadstore / dreaming-queue
 * locks open).
 *
 * Re-runs the upsert-friendly steps:
 *   - 8.  production-orders/, status/, quality-reports/  (file overwrite)
 *   - 9.  linedashboard/  (file overwrite)
 *   - 9b. ontology-bootstrap (idempotent: re-add entities + relationships)
 *   - 10. decision-graphs/ (idempotent: re-save replaces by id)
 *   - 11. insights/<seed>.md  (file overwrite)
 *   - 14. quick-actions  (idempotent: filter-and-merge by id+project)
 *
 * Skips: project create, wiki seeding (would create duplicate stubs),
 * RAG indexing (idempotent on the backend but slow), chat seeding,
 * dreaming run.
 *
 * Run with:
 *   cd c:/Data/GitHub/claude-multitenant
 *   npx tsx scripts/seed-factory-line-sim/update-factory-line-sim.ts
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpSync, symlinkSync } from 'node:fs';
import { platform } from 'node:os';

import { apiFetch, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { addWikiPage } from './lib/wiki-shell';

import { PROJECT_NAME, TODAY, MISSION_MD } from './fixtures/mission';
import { WIKI_PAGES } from './fixtures/wiki-pages';
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
import {
  SEED_INSIGHT_MD,
  SEED_INSIGHT_FILENAME,
  QUICK_ACTION_INSIGHT,
  QUICK_ACTION_DASHBOARD,
  QUICK_ACTION_DOCUMENTATION,
} from './fixtures/skill-and-misc';
import { DOCUMENTATION_MD } from './fixtures/documentation';
import { writeXlsx } from './fixtures/xlsx-writer';
import { existsSync } from 'node:fs';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || join(REPO_ROOT, 'workspace');
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
const ASSETS_ROOT = join(REPO_ROOT, 'scripts', 'seed-factory-line-sim', 'assets');

function header(s: string) { console.log(`\n\x1b[1m▸ ${s}\x1b[0m`); }
function ok(s: string)     { console.log(`  \x1b[32m✓\x1b[0m ${s}`); }
function info(s: string)   { console.log(`  \x1b[2m·\x1b[0m ${s}`); }
function warn(s: string)   { console.log(`  \x1b[33m!\x1b[0m ${s}`); }

async function step1_authenticate(): Promise<ApiContext> {
  header('1. Authenticate');
  const auth = await login();
  ok(`authenticated as ${auth.user.username}`);
  return { accessToken: auth.accessToken };
}

const NOW = `${TODAY}T08:00:00Z`;
const PROV = {
  sourceSessions: [] as string[],
  sourceEntries: [] as string[],
  createdBy: 'user' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

/** Re-seeds the wiki ONLY when wiki/_meta/mission.md is missing — so this
 *  is idempotent on a healthy project and self-healing on a wiped one. */
async function step5and6_restoreWikiIfMissing(ctx: ApiContext): Promise<void> {
  const missionPath = join(PROJECT_ROOT, 'wiki', '_meta', 'mission.md');
  if (existsSync(missionPath)) {
    info('wiki already present — skipping restore');
    return;
  }
  header('5+6. Wiki missing — restoring (mission + 22 pages)');

  // The wiki-add subprocess needs the wiki skill provisioned with
  // node_modules. If they're absent, borrow from the wiki-test project
  // (same trick the seed script uses).
  const skillDir = join(PROJECT_ROOT, '.claude', 'skills', 'wiki');
  const skillNodeModules = join(skillDir, 'node_modules');
  const wikiAdd = join(skillDir, 'scripts', 'wiki-add.ts');
  if (!existsSync(wikiAdd)) {
    // Skill itself missing — re-provision via the backend.
    info('wiki skill not provisioned; calling provision-standard');
    await apiFetch(ctx, `/api/skills/${PROJECT_NAME}/provision-standard`, {
      method: 'POST', body: JSON.stringify({}),
    });
    // Wait briefly for the skill files to land.
    const deadline = Date.now() + 10_000;
    while (!existsSync(wikiAdd) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!existsSync(wikiAdd)) {
      throw new Error(`wiki-add.ts still missing after provisioning: ${wikiAdd}`);
    }
  }
  if (!existsSync(skillNodeModules)) {
    const donor = join(WORKSPACE_ROOT, 'wiki-test', '.claude', 'skills', 'wiki', 'node_modules');
    if (existsSync(donor)) {
      if (platform() === 'win32') cpSync(donor, skillNodeModules, { recursive: true });
      else symlinkSync(donor, skillNodeModules, 'dir');
      info('borrowed wiki skill node_modules from wiki-test');
    } else {
      throw new Error(`wiki skill needs node_modules but no donor at ${donor}`);
    }
  }

  // Mission first (the wiki skill assumes it exists).
  await mkdir(join(PROJECT_ROOT, 'wiki', '_meta'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, 'wiki', '_meta', 'mission.md'), MISSION_MD, 'utf8');
  ok('mission.md written');

  // Topics + sources via the provisioned wiki-add.ts (handles backlinks
  // and auto-stubs).
  for (const draft of WIKI_PAGES) {
    const baseInput = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'restored by update-factory-line-sim.ts' }],
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
  ok(`wiki: ${WIKI_PAGES.length} pages restored`);
}

async function step8_writeOperationalData(): Promise<void> {
  header('8. Refresh production-orders/, status/, quality-reports/');

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
  header('9. Refresh linedashboard/');
  const dir = join(PROJECT_ROOT, 'linedashboard');
  await mkdir(dir, { recursive: true });

  for (const name of ['cnc-dashboard.html', 'line-timeline.html']) {
    const src = await readFile(join(ASSETS_ROOT, name), 'utf8');
    await writeFile(join(dir, name), src, 'utf8');
  }
  await writeFile(join(dir, 'categories.json'), JSON.stringify(CATEGORIES_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'jobs.json'), JSON.stringify(JOBS_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'machines.json'), JSON.stringify(MACHINES_JSON, null, 2), 'utf8');
  await writeFile(join(dir, 'keywords.json'), JSON.stringify(KEYWORDS_JSON, null, 2), 'utf8');
  for (const day of LINE_DASHBOARD_DAYS) {
    await writeFile(
      join(dir, `machines_line_${day.date}.linedashboard.json`),
      JSON.stringify(day, null, 2), 'utf8',
    );
  }
  await writeFile(
    join(dir, 'line-timeline-index.json'),
    JSON.stringify({ days: LINE_DASHBOARD_DAYS.map((d) => d.date) }, null, 2),
    'utf8',
  );
  // Images: only copy if real ones exist in assets/images/ — never
  // overwrite existing files (the user may have uploaded customs).
  const imagesDir = join(dir, 'images');
  await mkdir(imagesDir, { recursive: true });
  let copied = 0;
  for (const filename of ['cnc-5ax.png', 'deburr-hand.png', 'qa-insp.png']) {
    const src = join(ASSETS_ROOT, 'images', filename);
    if (existsSync(src)) {
      await writeFile(join(imagesDir, filename), await readFile(src));
      copied++;
    }
  }
  ok(`linedashboard: 2 HTMLs + JSONs + ${copied} machine images`);
}

async function step9b_bootstrapOntology(ctx: ApiContext): Promise<void> {
  header('9b. Bootstrap ontology (idempotent)');
  try {
    const r = await apiFetch<{ success: boolean; entitiesCreated: number; relationshipsCreated: number }>(
      ctx,
      `/api/decision-support/ontology-bootstrap/${PROJECT_NAME}`,
      { method: 'POST', body: JSON.stringify({ entities: ONTOLOGY_ENTITIES, relationships: ONTOLOGY_RELATIONSHIPS }) },
    );
    ok(`ontology: ${r.entitiesCreated} entities, ${r.relationshipsCreated} relationships`);
  } catch (err) {
    warn(`ontology-bootstrap failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function step10_decisionGraphs(ctx: ApiContext): Promise<void> {
  header(`10. Refresh ${DECISION_GRAPHS.length} decision graphs`);
  const dir = join(PROJECT_ROOT, 'decision-graphs');
  await mkdir(dir, { recursive: true });

  let persisted = 0;
  for (const graph of DECISION_GRAPHS) {
    await writeFile(join(dir, `${graph.id}.json`), JSON.stringify(graph, null, 2), 'utf8');
    try {
      await apiFetch(ctx, `/api/decision-support/graphs`, {
        method: 'POST',
        body: JSON.stringify({ project: PROJECT_NAME, graph }),
      });
      persisted++;
      info(`persisted ${graph.id}`);
    } catch (err) {
      warn(`could not persist ${graph.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  ok(`decision graphs: ${DECISION_GRAPHS.length} written, ${persisted} persisted`);
}

async function step11_writeInsight(): Promise<void> {
  header('11. Refresh seed insights report');
  const dir = join(PROJECT_ROOT, 'insights');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, SEED_INSIGHT_FILENAME), SEED_INSIGHT_MD, 'utf8');
  ok(`insights/${SEED_INSIGHT_FILENAME}`);
}

async function step11b_documentation(): Promise<void> {
  header('11b. Refresh documentation.md + register as auto-open');
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
  ok('documentation.md + auto-open registered');
}

async function step14_quickActions(ctx: ApiContext): Promise<void> {
  header('14. Refresh quick-action chips');
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
  await apiFetch(ctx, '/api/quick-actions', { method: 'POST', body: JSON.stringify({ actions: merged }) });
  ok(`quick-actions: ${merged.length} total`);
}

async function main(): Promise<void> {
  console.log(`\x1b[1mUpdating ${PROJECT_NAME} (incremental)\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);
  console.log(`anchor TODAY: ${TODAY}`);

  if (!existsSync(PROJECT_ROOT)) {
    console.error(`\n\x1b[31m✗ Project directory not found: ${PROJECT_ROOT}\x1b[0m`);
    console.error('  Run scripts/seed-factory-line-sim/seed-factory-line-sim.ts first.');
    process.exit(1);
  }

  const ctx = await step1_authenticate();
  await step5and6_restoreWikiIfMissing(ctx);
  await step8_writeOperationalData();
  await step9_writeDashboards();
  await step9b_bootstrapOntology(ctx);
  await step10_decisionGraphs(ctx);
  await step11_writeInsight();
  await step11b_documentation();
  await step14_quickActions(ctx);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${PROJECT_ROOT}`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
