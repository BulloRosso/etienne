/**
 * PersonalityStore test — exercises the firewall + cross-project persistence.
 *
 * Run with: tsx test/adaptive-memory-personality-store.test.ts
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'ps-'));
  process.env.WORKSPACE_ROOT = workspace;
  console.log(`# workspace: ${workspace}`);

  try {
    const { PersonalityStore } = await import(
      '../src/adaptive-memory/stores/personality.store'
    );
    const store = new PersonalityStore();

    // 1. Secret evidence → rejected at admission.
    const secretCand = {
      principle: 'Always check vendor terms',
      context: 'When negotiating a contract',
      evidence: ['sess-1'],
      inferenceTag: 'tag:vendor-check',
      isAbstract: true,
      evidenceClassifications: ['public' as const, 'secret' as const],
    };
    const r1 = await store.admitAndWrite(secretCand);
    assert.equal(r1.admitted, false);
    assert.equal((r1 as { admitted: false; reason: string }).reason, 'secret_evidence');
    // Nothing was written.
    assert.equal(
      existsSync(join(workspace, '.agent', 'personality', 'tag-vendor-check.md')),
      false,
    );
    console.log('  PASS  admitAndWrite rejects on secret evidence and writes nothing');

    // 2. Private evidence + non-abstract → rejected.
    const privNonAbs = {
      principle: 'For ProjectX, prefer vendor A',
      context: 'ProjectX procurement',
      evidence: ['sess-2'],
      inferenceTag: 'tag:projectx-vendor',
      isAbstract: false,
      evidenceClassifications: ['private' as const],
    };
    const r2 = await store.admitAndWrite(privNonAbs);
    assert.equal(r2.admitted, false);
    assert.equal((r2 as { admitted: false; reason: string }).reason, 'private_not_abstract');
    console.log('  PASS  admitAndWrite rejects private+non-abstract');

    // 3. Private + abstract → admitted; classification persisted as 'private'.
    const privAbs = {
      principle: 'Confirm vendor terms before signing',
      context: 'Any procurement decision',
      evidence: ['sess-2'],
      inferenceTag: 'tag:vendor-terms-abstract',
      isAbstract: true,
      evidenceClassifications: ['private' as const, 'public' as const],
    };
    const r3 = await store.admitAndWrite(privAbs);
    assert.equal(r3.admitted, true);
    const entry = (r3 as { admitted: true; entry: any }).entry;
    assert.equal(entry.classification, 'private');
    assert.equal(entry.id, 'tag:vendor-terms-abstract');
    assert.deepEqual(entry.evidence, ['sess-2']);
    console.log('  PASS  admitAndWrite admits private+abstract with classification=private');

    // 4. Public-only evidence → admitted with classification='public'.
    const pubOnly = {
      principle: 'Document decisions in writing',
      context: 'Any meaningful agreement',
      evidence: ['sess-3', 'sess-4'],
      inferenceTag: 'tag:document-decisions',
      isAbstract: true,
      evidenceClassifications: ['public' as const],
    };
    const r4 = await store.admitAndWrite(pubOnly);
    assert.equal(r4.admitted, true);
    const e4 = (r4 as { admitted: true; entry: any }).entry;
    assert.equal(e4.classification, 'public');
    console.log('  PASS  admitAndWrite admits public-only with classification=public');

    // 5. The on-disk files live under workspace/.agent/personality/.
    const dir = join(workspace, '.agent', 'personality');
    assert.equal(existsSync(join(dir, 'tag-vendor-terms-abstract.md')), true);
    assert.equal(existsSync(join(dir, 'tag-document-decisions.md')), true);
    assert.equal(existsSync(join(dir, 'index.json')), true);
    console.log('  PASS  entries live under workspace/.agent/personality/');

    // 6. get() round-trips an entry.
    const got = await store.get('tag:vendor-terms-abstract');
    assert.ok(got);
    assert.equal(got.principle, 'Confirm vendor terms before signing');
    assert.equal(got.context, 'Any procurement decision');
    assert.equal(got.classification, 'private');
    console.log('  PASS  get() round-trips principle + context');

    // 7. list() returns all admitted entries (only).
    const list = await store.list();
    const ids = list.map((e) => e.id).sort();
    assert.deepEqual(ids, ['tag:document-decisions', 'tag:vendor-terms-abstract']);
    console.log('  PASS  list() returns only admitted entries');

    // 8. delete() removes file + index.
    const d = await store.delete('tag:document-decisions');
    assert.equal(d.noop, false);
    assert.equal(existsSync(join(dir, 'tag-document-decisions.md')), false);
    const listAfter = await store.list();
    assert.deepEqual(listAfter.map((e) => e.id), ['tag:vendor-terms-abstract']);
    console.log('  PASS  delete() removes both file and index entry');

    // 9. delete() is idempotent.
    const d2 = await store.delete('tag:document-decisions');
    assert.equal(d2.noop, true);
    console.log('  PASS  delete() is idempotent');

    // 10. get() of missing tag returns null.
    assert.equal(await store.get('tag:nope'), null);
    console.log('  PASS  get() of unknown tag returns null');

    console.log('\nAll PersonalityStore tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
