/**
 * Unit tests for the deterministic blocks of the management analysis
 * (backend/src/requirements-tracking/analysis/analysis-report.service.ts):
 * table rendering, token substitution, appendix for unplaced blocks.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-analysis-report-blocks.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  AnalysisReportService,
  type AnalysisReportData,
} from '../src/requirements-tracking/analysis/analysis-report.service';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const service = new AnalysisReportService(null as any, null as any, null as any, null as any, null as any, null as any);

const data: AnalysisReportData = {
  tender: { key: 'T-2026-031', title: 'Logistikzentrum Nord', phase: 'bid', language: 'de' },
  runId: 'AN-001',
  generatedAt: '2026-09-12T10:00:00.000Z',
  language: 'de',
  reliable: false,
  documents: [{ docId: 'D-01', title: 'Leistungsbeschreibung', sections: 8 }],
  kpis: {
    requirements: 3, mandatory: 2, target: 1, optional: 0,
    verdicts: { FULL: 1, PARTIAL: 1, NON_COMPLIANT: 0, NEEDS_INPUT: 0, PENDING: 1 },
    mappedFull: 1, mappedPartial: 1, unmapped: 1, unmappedMandatory: 1,
    alerts: 1, unresolvedAlerts: 0, clarifications: 2, internalQuestions: 0, fulfilmentScore: 50, openReviews: 0,
  },
  requirements: [
    { id: 'REQ-001', earsText: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.', domainText: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.', modality: 'mandatory', category: 'functional', verdict: 'FULL', verdictStatus: 'proposed', services: [{ serviceId: 'SVC-001', title: 'Bestandsführung', coverage: 'full', status: 'proposed' }], alerts: [], ambiguities: [] },
    { id: 'REQ-002', earsText: 'Gefahrgut der Klasse 3 muss gelagert werden.', modality: 'mandatory', category: 'legal', verdict: 'PARTIAL', verdictStatus: 'proposed', deviation: 'Gefahrgutlagerung ausgeschlossen', services: [{ serviceId: 'SVC-002', title: 'Lagerung', coverage: 'partial', status: 'proposed' }], alerts: [], ambiguities: [] },
    { id: 'REQ-003', earsText: 'Retouren sollen zeitnah | bearbeitet werden.', modality: 'target', category: 'process', verdict: 'PENDING', verdictStatus: 'none', services: [], alerts: [], ambiguities: [{ type: 'vague_term', note: 'zeitnah', clarification_question_draft: 'Welche Frist gilt für Retouren?' }] },
  ],
  byCategory: {
    functional: { total: 1, verdicts: { FULL: 1, PARTIAL: 0, NON_COMPLIANT: 0, NEEDS_INPUT: 0, PENDING: 0 } },
    legal: { total: 1, verdicts: { FULL: 0, PARTIAL: 1, NON_COMPLIANT: 0, NEEDS_INPUT: 0, PENDING: 0 } },
    process: { total: 1, verdicts: { FULL: 0, PARTIAL: 0, NON_COMPLIANT: 0, NEEDS_INPUT: 0, PENDING: 1 } },
  },
  consistencyAlerts: [{ proposalId: 'P-1', requirementId: 'REQ-001', figureId: 'Mengen!B2', sheet: 'Mengen', cell: 'B2', label: 'Mengen › Palettenstellplätze › Anzahl', tenderValue: 12400, tenderUnit: 'count', tenderRaw: '12.400 Palettenstellplätze', excelValue: 12000, excelUnit: 'count', excelRaw: '12000', deviationAbs: 400, deviationPct: 3.3, note: 'gleiche Kennzahl', severity: 'warning', resolution: 'clarify' }],
  clarifications: [
    { requirementId: 'REQ-003', document: 'Leistungsbeschreibung', section: '', question: 'Welche Frist gilt für Retouren?', type: 'vague_term' },
    { requirementId: 'REQ-001', document: 'Leistungsbeschreibung', section: 'Mengen!B2', question: 'Bitte bestätigen Sie den gültigen Wert für Palettenstellplätze.', type: 'figure_contradiction' },
  ],
  internalQuestions: [],
  unmappedMandatory: [],
  termMappings: [{ customerTerm: 'Kommissionierung', ourTerm: 'Order Fulfillment', count: 2 }],
};

async function main() {
// 1. blocks
{
  const blocks = service.renderBlocks(data);
  assert.ok(blocks.kpis.includes('| Anforderungen gesamt | 3 |'));
  assert.ok(blocks.kpis.includes('| Erfüllungsgrad (erfüllt = 1, teilweise = 0,5) | 50 % |'));
  assert.ok(blocks.verdict_matrix.includes('| REQ-002 |'));
  assert.ok(blocks.verdict_matrix.includes('teilweise *'), 'proposed verdicts are starred');
  assert.ok(blocks.verdict_matrix.includes('zeitnah \\| bearbeitet'), 'pipes inside cells are escaped');
  assert.ok(blocks.alerts.includes('12.400 Palettenstellplätze'));
  assert.ok(blocks.alerts.includes('beim Kunden zu klären'));
  assert.ok(blocks.clarifications.startsWith('1. Welche Frist gilt für Retouren?'));
  assert.ok(blocks.reliability.includes('Analyse mit Vorbehalten'));
  assert.ok(blocks.terms.includes('| Kommissionierung | Order Fulfillment | 2 |'));
  assert.ok(blocks.internal_questions.includes('Keine internen Rückfragen'));
  pass('renderBlocks');
}

// 2. substitution + appendix for unplaced blocks
{
  const blocks = service.renderBlocks(data);
  const markdown = (service as any).substituteBlocks('# Titel\n\n{{block:kpis}}\n\nText\n\n{{block:clarifications}}\n', blocks);
  assert.ok(markdown.includes('| Anforderungen gesamt | 3 |'));
  assert.ok(!markdown.includes('{{block:'), 'no tokens left');
  assert.ok(markdown.includes('## Anhang'), 'unplaced blocks go to the appendix');
  assert.ok(markdown.includes('### Bewertungsmatrix'));
  pass('substituteBlocks');
}

// 2b. a RESOLVED "clarify" alert must not produce a second, synthesised question.
//     Live-run defect (2026-09-13): resolveAlert injects a drafted bidder
//     question into the card's ambiguities AND assemble() synthesised its own
//     from the same alert, so every resolved contradiction appeared twice in
//     the report (items 1 and 2 of "Klärungsbedarf beim Kunden").
//     This drives the REAL assemble() over stubbed repositories.
async function clarificationsFor(resolution?: 'tender' | 'excel' | 'clarify'): Promise<string[]> {
  const alert = {
    figureId: 'Mengen!B2', sheet: 'Mengen', cell: 'B2', label: 'Mengen › Palettenstellplätze › Anzahl',
    tenderValue: 12400, tenderUnit: 'count', tenderRaw: '12.400 Palettenstellplätze',
    excelValue: 12000, excelUnit: 'count', excelRaw: '12000',
    deviationAbs: 400, deviationPct: 3.3, note: 'gleiche Kennzahl', severity: 'warning' as const,
    ...(resolution ? { resolution } : {}),
  };
  // resolveAlert injects this ambiguity when (and only when) the human chose "clarify"
  const ambiguities = resolution === 'clarify'
    ? [{ type: 'conflicting_reference', note: `Zahlenwiderspruch zum Mengengerüst (${alert.figureId})`,
         clarification_question_draft: 'Zu „Palettenstellplätze“: Welcher Wert ist verbindlich?' }]
    : [];
  const version = {
    id: 'REQ-001/v/1', requirementId: 'REQ-001', versionNo: 1, earsPattern: 'ubiquitous',
    earsFields: {}, earsText: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.',
    domainText: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.',
    category: 'functional', modality: 'mandatory', quantities: [], sourceRef: { document: 'D-01', page: 1, quote: 'x' },
    ambiguities, createdFromProposalId: 'P-1', createdAt: new Date().toISOString(),
    termMappings: [], consistencyAlerts: [alert],
  };
  const repository = {
    getTenderMeta: async () => ({ key: 'T-TEST', title: 'T', phase: 'bid', language: 'de' }),
    listCompliance: async () => [],
    listProposals: async (_p: string, f: any) =>
      f?.kind === 'extraction'
        ? [{ id: 'P-1', kind: 'extraction', status: 'approved', payload: { ambiguities, consistency_alerts: [alert], source: { documentId: 'D-01' } } }]
        : [],
    listMappings: async () => [],
    listServices: async () => [],
    listRequirements: async () => [{ id: 'REQ-001', status: 'draft', currentVersionId: 'REQ-001/v/1' }],
    getVersions: async () => [version],
    listDocuments: async () => [{ id: 'D-01', kind: 'tender', title: 'Leistungsbeschreibung', sectionCount: 9 }],
  };
  const svc = new AnalysisReportService(null as any, null as any, repository as any, null as any, null as any, null as any);
  const run = { runId: 'AN-001', options: { language: 'de' }, extraction: { proposalIds: ['P-1'] } } as any;
  const assembled = await svc.assemble('demo', run, ['REQ-001']);
  return assembled.clarifications.map((c) => c.question);
}

{
  const resolved = await clarificationsFor('clarify');
  assert.equal(resolved.length, 1, `resolved "clarify" → exactly one question, got ${resolved.length}: ${JSON.stringify(resolved)}`);
  assert.ok(/verbindlich/.test(resolved[0]), resolved[0]);

  const unresolved = await clarificationsFor(undefined);
  assert.equal(unresolved.length, 1, `unresolved → exactly one (synthesised) question, got ${unresolved.length}`);
  assert.ok(/Bitte bestätigen Sie/.test(unresolved[0]), unresolved[0]);

  const takenFromTender = await clarificationsFor('tender');
  assert.equal(takenFromTender.length, 0, 'resolved by taking the tender value → no customer question');
  pass('one contradiction yields exactly one bidder question (real assemble())');
}

// 3. deterministic fallback document
{
  const blocks = service.renderBlocks(data);
  const doc = (service as any).deterministicDocument('# Vorlage\n\n## Kennzahlen\n{{block:kpis}}\n', data, blocks);
  assert.ok(doc.startsWith('# Management-Analyse — Logistikzentrum Nord'));
  assert.ok(doc.includes('Erzählteile konnten nicht generiert werden'));
  assert.ok(doc.includes('| Anforderungen gesamt | 3 |'));
  pass('deterministicDocument');
}


  console.log(`
${passed} checks passed`);
}

main().catch((error) => {
  console.error(`
  FAIL  ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
