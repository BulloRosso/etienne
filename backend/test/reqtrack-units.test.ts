/**
 * Unit tests for backend/src/requirements-tracking/analysis/units.ts — the
 * number/unit normalisation behind the Excel consistency check.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-units.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  detectUnitInLabel,
  extractNumbersFromText,
  normalizeUnit,
  parseGermanNumber,
  unitsCompatible,
  withinTolerance,
} from '../src/requirements-tracking/analysis/units';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

// 1. German numbers
{
  assert.equal(parseGermanNumber('12.500'), 12500);
  assert.equal(parseGermanNumber('12.500,50'), 12500.5);
  assert.equal(parseGermanNumber('1,45'), 1.45);
  assert.equal(parseGermanNumber('1.450.000'), 1450000);
  assert.equal(parseGermanNumber('0.3'), 0.3);
  assert.equal(parseGermanNumber('99,5'), 99.5);
  assert.equal(parseGermanNumber('1 450 000'), 1450000);
  assert.equal(parseGermanNumber('1,450,000'), 1450000, 'two commas = English thousands');
  assert.equal(parseGermanNumber('abc'), null);
  assert.equal(parseGermanNumber('-2,5'), -2.5);
  pass('parseGermanNumber');
}

// 2. units
{
  assert.deepEqual(normalizeUnit('T€'), { unit: 'EUR', factor: 1000, per: undefined });
  assert.equal(normalizeUnit('Mio. €').factor, 1e6);
  assert.equal(normalizeUnit('qm').unit, 'm2');
  assert.equal(normalizeUnit('m²').unit, 'm2');
  assert.equal(normalizeUnit('Std.').unit, 'hour');
  assert.equal(normalizeUnit('%').unit, 'percent');
  assert.equal(normalizeUnit('Palettenstellplätze').unit, 'count');
  assert.equal(normalizeUnit('Positionen/Tag').unit, 'count');
  assert.equal(normalizeUnit('Positionen/Tag').per, 'day');
  assert.equal(normalizeUnit('Bananen').unit, 'unknown');
  assert.equal(detectUnitInLabel('Fläche (m²)')?.unit, 'm2');
  assert.equal(detectUnitInLabel('Jahresbudget in T€')?.factor, 1000);
  assert.equal(detectUnitInLabel('Reaktionszeit [Std.]')?.unit, 'hour');
  assert.equal(detectUnitInLabel('Anzahl Palettenstellplätze')?.unit, 'count');
  assert.equal(detectUnitInLabel('Bemerkung'), null);
  assert.ok(unitsCompatible('count', 'unknown'));
  assert.ok(!unitsCompatible('EUR', 'm2'));
  pass('normalizeUnit / detectUnitInLabel / unitsCompatible');
}

// 3. numbers in text
{
  const found = extractNumbersFromText(
    'Die Lagerfläche beträgt 18.500 m² zzgl. einer Kühlzone von ca. 1.200 m² (2–8 °C). ' +
      'Das Jahresbudget liegt bei 1,45 Mio. €; die Laufzeit beträgt 48 Monate ab dem 01.01.2027, siehe Kapitel 3.2.1 und § 613a BGB. ' +
      'Cut-off ist 14:00 Uhr. Inventurgenauigkeit ≥ 99,5 %. 12.400 Palettenstellplätze sind vorzuhalten.',
  );
  const byRaw = new Map(found.map((n) => [n.raw, n]));
  assert.equal(byRaw.get('18.500 m²')?.value, 18500);
  assert.equal(byRaw.get('18.500 m²')?.unit, 'm2');
  assert.equal(byRaw.get('1.200 m²')?.approx, true, 'ca. marks approx');
  assert.equal(byRaw.get('1,45 Mio. €')?.value, 1450000);
  assert.equal(byRaw.get('1,45 Mio. €')?.unit, 'EUR');
  assert.equal(byRaw.get('48 Monate')?.unit, 'month');
  assert.equal(byRaw.get('99,5 %')?.unit, 'percent');
  assert.equal(byRaw.get('12.400 Palettenstellplätze')?.unit, 'count');
  assert.ok(!found.some((n) => n.value === 3.2 || n.value === 2027 || n.value === 613 || n.value === 14), `no section/year/paragraph/time numbers: ${found.map((n) => n.raw).join(', ')}`);
  pass('extractNumbersFromText: units, multipliers, approx, skips refs/years/times');
}

// 4. tolerance
{
  assert.equal(withinTolerance({ value: 12400, raw: '12.400' }, { value: 12000 }).equal, false, 'Palettenstellplätze 12.400 vs 12.000 differ');
  assert.equal(withinTolerance({ value: 480000, raw: '480.000 €' }, { value: 470000 }).equal, false);
  assert.equal(withinTolerance({ value: 1450000, raw: '1,45 Mio. €', factor: 1e6 }, { value: 1450000 }).equal, true);
  assert.equal(withinTolerance({ value: 1450000, raw: '1,45 Mio. €', factor: 1e6 }, { value: 1452000 }).equal, true, 'within half of the last written digit (0,005 Mio)');
  assert.equal(withinTolerance({ value: 18500, raw: '18.500' }, { value: 18500.4 }).equal, true);
  assert.equal(withinTolerance({ value: 1200, raw: '1.200', approx: true }, { value: 1234 }).equal, true, 'ca. widens to 5 %');
  assert.equal(withinTolerance({ value: 1200, raw: '1.200' }, { value: 1234 }).equal, false);
  const t = withinTolerance({ value: 12400 }, { value: 12000 });
  assert.equal(t.deviationAbs, 400);
  assert.ok(Math.abs(t.deviationPct - 3.333) < 0.01);
  pass('withinTolerance: rounding, magnitude words, approx');
}

console.log(`\n${passed} checks passed`);
