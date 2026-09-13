/**
 * Seed the `tendertrace-analysis` example project — the TenderTrace
 * tender-analysis showcase (domain: Lagerlogistik).
 *
 * Unlike the earlier story seed, this one does not replay history. It
 * creates a project with the folder contract of the Analyse-Cockpit and
 * drops synthetic customer documents in:
 *
 *   tender/01-leistungsbeschreibung-lagerlogistik.docx
 *   tender/02-vertragsbedingungen.docx
 *   tender/Mengengeruest.xlsx            ← raw figures, two deliberate contradictions
 *   servicecatalog/leistungskatalog.md    ← OUR vocabulary
 *   servicecatalog/glossary.md            ← customer term → our term
 *   analysis-template/management-analyse.md
 *
 * Then (optionally, SEED_RUN_ANALYSIS=1) it starts phase A of the analysis
 * through the product's own MCP tool and waits until the run reaches
 * "awaiting review" — the state a demo starts from.
 *
 * Run:
 *   npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
 *
 * Dry run (no network; validates fixture integrity and renders the DOCX/XLSX
 * into a temp folder):
 *   SEED_DRY_RUN=1 npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apiFetch, ApiError, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { McpClient } from './lib/mcp-client';
import { renderDocx } from './lib/docx-writer';
import { renderWorkbook } from './lib/xlsx-writer';

import { CLAUDE_MD, MISSION_BRIEF, PROJECT_NAME, TENDER_KEY, TENDER_TITLE } from './fixtures/mission';
import { TENDER_DOCS, TENDER_FIGURES_IN_TEXT } from './fixtures/tender-files';
import { EXPECTED_CONTRADICTIONS, WORKBOOK_FILE_NAME, WORKBOOK_SHEETS } from './fixtures/tender-xlsx';
import { CATALOG_FILE_NAME, CATALOG_MD, GLOSSARY_FILE_NAME, GLOSSARY_MD } from './fixtures/servicecatalog';
import { TEMPLATE_FILE_NAME, TEMPLATE_MD } from './fixtures/analysis-template';
import { DOCUMENTATION_MD, USER_INTERFACE_JSON } from './fixtures/documentation';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:6060';
const MCP_URL = `${BACKEND_BASE}/mcp/requirements-tracking`;
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
const DRY_RUN = process.env.SEED_DRY_RUN === '1';
const RUN_ANALYSIS = process.env.SEED_RUN_ANALYSIS === '1' || process.env.SEED_RUN_ANALYSIS === 'true';
const ANALYSIS_TIMEOUT_MS = Number(process.env.SEED_ANALYSIS_TIMEOUT_MS || 20 * 60 * 1000);

const PAGES = [
  'analysis',
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

// ─── fixture integrity (also the SEED_DRY_RUN=1 payload) ───────────────────

async function validateFixtures(): Promise<void> {
  header('0. Validate fixtures');
  const errors: string[] = [];

  // every figure listed for the text really is in a DOCX body (verbatim)
  const allText = TENDER_DOCS.map((doc) => doc.body).join('\n');
  for (const figure of TENDER_FIGURES_IN_TEXT) {
    if (!allText.includes(figure)) errors.push(`figure "${figure}" not found in the tender documents`);
  }
  // the workbook holds every headline figure except the one deliberate contradiction
  const cellValues = new Set<number>();
  for (const sheet of WORKBOOK_SHEETS) {
    for (const row of sheet.rows) for (const value of row) if (typeof value === 'number') cellValues.add(value);
  }
  // figures that must match the text verbatim (the deliberate contradictions
  // are asserted separately below and are intentionally absent here)
  for (const expected of [18500, 1200, 2300, 3800, 9500, 99.5, 15, 0.3, 48, 1450000, 62, 3, 250000, 5000000, 2]) {
    if (!cellValues.has(expected)) errors.push(`workbook is missing the figure ${expected}`);
  }
  for (const expected of EXPECTED_CONTRADICTIONS) {
    const sheet = WORKBOOK_SHEETS.find((entry) => entry.name === expected.sheet);
    const row = sheet?.rows.find((entry) => String(entry[0]).startsWith(expected.label.slice(0, 22)));
    if (!row) {
      errors.push(`contradiction row "${expected.label}" not found on sheet ${expected.sheet}`);
      continue;
    }
    if (row[1] !== expected.excelValue) {
      errors.push(`${expected.sheet}!${expected.cell} must hold ${expected.excelValue}, found ${row[1]}`);
    }
    if (row[1] === expected.tenderValue) {
      errors.push(`${expected.sheet}!${expected.cell} must differ from the tender value ${expected.tenderValue}`);
    }
  }
  // catalog + glossary + template shape
  const entries = CATALOG_MD.split('\n').filter((line) => line.startsWith('## ')).length;
  if (entries < 6) errors.push(`catalog has only ${entries} entries (need ≥ 6)`);
  if (!CATALOG_MD.includes('Nicht Bestandteil: Lagerung von Gefahrgut')) errors.push('catalog must exclude Gefahrgut');
  const glossaryRows = GLOSSARY_MD.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Kundenbegriff') && !line.startsWith('|---')).length;
  if (glossaryRows < 5) errors.push(`glossary has only ${glossaryRows} rows`);
  for (const heading of ['## Management Summary', '## Kennzahlen', '## Klärungsbedarf beim Kunden', '## Interne offene Punkte']) {
    if (!TEMPLATE_MD.includes(heading)) errors.push(`template is missing "${heading}"`);
  }
  for (const token of ['{{block:kpis}}', '{{block:clarifications}}']) {
    if (!TEMPLATE_MD.includes(token)) errors.push(`template is missing ${token}`);
  }

  // the writers render non-empty files
  const dir = await mkdtemp(join(tmpdir(), 'tendertrace-seed-'));
  for (const doc of TENDER_DOCS) {
    const target = join(dir, doc.fileName);
    await writeFile(target, await renderDocx(doc.title, doc.body));
    const size = (await stat(target)).size;
    if (size < 2000) errors.push(`${doc.fileName} rendered suspiciously small (${size} bytes)`);
  }
  const workbookPath = join(dir, WORKBOOK_FILE_NAME);
  await writeFile(workbookPath, await renderWorkbook(WORKBOOK_SHEETS));
  if ((await stat(workbookPath)).size < 2000) errors.push('workbook rendered suspiciously small');

  if (errors.length > 0) {
    for (const error of errors) console.error(`  \x1b[31m✗\x1b[0m ${error}`);
    throw new Error(`fixture validation failed with ${errors.length} error(s)`);
  }
  ok(
    `${TENDER_DOCS.length} tender documents, workbook with ${WORKBOOK_SHEETS.length} sheets, ${entries} catalog entries, ` +
      `${glossaryRows} glossary rows, template OK — rendered to ${dir}`,
  );
  for (const expected of EXPECTED_CONTRADICTIONS) {
    ok(
      `expected contradiction: ${expected.label} ${expected.tenderValue} ${expected.unit} (Text) vs ` +
        `${expected.excelValue} ${expected.unit} (${expected.sheet}!${expected.cell})`,
    );
  }
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
    const r = await apiFetch<{ success: boolean; warnings?: string[] }>(ctx, '/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ projectName: PROJECT_NAME, missionBrief: MISSION_BRIEF, language: 'de' }),
    });
    if (!r.success) throw new Error('project create returned success=false');
    ok(`project created: ${PROJECT_NAME}`);
    for (const w of r.warnings ?? []) warn(`warning: ${w}`);
  } catch (err) {
    if (err instanceof ApiError) {
      warn(`project create → HTTP ${err.status}; trying provision-standard fallback`);
      try {
        await apiFetch(ctx, `/api/skills/${PROJECT_NAME}/provision-standard`, { method: 'POST', body: JSON.stringify({}) });
        ok('standard skills provisioned via fallback');
      } catch (fallbackErr) {
        warn(`provision-standard fallback also failed (${fallbackErr instanceof ApiError ? `HTTP ${fallbackErr.status}` : fallbackErr}) — continuing`);
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
      description: 'TenderTrace requirements tracking + tender analysis',
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
  await writeFile(join(missionDir, 'mission.md'), `# Mission — ${PROJECT_NAME}\n\n${MISSION_BRIEF}\n`, 'utf8');
  ok('.claude/CLAUDE.md + wiki/_meta/mission.md written');
}

async function step4_writeFixtures(): Promise<void> {
  header('4. Write tender/, servicecatalog/, analysis-template/, out/analysis/');
  const tenderDir = join(PROJECT_ROOT, 'tender');
  const catalogDir = join(PROJECT_ROOT, 'servicecatalog');
  const templateDir = join(PROJECT_ROOT, 'analysis-template');
  const outDir = join(PROJECT_ROOT, 'out', 'analysis');
  for (const dir of [tenderDir, catalogDir, templateDir, outDir]) await mkdir(dir, { recursive: true });

  for (const doc of TENDER_DOCS) {
    await writeFile(join(tenderDir, doc.fileName), await renderDocx(doc.title, doc.body));
    ok(`tender/${doc.fileName}`);
  }
  await writeFile(join(tenderDir, WORKBOOK_FILE_NAME), await renderWorkbook(WORKBOOK_SHEETS));
  ok(`tender/${WORKBOOK_FILE_NAME} (${WORKBOOK_SHEETS.map((s) => s.name).join(', ')})`);
  await writeFile(join(catalogDir, CATALOG_FILE_NAME), CATALOG_MD, 'utf8');
  await writeFile(join(catalogDir, GLOSSARY_FILE_NAME), GLOSSARY_MD, 'utf8');
  ok(`servicecatalog/${CATALOG_FILE_NAME} + ${GLOSSARY_FILE_NAME}`);
  await writeFile(join(templateDir, TEMPLATE_FILE_NAME), TEMPLATE_MD, 'utf8');
  ok(`analysis-template/${TEMPLATE_FILE_NAME}`);
  await writeFile(join(outDir, '.gitkeep'), '', 'utf8');
}

async function step5_initTender(rt: RtCall): Promise<void> {
  header('5. rt_init_tender');
  await rt('rt_init_tender', { key: TENDER_KEY, title: TENDER_TITLE, phase: 'bid', language: 'de' });
  ok(`tender ${TENDER_KEY} initialized (phase: bid, language: de)`);
}

async function step6_pageSentinels(): Promise<void> {
  header(`6. Write the ${PAGES.length} page sentinels (out/tendertrace/pages/)`);
  const dir = join(PROJECT_ROOT, 'out', 'tendertrace', 'pages');
  await mkdir(dir, { recursive: true });
  for (const page of PAGES) {
    await writeFile(join(dir, `${page}.tendertrace.json`), JSON.stringify({ schema: 'tendertrace.v1', page }, null, 2), 'utf8');
  }
  ok(`sentinels written: ${PAGES.join(', ')}`);
}

async function step7_documentationAndUi(): Promise<void> {
  header('7. Write documentation.md + .etienne/user-interface.json + application type');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });
  await writeFile(join(etienne, 'user-interface.json'), JSON.stringify(USER_INTERFACE_JSON, null, 2), 'utf8');
  await writeFile(join(etienne, 'application-type.json'), JSON.stringify({ id: 'requirements-tracking' }, null, 2), 'utf8');
  ok('documentation.md + user-interface.json + application-type.json (requirements-tracking) written');
}

async function step8_runAnalysis(rt: RtCall): Promise<void> {
  header('8. Start phase A of the tender analysis (SEED_RUN_ANALYSIS)');
  const started = await rt<{ started?: boolean; runId?: string; success?: boolean; error?: string }>('rt_run_tender_analysis', {});
  if (!started.started) {
    warn(`rt_run_tender_analysis did not start: ${started.error ?? JSON.stringify(started)}`);
    return;
  }
  ok(`run ${started.runId} started — waiting for "awaiting review" (timeout ${Math.round(ANALYSIS_TIMEOUT_MS / 60000)} min)`);
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  let lastLine = '';
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await rt<any>('rt_get_analysis_status', {});
    const state = status.state;
    if (!state) continue;
    const line = `${state.percent}% · ${state.stepLabel}${state.currentFile ? ` · ${state.currentFile}` : ''}${state.message ? ` — ${state.message}` : ''}`;
    if (line !== lastLine) {
      info(line);
      lastLine = line;
    }
    if (state.status === 'awaiting_review') {
      ok(
        `phase A done: ${state.extraction.proposalIds.length} requirement cards, ${state.consistency.alerts.length} contradiction(s), ` +
          `${state.catalog.serviceIds.length} catalog services (${state.catalog.capabilities} EARS statements)`,
      );
      if (state.consistency.alerts.length !== EXPECTED_CONTRADICTIONS.length) {
        warn(
          `expected ${EXPECTED_CONTRADICTIONS.length} contradictions ` +
            `(${EXPECTED_CONTRADICTIONS.map((entry) => entry.label).join(', ')}), got ${state.consistency.alerts.length}`,
        );
      }
      return;
    }
    if (state.status === 'failed') {
      warn(`phase A failed at "${state.stepLabel}": ${state.message}`);
      return;
    }
  }
  warn('timed out waiting for phase A — the run keeps going in the backend; open the cockpit to watch it');
}

function step9_summary(): void {
  header('9. Summary');
  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  project:  ${PROJECT_ROOT}`);
  console.log(`  open:     out/tendertrace/pages/analysis.tendertrace.json (auto-opens — the Analyse-Cockpit)`);
  console.log(
    `  demo:     Analyse starten → Zur Prüfung → ${EXPECTED_CONTRADICTIONS.length} Widersprüche klären ` +
      `(${EXPECTED_CONTRADICTIONS.map((entry) => entry.label).join(', ')}) → Abgleich starten → Bericht öffnen`,
  );
  if (!RUN_ANALYSIS) console.log(`  hint:     set SEED_RUN_ANALYSIS=1 to let the seed run phase A right away`);
}

// ─── MCP wiring ─────────────────────────────────────────────────────────────

type RtCall = <T = any>(tool: string, args: Record<string, unknown>) => Promise<T>;

function makeRtCall(client: McpClient): RtCall {
  return async <T = any>(tool: string, args: Record<string, unknown>): Promise<T> =>
    client.callTool<T>(tool, { projectName: PROJECT_NAME, ...args });
}

// ─── entry ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\x1b[1mSeeding ${PROJECT_NAME}\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);
  console.log(`mcp:       ${MCP_URL}`);

  await validateFixtures();
  if (DRY_RUN) {
    console.log(`\n\x1b[32m✓ dry run passed\x1b[0m — no network calls made (unset SEED_DRY_RUN to seed)`);
    return;
  }

  if (existsSync(PROJECT_ROOT) && process.env.SEED_FORCE !== '1') {
    console.error(
      `\n\x1b[31m✗ project directory already exists:\x1b[0m ${PROJECT_ROOT}\n` +
        `  Delete it (plus matching Chroma/Quadstore entries) and re-run, or set SEED_FORCE=1 to seed on top anyway.`,
    );
    process.exit(1);
  }

  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step2b_provisionMcpServers(ctx);
  await step3_writeMissionAndClaudeMd();
  await step4_writeFixtures();

  const client = new McpClient(MCP_URL, { Authorization: 'test123', 'X-Project-Name': PROJECT_NAME });
  await client.connect();
  const rt = makeRtCall(client);
  try {
    await step5_initTender(rt);
    await step6_pageSentinels();
    await step7_documentationAndUi();
    if (RUN_ANALYSIS) await step8_runAnalysis(rt);
  } finally {
    await client.close();
  }
  step9_summary();
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
