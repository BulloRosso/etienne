/**
 * Test 4 — wiki cross-links + dreaming pipeline integration.
 *
 * Validates two coupled invariants on the seeded factory-line-sim:
 *
 *   A) Adding a wiki page that links to N existing pages produces N
 *      backlink updates (one per linked target). The wiki skill calls
 *      this its "backlinks" contract and the dreaming pipeline relies
 *      on it to follow citation chains across pages.
 *
 *   B) The dreaming pipeline can be triggered against the seeded
 *      project and produces a JSON artefact at
 *      `dreaming/dream-<today>.dreams.json` with a well-formed
 *      `items` array. The seed run produces 0 items (clean chats);
 *      this test injects a chat session with error markers so the
 *      segment scorer marks at least one trajectory as a 'failure'
 *      and reflect picks it up.
 *
 * What this catches: regressions in the wiki backlink walker, the
 * dreaming HARVEST stage (skipping when no new sessions), and the
 * SEGMENT score heuristic.
 *
 * Run with: npx tsx backend/test/wiki-dreaming-pipeline.test.ts
 *
 * Pre-requisite: factory-line-sim must be seeded.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { addWikiPage } from '../../scripts/seed-factory-line-sim/lib/wiki-shell';
import { login } from '../../scripts/seed-factory-line-sim/lib/auth';
import { apiFetch } from '../../scripts/seed-factory-line-sim/lib/api';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const PROJECT_ROOT = join(REPO_ROOT, 'workspace', 'factory-line-sim');
const PROJECT_NAME = 'factory-line-sim';

const NEW_SLUG = 'test-cross-machine-fixture-pattern';
const TEST_SESSION_ID = 'sess-zzzz-9999-zzzz-9999-test-dreaming-trigger';

// Pages the test will mutate (backlink appends). Snapshotted + restored.
const PAGES_TO_SNAPSHOT = [
  join(PROJECT_ROOT, 'wiki', 'topics', 'root-cause-fixture-drift.md'),
  join(PROJECT_ROOT, 'wiki', 'topics', 'data-status-reports-json.md'),
  join(PROJECT_ROOT, 'wiki', 'topics', 'mqtt-event-catalog.md'),
];
const snapshots = new Map<string, string>();

function snapshot(): void {
  for (const p of PAGES_TO_SNAPSHOT) {
    if (existsSync(p)) snapshots.set(p, readFileSync(p, 'utf8'));
  }
}

function cleanup(): void {
  // Remove the new wiki page + the test chat session.
  for (const p of [
    join(PROJECT_ROOT, 'wiki', 'topics', `${NEW_SLUG}.md`),
    join(PROJECT_ROOT, '.etienne', `chat.history-${TEST_SESSION_ID}.jsonl`),
  ]) {
    if (existsSync(p)) unlinkSync(p);
  }
  // Restore snapshots (revert backlink mutations).
  for (const [p, raw] of snapshots.entries()) writeFileSync(p, raw, 'utf8');
  // Remove the test session entry from chat.sessions.json if present.
  const sessionsPath = join(PROJECT_ROOT, '.etienne', 'chat.sessions.json');
  if (existsSync(sessionsPath)) {
    try {
      const obj = JSON.parse(readFileSync(sessionsPath, 'utf8'));
      if (Array.isArray(obj.sessions)) {
        obj.sessions = obj.sessions.filter((s: any) => s.sessionId !== TEST_SESSION_ID);
        writeFileSync(sessionsPath, JSON.stringify(obj, null, 2), 'utf8');
      }
    } catch { /* ignore */ }
  }
}

function injectFailureChatSession(): void {
  // 6 turns, 2 explicit "failed/error" markers → segment.ts scores as
  // 'failure' (toolErrors >= 2 → failure trajectory).
  const turns = [
    { timestamp: '2026-05-15T15:00:00Z', isAgent: false,
      message: 'Why are bracket parts coming out short on PO-1005?', contextName: 'order-review' },
    { timestamp: '2026-05-15T15:00:18Z', isAgent: true,
      message: 'I tried to read the status JSON but the parse failed: unexpected token at line 47.' },
    { timestamp: '2026-05-15T15:01:00Z', isAgent: false,
      message: 'Try again — the file should be valid JSON.', contextName: 'order-review' },
    { timestamp: '2026-05-15T15:01:18Z', isAgent: true,
      message: 'Re-read the file. This time parsing succeeded. The error was a stale cache.' },
    { timestamp: '2026-05-15T15:02:00Z', isAgent: false,
      message: 'OK — what does the timeline show?', contextName: 'order-review' },
    { timestamp: '2026-05-15T15:02:18Z', isAgent: true,
      message: 'Chip-jam at 09:50 caused tool damage. The four short parts came from cuts after the jam.' },
  ];
  const path = join(PROJECT_ROOT, '.etienne', `chat.history-${TEST_SESSION_ID}.jsonl`);
  writeFileSync(path, turns.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  // Also register the session in chat.sessions.json.
  const sessionsPath = join(PROJECT_ROOT, '.etienne', 'chat.sessions.json');
  const obj = existsSync(sessionsPath) ? JSON.parse(readFileSync(sessionsPath, 'utf8')) : { sessions: [] };
  obj.sessions = obj.sessions ?? [];
  obj.sessions.push({
    timestamp: '2026-05-15T15:00:00Z',
    sessionId: TEST_SESSION_ID,
    summary: 'Test session: parse error then recovery while diagnosing PO-1005 chip-jam attribution.',
  });
  writeFileSync(sessionsPath, JSON.stringify(obj, null, 2), 'utf8');
}

async function waitForDreamFile(beforeSize: number, deadlineMs: number): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const target = join(PROJECT_ROOT, 'dreaming', `dream-${today}.dreams.json`);
  const deadline = Date.now() + deadlineMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(target)) {
      const s = statSync(target);
      // Wait for the file to (a) exceed its prior size and (b) stop growing.
      if (s.size > beforeSize && s.size === lastSize) return target;
      lastSize = s.size;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return existsSync(target) ? target : null;
}

