/**
 * Unit tests for the Excel consistency check
 * (backend/src/requirements-tracking/analysis/consistency-check.ts) with a
 * stubbed LLM: an alert is raised ONLY when a figure denotes the same
 * quantity AND differs; requirements without numbers cost no LLM call.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-consistency.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  ConsistencyCheckService,
  candidateFigures,
  requirementQuantities,
} from '../src/requirements-tracking/analysis/consistency-check';
import type { Figure } from '../src/requirements-tracking/analysis/excel-figures';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const figures: Figure[] = [
  { id: 'Mengen!B2', sheet: 'Mengen', cell: 'B2', row: 2, col: 'B', value: 12000, rawValue: 12000, unit: 'count', unitSource: 'adjacent', label: 'Mengen › Palettenstellplätze › Anzahl', rawText: '12000', kind: 'count' },
  { id: 'Flächen!B2', sheet: 'Flächen', cell: 'B2', row: 2, col: 'B', value: 18500, rawValue: 18500, unit: 'm2', unitSource: 'header', label: 'Flächen › Lagerfläche gesamt › Fläche (m²)', rawText: '18500', kind: 'area' },
  { id: 'Budget!B2', sheet: 'Budget', cell: 'B2', row: 2, col: 'B', value: 1450000, rawValue: 1450000, unit: 'EUR', unitSource: 'numFmt', label: 'Budget › Lagerbetrieb › Jahresbudget', rawText: '1450000', kind: 'amount' },
  { id: 'Budget!C2', sheet: 'Budget', cell: 'C2', row: 2, col: 'C', value: 2027, rawValue: 2027, unit: 'unknown', unitSource: 'none', label: 'Budget › Lagerbetrieb › Jahr', rawText: '2027', kind: 'year' },
];

// 1. quantities of a proposal: structured ∪ text, deduplicated
{
  const q = requirementQuantities({
    ears_text: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.',
    quantities: [{ value: 12400, unit: 'Palettenstellplätze', kind: 'count' }],
    source: { quote: '12.400 Palettenstellplätze sind vorzuhalten.' },
  });
  assert.equal(q.length, 1, 'same value/unit from text and quantities is one entry');
  assert.equal(q[0].ref, 'q0');
  assert.equal(q[0].unit, 'count');
  const money = requirementQuantities({ ears_text: 'Das Jahresbudget beträgt 1,45 Mio. €.', quantities: [] });
  assert.equal(money[0].value, 1450000);
  assert.equal(money[0].unit, 'EUR');
  assert.equal(money[0].raw, '1,45 Mio. €');
  assert.deepEqual(requirementQuantities({ ears_text: 'Der Auftragnehmer muss Retouren zeitnah bearbeiten.', quantities: [] }), []);
  pass('requirementQuantities');
}

// 2. candidate pre-filter: unit compatibility + magnitude / label overlap; years never
{
  const q = requirementQuantities({ ears_text: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.', quantities: [] });
  const candidates = candidateFigures(q, figures, 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.');
  assert.deepEqual(candidates.map((f) => f.id), ['Mengen!B2']);
  const area = requirementQuantities({ ears_text: 'Lagerfläche von 18.500 m².', quantities: [] });
  assert.deepEqual(candidateFigures(area, figures, 'Lagerfläche').map((f) => f.id), ['Flächen!B2']);
  pass('candidateFigures');
}

// 3. service run with a stubbed LLM
{
  const proposals = new Map<string, any>([
    ['P-1', { id: 'P-1', status: 'proposed', payload: { ears_text: 'Der Auftragnehmer muss 12.400 Palettenstellplätze vorhalten.', quantities: [{ value: 12400, unit: 'Palettenstellplätze', kind: 'count' }], source: { quote: '12.400 Palettenstellplätze' } } }],
    ['P-2', { id: 'P-2', status: 'proposed', payload: { ears_text: 'Das Jahresbudget beträgt 1,45 Mio. €.', quantities: [{ value: 1450000, unit: '€', kind: 'threshold' }], source: { quote: '1,45 Mio. €' } } }],
    ['P-3', { id: 'P-3', status: 'proposed', payload: { ears_text: 'Retouren sind zeitnah zu bearbeiten.', quantities: [], source: { quote: 'zeitnah' } } }],
  ]);
  const updates: any[] = [];
  const events: any[] = [];
  let llmCalls = 0;
  const llm = {
    supportsStructuredOutput: () => false,
    getModelId: () => 'stub',
    generateTextWithMessages: async ({ messages }: any) => {
      llmCalls++;
      const user = messages[1].content as string;
      if (user.includes('Mengen!B2')) return JSON.stringify({ matches: [{ figure_id: 'Mengen!B2', quantity_ref: 'q0', same_quantity: true, reasoning: 'gleiche Kennzahl', confidence: 0.92 }] });
      if (user.includes('Budget!B2')) return JSON.stringify({ matches: [{ figure_id: 'Budget!B2', quantity_ref: 'q0', same_quantity: true, reasoning: 'Jahresbudget', confidence: 0.9 }] });
      return JSON.stringify({ matches: [] });
    },
  };
  const repository = {
    getProposal: async (_p: string, id: string) => proposals.get(id) ?? null,
    updateProposal: async (_p: string, proposal: any) => { updates.push(proposal); proposals.set(proposal.id, proposal); },
  };
  const eventsService = { emit: async (_p: string, type: string, payload: any) => { events.push({ type, payload }); return {} as any; } };
  const runs = { start: async () => ({ id: 'AR-1' }), finish: async () => undefined };

  const service = new ConsistencyCheckService(llm as any, repository as any, eventsService as any, runs as any);
  void (async () => {
    const result = await service.run('demo', ['P-1', 'P-2', 'P-3'], figures, { runTag: 'AN-001' });
    assert.equal(llmCalls, 2, 'no LLM call for the requirement without numbers');
    assert.equal(result.checked, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.matched, 2, 'both figures matched');
    assert.equal(result.alerts.length, 1, 'only the differing figure alerts');
    assert.equal(result.alerts[0].proposalId, 'P-1');
    assert.equal(result.alerts[0].figureId, 'Mengen!B2');
    assert.equal(result.alerts[0].tenderValue, 12400);
    assert.equal(result.alerts[0].excelValue, 12000);
    assert.equal(result.alerts[0].resolution, undefined);
    assert.equal(proposals.get('P-1').payload.consistency_alerts.length, 1, 'alert persisted on the card');
    assert.equal(proposals.get('P-2').payload.consistency_alerts.length, 0, 'equal figures leave no alert');
    assert.equal(proposals.get('P-3').payload.consistency_alerts, undefined, 'skipped card untouched');
    assert.ok(events.some((e) => e.type === 'analysis.alert' && e.payload.proposalId === 'P-1'));
    pass('run: alert only when same quantity AND differs; equal + unmatched silent');

    // re-run keeps a human resolution on the same alert
    proposals.get('P-1').payload.consistency_alerts[0].resolution = 'clarify';
    await service.run('demo', ['P-1'], figures, { runTag: 'AN-002' });
    assert.equal(proposals.get('P-1').payload.consistency_alerts[0].resolution, 'clarify');
    pass('re-run preserves the resolution of an unchanged alert');

    console.log(`\n${passed} checks passed`);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
