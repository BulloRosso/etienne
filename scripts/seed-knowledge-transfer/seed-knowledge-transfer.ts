/**
 * Seed the `knowledge-transfer` (Lumitec LED-Headlight Onboarding)
 * example project.
 *
 * What this seeds:
 *   1. OAuth login + project create (auto-provisions standard skills).
 *   2. Static .claude/CLAUDE.md + templated .claude/CLAUDE.md.tpl + the
 *      long-form mission at wiki/_meta/mission.md.
 *   3. 22 wiki pages mirroring the curriculum ToC (1.0 → 5.3),
 *      cross-linked, with status / confidence / mission_relevance.
 *   4. 14 RAG documents under documents/ (in-house German handbooks +
 *      OEM customer-facing English glossaries).
 *   5. 3 inbox/*.docx (DOCX uploads the expert curates into the wiki).
 *   6. 3 chat sessions (.etienne/chat.history-*.jsonl + chat.sessions.json):
 *      first day, ASIL B EN deep dive, Anke curating Gen-5 IC.
 *   7. progress/_template.progress.json + progress/guest.progress.json.
 *   8. .etienne/event-handling.json with two rules.
 *   9. .etienne/application-type.json pointing at the `knowledge-transfer`
 *      application type (role-aware sidebar).
 *  10. Pre-rendered HTML assets: one quiz, one branching scenario, five
 *      colleague intro cards.
 *  11. Per-project skill: skill-templates/quiz-generator/.
 *
 * Reused from scripts/seed-requirements-hv/:
 *   - lib/api.ts          (authenticated fetch wrapper)
 *   - lib/auth.ts         (login + SEED_ACCESS_TOKEN env handling)
 *   - lib/wiki-shell.ts   (wiki-add.ts skill invocation)
 *   - fixtures/docx-writer.ts (renders DOCX via @turbodocx/html-to-docx
 *                              from backend/node_modules)
 *
 * Run with:
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-knowledge-transfer/seed-knowledge-transfer.ts
 */

import { existsSync, cpSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';

import { apiFetch, ApiError, type ApiContext } from '../seed-requirements-hv/lib/api';
import { login } from '../seed-requirements-hv/lib/auth';
import { addWikiPage } from '../seed-requirements-hv/lib/wiki-shell';
import { renderDocx } from '../seed-requirements-hv/fixtures/docx-writer';

import {
  PROJECT_NAME,
  MISSION_BRIEF,
  MISSION_MD,
  CLAUDE_MD,
  CLAUDE_MD_TPL,
} from './fixtures/mission';
import { WIKI_PAGES } from './fixtures/wiki-pages';
import { RAG_DOCS } from './fixtures/rag-docs';
import { INBOX_DOCS } from './fixtures/inbox-docs';
import { SESSIONS } from './fixtures/chats';
import { PROGRESS_TEMPLATE, PROGRESS_GUEST } from './fixtures/progress';
import { EVENT_RULES, SEED_PROMPTS, SCHEDULED_TASKS } from './fixtures/event-rules';
import { QUIZ_TOPIC_1, SCENARIO_5_1, COLLEAGUE_INTROS } from './fixtures/html-assets';
import { SIMULATORS } from './fixtures/simulators';
import { DOCUMENTATION_MD } from './fixtures/documentation';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);
const NOW = '2026-05-29T08:00:00Z';

const PROV = {
  sourceSessions: [] as string[],
  sourceEntries: [] as string[],
  createdBy: 'user' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

// ─── pretty logging ───────────────────────────────────────────────────────

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

// ─── steps ────────────────────────────────────────────────────────────────

async function step1_authenticate(): Promise<ApiContext> {
  header('1. Authenticate');
  const auth = await login();
  ok(`authenticated as ${auth.user.username} (${auth.user.role})`);
  return { accessToken: auth.accessToken };
}

async function step2_createProject(ctx: ApiContext): Promise<void> {
  header('2. Create project (auto-provisions standard skills)');
  // In-place re-seed is supported: if the project already exists we
  // proceed and let downstream steps overwrite fixture files. The
  // backend's "already exists" branch below provisions standard skills
  // without touching the existing content.
  const body = {
    projectName: PROJECT_NAME,
    missionBrief: MISSION_BRIEF,
    language: 'de',
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
  ok('wiki skill provisioned');

  // Wiki skill needs its node_modules to invoke gray-matter etc. The standard
  // provisioner doesn't install npm deps; borrow from workspace/wiki-test/ as
  // the HV seed does.
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
        `wiki skill needs node_modules but no donor found at ${donor}.\n` +
          `Run: (cd ${skillDir} && npm install) and re-run this script.`,
      );
    }
  }
}

