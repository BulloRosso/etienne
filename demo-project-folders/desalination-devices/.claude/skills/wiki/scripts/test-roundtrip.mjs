// Smoke test: wiki-add (with classification/provenance) + wiki-delete (soft tombstone).
//
// The wiki skill is intended to run from a provisioned per-project copy (which
// has node_modules with gray-matter). We exercise the central source by:
//   1. Building a temp workspace with `wiki/_meta/mission.md`.
//   2. Copying the central scripts/ into a sibling .claude/skills/wiki/ inside
//      the workspace and reusing the gray-matter node_modules from the
//      provisioned wiki-test project (symlink on POSIX, copy on Windows).
//   3. Running the .ts scripts via `tsx` invoked from the workspace cwd.
//
// Exits non-zero on assertion failure. Quiet on success.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const centralSkillRoot = join(__dirname, '..');
const provisionedSkill = join(
  __dirname, '..', '..', '..', '..', 'workspace', 'wiki-test', '.claude', 'skills', 'wiki',
);
const provisionedNodeModules = join(provisionedSkill, 'node_modules');

if (!existsSync(provisionedNodeModules)) {
  console.error(`required: ${provisionedNodeModules}\n(run npm install in that skill first, or provision wiki to wiki-test)`);
  process.exit(2);
}

const workspace = mkdtempSync(join(tmpdir(), 'wiki-test-'));
const wikiRoot = join(workspace, 'wiki');
mkdirSync(join(wikiRoot, '_meta'), { recursive: true });
writeFileSync(join(wikiRoot, '_meta', 'mission.md'), '# Test mission\n', 'utf8');

const skillTarget = join(workspace, '.claude', 'skills', 'wiki');
mkdirSync(skillTarget, { recursive: true });
cpSync(join(centralSkillRoot, 'scripts'), join(skillTarget, 'scripts'), { recursive: true });
cpSync(join(centralSkillRoot, 'package.json'), join(skillTarget, 'package.json'));
// Reuse the provisioned project's node_modules (cheaper than reinstalling).
if (platform() === 'win32') {
  cpSync(provisionedNodeModules, join(skillTarget, 'node_modules'), { recursive: true });
} else {
  symlinkSync(provisionedNodeModules, join(skillTarget, 'node_modules'), 'dir');
}

const wikiAdd = join(skillTarget, 'scripts', 'wiki-add.ts');
const wikiDelete = join(skillTarget, 'scripts', 'wiki-delete.ts');

const provenance = {
  sourceSessions: ['sess-1'],
  sourceEntries: ['entry-1'],
  createdBy: 'agent',
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
  inferenceTag: 'tag:test',
};
const inputPath = join(workspace, 'page.json');
writeFileSync(inputPath, JSON.stringify({
  title: 'Adaptive Memory Test Page',
  body: '# Body\n\nSome content.\n',
  sources: [{ kind: 'conversation', turn: '2026-05-14T00:00:00Z', note: 'manual' }],
  mode: 'create',
  classification: 'private',
  provenance,
  tags: ['test'],
}, null, 2), 'utf8');

console.log(`# workspace: ${workspace}`);

function run(label, args, cwd) {
  console.log(`  exec  ${label}: tsx ${args.join(' ')}`);
  // shell:true so Windows resolves npx.cmd; quoted args so spaces survive.
  const out = execFileSync('npx', ['tsx', ...args.map((a) => `"${a}"`)], {
    cwd, encoding: 'utf8', shell: true,
  });
  return JSON.parse(out);
}

// 1. wiki-add with classification + provenance
const addResult = run('wiki-add', [wikiAdd, '--input', inputPath], workspace);
assert.equal(addResult.ok, true, 'wiki-add should succeed');
assert.equal(addResult.bucket, 'topics');
assert.equal(addResult.slug, 'adaptive-memory-test-page');

const pagePath = join(workspace, addResult.path);
const pageText = readFileSync(pagePath, 'utf8');
assert.ok(pageText.includes('classification: private'), 'page should persist classification');
assert.ok(pageText.includes('createdBy: agent'), 'page should persist provenance.createdBy');
// YAML serializer quotes strings containing colons; accept either form.
assert.ok(
  pageText.includes('inferenceTag: tag:test') || pageText.includes("inferenceTag: 'tag:test'"),
  'page should persist provenance.inferenceTag',
);
console.log('  PASS  wiki-add persists classification + provenance');

// 2. wiki-delete soft-deletes
const delResult = run('wiki-delete', [wikiDelete, '--slug', addResult.slug, '--reason', 'test cleanup'], workspace);
assert.equal(delResult.ok, true, 'wiki-delete should succeed');
assert.ok(delResult.redirectsEntry?.includes('test cleanup'));

const afterDelete = readFileSync(pagePath, 'utf8');
assert.ok(afterDelete.includes('status: deleted'), 'page should be marked status: deleted after wiki-delete');
console.log('  PASS  wiki-delete marks page status: deleted');

const redirects = readFileSync(join(wikiRoot, '_meta', 'redirects.md'), 'utf8');
assert.ok(redirects.includes(`topics/${addResult.slug}`), 'redirects.md should record the tombstone');
console.log('  PASS  wiki-delete appends redirects.md entry');

// 3. wiki-delete is idempotent
const delAgain = run('wiki-delete', [wikiDelete, '--slug', addResult.slug], workspace);
assert.equal(delAgain.ok, true);
assert.equal(delAgain.noop, true, 'second wiki-delete should be a no-op');
console.log('  PASS  wiki-delete is idempotent');

// Cleanup
rmSync(workspace, { recursive: true, force: true });
console.log('\nAll wiki-skill smoke tests passed.');
