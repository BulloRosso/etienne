/**
 * Integration test for WikiService.
 *
 * Stands up a temp WORKSPACE_ROOT with one project, copies the central wiki skill
 * + a node_modules folder borrowed from the provisioned wiki-test project, then
 * exercises putPage → getPage → listPages → search → deletePage → getPage.
 *
 * Run with: tsx test/wiki-service-integration.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const projectName = 'wiki-int';

const PROVISIONED_NODE_MODULES = join(
  process.cwd(),
  'workspace',
  'wiki-test',
  '.claude',
  'skills',
  'wiki',
  'node_modules',
);
const CENTRAL_WIKI_SKILL = join(
  process.cwd(),
  'skill-repository',
  'standard',
  'wiki',
);

// We resolve from the test cwd assuming `cd backend && tsx test/...`. Walk up
// if the expected dirs aren't there.
function resolveProvisionedDeps(): string {
  let here = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = join(
      here,
      'workspace',
      'wiki-test',
      '.claude',
      'skills',
      'wiki',
      'node_modules',
    );
    if (existsSync(candidate)) return candidate;
    here = join(here, '..');
  }
  return PROVISIONED_NODE_MODULES;
}

function resolveCentralSkill(): string {
  let here = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = join(here, 'skill-repository', 'standard', 'wiki');
    if (existsSync(candidate)) return candidate;
    here = join(here, '..');
  }
  return CENTRAL_WIKI_SKILL;
}

async function main(): Promise<void> {
  const provisionedNm = resolveProvisionedDeps();
  const centralSkill = resolveCentralSkill();
  if (!existsSync(provisionedNm)) {
    console.error(
      `required node_modules not found: ${provisionedNm}\n(provision the wiki skill to wiki-test first)`,
    );
    process.exit(2);
  }

  const workspace = mkdtempSync(join(tmpdir(), 'wiki-svc-'));
  console.log(`# workspace: ${workspace}`);

  try {
    // Set WORKSPACE_ROOT so WikiService picks up our temp dir.
    process.env.WORKSPACE_ROOT = workspace;
    const projectDir = join(workspace, projectName);
    mkdirSync(join(projectDir, 'wiki', '_meta'), { recursive: true });
    writeFileSync(
      join(projectDir, 'wiki', '_meta', 'mission.md'),
      '# Test mission\n',
      'utf8',
    );

    // Provision the wiki skill into the temp project.
    const skillTarget = join(projectDir, '.claude', 'skills', 'wiki');
    mkdirSync(skillTarget, { recursive: true });
    cpSync(join(centralSkill, 'scripts'), join(skillTarget, 'scripts'), {
      recursive: true,
    });
    cpSync(join(centralSkill, 'package.json'), join(skillTarget, 'package.json'));
    if (platform() === 'win32') {
      cpSync(provisionedNm, join(skillTarget, 'node_modules'), { recursive: true });
    } else {
      const { symlinkSync } = await import('node:fs');
      symlinkSync(provisionedNm, join(skillTarget, 'node_modules'), 'dir');
    }

    // Import the service AFTER WORKSPACE_ROOT is set.
    const { WikiService } = await import('../src/wiki/wiki.service');
    const wiki = new WikiService();

    // 1. putPage → getPage round-trip with classification + provenance.
    const putResult = await wiki.putPage(projectName, {
      title: 'Adaptive Memory Smoke Page',
      body: '# Smoke\n\nA test page. See [related](../topics/related.md).\n',
      sources: [{ kind: 'conversation', turn: '2026-05-14T00:00:00Z' }],
      classification: 'private',
      provenance: {
        sourceSessions: ['sess-svc-1'],
        sourceEntries: ['entry-svc-1'],
        createdBy: 'agent',
        createdAt: '2026-05-14T00:00:00Z',
        updatedAt: '2026-05-14T00:00:00Z',
        inferenceTag: 'tag:integration',
      },
      tags: ['smoke'],
    });
    assert.equal(putResult.slug, 'adaptive-memory-smoke-page');
    assert.equal(putResult.mode, 'create');
    console.log('  PASS  putPage creates a new page');

    const fetched = await wiki.getPage(projectName, putResult.slug);
    assert.ok(fetched, 'getPage should return the just-created page');
    assert.equal(fetched.classification, 'private');
    assert.equal(fetched.provenance.inferenceTag, 'tag:integration');
    assert.deepEqual(fetched.links, ['related']);
    console.log('  PASS  getPage maps frontmatter + extracts links');

    // 2. getPage on missing slug returns null.
    const missing = await wiki.getPage(projectName, 'does-not-exist');
    assert.equal(missing, null);
    console.log('  PASS  getPage returns null for unknown slug');

    // 3. Classification default-on-read: write a page through the script directly
    //    with no classification, then assert WikiService defaults to 'private'.
    const skill = await import('child_process');
    const wikiAdd = join(skillTarget, 'scripts', 'wiki-add.ts');
    const noClassInput = join(projectDir, 'no-class.json');
    writeFileSync(
      noClassInput,
      JSON.stringify({
        title: 'No Classification Page',
        body: 'body',
        sources: [{ kind: 'conversation', turn: 't' }],
        mode: 'create',
      }),
      'utf8',
    );
    const out = skill.execFileSync(
      'npx',
      ['tsx', `"${wikiAdd}"`, '--input', `"${noClassInput}"`],
      { cwd: projectDir, shell: true, encoding: 'utf8' },
    );
    const addRes = JSON.parse(out);
    const noClassPage = await wiki.getPage(projectName, addRes.slug);
    assert.ok(noClassPage);
    assert.equal(
      noClassPage.classification,
      'private',
      'missing classification should default to private',
    );
    assert.equal(noClassPage.provenance.createdBy, 'user');
    console.log('  PASS  getPage defaults missing classification to private');

    // 4. listPages
    const list = await wiki.listPages(projectName);
    const slugs = list.map((p) => p.slug).sort();
    assert.deepEqual(
      slugs,
      ['adaptive-memory-smoke-page', 'no-classification-page', 'related'],
      'listPages should return both written pages plus the auto-stub for ../related',
    );
    console.log('  PASS  listPages returns all surviving pages');

    // 5. listPages with tag filter
    const filteredByTag = await wiki.listPages(projectName, { tag: 'smoke' });
    assert.equal(filteredByTag.length, 1);
    assert.equal(filteredByTag[0].slug, 'adaptive-memory-smoke-page');
    console.log('  PASS  listPages filters by tag');

    // 6. search
    const hits = await wiki.search(projectName, ['Adaptive', 'Memory', 'Smoke'], {
      limit: 5,
    });
    assert.ok(hits.length >= 1, 'search should find at least the smoke page');
    assert.ok(
      hits.some((h) => h.slug === 'adaptive-memory-smoke-page'),
      'search hits should include the smoke page',
    );
    console.log('  PASS  search returns ranked slug hits');

    // 7. deletePage → tombstones
    const delRes = await wiki.deletePage(projectName, 'adaptive-memory-smoke-page', {
      reason: 'integration cleanup',
    });
    assert.equal(delRes.noop, false);
    const afterDelete = await wiki.getPage(projectName, 'adaptive-memory-smoke-page');
    assert.equal(afterDelete, null, 'tombstoned page should read as null');
    const listAfterDelete = await wiki.listPages(projectName);
    assert.ok(
      !listAfterDelete.some((p) => p.slug === 'adaptive-memory-smoke-page'),
      'tombstoned page should be excluded from listPages',
    );
    const hitsAfterDelete = await wiki.search(
      projectName,
      ['Adaptive', 'Memory', 'Smoke'],
      { limit: 5 },
    );
    assert.ok(
      !hitsAfterDelete.some((h) => h.slug === 'adaptive-memory-smoke-page'),
      'tombstoned page should be excluded from search',
    );
    console.log('  PASS  deletePage hides page from getPage/listPages/search');

    // 8. deletePage idempotency
    const delAgain = await wiki.deletePage(projectName, 'adaptive-memory-smoke-page');
    assert.equal(delAgain.noop, true);
    console.log('  PASS  deletePage is idempotent');

    console.log('\nAll WikiService integration tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
