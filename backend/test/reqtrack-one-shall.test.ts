/**
 * Unit tests for the atomicity heuristic of the extraction pipeline
 * (`countObligations` in backend/src/requirements-tracking/pipelines/extraction.pipeline.ts).
 * German "muss … können" is ONE obligation; "darf … nicht" is one prohibition.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-one-shall.test.ts
 */
import { strict as assert } from 'node:assert';
import { countObligations } from '../src/requirements-tracking/pipelines/extraction.pipeline';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

assert.equal(countObligations('Das WMS muss Bestände in Echtzeit anzeigen können.'), 1, 'muss … können');
assert.equal(countObligations('Der Auftragnehmer darf keine Gefahrgüter der Klasse 3 lagern.'), 1, 'darf … nicht');
assert.equal(countObligations('Wareneingänge sind innerhalb von 4 Stunden zu buchen.'), 1, 'sind zu');
assert.equal(countObligations('Der Auftragnehmer hat die Inventur jährlich durchzuführen.'), 1, 'hat zu');
assert.equal(countObligations('Der Auftragnehmer soll Retouren zeitnah bearbeiten.'), 1, 'soll');
assert.equal(countObligations('The contractor shall be able to report daily.'), 1, 'shall');
assert.equal(countObligations('Das System muss umschalten und muss den Administrator benachrichtigen.'), 2, 'two obligations');
assert.equal(countObligations('Das System muss umschalten und soll benachrichtigen.'), 2, 'muss + soll');
assert.equal(countObligations('Das System kann exportieren und muss protokollieren.'), 2, 'kann before muss is not an ability verb');
assert.equal(countObligations('Der Lagerbetrieb umfasst 18.500 m².'), 0, 'no obligation');
pass('countObligations');

console.log(`\n${passed} checks passed`);