async function step3_writeMission(): Promise<void> {
  header('3. Write documentation.md + wiki/_meta/mission.md + .claude/CLAUDE.md(.tpl)');
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');
  info('documentation.md (welcome / orientation page, auto-opened on project load)');

  const metaDir = join(PROJECT_ROOT, 'wiki', '_meta');
  await mkdir(metaDir, { recursive: true });
  await writeFile(join(metaDir, 'mission.md'), MISSION_MD, 'utf8');
  info('wiki/_meta/mission.md (long-form mission, German — agent reads this)');

  const claudeDir = join(PROJECT_ROOT, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(join(claudeDir, 'CLAUDE.md'), CLAUDE_MD, 'utf8');
  await writeFile(join(claudeDir, 'CLAUDE.md.tpl'), CLAUDE_MD_TPL, 'utf8');
  ok('CLAUDE.md (static) + CLAUDE.md.tpl (templated) written');
}

async function step4_seedWiki(): Promise<void> {
  header('4. Seed 22 wiki pages via the provisioned wiki-add.ts');
  for (const draft of WIKI_PAGES) {
    const input = {
      title: draft.title,
      slug: draft.slug,
      bucket: draft.bucket,
      status: draft.status,
      confidence: draft.confidence,
      tags: draft.tags,
      mission_relevance: draft.mission_relevance,
      sources: [
        { kind: 'conversation' as const, turn: NOW, note: 'seeded by seed-knowledge-transfer.ts' },
      ],
      body: draft.body,
      classification: 'private' as const,
      provenance: { ...PROV },
    };
    let result = await addWikiPage(PROJECT_ROOT, { ...input, mode: 'create' });
    if (!result.ok && /already exists/.test(result.error ?? '')) {
      result = await addWikiPage(PROJECT_ROOT, { ...input, mode: 'update' });
    }
    if (!result.ok) {
      throw new Error(`wiki-add failed for ${draft.slug}: ${result.error ?? 'unknown'}`);
    }
    info(`${draft.bucket}/${result.slug ?? draft.slug} (${result.mode}, status=${draft.status})`);
  }
  ok(`wiki: ${WIKI_PAGES.length} pages written`);
}

async function step5_seedDocuments(ctx: ApiContext): Promise<void> {
  header('5. Write + RAG-index documents/');
  const dir = join(PROJECT_ROOT, 'documents');
  await mkdir(dir, { recursive: true });
  let indexed = 0;
  let skipped = 0;
  for (const doc of RAG_DOCS) {
    await writeFile(join(dir, doc.filename), doc.body, 'utf8');
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

async function step6_seedInbox(): Promise<void> {
  header('6. Write inbox/*.docx (expert curates these into the wiki)');
  const dir = join(PROJECT_ROOT, 'inbox');
  await mkdir(dir, { recursive: true });
  for (const doc of INBOX_DOCS) {
    const buf = await renderDocx(doc.title, doc.body);
    await writeFile(join(dir, doc.filename), buf);
    info(`inbox/${doc.filename} (${buf.length} bytes)`);
  }
  ok(`inbox: ${INBOX_DOCS.length} .docx files (not RAG-indexed — expert promotes them via the wiki)`);
}

async function step7_writeProgress(): Promise<void> {
  header('7. Write progress/ template + pre-seeded partial state for the demo user');
  const dir = join(PROJECT_ROOT, 'progress');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, '_template.progress.json'),
    JSON.stringify(PROGRESS_TEMPLATE, null, 2),
    'utf8',
  );
  info('progress/_template.progress.json (the empty curriculum every guest starts from)');
  await writeFile(
    join(dir, 'guest.progress.json'),
    JSON.stringify(PROGRESS_GUEST, null, 2),
    'utf8',
  );
  ok(`progress/guest.progress.json (worked-example, partial state, 4 Q/As, 3 badges)`);
}

async function step8_seedChats(): Promise<void> {
  header('8. Seed chat sessions (.etienne/chat.history-*.jsonl + chat.sessions.json)');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  let totalTurns = 0;
  for (const session of SESSIONS) {
    const path = join(etienne, `chat.history-${session.id}.jsonl`);
    const lines = session.messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await writeFile(path, lines, 'utf8');
    totalTurns += session.messages.length;
    info(`chat.history-${session.id}.jsonl (${session.messages.length} turns)`);
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
    sessionId: s.id,
    timestamp: s.created_at,
    summary: s.title,
  }));
  await writeFile(
    sessionsPath,
    JSON.stringify({ sessions: [...(existing.sessions ?? []), ...seeded] }, null, 2),
    'utf8',
  );
  ok(`sessions: ${SESSIONS.length} sessions written, ${totalTurns} turns total`);
}

