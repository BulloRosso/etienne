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

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  'C:/Data/GitHub/claude-multitenant/workspace';

const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

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

  console.log(`\n\x1b[32m✓ done\x1b[0m`);
  console.log(`  inspect:  ${dreamPath}`);
  console.log(`  ui:       open the Adaptive Memory tile on the dashboard and pick "${PROJECT_NAME}"`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ FAILED:\x1b[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
