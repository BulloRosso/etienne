/**
 * One-off script: apply the markus → user rename + add documentation.md
 * to an existing lumitec-led-onboarding workspace without re-running
 * the full seed.
 *
 * Idempotent. Run with:
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-knowledge-transfer/reseed-user-rename.ts
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_NAME } from './fixtures/mission';
import { PROGRESS_GUEST } from './fixtures/progress';
import { SESSIONS } from './fixtures/chats';
import { DOCUMENTATION_MD } from './fixtures/documentation';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

async function main() {
  if (!existsSync(PROJECT_ROOT)) {
    throw new Error(`project not found at ${PROJECT_ROOT}`);
  }
  console.log(`▸ Updating ${PROJECT_ROOT}\n`);

  // 1. Welcome / orientation page.
  await writeFile(join(PROJECT_ROOT, 'documentation.md'), DOCUMENTATION_MD, 'utf8');
  console.log('  ✓ documentation.md');

  // 2. Rename progress: write progress/guest.progress.json with the renamed
  //    fixture content.
  const progressDir = join(PROJECT_ROOT, 'progress');
  await mkdir(progressDir, { recursive: true });
  await writeFile(
    join(progressDir, 'guest.progress.json'),
    JSON.stringify(PROGRESS_GUEST, null, 2),
    'utf8',
  );
  console.log('  ✓ progress/guest.progress.json');

  // 3. Rewrite chat sessions for the renamed user.
  const etienne = join(PROJECT_ROOT, '.etienne');
  await mkdir(etienne, { recursive: true });
  for (const session of SESSIONS) {
    const path = join(etienne, `chat.history-${session.id}.jsonl`);
    const lines = session.messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await writeFile(path, lines, 'utf8');
    console.log(`  ✓ .etienne/chat.history-${session.id}.jsonl`);
  }

  // 4. Update chat.sessions.json: add the new user-* sessions if missing.
  const sessionsPath = join(etienne, 'chat.sessions.json');
  let index: { sessions?: Array<{ sessionId: string; timestamp: string; summary?: string }> } = {};
  if (existsSync(sessionsPath)) {
    try { index = JSON.parse(await readFile(sessionsPath, 'utf8')); } catch { /* noop */ }
  }
  const known = new Set((index.sessions ?? []).map((s) => s.sessionId));
  for (const s of SESSIONS) {
    if (!known.has(s.id)) {
      (index.sessions ??= []).push({ sessionId: s.id, timestamp: s.created_at, summary: s.title });
    }
  }
  await writeFile(sessionsPath, JSON.stringify(index, null, 2), 'utf8');
  console.log('  ✓ .etienne/chat.sessions.json');

  // 5. Auto-preview documents: documentation.md + progress/guest.progress.json.
  const uiPath = join(etienne, 'user-interface.json');
  let ui: any = {};
  if (existsSync(uiPath)) {
    try { ui = JSON.parse(await readFile(uiPath, 'utf8')); } catch { /* noop */ }
  }
  ui.previewDocuments = ['documentation.md', 'progress/guest.progress.json'];
  await writeFile(uiPath, JSON.stringify(ui, null, 2), 'utf8');
  console.log('  ✓ .etienne/user-interface.json (previewDocuments rewritten)');

  console.log('\n✓ done.');
}

main().catch((err) => {
  console.error(`\n✗ failed: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
