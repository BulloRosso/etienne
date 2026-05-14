/**
 * Quality-scoring tests (PRD §6.1).
 *
 * Validates the contract: a single-turn session with a workspace change
 * scores high; the same workspace change after many corrective user turns
 * scores low. The Ponderer relies on this ordering to decide which sessions
 * feed personality induction.
 *
 * Run with: tsx test/adaptive-memory-quality-scoring.test.ts
 */

import { strict as assert } from 'node:assert';
import { scoreSession } from '../src/adaptive-memory/stages/quality-scoring';
import type { SessionRecord, Skill, SessionTurn } from '../src/memory/types';

const SKILLS_NONE: Skill[] = [];

function skill(name: string, baselineTurns?: number): Skill {
  return {
    id: name,
    name,
    body: `# ${name}`,
    frontmatter: {
      description: '',
      sourcePriorities: [],
      classificationContext: 'private',
      invocationTriggers: [],
      ...(baselineTurns !== undefined ? { baselineTurns } : {}),
    },
    originalHash: 'h0',
    currentHash: 'h0',
  };
}

function session(args: {
  turns: Array<Partial<SessionTurn> & { role: SessionTurn['role']; content: string }>;
  workspaceSnapshotBefore?: string;
  workspaceSnapshotAfter?: string;
}): SessionRecord {
  return {
    id: 's',
    projectId: 'p',
    startedAt: '2026-05-14T00:00:00Z',
    endedAt: '2026-05-14T00:10:00Z',
    activeSkills: [],
    workspaceSnapshotBefore: args.workspaceSnapshotBefore ?? '',
    workspaceSnapshotAfter: args.workspaceSnapshotAfter ?? '',
    turns: args.turns.map((t) => ({
      role: t.role,
      content: t.content,
      storeWrites: t.storeWrites ?? [],
    })),
  };
}

let failures = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

