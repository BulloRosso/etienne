/**
 * Regression test for resolveAlert → requirement-version sync.
 *
 * Live-run defect (2026-09-13, run AN-005 with two contradictions):
 * `resolveAlert` wrote the resolution and the injected `conflicting_reference`
 * question ONLY to the proposal payload. `createFromExtraction` had already
 * copied the payload onto the requirement version at approval time, so a
 * contradiction resolved AFTER approval never reached the version. The
 * management report reads versions, so the customer question vanished from
 * "Klärungsbedarf beim Kunden" (report listed 14) while the cockpit, which
 * reads live proposals, still counted it (15). REQ-146 had 0 ambiguities and
 * its alert still read `none`.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-resolve-alert-version-sync.test.ts
 */
import { strict as assert } from 'node:assert';
import { TenderAnalysisPipeline } from '../src/requirements-tracking/pipelines/tender-analysis.pipeline';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const ALERT = {
  figureId: 'KPIs!B4',
  sheet: 'KPIs',
  cell: 'B4',
  label: 'KPIs › Wareneingangsbuchung nach Entladung › Zielwert',
  tenderValue: 4,
  tenderUnit: 'hour',
  tenderRaw: '4 Stunden',
  excelValue: 6,
  excelUnit: 'hour',
  excelRaw: '6',
  deviationAbs: 2,
  deviationPct: 33.3,
  note: 'gleiche Kennzahl',
  severity: 'warning' as const,
};

