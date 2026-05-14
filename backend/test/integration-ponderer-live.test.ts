/**
 * Integration test: end-to-end Ponderer cycle against live Quadstore (:7000).
 *
 * SKIPPED automatically when Quadstore is not running. Chroma is not used
 * here because the Ponderer's maintenance stage doesn't query RAG today —
 * the live-Chroma path is covered by integration-chroma-firewall.test.ts.
 *
 * Validates:
 *   - Opting a project in via AdaptiveMemoryConfigService.save activates it.
 *   - Seeding a session + entities, then running Ponderer.run, produces
 *     ReviewItems in the per-project queue.
 *   - PersonalityStore receives the admitted candidate from the live cycle.
 *   - The cross-project cycles.json is updated.
 *
 * Run with: tsx backend/test/integration-ponderer-live.test.ts
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

async function isQuadstoreUp(): Promise<boolean> {
  try {
    const r = await axios.get(`${QUADSTORE_URL}/health`, { timeout: 1500 });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await isQuadstoreUp())) {
    console.log(`SKIP integration-ponderer-live — Quadstore not reachable at ${QUADSTORE_URL}`);
    return;
  }
  console.log(`# Quadstore live at ${QUADSTORE_URL}`);

  const workspace = mkdtempSync(join(tmpdir(), 'int-pond-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = `int-pond-${randomUUID().slice(0, 8)}`;
  console.log(`# workspace: ${workspace}`);
  console.log(`# project: ${project}`);

  // Provision a minimal opted-in project layout.
  mkdirSync(join(workspace, project, '.etienne'), { recursive: true });
  const skillDir = join(workspace, project, '.claude', 'skills', 'dreaming');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---
description: Reflection skill
classificationContext: private
invocationTriggers: []
baselineTurns: 2
---
# Dreaming
`,
    'utf8',
  );
  // Wiki dir so the listPages call in maintenance doesn't blow up.
  mkdirSync(join(workspace, project, 'wiki', '_meta'), { recursive: true });
  writeFileSync(join(workspace, project, 'wiki', '_meta', 'mission.md'), '# m\n');

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
    const { KnowledgeGraphService } = await import(
      '../src/knowledge-graph/knowledge-graph.service'
    );
    const { RealKGAdapter } = await import('../src/adaptive-memory/adapters/real');

    const config = new AdaptiveMemoryConfigService();
    const sessions = new SessionsStore();
    const skills = new SkillsStore();
    const personality = new PersonalityStore();
    const reviewQueue = new ReviewQueueStore();
    const wiki = new WikiService();
    const kgService: any = new KnowledgeGraphService();
    await kgService.onModuleInit();
    const kgAdapter = new RealKGAdapter(kgService);

    // No-op LLM (self-edit won't run because there's no feedback yet).
    const llm = { generateTextWithMessages: async () => '' } as any;
    // Dreaming triggerRun stubbed — we test the Ponderer path, not the
    // strategy-mining pipeline itself.
    const dreaming = {
      triggerRun: async () => ({ runId: 'fake', enqueued: true }),
    } as any;

    // 1. Activate.
    await config.save(project, {});
    assert.equal(config.isActive(project), true);
    console.log('  PASS  project activated');

    // 2. Seed one high-quality session.
    const sess = await sessions.open(project, 'sess-int', { activeSkills: ['dreaming'] });
    await sessions.appendTurn(project, sess, { role: 'user', content: 'reflect', storeWrites: [] });
    await sessions.appendTurn(project, sess, {
      role: 'agent',
      content: 'done',
      storeWrites: [{ store: 'kg', entryId: 'walnut' }],
    });
    sess.workspaceSnapshotBefore = 'aaa';
    sess.workspaceSnapshotAfter = 'bbb';
    await sessions.close(project, sess);

    // 3. Seed a live KG entity that the maintenance stage will see.
    await kgAdapter.assertEntity(project, {
      id: 'walnut',
      type: 'Material',
      label: 'Walnut',
      attributes: {},
      classification: 'private',
      provenance: {
        sourceSessions: ['sess-int'],
        sourceEntries: [],
        createdBy: 'agent',
        createdAt: '2026-05-14T00:00:00Z',
        updatedAt: '2026-05-14T00:00:00Z',
      },
    });

    // 4. Run the Ponderer.
    const ponderer = new Ponderer(
      config,
      sessions,
      skills,
      personality,
      reviewQueue,
      wiki,
      kgAdapter as any,
      dreaming,
      llm,
    );
    const report = await ponderer.run(project);
    console.log(`  ⮕ report: ${JSON.stringify(report)}`);

    // 5. ReviewItems were published.
    assert.ok(report.reviewItemsPublished >= 1, 'Ponderer should publish at least one review item');
    const items = await reviewQueue.listByProject(project);
    assert.ok(items.length >= 1);
    console.log('  PASS  ReviewItems published to per-project JSONL');

    // 6. PersonalityStore received the admitted candidate.
    const persDir = join(workspace, '.agent', 'personality');
    const persIndexExists = existsSync(join(persDir, 'index.json'));
    assert.equal(persIndexExists, true, 'personality index.json should exist after admission');
    const persEntries = await personality.list();
    assert.ok(persEntries.length >= 1, `expected ≥1 admitted personality entry, got ${persEntries.length}`);
    console.log('  PASS  PersonalityStore received admitted entries (cross-project)');

    // 7. cycles.json updated.
    const summary = await reviewQueue.cyclesSummary();
    assert.ok(summary[project], 'cross-project cycles.json should include this project');
    assert.ok(summary[project].length >= 1);
    console.log('  PASS  cross-project cycles.json updated');

    // 8. Session no longer in unprocessed (was scored).
    const unprocessedAfter = await sessions.unprocessed(project);
    assert.equal(unprocessedAfter.length, 0);
    console.log('  PASS  session scored; unprocessed() now empty');

    console.log('\nAll live-services Ponderer integration tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
