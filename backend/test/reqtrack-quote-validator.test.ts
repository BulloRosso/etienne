/**
 * Regression tests for the verbatim-quote check
 * (backend/src/requirements-tracking/pipelines/quote-validator.ts) and the
 * mammoth escape stripper in the ingestion service.
 *
 * The live run of 2026-09-12 failed EVERY extraction chunk with
 * "source.quote is not a verbatim quote": mammoth stores `18\.500 m²` while
 * the model quotes `18.500 m²`. Both sides must compare equal.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-quote-validator.test.ts
 */
import { strict as assert } from 'node:assert';
import { validateQuote } from '../src/requirements-tracking/pipelines/quote-validator';
import { unescapeMarkdownPunctuation } from '../src/requirements-tracking/ingestion.service';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

// 1. the escape stripper turns mammoth output back into readable text
{
  const raw =
    'Die Lagerfläche beträgt 18\\.500 m² Hallenfläche, davon 1\\.200 m² temperaturgeführte Kühlzone \\(2–8 °C\\)\\. ' +
    'Kontraktlogistik\\-Dienstleistung, Service\\-Level und IT\\-Anbindung\\.';
  const clean = unescapeMarkdownPunctuation(raw);
  assert.ok(clean.includes('18.500 m²'), clean);
  assert.ok(clean.includes('(2–8 °C).'), clean);
  assert.ok(clean.includes('Kontraktlogistik-Dienstleistung'), clean);
  assert.ok(!clean.includes('\\'), 'no backslashes left');
  // an escaped backslash collapses to one backslash (markdown semantics)
  assert.equal(unescapeMarkdownPunctuation('C:\\\\temp'), 'C:\\temp');
  // a lone backslash before a non-punctuation char is left alone
  assert.equal(unescapeMarkdownPunctuation('C:\\temp'), 'C:\\temp');
  // markdown structure is untouched
  assert.equal(unescapeMarkdownPunctuation('## 2 Mengengerüst'), '## 2 Mengengerüst');
  pass('unescapeMarkdownPunctuation: escapes removed, backslash semantics, headings intact');
}

// 2. the quote check tolerates escapes on either side (defence in depth)
{
  const escapedSource = 'Im Hochregallager sind insgesamt 12\\.400 Palettenstellplätze vorzuhalten\\.';
  const humanQuote = 'insgesamt 12.400 Palettenstellplätze vorzuhalten.';
  const result = validateQuote(escapedSource, humanQuote);
  assert.equal(result.valid, true, `escaped source vs plain quote: ${result.reason}`);
  assert.equal(result.exact, false, 'matched via normalisation, not exactly');
  pass('validateQuote: escaped source text matches an unescaped quote');
}

// 3. typographic variants (Word quotes/dashes, non-breaking space)
{
  assert.equal(validateQuote('Der Cut\u2011off ist 14:00\u00a0Uhr.', 'Der Cut-off ist 14:00 Uhr.').valid, true);
  assert.equal(validateQuote('Die \u201eKühlzone\u201c wird betrieben.', 'Die "Kühlzone" wird betrieben.').valid, true);
  assert.equal(validateQuote('Laufzeit 48 Monate \u2013 fest.', 'Laufzeit 48 Monate - fest.').valid, true);
  pass('validateQuote: smart quotes, dashes and non-breaking spaces normalise');
}

// 4. the check still rejects genuinely invented quotes
{
  const source = 'Der Auftragnehmer muss angelieferte Ware innerhalb von 4 Stunden buchen.';
  assert.equal(validateQuote(source, 'innerhalb von 2 Stunden buchen').valid, false, 'changed number is not verbatim');
  assert.equal(validateQuote(source, 'Der Auftragnehmer haftet unbegrenzt.').valid, false, 'invented sentence');
  assert.equal(validateQuote(source, '').valid, false, 'empty quote');
  assert.equal(validateQuote(source, 'innerhalb von 4 Stunden buchen').valid, true, 'exact substring still valid');
  pass('validateQuote: still rejects altered numbers and invented text');
}

console.log(`\n${passed} checks passed`);
