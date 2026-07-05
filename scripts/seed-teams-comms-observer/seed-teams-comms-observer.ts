/**
 * Seed the `teams-comms-observer` example project — the "Hyperactive Hive
 * Mind" analyst that silently observes mirrored MS Teams channels.
 *
 *   1. Authenticate against the OAuth server (:5950).
 *   2. Create the project via POST /api/projects/create (auto-provisions
 *      standard skills incl. wiki) + borrow wiki node_modules.
 *  2b. Provision the kg MCP server (.mcp.json + settings sync).
 *   3. Write mission, persona (.claude/CLAUDE.md), permissions, and install
 *      the hive-analytics project skill.
 *   4. Write 14 wiki pages (taxonomy, agreement playbook, research basis,
 *      methodology, guardrails, profiles, channels).
 *   5. POST KG entities + relationships (patterns as first-class citizens).
 *   6. Write 8 RAG reference docs + index them.
 *   7. Write sample channel transcripts (data/teams/…, dates relative to
 *      today) + .etienne/teams-observer.json (enabled:false).
 *   8. Run the hive-analytics metrics script over the transcripts
 *      (data/metrics/… + reports/data/hive-metrics.json).
 *   9. Write prewritten reports (out/, reports/) + the two hand-built
 *      dashboard data exports.
 *  10. Install the hyperscreen (settings.json + covers + 3 dashboards).
 *  11. Seed 2 chat sessions.
 *  12. user-interface.json previewDocuments + prompts.json.
 *  13. Register the nightly analysis cron (02:00 UTC).
 *  14. Write documentation.md.
 *  15. (optional, SEED_RUN_ANALYSIS=1) one unattended analysis run.
 *
 * Run with:
 *   npx tsx scripts/seed-teams-comms-observer/seed-teams-comms-observer.ts
 */

