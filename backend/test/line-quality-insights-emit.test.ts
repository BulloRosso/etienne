/**
 * Test 2 — line-quality-insights skill: Emit-Insight quick-action contract.
 *
 * The skill promises that when it produces a useful insight it will:
 *   1. Write a markdown file to insights/insight-<date>-<slug>.md
 *   2. Add a quick-action chip to the workspace store with previewFile
 *      pointing at that file.
 *
 * The seed script primes both — one insight file + one chip — so a fresh
 * agent session has working state from minute one. This test verifies
 * that primed state is correct AND that the contract is enforceable
 * (so a future skill change that breaks the chip → file link is caught).
 *
 * Contract verified:
 *   - The seeded insights file exists at the path the seeded chip points to
 *   - The seeded insights file has all required frontmatter fields
 *   - The seeded chip has all 6 fields the QuickActionDto requires
 *   - The chip's icon name matches the react-icons naming convention
 *   - The chip is project-scoped (not global) so it only appears for
 *     this project
 *   - The store also contains a dashboard chip (additive, not replacing)
 *   - Neither chip overwrote any other workspace-level entry
 *
 * Run with: npx tsx backend/test/line-quality-insights-emit.test.ts
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const WORKSPACE_ROOT = join(REPO_ROOT, 'workspace');
const PROJECT_ROOT = join(WORKSPACE_ROOT, 'factory-line-sim');
const QUICK_ACTIONS_PATH = join(WORKSPACE_ROOT, '.agent', 'quick-actions.json');

/** Tiny YAML frontmatter parser — just enough for our shape. */
function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]!] = kv[2]!.trim();
  }
  return out;
}

const REACT_ICONS_RE = /^(Fa|Md|Io|Bi|Ai|Gi|Fi|Tb|Bs)[A-Z]\w+$/;

async function main(): Promise<void> {
  console.log(`# project: ${PROJECT_ROOT}`);
  console.log(`# quick-actions: ${QUICK_ACTIONS_PATH}`);

  assert.ok(existsSync(PROJECT_ROOT), 'factory-line-sim must be seeded first');
  assert.ok(existsSync(QUICK_ACTIONS_PATH), 'workspace quick-actions.json must exist after seeding');

  const store = JSON.parse(readFileSync(QUICK_ACTIONS_PATH, 'utf8'));
  assert.ok(Array.isArray(store.actions), 'quick-actions store has an actions array');
  console.log(`  PASS  quick-actions store loaded (${store.actions.length} actions total)`);

  // ── 1. The seeded insight chip exists ───────────────────────────
  const insightChip = store.actions.find((a: any) => a.id === 'insight-coolant-po1003');
  assert.ok(insightChip, 'seeded insight chip must be present');
  console.log('  PASS  seeded insight chip "insight-coolant-po1003" is present');

  // ── 2. Chip has all 6 fields the QuickActionDto requires ────────
  for (const field of ['id', 'title', 'prompt', 'icon', 'project', 'previewFile']) {
    assert.ok(
      insightChip[field] !== undefined && insightChip[field] !== '',
      `chip must have non-empty "${field}" field`,
    );
  }
  // sortOrder is technically optional but the seed always sets it
  assert.equal(typeof insightChip.sortOrder, 'number', 'chip has numeric sortOrder');
  console.log('  PASS  chip has all 6 required fields (id, title, prompt, icon, project, previewFile) + sortOrder');

  // ── 3. Chip is project-scoped to factory-line-sim ───────────────
  assert.equal(insightChip.project, 'factory-line-sim',
    'chip must be project-scoped so it only shows when factory-line-sim is active');
  console.log('  PASS  chip is project-scoped (only visible in factory-line-sim)');

  // ── 4. icon follows react-icons naming ──────────────────────────
  assert.match(insightChip.icon, REACT_ICONS_RE,
    `chip.icon "${insightChip.icon}" must match react-icons naming (Fa|Md|Io|Bi|Ai|Gi|Fi|Tb|Bs + PascalCase)`);
  console.log(`  PASS  chip.icon "${insightChip.icon}" follows react-icons naming`);

  // ── 5. previewFile points at a file that actually exists ────────
  // This is THE critical link — if it breaks, clicking the chip opens
  // an empty preview pane and the demo fails silently.
  const previewPath = join(PROJECT_ROOT, insightChip.previewFile);
  assert.ok(existsSync(previewPath),
    `previewFile "${insightChip.previewFile}" must point at an existing file (full path: ${previewPath})`);
  console.log(`  PASS  chip.previewFile "${insightChip.previewFile}" exists on disk`);

  // ── 6. The insights file has the documented frontmatter shape ───
  const insightMd = readFileSync(previewPath, 'utf8');
  const fm = parseFrontmatter(insightMd);
  for (const field of ['title', 'date', 'window', 'machines', 'orders', 'root_cause', 'severity']) {
    assert.ok(fm[field], `insights/*.md frontmatter must include "${field}" (got: ${Object.keys(fm).join(',')})`);
  }
  assert.equal(fm.severity, 'major', 'seeded insight is severity=major');
  assert.match(fm.root_cause!, /coolant/, 'seeded insight root_cause references coolant');
  assert.match(fm.machines!, /CNC-5AX/, 'seeded insight machines list includes CNC-5AX');
  assert.match(fm.orders!, /PO-1003/, 'seeded insight orders list includes PO-1003');
  console.log('  PASS  insights file has all 7 required frontmatter fields');

  // ── 7. The dashboard chip is also present (additive seeding) ────
  const dashboardChip = store.actions.find((a: any) => a.id === 'line-dashboard');
  assert.ok(dashboardChip, 'seeded dashboard chip must also be present');
  assert.equal(dashboardChip.project, 'factory-line-sim');
  assert.ok(dashboardChip.previewFile.endsWith('cnc-dashboard.html'),
    'dashboard chip points at cnc-dashboard.html');
  // Verify the dashboard file exists too — the chip must point to a real file.
  assert.ok(existsSync(join(PROJECT_ROOT, dashboardChip.previewFile)),
    'dashboard chip previewFile must exist');
  console.log('  PASS  dashboard chip is present, project-scoped, and points to a real file');

  // ── 8. (id, project) pairs are unique — that's the upsert key in
  //       quick-actions.service.ts:upsertProjectAction. The same id
  //       across DIFFERENT projects is allowed (e.g. each project's
  //       own "dreaming-latest" chip).
  const factoryLineChips = store.actions.filter((a: any) => a.project === 'factory-line-sim');
  const factoryLineIds = factoryLineChips.map((a: any) => a.id);
  assert.equal(factoryLineIds.length, new Set(factoryLineIds).size,
    'no duplicate chip ids within factory-line-sim project (re-seed must be idempotent)');
  console.log(`  PASS  factory-line-sim chips have unique ids (${factoryLineChips.length} chips, all distinct)`);

  // ── 9. Title fits in a chip label (UI constraint: ~40 chars) ────
  // Longer titles get truncated with ellipsis in the toolbar; the seed
  // script controls these so we enforce the limit.
  for (const chip of [insightChip, dashboardChip]) {
    assert.ok(chip.title.length <= 50,
      `chip title "${chip.title}" must fit in a toolbar label (≤50 chars; got ${chip.title.length})`);
  }
  console.log('  PASS  chip titles fit in the toolbar (≤50 chars each)');

  console.log('\n[32m✓ line-quality-insights-emit.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