function main(): void {
  console.log('\n# baseline contract');
  test('one-turn success with git change → high score', () => {
    const s = session({
      turns: [
        { role: 'user', content: 'add a wiki page about walnut' },
        { role: 'agent', content: 'done', storeWrites: [{ store: 'wiki', entryId: 'walnut' }] },
      ],
      workspaceSnapshotBefore: 'abc111',
      workspaceSnapshotAfter: 'def222',
    });
    const r = scoreSession({ session: s, activeSkills: SKILLS_NONE });
    assert.equal(r.userCorrectionTurns, 0);
    assert.equal(r.agentRetryTurns, 0);
    assert.equal(r.workspaceMatch, 1);
    assert.ok(r.score >= 0.5, `expected high; got ${r.score}`);
    assert.ok(r.score <= 1);
  });

  test('repeated user corrections drive score down', () => {
    const s = session({
      turns: [
        { role: 'user', content: 'do thing' },
        { role: 'agent', content: 'attempt 1' },
        { role: 'user', content: 'no, wrong, try again' },
        { role: 'agent', content: 'attempt 2' },
        { role: 'user', content: 'actually that is not what I meant' },
        { role: 'agent', content: 'attempt 3', storeWrites: [{ store: 'wiki', entryId: 'walnut' }] },
        { role: 'user', content: 'undo that, instead do X' },
      ],
      workspaceSnapshotBefore: 'abc111',
      workspaceSnapshotAfter: 'def222',
    });
    const r = scoreSession({ session: s, activeSkills: SKILLS_NONE });
    assert.equal(r.workspaceMatch, 1);
    assert.ok(r.userCorrectionTurns >= 3, `expected ≥3 corrections; got ${r.userCorrectionTurns}`);
    // Same workspace change but many corrections → lower than the clean run.
    const cleanScore = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'done', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'abc111',
        workspaceSnapshotAfter: 'def222',
      }),
      activeSkills: SKILLS_NONE,
    }).score;
    assert.ok(r.score < cleanScore, `corrective run (${r.score}) should score below clean run (${cleanScore})`);
  });

  test('agent retry hints lower the score', () => {
    const withRetries = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'let me try again, retrying' },
          { role: 'agent', content: 'trying again', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'abc111',
        workspaceSnapshotAfter: 'def222',
      }),
      activeSkills: SKILLS_NONE,
    });
    const without = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'done', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'abc111',
        workspaceSnapshotAfter: 'def222',
      }),
      activeSkills: SKILLS_NONE,
    });
    assert.ok(withRetries.score < without.score);
  });

  console.log('\n# workspace match heuristics');
  test('identical git refs → low workspace match (no change happened)', () => {
    const r = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'done' },
        ],
        workspaceSnapshotBefore: 'abc111',
        workspaceSnapshotAfter: 'abc111',
      }),
      activeSkills: SKILLS_NONE,
    });
    assert.equal(r.workspaceMatch, 0.2);
  });

  test('nogit snapshots with no writeback → 0.5 (uncertain)', () => {
    const r = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'hello' },
          { role: 'agent', content: 'hi' },
        ],
        workspaceSnapshotBefore: 'nogit:2026-01-01T00:00:00Z',
        workspaceSnapshotAfter: 'nogit:2026-01-01T00:00:00Z',
      }),
      activeSkills: SKILLS_NONE,
    });
    assert.equal(r.workspaceMatch, 0.5);
  });

  test('nogit snapshots WITH at least one writeback → 1.0', () => {
    const r = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'hello' },
          { role: 'agent', content: 'hi', storeWrites: [{ store: 'wiki', entryId: 'page' }] },
        ],
        workspaceSnapshotBefore: 'nogit:2026-01-01T00:00:00Z',
        workspaceSnapshotAfter: 'nogit:2026-01-01T00:00:00Z',
      }),
      activeSkills: SKILLS_NONE,
    });
    assert.equal(r.workspaceMatch, 1.0);
  });

  console.log('\n# baselineTurns');
  test('uses default baseline when no active skills', () => {
    const r = scoreSession({
      session: session({ turns: [], workspaceSnapshotBefore: 'a', workspaceSnapshotAfter: 'b' }),
      activeSkills: SKILLS_NONE,
    });
    assert.equal(r.baselineTurns, 3);
  });

  test('averages baselineTurns across active skills', () => {
    const r = scoreSession({
      session: session({ turns: [], workspaceSnapshotBefore: 'a', workspaceSnapshotAfter: 'b' }),
      activeSkills: [skill('s1', 2), skill('s2', 6)],
    });
    assert.equal(r.baselineTurns, 4);
  });

  test('falls back to default when no skill supplies baselineTurns', () => {
    const r = scoreSession({
      session: session({ turns: [], workspaceSnapshotBefore: 'a', workspaceSnapshotAfter: 'b' }),
      activeSkills: [skill('s1'), skill('s2')],
    });
    assert.equal(r.baselineTurns, 3);
  });

  console.log('\n# ordering contract (the PRD-critical property)');
  test('a curated set: clean > corrective > retry-spam, with the same workspace change', () => {
    const clean = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'done', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'a',
        workspaceSnapshotAfter: 'b',
      }),
      activeSkills: SKILLS_NONE,
    }).score;
    const corrective = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'attempt 1' },
          { role: 'user', content: 'no, wrong' },
          { role: 'agent', content: 'attempt 2', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'a',
        workspaceSnapshotAfter: 'b',
      }),
      activeSkills: SKILLS_NONE,
    }).score;
    const retrySpam = scoreSession({
      session: session({
        turns: [
          { role: 'user', content: 'do thing' },
          { role: 'agent', content: 'retry once' },
          { role: 'agent', content: 'trying again' },
          { role: 'agent', content: 'let me try', storeWrites: [{ store: 'wiki', entryId: 'x' }] },
        ],
        workspaceSnapshotBefore: 'a',
        workspaceSnapshotAfter: 'b',
      }),
      activeSkills: SKILLS_NONE,
    }).score;
    assert.ok(clean > corrective, `clean(${clean}) > corrective(${corrective})`);
    assert.ok(corrective > retrySpam || corrective === retrySpam, `corrective(${corrective}) >= retrySpam(${retrySpam})`);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll quality-scoring tests passed.');
}

main();