import { existsSync, cpSync, readdirSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

import { apiFetch, ApiError, type ApiContext } from './lib/api';
import { login } from './lib/auth';
import { addWikiPage } from './lib/wiki-shell';

import { MISSION_BRIEF, MISSION_MD, PROJECT_NAME } from './fixtures/mission';
import { CLAUDE_MD, SETTINGS_PERMISSIONS, DATA_PERMISSIONS } from './fixtures/persona';
import { WIKI_PAGES } from './fixtures/wiki-pages';
import { kgEntities, kgRelationships } from './fixtures/kg';
import { RAG_DOCS } from './fixtures/rag-docs';
import { CHANNELS, buildChannelTranscript } from './fixtures/transcripts';
import { buildSessions } from './fixtures/chats';
import {
  hiveMindReport,
  teamAgreementDraft,
  commsInsightsLog,
  patternOccurrencesJson,
  agreementNormsJson,
} from './fixtures/reports';
import { documentationMd } from './fixtures/documentation';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  'C:/Data/GitHub/claude-multitenant/workspace';

const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
// tsx runs these scripts as CJS (same convention as the other seeds).
const SEED_DIR = __dirname;

/** All relative dates in the fixtures hang off "today 00:00 UTC". */
const BASE_DATE = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

const NOW = new Date().toISOString();
const PROV = {
  sourceSessions: [] as string[],
  sourceEntries: [] as string[],
  createdBy: 'user' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

// ─── helpers ───────────────────────────────────────────────────────────────

function header(s: string) { console.log(`\n\x1b[1m▸ ${s}\x1b[0m`); }
function ok(s: string) { console.log(`  \x1b[32m✓\x1b[0m ${s}`); }
function info(s: string) { console.log(`  \x1b[2m·\x1b[0m ${s}`); }
function warn(s: string) { console.log(`  \x1b[33m!\x1b[0m ${s}`); }

async function writeProjectFile(rel: string, body: string | Buffer): Promise<void> {
  const abs = join(PROJECT_ROOT, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body as any, typeof body === 'string' ? 'utf8' : undefined);
}

function spawnTsx(scriptAbs: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', scriptAbs, ...args], {
      cwd, shell: platform() === 'win32', env: process.env,
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`tsx exited ${code}: ${stderr || stdout}`)));
  });
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

  const body = { projectName: PROJECT_NAME, missionBrief: MISSION_BRIEF, language: 'en' };
  try {
    const r = await apiFetch<{ success: boolean; warnings?: string[] }>(
      ctx, '/api/projects/create', { method: 'POST', body: JSON.stringify(body) },
    );
    if (!r.success) throw new Error(`project create returned success=false`);
    ok(`project created: ${PROJECT_NAME}`);
    for (const w of r.warnings ?? []) warn(`warning: ${w}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && err.body.includes('already exists')) {
      info('project entry already present — provisioning standard skills directly');
      const r = await apiFetch<{ success: boolean; message: string }>(
        ctx, `/api/skills/${PROJECT_NAME}/provision-standard`, { method: 'POST', body: JSON.stringify({}) },
      );
      if (!r.success) throw new Error(`provision-standard failed: ${r.message}`);
      ok(r.message);
    } else {
      throw err;
    }
  }

  // Wait for the wiki skill (provisioning can be async).
  const wikiAdd = join(PROJECT_ROOT, '.claude', 'skills', 'wiki', 'scripts', 'wiki-add.ts');
  const deadline = Date.now() + 20_000;
  while (!existsSync(wikiAdd) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!existsSync(wikiAdd)) throw new Error(`wiki skill not provisioned after 20s: ${wikiAdd}`);
  ok('wiki skill provisioned (.claude/skills/wiki/)');

  // The wiki skill needs gray-matter at runtime; borrow node_modules.
  const skillDir = join(PROJECT_ROOT, '.claude', 'skills', 'wiki');
  const skillNodeModules = join(skillDir, 'node_modules');
  if (!existsSync(skillNodeModules)) {
    const donors = readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== PROJECT_NAME)
      .map((e) => join(WORKSPACE_ROOT, e.name, '.claude', 'skills', 'wiki', 'node_modules'))
      .filter((p) => existsSync(p));
    if (donors.length > 0) {
      cpSync(donors[0], skillNodeModules, { recursive: true });
      ok(`wiki skill node_modules borrowed from ${donors[0]}`);
    } else {
      throw new Error(
        `wiki skill needs node_modules but no donor project found in ${WORKSPACE_ROOT}.\n` +
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
  };
  await apiFetch(ctx, `/api/claude/mcp/config/save`, {
    method: 'POST',
    body: JSON.stringify({ projectName: PROJECT_NAME, mcpServers }),
  });
  if (!existsSync(join(PROJECT_ROOT, '.mcp.json'))) {
    throw new Error(`.mcp.json not written at ${join(PROJECT_ROOT, '.mcp.json')}`);
  }
  ok(`mcp servers provisioned: ${Object.keys(mcpServers).join(', ')}`);
}

async function step3_personaAndSkill(): Promise<void> {
  header('3. Mission, persona, permissions, hive-analytics skill');
  await writeProjectFile(join('wiki', '_meta', 'mission.md'), MISSION_MD);
  await writeProjectFile(join('.claude', 'CLAUDE.md'), CLAUDE_MD);
  await writeProjectFile(join('data', 'permissions.json'), JSON.stringify(DATA_PERMISSIONS, null, 2));

  // Merge permissions into the provisioned .claude/settings.json.
  const settingsPath = join(PROJECT_ROOT, '.claude', 'settings.json');
  let settings: any = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(await readFile(settingsPath, 'utf8')); } catch { settings = {}; }
  }
  const perms = settings.permissions ?? {};
  perms.allow = [...new Set([...(perms.allow ?? []), ...SETTINGS_PERMISSIONS.allow])];
  perms.deny = [...new Set([...(perms.deny ?? []), ...SETTINGS_PERMISSIONS.deny])];
  settings.permissions = perms;
  await writeProjectFile(join('.claude', 'settings.json'), JSON.stringify(settings, null, 2));

  // Install the hive-analytics project skill from the seed assets.
  const skillSrc = join(SEED_DIR, 'skills', 'hive-analytics');
  const skillDst = join(PROJECT_ROOT, '.claude', 'skills', 'hive-analytics');
  cpSync(skillSrc, skillDst, { recursive: true });
  ok('mission + persona + permissions + hive-analytics skill installed');
}

async function step4_seedWiki(): Promise<void> {
  header('4. Seed wiki pages via provisioned wiki-add.ts');
  let written = 0;
  for (const draft of WIKI_PAGES) {
    const baseInput = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [{ kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-teams-comms-observer.ts' }],
      body: draft.body,
      classification: draft.classification ?? ('private' as const),
      provenance: { ...PROV },
    };
    let result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'create' });
    if (!result.ok && /already exists/.test(result.error ?? '')) {
      result = await addWikiPage(PROJECT_ROOT, { ...baseInput, mode: 'update' });
    }
    if (!result.ok) throw new Error(`wiki-add failed for ${draft.slug}: ${result.error ?? 'unknown'}`);
    written += 1;
    info(`${draft.bucket}/${result.slug} (${result.mode})`);
  }
  ok(`wiki: ${written} pages written`);
}

async function step5_seedKG(ctx: ApiContext): Promise<void> {
  header('5. Seed knowledge graph (patterns as first-class citizens)');
  let ec = 0;
  for (const e of kgEntities(BASE_DATE)) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/entities`, {
      method: 'POST', body: JSON.stringify(e),
    });
    ec += 1;
  }
  ok(`kg: ${ec} entities`);
  let rc = 0;
  for (const r of kgRelationships(BASE_DATE)) {
    await apiFetch(ctx, `/api/knowledge-graph/${PROJECT_NAME}/relationships`, {
      method: 'POST', body: JSON.stringify(r),
    });
    rc += 1;
  }
  ok(`kg: ${rc} relationships (exhibits / occursIn / wouldPrevent / …)`);
}

