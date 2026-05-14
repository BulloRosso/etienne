/**
 * SessionsStore integration test.
 *
 * Run with: tsx test/adaptive-memory-sessions-store.test.ts
 *
 * Stands up a temp WORKSPACE_ROOT, opens a session, appends turns + writes,
 * closes, and verifies the on-disk snapshot survives a fresh read.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'ss-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'sess-proj';
  mkdirSync(join(workspace, project), { recursive: true });
  console.log(`# workspace: ${workspace}`);

  try {
    const { SessionsStore } = await import(
      '../src/adaptive-memory/stores/sessions.store'
    );
    const store = new SessionsStore();

    // 1. open creates a snapshot file with workspaceSnapshotBefore set.
    const sessionId = 'sess-123';
    const rec = await store.open(project, sessionId, { activeSkills: ['wiki', 'dreaming'] });
    assert.equal(rec.id, sessionId);
    assert.equal(rec.projectId, project);
    assert.equal(rec.turns.length, 0);
    assert.ok(rec.workspaceSnapshotBefore.length > 0);
    assert.equal(rec.workspaceSnapshotAfter, '');
    const path = join(workspace, project, '.etienne', 'adaptive-memory', 'sessions', `${sessionId}.snapshot.json`);
    assert.equal(existsSync(path), true);
    console.log('  PASS  open() persists snapshot with workspaceSnapshotBefore');

    // 2. appendTurn persists immediately.
    await store.appendTurn(project, rec, {
      role: 'user',
      content: 'hello',
      storeWrites: [],
    });
    await store.appendTurn(project, rec, {
      role: 'agent',
      content: 'hi',
      storeWrites: [],
    });
    const reloaded1 = await store.read(project, sessionId);
    assert.ok(reloaded1);
    assert.equal(reloaded1.turns.length, 2);
    assert.equal(reloaded1.turns[0].role, 'user');
    console.log('  PASS  appendTurn persists on every call');

    // 3. recordWrite mutates the most-recent turn.
    await store.recordWrite(project, rec, 'wiki', 'mid-century-sofa');
    await store.recordWrite(project, rec, 'kg', 'sofa');
    const reloaded2 = await store.read(project, sessionId);
    assert.ok(reloaded2);
    assert.equal(reloaded2.turns[1].storeWrites.length, 2);
    assert.deepEqual(reloaded2.turns[1].storeWrites[0], {
      store: 'wiki',
      entryId: 'mid-century-sofa',
    });
    console.log('  PASS  recordWrite attaches to the most recent turn');

    // 4. close fills endedAt + workspaceSnapshotAfter.
    await store.close(project, rec);
    const reloaded3 = await store.read(project, sessionId);
    assert.ok(reloaded3);
    assert.ok(reloaded3.endedAt.length > 0);
    assert.ok(reloaded3.workspaceSnapshotAfter.length > 0);
    console.log('  PASS  close() persists endedAt + workspaceSnapshotAfter');

    // 5. close is idempotent (does not overwrite endedAt on a closed record).
    const firstClose = reloaded3.endedAt;
    await new Promise((r) => setTimeout(r, 10));
    await store.close(project, reloaded3);
    const reloaded4 = await store.read(project, sessionId);
    assert.equal(reloaded4?.endedAt, firstClose);
    console.log('  PASS  close() is idempotent');

    // 6. unprocessed lists closed sessions without qualityScore.
    const pending = await store.unprocessed(project);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, sessionId);
    console.log('  PASS  unprocessed lists closed-but-unscored sessions');

    // 7. After setQualityScore, the session is no longer "unprocessed".
    await store.setQualityScore(project, sessionId, 0.75);
    const after = await store.unprocessed(project);
    assert.equal(after.length, 0);
    const finalRec = await store.read(project, sessionId);
    assert.equal(finalRec?.qualityScore, 0.75);
    console.log('  PASS  setQualityScore is reflected on subsequent reads');

    // 8. Sessions that have not been closed are excluded from unprocessed.
    const openRec = await store.open(project, 'sess-open', { activeSkills: [] });
    await store.appendTurn(project, openRec, { role: 'user', content: 'x', storeWrites: [] });
    const pending2 = await store.unprocessed(project);
    assert.deepEqual(
      pending2.map((r) => r.id),
      [],
      'open sessions are not yet eligible for scoring',
    );
    console.log('  PASS  unprocessed excludes still-open sessions');

    console.log('\nAll SessionsStore tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
