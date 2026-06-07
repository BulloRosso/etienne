/**
 * Unit tests for `tryParseLlmJson` — the salvage parser used on the
 * generateText fallback path of the EARS extraction pipeline.
 *
 * These guard the behaviours that previously caused silent empty-array
 * failures: ```json fences, prose around the JSON, and truncated output.
 *
 * Run with:  cd backend && tsx test/unit-try-parse-llm-json.test.ts
 */
import { strict as assert } from 'node:assert';
import { tryParseLlmJson } from '../src/mcpserver/document-analysis-tools';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

// 1. Plain valid JSON
{
  const out = tryParseLlmJson('{"requirements": [{"original_text": "x"}]}') as any;
  assert.ok(out && Array.isArray(out.requirements), 'plain JSON parses');
  assert.equal(out.requirements[0].original_text, 'x');
  pass('plain valid JSON');
}

// 2. ```json fenced block (the case the old parser mishandled)
{
  const raw = 'Here you go:\n```json\n{"requirements": [{"original_text": "y"}]}\n```\nDone.';
  const out = tryParseLlmJson(raw) as any;
  assert.ok(out && out.requirements?.[0]?.original_text === 'y', 'fenced json salvaged');
  pass('```json fenced block with surrounding prose');
}

// 3. Bare ``` fence (no language tag)
{
  const raw = '```\n{"a": 1}\n```';
  const out = tryParseLlmJson(raw) as any;
  assert.equal(out?.a, 1);
  pass('bare ``` fence');
}

// 4. Prose around a raw object (no fence) — brace-balance salvage
{
  const raw = 'The result is {"requirements": [], "context_facts": []} as requested.';
  const out = tryParseLlmJson(raw) as any;
  assert.ok(out && Array.isArray(out.requirements), 'prose-wrapped object salvaged');
  pass('prose-wrapped object (brace-balance salvage)');
}

// 5. Strings containing braces must not confuse the balance scan
{
  const raw = '{"note": "this } is { tricky", "n": 2}';
  const out = tryParseLlmJson(raw) as any;
  assert.equal(out?.n, 2);
  assert.equal(out?.note, 'this } is { tricky');
  pass('braces inside string literals');
}

// 6. Truncated JSON (output cut off) → null
{
  const raw = '{"requirements": [{"original_text": "partial", "actor": "the sys';
  const out = tryParseLlmJson(raw);
  assert.equal(out, null, 'truncated JSON returns null, not a partial object');
  pass('truncated JSON returns null');
}

// 7. Empty / whitespace input → null
{
  assert.equal(tryParseLlmJson(''), null);
  assert.equal(tryParseLlmJson('   \n  '), null);
  pass('empty input returns null');
}

// 8. Non-JSON prose → null
{
  assert.equal(tryParseLlmJson('I could not find any requirements.'), null);
  pass('non-JSON prose returns null');
}

console.log(`\n${passed} assertions passed.`);
