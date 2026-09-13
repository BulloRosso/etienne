/**
 * Unit tests for the workbook renderer + figure index
 * (backend/src/requirements-tracking/ingestion/xlsx-markdown.ts,
 *  backend/src/requirements-tracking/analysis/excel-figures.ts).
 *
 * Builds a workbook in memory with ExcelJS — no files, no services.
 * Run with:  cd backend && npx tsx test/reqtrack-excel-figures.test.ts
 */
import { strict as assert } from 'node:assert';
import ExcelJS from 'exceljs';
import { renderWorkbook } from '../src/requirements-tracking/ingestion/xlsx-markdown';
import { buildFigureIndex } from '../src/requirements-tracking/analysis/excel-figures';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const wb = new ExcelJS.Workbook();
const flaechen = wb.addWorksheet('Flächen');
flaechen.addRow(['Bereich', 'Fläche (m²)', 'Bemerkung']);
flaechen.addRow(['Lagerfläche gesamt', 18500, 'Hochregal + Blocklager']);
flaechen.addRow(['Kühlzone', 1200, '2–8 °C']);

const mengen = wb.addWorksheet('Mengen');
mengen.addRow(['Position', 'Anzahl', 'Einheit']);
mengen.addRow(['Palettenstellplätze', 12000, 'Stück']);
mengen.addRow(['Pickpositionen', 2300, 'Positionen/Tag']);

const budget = wb.addWorksheet('Budget');
budget.addRow(['Position', 'Jahresbudget', 'Jahr']);
const budgetRow = budget.addRow(['Lagerbetrieb', 1450000, 2027]);
budgetRow.getCell(2).numFmt = '#,##0 "€"';

const kpis = wb.addWorksheet('KPIs');
kpis.addRow(['Kennzahl', 'Zielwert']);
const accuracy = kpis.addRow(['Inventurgenauigkeit', 0.995]);
accuracy.getCell(2).numFmt = '0.0%';
kpis.addRow(['Reaktionszeit (Std.)', 4]);

const rendered = renderWorkbook(wb);

// 1. markdown lines carry sheet, cell range and header:value pairs
{
  assert.ok(rendered.markdown.includes('## Tabelle: Flächen'));
  assert.ok(rendered.markdown.includes('Spalten: A Bereich | B Fläche (m²) | C Bemerkung'));
  assert.ok(
    rendered.markdown.includes('- [Flächen!A2:C2] Bereich: Lagerfläche gesamt | Fläche (m²): 18500 | Bemerkung: Hochregal + Blocklager'),
    rendered.markdown,
  );
  assert.ok(rendered.markdown.includes('- [Mengen!A2:C2] Position: Palettenstellplätze | Anzahl: 12000 | Einheit: Stück'));
  assert.ok(rendered.markdown.includes('Zielwert: 99.5%'), 'percent format rendered as percent');
  assert.deepEqual(rendered.sheets.map((s) => s.rows), [2, 2, 1, 2]);
  pass('renderWorkbook: one quotable line per row with cell range');
}

// 2. cell records carry headers
{
  const cell = rendered.cells.find((c) => c.sheet === 'Mengen' && c.address === 'B2');
  assert.ok(cell);
  assert.equal(cell!.value, 12000);
  assert.equal(cell!.colHeader, 'Anzahl');
  assert.equal(cell!.rowHeader, 'Palettenstellplätze');
  pass('cell records: value, colHeader, rowHeader');
}

// 3. figure index: units from header, adjacent cell, numFmt; percent scaling; year excluded
{
  const figures = buildFigureIndex(rendered.cells);
  const byId = new Map(figures.map((f) => [f.id, f]));

  const area = byId.get('Flächen!B2')!;
  assert.equal(area.unit, 'm2');
  assert.equal(area.unitSource, 'header');
  assert.equal(area.value, 18500);
  assert.equal(area.kind, 'area');
  assert.equal(area.label, 'Flächen › Lagerfläche gesamt › Fläche (m²)');

  const pallets = byId.get('Mengen!B2')!;
  assert.equal(pallets.unit, 'count');
  assert.equal(pallets.unitSource, 'adjacent');

  const picks = byId.get('Mengen!B3')!;
  assert.equal(picks.unit, 'count');
  assert.equal(picks.per, 'day');

  const money = byId.get('Budget!B2')!;
  assert.equal(money.unit, 'EUR');
  assert.equal(money.unitSource, 'numFmt');
  assert.equal(money.kind, 'amount');

  const year = byId.get('Budget!C2')!;
  assert.equal(year.kind, 'year', 'a 4-digit value under a "Jahr" header is a year, never alerted');

  const pct = byId.get('KPIs!B2')!;
  assert.equal(pct.unit, 'percent');
  assert.equal(pct.value, 99.5);

  const hours = byId.get('KPIs!B3')!;
  assert.equal(hours.unit, 'hour');
  assert.equal(hours.unitSource, 'rowLabel');
  pass('buildFigureIndex: unit detection order, percent scaling, year kind');
}

console.log(`\n${passed} checks passed`);
