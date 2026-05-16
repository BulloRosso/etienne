/**
 * Tracking-feature tests for the Document Creation flow.
 *
 * Exercises the pure mapping/tracking logic shared by the dashboard
 * (DocumentCreationModal.jsx) and the document-creation skill contract:
 * `recomputeStatus`, `mergeMappings`, `buildMappingFile`,
 * `validateTrackingSchema`. These are deterministic and require no backend,
 * so this file always runs (no auto-skip needed).
 *
 * It is the deterministic guard for the source-target.sectionmappings.json
 * journal contract: status state machine, read-modify-write preservation of
 * skill-written provenance / lastRun, backward compatibility with the
 * un-migrated demo file, and idempotent round-trips.
 *
 * Run with:
 *   cd backend && tsx test/integration-document-creation-tracking.test.ts
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

// Walk up to the repo root (dir containing backend/ and frontend/).
function repoRoot(): string {
  let here = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(here, 'backend')) && existsSync(join(here, 'frontend'))) {
      return here;
    }
    here = join(here, '..');
  }
  return join(process.cwd(), '..');
}

async function main(): Promise<void> {
  console.log('# Document Creation — tracking tests\n');

  const root = repoRoot();
  const modulePath = join(
    root,
    'frontend',
    'src',
    'components',
    'documentCreationMapping.js',
  );
  assert.ok(existsSync(modulePath), `shared module missing: ${modulePath}`);

  const m: any = await import(pathToFileURL(modulePath).href);
  const {
    recomputeStatus,
    mergeMappings,
    buildMappingFile,
    validateTrackingSchema,
    statusMap,
    coverageCounts,
    targetKeyOf,
  } = m;

  // ── recomputeStatus ──────────────────────────────────────────────────────
  console.log('## recomputeStatus');

  assert.equal(
    recomputeStatus({ sourceSection: '', transformation: '' }, null),
    'unmapped',
    'no source ⇒ unmapped',
  );
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'copy' }, null),
    'mapped',
    'source set, no base ⇒ mapped',
  );
  pass('unmapped / mapped base cases');

  const generatedBase = {
    status: 'generated',
    provenance: { generatedAt: '2026-05-16T10:00:00Z', sourceHash: 'sha256:abcd1234', outputSection: '2 X', note: 'copied' },
    source: { section: '1', title: 'Intro' },
    transformation: 'copy',
  };
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'copy' }, generatedBase),
    'generated',
    'source+transform unchanged vs generated base ⇒ stays generated',
  );
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'summarize' }, generatedBase),
    'mapped',
    'transformation changed vs generated base ⇒ mapped (must regenerate)',
  );
  assert.equal(
    recomputeStatus({ sourceSection: '2||Other', transformation: 'copy' }, generatedBase),
    'mapped',
    'source changed vs generated base ⇒ mapped',
  );
  pass('generated stays/invalidates correctly on edit');

  const reviewedBase = { ...generatedBase, status: 'reviewed' };
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'copy' }, reviewedBase),
    'reviewed',
    'reviewed is sticky when inputs unchanged',
  );
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'changed' }, reviewedBase),
    'mapped',
    'reviewed downgrades to mapped when the user edits the row',
  );
  const errBase = { ...generatedBase, status: 'error' };
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'copy' }, errBase),
    'error',
    'error preserved when inputs unchanged',
  );
  const skipBase = { ...generatedBase, status: 'skipped' };
  assert.equal(
    recomputeStatus({ sourceSection: '1||Intro', transformation: 'copy' }, skipBase),
    'skipped',
    'skipped preserved when inputs unchanged',
  );
  pass('reviewed / error / skipped preservation');

  // ── validateTrackingSchema ───────────────────────────────────────────────
  console.log('\n## validateTrackingSchema');

  const goodPostRun = {
    sourceDocuments: ['source/a.pdf'],
    templateDocument: 'target/t.docx',
    targetLanguage: 'en',
    mode: 'structured',
    outputFile: 'target/out.docx',
    mappings: [
      {
        targetSection: { number: '1', title: 'Exec' },
        source: { document: 'source/a.pdf', section: '1', title: 'O' },
        transformation: 'summarize',
        sourceLanguage: 'en',
        status: 'generated',
        provenance: {
          generatedAt: '2026-05-16T10:22:00Z',
          sourceHash: 'sha256:ab12cd34ef56',
          outputSection: '1 Exec',
          note: 'Summarized; copied en',
        },
      },
    ],
    lastRun: { at: '2026-05-16T10:22:05Z', outputFile: 'target/out.docx', filled: 1, skipped: 0, error: 0 },
  };
  assert.deepEqual(validateTrackingSchema(goodPostRun), [], 'valid post-run file ⇒ no errors');
  pass('a well-formed post-run file validates clean');

  assert.ok(
    validateTrackingSchema({ mappings: [{ targetSection: { number: '1', title: 'X' }, status: 'bogus' }] })
      .some((e: string) => e.includes('status')),
    'invalid status value is reported',
  );
  assert.ok(
    validateTrackingSchema({ mappings: [{ targetSection: {}, provenance: { generatedAt: 'not-a-date', sourceHash: 'nope', outputSection: 1, note: 2 } }] })
      .length >= 3,
    'bad provenance fields are reported',
  );
  assert.ok(
    validateTrackingSchema({ lastRun: { at: 'x', filled: 'a', skipped: 1, error: 0, outputFile: 5 } })
      .length >= 3,
    'bad lastRun fields are reported',
  );
  pass('schema violations are caught');

  // Backward compat: the actual seeded demo file (no status yet) is valid.
  const demoFile = join(
    root,
    'workspace',
    'document-creation-demo',
    'source-target.sectionmappings.json',
  );
  if (existsSync(demoFile)) {
    const demo = JSON.parse(readFileSync(demoFile, 'utf8'));
    assert.deepEqual(
      validateTrackingSchema(demo),
      [],
      'un-migrated seeded demo file (no status/provenance) is valid',
    );
    pass('backward compat: current seeded demo file validates');
  } else {
    console.log('  SKIP  seeded demo file not found — backward-compat check skipped');
  }

  // ── mergeMappings (read-modify-write) ────────────────────────────────────
  console.log('\n## mergeMappings (read-modify-write)');

  // Base = a post-run file the skill wrote. UI changed ONLY row 2's transform.
  const base = {
    sourceDocuments: ['source/a.pdf'],
    templateDocument: 'target/t.docx',
    targetLanguage: 'en',
    mode: 'structured',
    outputFile: 'target/out.docx',
    mappings: [
      {
        targetSection: { number: '1', title: 'A' },
        source: { document: 'source/a.pdf', section: '1', title: 'S1' },
        transformation: 'copy',
        sourceLanguage: 'en',
        status: 'generated',
        provenance: { generatedAt: '2026-05-16T10:00:00Z', sourceHash: 'sha256:aaaa1111', outputSection: '1 A', note: 'copied' },
      },
      {
        targetSection: { number: '2', title: 'B' },
        source: { document: 'source/a.pdf', section: '2', title: 'S2' },
        transformation: 'copy',
        sourceLanguage: 'en',
        status: 'generated',
        provenance: { generatedAt: '2026-05-16T10:00:01Z', sourceHash: 'sha256:bbbb2222', outputSection: '2 B', note: 'copied' },
      },
    ],
    lastRun: { at: '2026-05-16T10:00:05Z', outputFile: 'target/out.docx', filled: 2, skipped: 0, error: 0 },
  };

  const ui = {
    sourceDocuments: ['source/a.pdf'],
    templateDocument: 'target/t.docx',
    targetLanguage: 'en',
    mode: 'structured',
    outputFile: 'target/out.docx',
    sourceLanguageCode: 'en',
    rows: [
      { targetSection: { number: '1', title: 'A' }, sourceSection: '1||S1', transformation: 'copy' },
      { targetSection: { number: '2', title: 'B' }, sourceSection: '2||S2', transformation: 'SUMMARIZE NOW' },
    ],
  };

  const merged = mergeMappings(base, ui);

  assert.equal(merged.mappings[0].status, 'generated', 'untouched row keeps generated');
  assert.ok(merged.mappings[0].provenance, 'untouched row keeps its provenance');
  assert.equal(
    merged.mappings[0].provenance.sourceHash,
    'sha256:aaaa1111',
    'untouched row provenance is verbatim',
  );
  assert.equal(merged.mappings[1].status, 'mapped', 'edited row downgraded to mapped');
  assert.ok(!merged.mappings[1].provenance, 'edited (invalidated) row drops stale provenance');
  assert.deepEqual(
    merged.lastRun,
    base.lastRun,
    'top-level lastRun preserved verbatim',
  );
  assert.equal(merged.mappings[1].transformation, 'SUMMARIZE NOW', 'user edit applied');
  pass('merge keeps skill fields, only invalidates the edited row');

  // No base (first save) ⇒ buildMappingFile-equivalent shape.
  const firstSave = mergeMappings(null, ui);
  assert.equal(firstSave.mappings.length, 2, 'first save emits all rows');
  assert.equal(firstSave.mappings[0].status, 'mapped', 'first save: mapped with source');
  assert.ok(!firstSave.lastRun, 'first save: no lastRun');
  pass('merge with null base behaves as a first save');

  // Idempotent round-trip: merge a post-run file with a no-op UI ⇒ unchanged
  // skill fields.
  const noopUi = {
    sourceDocuments: base.sourceDocuments,
    templateDocument: base.templateDocument,
    targetLanguage: base.targetLanguage,
    mode: base.mode,
    outputFile: base.outputFile,
    sourceLanguageCode: 'en',
    rows: base.mappings.map((mm: any) => ({
      targetSection: mm.targetSection,
      sourceSection: `${mm.source.section}||${mm.source.title}`,
      transformation: mm.transformation,
    })),
  };
  const roundTrip = mergeMappings(base, noopUi);
  assert.equal(roundTrip.mappings[0].status, 'generated', 'round-trip: status unchanged');
  assert.equal(roundTrip.mappings[1].status, 'generated', 'round-trip: status unchanged');
  assert.deepEqual(roundTrip.lastRun, base.lastRun, 'round-trip: lastRun unchanged');
  assert.deepEqual(
    validateTrackingSchema(roundTrip),
    [],
    'round-trip result still validates',
  );
  pass('no-op merge is idempotent over skill fields');

  // ── buildMappingFile / counts ────────────────────────────────────────────
  console.log('\n## buildMappingFile + coverage');

  const built = buildMappingFile(ui);
  assert.equal(built.mappings.length, 2, 'buildMappingFile emits all rows');
  assert.equal(built.mappings[0].status, 'mapped', 'buildMappingFile sets mapped for sourced rows');
  assert.ok(!('lastRun' in built), 'buildMappingFile does not invent lastRun');

  const rows = [
    { targetSection: { number: '1', title: 'A' } },
    { targetSection: { number: '2', title: 'B' } },
    { targetSection: { number: '3', title: 'C' } },
  ];
  const byKey = {
    [targetKeyOf({ number: '1', title: 'A' })]: 'generated',
    [targetKeyOf({ number: '2', title: 'B' })]: 'reviewed',
    [targetKeyOf({ number: '3', title: 'C' })]: 'unmapped',
  };
  const cov = coverageCounts(rows, byKey);
  assert.deepEqual(
    cov,
    { total: 3, mapped: 2, generated: 1, reviewed: 1 },
    'coverageCounts tallies mapped/generated/reviewed correctly',
  );

  const sMap = statusMap(
    [{ targetSection: { number: '1', title: 'A' }, sourceSection: '', transformation: '' }],
    {},
  );
  assert.equal(
    sMap[targetKeyOf({ number: '1', title: 'A' })],
    'unmapped',
    'statusMap derives unmapped for an empty row',
  );
  pass('buildMappingFile, coverageCounts and statusMap behave as specified');

  console.log(`\nDone. ${passed} groups passed.`);
  if (passed === 0) {
    console.error('No assertions ran — treating as failure.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