async function step6_seedRag(ctx: ApiContext): Promise<void> {
  header('6. Seed RAG reference documents');
  let indexed = 0;
  for (const doc of RAG_DOCS) {
    await writeProjectFile(join('documents', doc.filename), doc.body);
    try {
      await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/index-document`, {
        method: 'POST',
        body: JSON.stringify({ documentPath: `documents/${doc.filename}` }),
      });
      indexed += 1;
    } catch (err) {
      if (err instanceof ApiError) {
        warn(`index failed for ${doc.filename}: HTTP ${err.status} (file still written for retry)`);
        continue;
      }
      throw err;
    }
  }
  ok(`rag: ${indexed}/${RAG_DOCS.length} documents indexed`);
}

async function step7_seedTranscripts(): Promise<void> {
  header('7. Seed sample channel transcripts + observer config');
  for (const slug of Object.keys(CHANNELS)) {
    const { jsonl, dailyMd } = buildChannelTranscript(slug, BASE_DATE);
    await writeProjectFile(join('data', 'teams', slug, 'messages.jsonl'), jsonl);
    for (const [day, md] of Object.entries(dailyMd)) {
      await writeProjectFile(join('data', 'teams', slug, `${day}.md`), md);
    }
    info(`${slug}: ${jsonl.trim().split('\n').length} messages, ${Object.keys(dailyMd).length} daily transcripts`);
  }

  // Observer config — disabled placeholder; operator flips on with a tenant.
  const observerConfig = {
    version: 1,
    enabled: false,
    syncIntervalSec: 120,
    refreshWindowHours: 24,
    downloadHostedContent: true,
    backfillDays: 90,
    channels: Object.entries(CHANNELS).map(([slug, def]) => ({
      teamId: 'REPLACE_WITH_TEAM_ID',
      channelId: 'REPLACE_WITH_CHANNEL_ID',
      teamName: def.teamName,
      channelName: def.channelName,
      slug,
    })),
  };
  await writeProjectFile(join('.etienne', 'teams-observer.json'), JSON.stringify(observerConfig, null, 2));
  ok('transcripts + .etienne/teams-observer.json (enabled:false) written');
}

async function step8_runMetrics(): Promise<void> {
  header('8. Compute metrics via the hive-analytics skill');
  const script = join(PROJECT_ROOT, '.claude', 'skills', 'hive-analytics', 'scripts', 'compute-metrics.ts');
  const out = await spawnTsx(script, ['--project-root', PROJECT_ROOT], PROJECT_ROOT);
  const lastLine = out.trim().split('\n').pop() ?? '';
  try {
    const parsed = JSON.parse(lastLine);
    ok(`metrics computed: ${parsed.days} days, ${parsed.persons} persons → ${parsed.wrote.join(', ')}`);
  } catch {
    ok('metrics script ran (unparsed output): ' + lastLine.slice(0, 120));
  }
}

async function step9_reportsAndDashboardData(): Promise<void> {
  header('9. Prewritten reports + dashboard data exports');
  await writeProjectFile(join('out', 'hive-mind-report.md'), hiveMindReport(BASE_DATE));
  await writeProjectFile(join('out', 'team-agreement-draft.md'), teamAgreementDraft(BASE_DATE));
  await writeProjectFile(join('reports', 'comms-insights-log.md'), commsInsightsLog(BASE_DATE));
  await writeProjectFile(
    join('reports', 'data', 'pattern-occurrences.json'),
    JSON.stringify(patternOccurrencesJson(BASE_DATE), null, 2),
  );
  await writeProjectFile(
    join('reports', 'data', 'agreement-norms.json'),
    JSON.stringify(agreementNormsJson(BASE_DATE), null, 2),
  );
  ok('out/hive-mind-report.md, out/team-agreement-draft.md, reports/* written');
}

async function step10_hyperscreen(): Promise<void> {
  header('10. Install hyperscreen (3 report cards)');
  const assets = join(SEED_DIR, 'assets');
  await writeProjectFile(
    join('hyperscreen', 'settings.json'),
    await readFile(join(assets, 'hyperscreen-settings.json'), 'utf8'),
  );
  for (const img of ['pulse.png', 'patterns.png', 'agreement.png']) {
    await writeProjectFile(join('hyperscreen', img), await readFile(join(assets, img)));
  }
  for (const html of ['hive-pulse.html', 'pattern-radar.html', 'agreement-scoreboard.html']) {
    await writeProjectFile(join('reports', html), await readFile(join(assets, html), 'utf8'));
  }
  ok('hyperscreen/settings.json + covers + reports/*.html installed');
}

async function step11_seedChats(): Promise<void> {
  header('11. Seed chat sessions');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });
  const sessions = buildSessions(BASE_DATE);

  for (const session of sessions) {
    const path = join(etienne, `chat.history-${session.sessionId}.jsonl`);
    const lines = session.turns.map((t) => JSON.stringify(t)).join('\n') + '\n';
    await writeFile(path, lines, 'utf8');
    info(`chat.history-${session.sessionId}.jsonl (${session.turns.length} turns)`);
  }

  const sessionsPath = join(etienne, 'chat.sessions.json');
  let existing: { sessions?: Array<{ sessionId: string; timestamp: string; summary?: string }> } = {};
  if (existsSync(sessionsPath)) {
    try { existing = JSON.parse(await readFile(sessionsPath, 'utf8')); } catch { existing = {}; }
  }
  const merged = {
    sessions: [
      ...(existing.sessions ?? []),
      ...sessions.map((s) => ({ timestamp: s.timestamp, sessionId: s.sessionId, summary: s.summary })),
    ],
  };
  await writeFile(sessionsPath, JSON.stringify(merged, null, 2), 'utf8');
  ok(`sessions: ${sessions.length} sessions written`);
}

async function step12_uiAndPrompts(): Promise<void> {
  header('12. user-interface.json + prompts.json');
  const uiPath = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  let ui: any = { previewDocuments: [] };
  if (existsSync(uiPath)) {
    try { ui = JSON.parse(await readFile(uiPath, 'utf8')); } catch { /* keep default */ }
  }
  const previews: string[] = Array.isArray(ui.previewDocuments) ? ui.previewDocuments : [];
  for (const doc of ['documentation.md', 'out/hive-mind-report.md']) {
    if (!previews.includes(doc)) previews.push(doc);
  }
  ui.previewDocuments = previews;
  await writeProjectFile(join('.etienne', 'user-interface.json'), JSON.stringify(ui, null, 2));

  const prPath = join(PROJECT_ROOT, '.etienne', 'prompts.json');
  let pr: { prompts: any[] } = { prompts: [] };
  if (existsSync(prPath)) {
    try { pr = JSON.parse(await readFile(prPath, 'utf8')); } catch { pr = { prompts: [] }; }
  }
  if (!Array.isArray(pr.prompts)) pr.prompts = [];
  const upsert = (p: { id: string; title: string; content: string }) => {
    if (!pr.prompts.some((x) => x.id === p.id)) {
      pr.prompts.push({ ...p, createdAt: NOW, updatedAt: NOW });
    }
  };
  upsert({
    id: 'hive-analysis-on-demand',
    title: 'Hive analysis — on demand',
    content:
      'Run the hive-analytics metrics script (npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts), ' +
      'then analyze all transcripts under data/teams/ newer than the last-processed marker in reports/comms-insights-log.md: ' +
      'classify pattern occurrences against wiki/topics/hive-mind-pattern-taxonomy.md, record them in the knowledge graph ' +
      'with evidence links, update the affected person profiles (respectful, pattern-not-character), rewrite ' +
      'out/hive-mind-report.md, revise out/team-agreement-draft.md where evidence changed, regenerate ' +
      'reports/data/pattern-occurrences.json and reports/data/agreement-norms.json, append findings to the log and ' +
      'advance the marker. Never post to Teams.',
  });
  upsert({
    id: 'team-agreement-refresh',
    title: 'Team agreement — refresh draft',
    content:
      'Re-derive out/team-agreement-draft.md from the current knowledge graph: for each AgreementNorm, collect its ' +
      'wouldPrevent occurrences as evidence, restate the expected measurable effect, and mark status ' +
      '(proposed/adopted/deferred). Ground the meeting-free-day section in wiki/sources/research-basis.md. Update ' +
      'reports/data/agreement-norms.json to match. Keep it to one page; every claim cites evidence.',
  });
  await writeProjectFile(join('.etienne', 'prompts.json'), JSON.stringify(pr, null, 2));
  ok('previewDocuments + prompts seeded');
}

async function step13_registerNightlyCron(ctx: ApiContext): Promise<void> {
  header('13. Register nightly analysis cron');
  try {
    await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'hive-observer-nightly',
        name: 'Nightly hive communication analysis',
        prompt:
          'Nightly hive analysis. 1) Run the hive-analytics metrics script ' +
          '(npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts). ' +
          '2) Read the transcripts under data/teams/ newer than the last-processed marker in ' +
          'reports/comms-insights-log.md. 3) Classify pattern occurrences against ' +
          'wiki/topics/hive-mind-pattern-taxonomy.md and record each in the knowledge graph ' +
          '(PatternOccurrence via properties.domainType, with exhibits/involvedIn/occursIn/wouldPrevent ' +
          'relationships and evidence links). 4) Update person style profiles in wiki/topics/person-<slug>.md ' +
          '(evidence-cited, respectful, pattern-not-character). 5) Rewrite out/hive-mind-report.md as the standing ' +
          'report and revise out/team-agreement-draft.md where new evidence strengthens or weakens a norm. ' +
          '6) Regenerate reports/data/pattern-occurrences.json and reports/data/agreement-norms.json so the ' +
          'dashboards refresh. 7) Append dated findings to reports/comms-insights-log.md and advance the marker. ' +
          'Never post to Teams; you are a silent observer.',
        cronExpression: '0 2 * * *',
        timeZone: 'UTC',
        type: 'recurring',
      }),
    });
    ok('nightly cron registered (0 2 * * * UTC)');
  } catch (err) {
    if (err instanceof ApiError) {
      warn(`cron registration → HTTP ${err.status} (register manually if needed)`);
      return;
    }
    throw err;
  }
}

async function step14_documentation(): Promise<void> {
  header('14. Write documentation.md');
  await writeProjectFile('documentation.md', documentationMd(BASE_DATE));
  ok('documentation.md written (auto-opens via previewDocuments)');
}

async function step15_optionalAnalysisRun(ctx: ApiContext): Promise<void> {
  if (process.env.SEED_RUN_ANALYSIS !== '1') {
    info('skipping live analysis run (set SEED_RUN_ANALYSIS=1 to enable)');
    return;
  }
  header('15. Run one unattended analysis (SEED_RUN_ANALYSIS=1)');
  const r = await apiFetch<{ success?: boolean; response?: string }>(
    ctx,
    `/api/claude/unattended/${PROJECT_NAME}`,
    {
      method: 'POST',
      body: JSON.stringify({
        prompt:
          'Run the hive-analysis-on-demand procedure from .etienne/prompts.json (id: hive-analysis-on-demand).',
        maxTurns: 25,
        source: 'Seed: initial analysis',
        sessionName: 'Seed analysis',
      }),
    },
  );
  ok(`analysis run finished (success=${r.success ?? 'n/a'})`);
}

// ─── entry ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\x1b[1mSeeding ${PROJECT_NAME}\x1b[0m`);
  console.log(`workspace: ${WORKSPACE_ROOT}`);
  console.log(`base date: ${BASE_DATE.toISOString().slice(0, 10)} (transcripts span the 5 preceding days)`);

  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step2b_provisionMcpServers(ctx);
  await step3_personaAndSkill();
  await step4_seedWiki();
  await step5_seedKG(ctx);
  await step6_seedRag(ctx);
  await step7_seedTranscripts();
  await step8_runMetrics();
  await step9_reportsAndDashboardData();
  await step10_hyperscreen();
  await step11_seedChats();
  await step12_uiAndPrompts();
  await step13_registerNightlyCron(ctx);
  await step14_documentation();
  await step15_optionalAnalysisRun(ctx);

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  open the project — the hyperscreen with the 3 reports appears automatically`);
  console.log(`  docs: workspace/${PROJECT_NAME}/documentation.md`);
  console.log(`  live tenant hookup: see ms-teams-integration.md at the repo root`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