/** Pipeline with just enough stubs for resolveAlert + the version sync. */
function makePipeline(proposalStatus: 'proposed' | 'approved') {
  const proposal = {
    id: 'P-0227',
    kind: 'extraction',
    status: proposalStatus,
    payload: {
      ears_text: 'Der Auftragnehmer muss angelieferte Ware innerhalb von 4 Stunden buchen.',
      domain_text: 'Der Auftragnehmer muss angelieferte Ware innerhalb von 4 Stunden im WMS buchen.',
      quantities: [{ value: 4, unit: 'Stunden', kind: 'threshold' }],
      ambiguities: [],
      consistency_alerts: [ALERT],
      source: { documentId: 'D-01' },
    },
  };
  const version: any = {
    id: 'REQ-146/v/1',
    requirementId: 'REQ-146',
    versionNo: 1,
    earsText: proposal.payload.ears_text,
    domainText: proposal.payload.domain_text,
    quantities: proposal.payload.quantities,
    ambiguities: [],                 // frozen at approval: no question yet
    consistencyAlerts: [ALERT],      // ... and the alert is unresolved
    createdFromProposalId: 'P-0227',
    createdAt: new Date().toISOString(),
    category: 'process',
    modality: 'mandatory',
    sourceRef: { document: 'D-01', page: 1, quote: 'x' },
    earsPattern: 'ubiquitous',
    earsFields: {},
  };
  const versionWrites: any[] = [];
  const repository = {
    getProposal: async () => JSON.parse(JSON.stringify(proposal)),
    updateProposal: async (_p: string, next: any) => { proposal.payload = next.payload; },
    listRequirements: async () => [{ id: 'REQ-146', status: 'draft', currentVersionId: 'REQ-146/v/1' }],
    getVersions: async () => [version],
    updateVersion: async (_p: string, v: any) => { versionWrites.push(v); },
  };
  const pipeline = new TenderAnalysisPipeline(
    {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any,
    repository as any,
    { invalidate() {} } as any,
    {} as any,
    { emit: async () => ({}), stream: () => ({ subscribe: () => ({ unsubscribe() {} }) }) } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  // maybeEmitReady touches state files we do not stub; it is not under test
  (pipeline as any).maybeEmitReady = async () => undefined;
  return { pipeline, proposal, versionWrites };
}

async function main() {
  // 1. resolve AFTER approval must reach the frozen version
  {
    const { pipeline, proposal, versionWrites } = makePipeline('approved');
    const result = await pipeline.resolveAlert('demo', {
      proposalId: 'P-0227', alertIndex: 0, resolution: 'clarify', actor: 'user',
    });
    assert.equal(result.success, true, result.error);
    assert.equal(versionWrites.length, 1, 'the requirement version was patched exactly once');
    const written = versionWrites[0];
    assert.equal(written.requirementId, 'REQ-146');
    assert.equal(written.versionNo, 1, 'patched in place — no new version number');
    assert.equal(written.ambiguities.length, 1, 'the drafted question reached the version');
    assert.equal(written.ambiguities[0].type, 'conflicting_reference');
    assert.ok(/verbindlich/.test(written.ambiguities[0].clarification_question_draft), written.ambiguities[0].clarification_question_draft);
    assert.equal(written.consistencyAlerts[0].resolution, 'clarify', 'the resolution reached the version');
    // the card itself is still updated as before
    assert.equal(proposal.payload.consistency_alerts[0].resolution, 'clarify');
    assert.equal(proposal.payload.ambiguities.length, 1);
    pass('resolve after approve: question + resolution are mirrored onto the requirement version');
  }

  // 2. a card still in review needs no version write (none exists yet)
  {
    const { pipeline, proposal, versionWrites } = makePipeline('proposed');
    const result = await pipeline.resolveAlert('demo', {
      proposalId: 'P-0227', alertIndex: 0, resolution: 'clarify', actor: 'user',
    });
    assert.equal(result.success, true, result.error);
    assert.equal(versionWrites.length, 0, 'no version exists yet, so nothing is patched');
    assert.equal(proposal.payload.ambiguities.length, 1, 'the card still carries the question for approval time');
    pass('resolve before approve: only the card is updated (approval copies it onto the version)');
  }

  // 3. taking the Excel value after approval updates the version texts too
  {
    const { pipeline, versionWrites } = makePipeline('approved');
    const result = await pipeline.resolveAlert('demo', {
      proposalId: 'P-0227', alertIndex: 0, resolution: 'excel', actor: 'user',
    });
    assert.equal(result.success, true, result.error);
    assert.equal(versionWrites.length, 1);
    const written = versionWrites[0];
    assert.equal(written.consistencyAlerts[0].resolution, 'excel');
    assert.equal(written.ambiguities.length, 0, '"excel" raises no customer question');
    pass('resolve as "excel" after approve: the version records the decision without a question');
  }

  // 4. resolving the SAME alert twice must not duplicate the drafted question.
  //     Regression (2026-09-13): re-running the resolve appended a second
  //     identical conflicting_reference entry, so the report listed each
  //     contradiction twice, then three times (19 questions).
  {
    const { pipeline, proposal, versionWrites } = makePipeline('approved');
    for (let i = 0; i < 3; i++) {
      const r = await pipeline.resolveAlert('demo', {
        proposalId: 'P-0227', alertIndex: 0, resolution: 'clarify', actor: 'user',
      });
      assert.equal(r.success, true, r.error);
    }
    const drafts = proposal.payload.ambiguities.filter((a: any) => a.type === 'conflicting_reference');
    assert.equal(drafts.length, 1, `three resolves must leave exactly one draft, got ${drafts.length}`);
    const lastVersion = versionWrites[versionWrites.length - 1];
    assert.equal(
      lastVersion.ambiguities.filter((a: any) => a.type === 'conflicting_reference').length,
      1,
      'the requirement version carries exactly one draft too',
    );
    pass('resolveAlert is idempotent: re-deciding replaces the question, never appends');
  }

  // 5. switching the decision away from "clarify" drops the customer question
  {
    const { pipeline, proposal } = makePipeline('approved');
    await pipeline.resolveAlert('demo', { proposalId: 'P-0227', alertIndex: 0, resolution: 'clarify', actor: 'user' });
    await pipeline.resolveAlert('demo', { proposalId: 'P-0227', alertIndex: 0, resolution: 'tender', actor: 'user' });
    const drafts = proposal.payload.ambiguities.filter((a: any) => a.type === 'conflicting_reference');
    assert.equal(drafts.length, 0, 'changing the decision away from "clarify" removes the stale question');
    assert.equal(proposal.payload.consistency_alerts[0].resolution, 'tender');
    pass('changing a resolution removes the stale bidder question');
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
