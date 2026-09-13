/**
 * Unit tests for the heading-aware sectionizer used by the tender analysis
 * ingestion (backend/src/requirements-tracking/ingestion/sectionizer.ts).
 *
 * Run with:  cd backend && npx tsx test/reqtrack-sectionizer.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  detectHeading,
  joinPages,
  sectionizeDocument,
} from '../src/requirements-tracking/ingestion/sectionizer';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

// 1. heading detection
{
  assert.deepEqual(detectHeading('## Tabelle: Mengen'), { level: 2, title: 'Tabelle: Mengen' });
  assert.deepEqual(detectHeading('3.2.1 Wareneingang'), { level: 3, title: '3.2.1 Wareneingang' });
  assert.deepEqual(detectHeading('1 Gegenstand der Ausschreibung'), { level: 1, title: '1 Gegenstand der Ausschreibung' });
  assert.equal(detectHeading('3 Wareneingang muss innerhalb von 4 Stunden erfolgen.'), null, 'sentence is not a heading');
  assert.equal(detectHeading('3.2 Lagerung ............ 12'), null, 'TOC dot leader line');
  assert.equal(detectHeading('12.500 m² Lagerfläche'), null, 'quantity line');
  assert.equal(detectHeading('18.500 Palettenstellplätze'), null, 'thousands number is not a chapter number');
  assert.deepEqual(detectHeading('LEISTUNGSBESCHREIBUNG'), { level: 1, title: 'LEISTUNGSBESCHREIBUNG' });
  assert.deepEqual(detectHeading('§ 5 Haftung'), { level: 1, title: '§ 5 Haftung' });
  assert.deepEqual(detectHeading('Anlage 2 – Mengengerüst'), { level: 1, title: 'Anlage 2 – Mengengerüst' });
  assert.equal(detectHeading('<!-- page: 3 -->'), null, 'page marker is never a heading');
  assert.equal(detectHeading('AB'), null, 'too short for all-caps');
  pass('detectHeading: markdown, numbered, keyword, ALL CAPS; rejects sentences, TOC, quantities, markers');
}

// 2. LiteParse-like text with page markers → sections with real pages
{
  const text = joinPages([
    { pageNum: 1, text: 'Nordland Handels AG\n1 Gegenstand der Ausschreibung\nDie Nordland Handels AG schreibt den Betrieb aus.\n2 Mengengerüst\nLagerfläche 18.500 m² gesamt.' },
    { pageNum: 2, text: '2.1 Flächen\nKühlzone 1.200 m² (2–8 °C).\n3 Wareneingang\nDer Auftragnehmer muss Wareneingänge innerhalb von 4 Stunden buchen.' },
  ]);
  const { sections, pageSource } = sectionizeDocument('D-01', text);
  assert.equal(pageSource, 'markers');
  const paths = sections.map((s) => s.headingPath);
  assert.deepEqual(paths, [
    '(preamble)',
    '1 Gegenstand der Ausschreibung',
    '2 Mengengerüst',
    '2 Mengengerüst > 2.1 Flächen',
    '3 Wareneingang',
  ]);
  assert.deepEqual(sections.map((s) => s.id), ['D-01/sec/1', 'D-01/sec/2', 'D-01/sec/3', 'D-01/sec/4', 'D-01/sec/5']);
  assert.equal(sections[1].pageFrom, 1);
  assert.equal(sections[3].pageFrom, 2, '2.1 Flächen is on page 2');
  assert.equal(sections[4].pageTo, 2);
  // the Mengengerüst section spans the page break (marker sits inside it)
  assert.equal(sections[2].pageFrom, 1);
  assert.equal(sections[2].pageTo, 2);
  for (const section of sections) {
    assert.equal(text.slice(section.charFrom, section.charTo).trim(), section.text, `char offsets of ${section.id}`);
  }
  for (let i = 1; i < sections.length; i++) {
    assert.ok(sections[i - 1].charTo <= sections[i].charFrom, 'sections are contiguous and ordered');
  }
  pass('page markers → real pageFrom/pageTo, contiguous char offsets, nested heading paths');
}

// 3. no markers → estimated pages, one preamble when nothing looks like a heading
{
  const long = `Einleitung ohne Überschriften.\n${'Lorem ipsum dolor sit amet. '.repeat(400)}`;
  const { sections, pageSource } = sectionizeDocument('D-02', long, { charsPerPage: 3000 });
  assert.equal(pageSource, 'estimated');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].headingPath, '(preamble)');
  assert.equal(sections[0].pageFrom, 1);
  assert.ok(sections[0].pageTo >= 4, `estimated ${sections[0].pageTo} pages`);
  pass('no markers → estimated pages (~3000 chars/page)');
}

// 4. markdown (mammoth / catalog) still works exactly as before
{
  const md = '# Leistungskatalog\n\nIntro\n\n## Inbound-Handling\n\nWareneingang.\n\n## Order Fulfillment\n\nPicking.\n';
  const { sections } = sectionizeDocument('D-03', md);
  assert.deepEqual(
    sections.map((s) => s.headingPath),
    ['Leistungskatalog', 'Leistungskatalog > Inbound-Handling', 'Leistungskatalog > Order Fulfillment'],
  );
  pass('markdown headings');
}

// 5. a marker-only preamble is dropped
{
  const text = joinPages([{ pageNum: 1, text: '1 Titel\nInhalt' }]);
  const { sections } = sectionizeDocument('D-04', text);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].headingPath, '1 Titel');
  pass('marker-only preamble is not a section');
}

console.log(`\n${passed} checks passed`);