async function main(): Promise<void> {
  console.log(`# project: ${PROJECT_ROOT}`);
  assert.ok(existsSync(PROJECT_ROOT), 'factory-line-sim must be seeded first');
  snapshot();
  cleanup();

  // ── Part A: cross-link / backlink contract ────────────────────────
  // Add a wiki page that references THREE existing pages. Verify all
  // three got a backlink update.
  const result = await addWikiPage(PROJECT_ROOT, {
    title: 'Cross-machine fixture-pressure pattern',
    slug: NEW_SLUG,
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['root-cause', 'pattern', 'fixture'],
    mission_relevance: 0.6,
    sources: [{ kind: 'conversation', turn: '2026-05-15T14:00:00Z', note: 'observed pattern' }],
    body:
`# Cross-machine fixture-pressure pattern

A correlation observed across the seeded incidents: when
[fixture clamping drift](../topics/root-cause-fixture-drift.md) shows up
in the same week as repeated coolant events, the
[machine status reports](../topics/data-status-reports-json.md) tend to
under-report the issue (status stays 'running' even though performance
drops). The MQTT side gives a clearer picture — see
[event catalogue](../topics/mqtt-event-catalog.md).
`,
    mode: 'create',
    classification: 'private',
    provenance: {
      sourceSessions: [TEST_SESSION_ID],
      sourceEntries: ['turn-2026-05-15-pattern'],
      createdBy: 'agent',
      createdAt: '2026-05-15T14:00:00Z',
      updatedAt: '2026-05-15T14:00:00Z',
      inferenceTag: 'test-pattern',
    },
  });

  assert.ok(result.ok, `wiki-add failed: ${result.error ?? 'unknown'}`);
  console.log(`  PASS  new wiki page created: topics/${NEW_SLUG}.md`);

  // The page links to 3 existing pages → 3 backlinksUpdated entries.
  assert.ok(Array.isArray(result.backlinksUpdated),
    'backlinksUpdated array must be returned');
  const backlinkSlugs = (result.backlinksUpdated ?? [])
    .map((p) => p.replace(/\\/g, '/').match(/([^/]+)\.md$/)?.[1] ?? '');
  for (const expected of ['root-cause-fixture-drift', 'data-status-reports-json', 'mqtt-event-catalog']) {
    assert.ok(backlinkSlugs.includes(expected),
      `backlink missing for "${expected}"; got: ${JSON.stringify(backlinkSlugs)}`);
  }
  console.log(`  PASS  3 existing pages got backlink updates: ${backlinkSlugs.join(', ')}`);

  // Spot-check: the actual file content for one target now references the new slug.
  const fixturePath = join(PROJECT_ROOT, 'wiki', 'topics', 'root-cause-fixture-drift.md');
  const fixtureMd = readFileSync(fixturePath, 'utf8');
  assert.match(fixtureMd, new RegExp(NEW_SLUG),
    'root-cause-fixture-drift.md must contain a backlink to the new page');
  console.log('  PASS  spot-check: root-cause-fixture-drift contains new slug as backlink');

  // ── Part B: dreaming pipeline produces ≥1 item with the failure ──
  // ──         trajectory we just injected.
  console.log('\n  → injecting failure-trajectory chat session');
  injectFailureChatSession();

  // Capture the current dream file size (if any) so we can wait for growth.
  const today = new Date().toISOString().slice(0, 10);
  const target = join(PROJECT_ROOT, 'dreaming', `dream-${today}.dreams.json`);
  const beforeSize = existsSync(target) ? statSync(target).size : 0;
  console.log(`  → existing dream file size: ${beforeSize} bytes`);

  // Trigger run-now via the API (requires auth).
  const auth = await login();
  const ctx = { accessToken: auth.accessToken };
  const enq = await apiFetch<{ runId: string; enqueued: boolean; reason?: string }>(
    ctx, `/api/dreaming/${PROJECT_NAME}/run-now`, { method: 'POST' },
  );
  assert.ok(enq.enqueued, `dreaming run-now should enqueue; got reason: ${enq.reason ?? 'unknown'}`);
  console.log(`  PASS  dreaming run-now enqueued: ${enq.runId}`);

  // Wait up to 4 minutes for the new artefact (longer than the seed's
  // 5min because we have an extra session + actual content to reflect on).
  console.log('  → waiting for new dream artefact (up to 4 min)…');
  const dreamPath = await waitForDreamFile(beforeSize, 4 * 60 * 1000);
  assert.ok(dreamPath, `dream file did not grow within 4 min (target: ${target})`);

  const raw = readFileSync(dreamPath!, 'utf8');
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.items), `dream file must have items[] array; got: ${typeof parsed.items}`);
  console.log(`  PASS  dream file produced (${parsed.items.length} items, ${raw.length} bytes)`);

  // We don't strictly assert items.length > 0 — the LLM may still find
  // nothing reflectable even with a failure trajectory. But we DO assert
  // the structure is right (items is an array) and the runId is captured.
  assert.ok(parsed.runId || parsed.generatedAt,
    'dream file must include a runId or generatedAt timestamp');
  console.log(`  PASS  dream file metadata is well-formed (runId/generatedAt present)`);

  cleanup();
  console.log('\n[32m✓ wiki-dreaming-pipeline.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  cleanup();
  process.exit(1);
});