async function step9_writeEventRules(): Promise<void> {
  header('9. Seed event rules + prompts (.etienne/event-handling.json + prompts.json)');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });

  // Merge with any pre-existing rules (e.g. seeded by a standard skill).
  const ehPath = join(etienne, 'event-handling.json');
  let eh: { rules: any[] } = { rules: [] };
  if (existsSync(ehPath)) {
    try { eh = JSON.parse(await readFile(ehPath, 'utf8')); } catch { eh = { rules: [] }; }
  }
  if (!Array.isArray(eh.rules)) eh.rules = [];
  for (const rule of EVENT_RULES) {
    if (!eh.rules.some((r: any) => r.id === rule.id)) eh.rules.push(rule);
  }
  await writeFile(ehPath, JSON.stringify(eh, null, 2), 'utf8');
  for (const rule of EVENT_RULES) {
    info(`${rule.id} (${rule.condition.type}, ${rule.enabled ? 'enabled' : 'disabled'})`);
  }

  const prPath = join(etienne, 'prompts.json');
  let pr: { prompts: any[] } = { prompts: [] };
  if (existsSync(prPath)) {
    try { pr = JSON.parse(await readFile(prPath, 'utf8')); } catch { pr = { prompts: [] }; }
  }
  if (!Array.isArray(pr.prompts)) pr.prompts = [];
  for (const prompt of SEED_PROMPTS) {
    if (!pr.prompts.some((p: any) => p.id === prompt.id)) pr.prompts.push(prompt);
  }
  await writeFile(prPath, JSON.stringify(pr, null, 2), 'utf8');
  ok(`event rules: ${EVENT_RULES.length} written, prompts: ${SEED_PROMPTS.length} written`);
}

async function step9b_registerScheduledTasks(ctx: ApiContext): Promise<void> {
  header('9b. Register recurring scheduler tasks (nightly progress recompute)');
  for (const task of SCHEDULED_TASKS) {
    try {
      await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
        method: 'POST',
        body: JSON.stringify(task),
      });
      info(`${task.id} (${task.cronExpression} ${task.timeZone})`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        info(`${task.id} already registered`);
      } else {
        warn(`failed to register ${task.id}: ${err?.message ?? err}`);
      }
    }
  }
  ok(`scheduler: ${SCHEDULED_TASKS.length} task(s) registered`);
}

async function step10_assignApplicationType(): Promise<void> {
  header('10. Assign `knowledge-transfer` application type');
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });
  await writeFile(
    join(etienne, 'application-type.json'),
    JSON.stringify({ id: 'knowledge-transfer', version: '1.0' }, null, 2),
    'utf8',
  );
  ok('.etienne/application-type.json → knowledge-transfer');
}

