/**
 * SkillsStore integration test.
 *
 * Run with: tsx test/adaptive-memory-skills-store.test.ts
 *
 * Validates:
 *   - get() parses frontmatter into the PRD SkillFrontmatter shape
 *   - first read records originalHash; subsequent reads preserve it
 *   - write() updates currentHash while preserving originalHash
 *   - write() persists across stores (cross-project state file)
 *   - list() returns provisioned skills
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'sk-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'sk-proj';
  const skillName = 'dreaming';
  const skillDir = join(workspace, project, '.claude', 'skills', skillName);
  mkdirSync(skillDir, { recursive: true });
  const skillFile = join(skillDir, 'SKILL.md');
  const seedBody = '# Dreaming\n\nOriginal body content.\n';
  const seedFrontmatter = `---
description: Original dreaming description
classificationContext: private
invocationTriggers:
  - dream
  - reflect
sourcePriorities:
  - store: wiki
    priority: 1
  - store: kg
    priority: 2
---
`;
  writeFileSync(skillFile, seedFrontmatter + seedBody, 'utf8');
  console.log(`# workspace: ${workspace}`);

  try {
    const { SkillsStore } = await import('../src/adaptive-memory/stores/skills.store');
    const store = new SkillsStore();

    // 1. get() returns a Skill with the parsed frontmatter and matching hashes.
    const first = await store.get(project, skillName);
    assert.ok(first);
    assert.equal(first.name, skillName);
    assert.equal(first.frontmatter.description, 'Original dreaming description');
    assert.equal(first.frontmatter.classificationContext, 'private');
    assert.deepEqual(first.frontmatter.invocationTriggers, ['dream', 'reflect']);
    assert.deepEqual(first.frontmatter.sourcePriorities, [
      { store: 'wiki', priority: 1 },
      { store: 'kg', priority: 2 },
    ]);
    // On first read, currentHash == originalHash.
    assert.equal(first.currentHash, first.originalHash);
    const originalHash = first.originalHash;
    console.log('  PASS  get() parses frontmatter and records originalHash on first read');

    // 2. State file is created at the documented path.
    const statePath = join(workspace, '.agent', 'adaptive-memory', 'skills.state.json');
    assert.equal(existsSync(statePath), true);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state[skillName].originalHash, originalHash);
    console.log('  PASS  state file persisted at workspace/.agent/adaptive-memory/');

    // 3. Subsequent reads return the same originalHash.
    const second = await store.get(project, skillName);
    assert.equal(second?.originalHash, originalHash);
    console.log('  PASS  subsequent get() preserves originalHash');

    // 4. write() updates currentHash and preserves originalHash.
    const updated = await store.write(project, {
      ...second!,
      body: '# Dreaming\n\nUPDATED body content.\n',
    });
    assert.equal(updated.originalHash, originalHash, 'originalHash must survive a write');
    assert.notEqual(updated.currentHash, originalHash, 'currentHash must change after a write');
    console.log('  PASS  write() updates currentHash and preserves originalHash');

    // 5. The file on disk now contains the new body, frontmatter intact.
    const afterWrite = readFileSync(skillFile, 'utf8');
    assert.ok(afterWrite.includes('UPDATED body content.'));
    assert.ok(
      afterWrite.includes('description: Original dreaming description'),
      'frontmatter should round-trip through write()',
    );
    assert.ok(afterWrite.startsWith('---\n'), 'YAML fence preserved');
    console.log('  PASS  write() persists new body with frontmatter intact');

    // 6. A fresh get() sees the new body and the same originalHash.
    const third = await store.get(project, skillName);
    assert.ok(third);
    assert.ok(third.body.includes('UPDATED body content.'));
    assert.equal(third.originalHash, originalHash);
    assert.equal(third.currentHash, updated.currentHash);
    console.log('  PASS  fresh get() reflects new body but stable originalHash');

    // 7. list() returns the provisioned skill name.
    const skills = await store.list(project);
    assert.deepEqual(skills, [skillName]);
    console.log('  PASS  list() enumerates provisioned skill directories');

    // 8. byIds drops missing skills silently.
    const found = await store.byIds(project, [skillName, 'nope']);
    assert.equal(found.length, 1);
    assert.equal(found[0].name, skillName);
    console.log('  PASS  byIds() drops unknown skill names');

    // 9. Skills with no frontmatter get sensible defaults.
    const minDir = join(workspace, project, '.claude', 'skills', 'minimal');
    mkdirSync(minDir, { recursive: true });
    writeFileSync(join(minDir, 'SKILL.md'), '# Minimal\n\nNo frontmatter.\n', 'utf8');
    const min = await store.get(project, 'minimal');
    assert.ok(min);
    assert.equal(min.frontmatter.description, 'Skill: minimal');
    assert.equal(min.frontmatter.classificationContext, 'private');
    assert.deepEqual(min.frontmatter.invocationTriggers, []);
    console.log('  PASS  skills without frontmatter get conservative defaults');

    // 10. resetOriginalHash baselines the diff to the current file content.
    await store.resetOriginalHash(project, skillName);
    const afterReset = await store.get(project, skillName);
    assert.equal(afterReset?.originalHash, afterReset?.currentHash);
    console.log('  PASS  resetOriginalHash() rebaselines the diff');

    console.log('\nAll SkillsStore tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
