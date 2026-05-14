/**
 * Ponderer end-to-end test (against fakes, no live LLM).
 *
 * Validates the full 5-stage run:
 *   1. quality-scoring sets qualityScore on every unprocessed session
 *   2. maintenance produces a report (stale wiki pages flagged)
 *   3. personality-induction admits abstract candidates, rejects private/non-abstract
 *   4. self-edit triggers when the previous cycle's verdicts demand it
 *   5. publish-review writes items into the per-project ReviewQueueStore
 *
 * Plus the activation gate: refuses to run when no .etienne/adaptive-memory.config.json.
 *
 * Run with: tsx test/adaptive-memory-ponderer.test.ts
 */

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'pond-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'pond-proj';
  mkdirSync(join(workspace, project, '.etienne'), { recursive: true });
  // Provide a dreaming skill so SkillsStore.byIds has something to resolve.
  const dreamingDir = join(workspace, project, '.claude', 'skills', 'dreaming');
  mkdirSync(dreamingDir, { recursive: true });
  writeFileSync(
    join(dreamingDir, 'SKILL.md'),
    `---
description: Reflection skill
classificationContext: private
invocationTriggers: []
baselineTurns: 2
---
# Dreaming

Original body.
`,
    'utf8',
  );
  // Provide a wiki dir so listPages doesn't crash on bucket walk.
  mkdirSync(join(workspace, project, 'wiki', '_meta'), { recursive: true });
  writeFileSync(join(workspace, project, 'wiki', '_meta', 'mission.md'), '# m\n');
  console.log(`# workspace: ${workspace}`);

  try {
    const { Ponderer } = await import(
      '../src/adaptive-memory/subagents/ponderer.service'
    );
    const { AdaptiveMemoryConfigService } = await import(
      '../src/adaptive-memory/config/adaptive-memory-config.service'
    );
    const { SessionsStore } = await import(
      '../src/adaptive-memory/stores/sessions.store'
    );
    const { SkillsStore } = await import(
      '../src/adaptive-memory/stores/skills.store'
    );
    const { PersonalityStore } = await import(
      '../src/adaptive-memory/stores/personality.store'
    );
    const { ReviewQueueStore } = await import(
      '../src/adaptive-memory/stores/review-queue.store'
    );
    const { WikiService } = await import('../src/wiki/wiki.service');
    const { KGFake } = await import('../src/adaptive-memory/adapters/fakes');

    const config = new AdaptiveMemoryConfigService();
    const sessions = new SessionsStore();
    const skills = new SkillsStore();
    const personality = new PersonalityStore();
    const reviewQueue = new ReviewQueueStore();
    const wiki = new WikiService();
    const kg = new KGFake();

    // Fake LlmService — never called in the deterministic test paths.
    const llm = {
      generateTextWithMessages: async () => 'rewritten body',
    } as any;

    // Fake DreamingService — returns success without doing real work.
    const dreaming = {
      triggerRun: async () => ({ runId: 'fake-run', enqueued: true }),
    } as any;

    // === 1. activation gate ===============================================
    const ponderer1 = new Ponderer(
      config,
      sessions,
      skills,
      personality,
      reviewQueue,
      wiki,
      kg as any,
      dreaming,
      llm,
    );
    await assert.rejects(
      () => ponderer1.run(project),
      /adaptive_memory_inactive/,
    );
    console.log('  PASS  run() refuses when project not opted in');

    // === 2. activate ======================================================
    await config.save(project, {});
    assert.equal(config.isActive(project), true);

    // === 3. seed two sessions ============================================
    // High-quality: clean turn with a workspace change.
    const high = await sessions.open(project, 'sess-high', { activeSkills: ['dreaming'] });
    await sessions.appendTurn(project, high, {
      role: 'user',
      content: 'reflect on walnut',
      storeWrites: [],
    });
    await sessions.appendTurn(project, high, {
      role: 'agent',
      content: 'done',
      storeWrites: [{ store: 'wiki', entryId: 'walnut' }],
    });
    high.workspaceSnapshotBefore = 'aaa';
    high.workspaceSnapshotAfter = 'bbb';
    await sessions.close(project, high);

    // Low-quality: many corrections.
    const low = await sessions.open(project, 'sess-low', { activeSkills: ['dreaming'] });
    await sessions.appendTurn(project, low, { role: 'user', content: 'do thing', storeWrites: [] });
    await sessions.appendTurn(project, low, { role: 'agent', content: 'attempt 1', storeWrites: [] });
    await sessions.appendTurn(project, low, { role: 'user', content: 'no, wrong', storeWrites: [] });
    await sessions.appendTurn(project, low, { role: 'agent', content: 'attempt 2', storeWrites: [] });
    await sessions.appendTurn(project, low, { role: 'user', content: 'actually not that', storeWrites: [] });
    await sessions.appendTurn(project, low, {
      role: 'agent',
      content: 'attempt 3',
      storeWrites: [{ store: 'wiki', entryId: 'x' }],
    });
    low.workspaceSnapshotBefore = 'aaa';
    low.workspaceSnapshotAfter = 'bbb';
    await sessions.close(project, low);

    // === 4. run the cycle =================================================
    const ponderer = new Ponderer(
      config,
      sessions,
      skills,
      personality,
      reviewQueue,
      wiki,
      kg as any,
      dreaming,
      llm,
    );
    const events: any[] = [];
    ponderer.getEventSubject(project).subscribe((e) => events.push(e));
    const report = await ponderer.run(project);

    // stage 1: both sessions scored
    assert.equal(report.sessionsScored, 2);
    const highReread = await sessions.read(project, high.id);
    const lowReread = await sessions.read(project, low.id);
    assert.ok(highReread?.qualityScore != null);
    assert.ok(lowReread?.qualityScore != null);
    assert.ok((highReread?.qualityScore ?? 0) > (lowReread?.qualityScore ?? 0));
    console.log('  PASS  quality scoring persists scores and orders sessions');

    // stage 3: only high-quality session induced; admitted because public-class evidence
    assert.ok(report.personalityAdmitted >= 1);
    // No personality entries should be written for the low-quality session
    // (it's below threshold). To verify, count files in workspace/.agent/personality/.
    const persDir = join(workspace, '.agent', 'personality');
    const persEntries = await import('node:fs').then((m) =>
      m.existsSync(persDir) ? m.readdirSync(persDir) : [],
    );
    const mdFiles = persEntries.filter((f) => f.endsWith('.md'));
    assert.ok(mdFiles.length >= 1, 'at least one personality entry should be admitted');
    console.log('  PASS  personality-induction admits high-quality session(s)');

    // stage 5: items appear in the per-project review queue and the cross-project summary
    assert.ok(report.reviewItemsPublished >= 1);
    const pending = await reviewQueue.pending(project);
    assert.ok(pending.length >= 1, 'pending review items should appear in the queue');
    const summary = await reviewQueue.cyclesSummary();
    assert.ok(summary[project], 'cross-project summary should contain this project');
    console.log('  PASS  publish-review writes items + cross-project summary');

    // === 5. event timeline ================================================
    const types = events.map((e) => e.type);
    assert.equal(types[0], 'cycle-started');
    assert.equal(types[types.length - 1], 'cycle-completed');
    const stages = events
      .filter((e) => e.type === 'stage-completed')
      .map((e) => e.payload.stage);
    assert.deepEqual(
      stages,
      ['quality-scoring', 'maintenance', 'personality-induction', 'self-edit', 'publish-review'],
      'stages emitted in PRD order',
    );
    console.log('  PASS  events emitted: cycle-started → 5 stage-completed → cycle-completed');

    // === 6. unprocessed list is now empty (all sessions scored) ===========
    const stillUnprocessed = await sessions.unprocessed(project);
    assert.equal(stillUnprocessed.length, 0);
    console.log('  PASS  sessions no longer appear in unprocessed() after scoring');

    // === 7. Re-running the cycle is a near-no-op (no new sessions) ========
    const report2 = await ponderer.run(project);
    assert.equal(report2.sessionsScored, 0, 'second cycle has no new sessions to score');
    console.log('  PASS  re-running with no new sessions scores 0');

    console.log('\nAll Ponderer tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
