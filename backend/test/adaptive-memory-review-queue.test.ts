/**
 * ReviewQueueStore tests.
 *
 * Validates:
 *   - publish() appends, listByProject() reflects the publish
 *   - setVerdict() tombstones override the published status (latest wins)
 *   - pending() filters down to items in the 'pending' state
 *   - cross-project cycles summary updates on publish AND on verdict
 *   - JSONL replay survives a corrupted line in the middle
 *   - mixed cycleIds in one publish call throws
 *
 * Run with: tsx test/adaptive-memory-review-queue.test.ts
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReviewItem } from '../src/memory/types';

const PROV = {
  sourceSessions: [],
  sourceEntries: [],
  createdBy: 'ponderer' as const,
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
  inferenceTag: 'tag:test',
};

function item(id: string, cycleId: string, kind: ReviewItem['kind']): ReviewItem {
  return {
    id,
    projectId: 'rq-proj',
    kind,
    summary: `summary for ${id}`,
    details: {},
    provenance: PROV,
    status: 'pending',
    cycleId,
  };
}

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'rq-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'rq-proj';
  mkdirSync(join(workspace, project, '.etienne'), { recursive: true });
  console.log(`# workspace: ${workspace}`);

  try {
    const { ReviewQueueStore } = await import(
      '../src/adaptive-memory/stores/review-queue.store'
    );
    const store = new ReviewQueueStore();

    // 1. publish() creates the jsonl and the cycle is visible in the summary.
    const cycle1 = 'cycle-1';
    const r = await store.publish(project, [
      item('a', cycle1, 'skill_diff'),
      item('b', cycle1, 'personality_proposal'),
      item('c', cycle1, 'contradiction_resolution'),
    ]);
    assert.equal(r.published, 3);
    assert.equal(r.cycleId, cycle1);

    const jsonl = join(workspace, project, '.etienne', 'adaptive-memory', 'review-queue.jsonl');
    assert.equal(existsSync(jsonl), true);
    console.log('  PASS  publish() writes JSONL');

    // 2. listByProject returns items in publish order, all pending.
    const items = await store.listByProject(project);
    assert.deepEqual(items.map((i) => i.id), ['a', 'b', 'c']);
    assert.ok(items.every((i) => i.status === 'pending'));
    console.log('  PASS  listByProject() in publish order, all pending');

    // 3. setVerdict overrides the published status.
    await store.setVerdict(project, 'a', 'good');
    await store.setVerdict(project, 'b', 'badly_reasoned');
    const afterVerdicts = await store.listByProject(project);
    assert.equal(afterVerdicts.find((i) => i.id === 'a')?.status, 'good');
    assert.equal(afterVerdicts.find((i) => i.id === 'b')?.status, 'badly_reasoned');
    assert.equal(afterVerdicts.find((i) => i.id === 'c')?.status, 'pending');
    console.log('  PASS  setVerdict() tombstones override published status (latest wins)');

    // 4. Latest verdict wins for repeated setVerdict calls.
    await store.setVerdict(project, 'a', 'unusable');
    const afterRevert = await store.listByProject(project);
    assert.equal(afterRevert.find((i) => i.id === 'a')?.status, 'unusable');
    console.log('  PASS  repeated setVerdict — latest wins');

    // 5. pending() returns only pending items.
    const pending = await store.pending(project);
    assert.deepEqual(pending.map((i) => i.id), ['c']);
    console.log('  PASS  pending() filters to status=pending');

    // 6. readByCycle limits to the requested cycle.
    const cycle2 = 'cycle-2';
    await store.publish(project, [item('d', cycle2, 'stale_data_flag')]);
    const byCycle1 = await store.readByCycle(project, cycle1);
    const byCycle2 = await store.readByCycle(project, cycle2);
    assert.deepEqual(byCycle1.map((i) => i.id).sort(), ['a', 'b', 'c']);
    assert.deepEqual(byCycle2.map((i) => i.id), ['d']);
    console.log('  PASS  readByCycle() partitions correctly');

    // 7. Cross-project cycles summary updated.
    const summary = await store.cyclesSummary();
    assert.ok(summary[project], 'cycles summary should include this project');
    const cycles = summary[project].map((c) => c.cycleId).sort();
    assert.deepEqual(cycles, ['cycle-1', 'cycle-2']);
    const c1Summary = summary[project].find((c) => c.cycleId === 'cycle-1');
    assert.ok(c1Summary);
    assert.equal(c1Summary.itemCount, 3);
    // After verdicts: a=unusable, b=badly_reasoned, c=pending
    assert.equal(c1Summary.verdicts.unusable, 1);
    assert.equal(c1Summary.verdicts.badly_reasoned, 1);
    assert.equal(c1Summary.verdicts.pending, 1);
    assert.equal(c1Summary.verdicts.good, 0);
    console.log('  PASS  cross-project cycles summary tracks per-cycle verdict tallies');

    // 8. JSONL replay tolerates a corrupted line.
    appendFileSync(jsonl, 'this is not valid json\n', 'utf8');
    const stillReadable = await store.listByProject(project);
    assert.equal(stillReadable.length, 4); // a,b,c,d preserved
    console.log('  PASS  JSONL replay skips malformed lines without aborting');

    // 9. Mixed cycleIds rejected.
    await assert.rejects(
      () =>
        store.publish(project, [
          item('x', 'cycle-X', 'skill_diff'),
          item('y', 'cycle-Y', 'skill_diff'),
        ]),
      /mixed cycleIds/,
    );
    console.log('  PASS  publish() rejects mixed cycleIds in a single call');

    // 10. Empty publish is a no-op.
    const empty = await store.publish(project, []);
    assert.equal(empty.published, 0);
    assert.equal(empty.cycleId, null);
    console.log('  PASS  publish([]) is a no-op');

    console.log('\nAll ReviewQueueStore tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