async function step11_writeHtmlAssets(): Promise<void> {
  header('11. Pre-render HTML assets (quiz + scenario + 5 colleague intros)');
  const quizDir = join(PROJECT_ROOT, 'out', 'quizzes');
  const scenarioDir = join(PROJECT_ROOT, 'out', 'scenarios');
  const introDir = join(PROJECT_ROOT, 'out', 'intros');
  await mkdir(quizDir, { recursive: true });
  await mkdir(scenarioDir, { recursive: true });
  await mkdir(introDir, { recursive: true });

  await writeFile(join(quizDir, '1-deine-rolle-bei-lumitec.quiz.html'), QUIZ_TOPIC_1, 'utf8');
  info('out/quizzes/1-deine-rolle-bei-lumitec.quiz.html (7 MCQs)');

  await writeFile(
    join(scenarioDir, '5-1-flicker-on-b-sample.scenario.html'),
    SCENARIO_5_1,
    'utf8',
  );
  info('out/scenarios/5-1-flicker-on-b-sample.scenario.html (branching, 5 nodes)');

  for (const [filename, html] of Object.entries(COLLEAGUE_INTROS)) {
    await writeFile(join(introDir, filename), html, 'utf8');
    info(`out/intros/${filename}`);
  }
  ok(`html: 1 quiz + 1 scenario + ${Object.keys(COLLEAGUE_INTROS).length} colleague intros`);

  // Application simulators (interactive mocks the trainee clicks through).
  const simDir = join(PROJECT_ROOT, 'out', 'simulators');
  await mkdir(simDir, { recursive: true });
  for (const sim of SIMULATORS) {
    await writeFile(join(simDir, sim.filename), sim.html, 'utf8');
    info(`out/simulators/${sim.filename}`);
  }
  ok(`simulators: ${SIMULATORS.length} pre-rendered (CRM + ERP available on-demand via simulator-author skill)`);
}

async function step12_writeProjectSkills(): Promise<void> {
  header('12. Provision project-local skills (quiz-generator + simulator-author)');
  const skills = ['quiz-generator', 'simulator-author'];
  for (const skill of skills) {
    const src = join(__dirname, 'skill-templates', skill, 'SKILL.md');
    const dst = join(PROJECT_ROOT, '.claude', 'skills', skill);
    await mkdir(dst, { recursive: true });
    const body = await readFile(src, 'utf8');
    await writeFile(join(dst, 'SKILL.md'), body, 'utf8');
    info(`.claude/skills/${skill}/SKILL.md`);
  }
  ok(`provisioned ${skills.length} project-local skills`);
}

async function step13_registerPreviewDocuments(): Promise<void> {
  header('13. Configure UI (welcome message + auto-preview documents) — .etienne/user-interface.json');
  const path = join(PROJECT_ROOT, '.etienne', 'user-interface.json');
  // If a user-interface.json already exists (created by a standard skill),
  // merge in our additions; otherwise create a minimal one.
  let existing: any = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      existing = {};
    }
  }
  // Welcome message — shown on the WelcomePage before any chat is open.
  // Only override if not already customised by the operator.
  const welcomePage = { ...(existing.welcomePage ?? {}) };
  if (!welcomePage.message) {
    welcomePage.message =
      'Welcome to your Lumitec LED Headlight Onboarding. Ask me anything — ' +
      '"What\'s next?", "Explain ISO 26262 to me", or "Let me practice MD04" — ' +
      "and I'll meet you where you are.";
  }
  if (welcomePage.showWelcomeMessage === undefined) welcomePage.showWelcomeMessage = true;

  const previewDocuments = Array.isArray(existing.previewDocuments)
    ? existing.previewDocuments.slice()
    : [];
  const additions = [
    'documentation.md',
    'progress/guest.progress.json',
  ];
  for (const p of additions) {
    if (!previewDocuments.includes(p)) previewDocuments.push(p);
  }
  await writeFile(
    path,
    JSON.stringify({ ...existing, welcomePage, previewDocuments }, null, 2),
    'utf8',
  );
  ok(`UI configured: welcome message + ${previewDocuments.length} preview document(s)`);
}

// ─── main ────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  console.log(
    '\x1b[36m\x1b[1m=== Seed: knowledge-transfer (Lumitec LED Headlight Onboarding) ===\x1b[0m',
  );
  const ctx = await step1_authenticate();
  await step2_createProject(ctx);
  await step3_writeMission();
  await step4_seedWiki();
  await step5_seedDocuments(ctx);
  await step6_seedInbox();
  await step7_writeProgress();
  await step8_seedChats();
  await step9_writeEventRules();
  await step9b_registerScheduledTasks(ctx);
  await step10_assignApplicationType();
  await step11_writeHtmlAssets();
  await step12_writeProjectSkills();
  await step13_registerPreviewDocuments();
  const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n\x1b[1m\x1b[32m✓ seed complete in ${dur}s — project at:\x1b[0m ${PROJECT_ROOT}\n`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ seed failed: ${err?.message ?? err}\x1b[0m`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
