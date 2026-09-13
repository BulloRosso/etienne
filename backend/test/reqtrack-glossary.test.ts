/**
 * Unit tests for the user-glossary parser and the <glossary> renderer
 * (backend/src/requirements-tracking/analysis/glossary.service.ts).
 *
 * Run with:  cd backend && npx tsx test/reqtrack-glossary.test.ts
 */
import { strict as assert } from 'node:assert';
import { GlossaryService } from '../src/requirements-tracking/analysis/glossary.service';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const service = new GlossaryService(null as any, null as any, null as any);

// 1. markdown table + bullets, merged by our term
{
  const md = `# Glossar

| Kundenbegriff | Unser Begriff | Hinweis |
|---|---|---|
| Kommissionierung | Order Fulfillment (Picking & Packing) | inkl. Verpackung |
| Auftragskommissionierung | Order Fulfillment (Picking & Packing) | |
| LVS | WMS | Lagerverwaltungssystem |

- Retourenabwicklung → Returns Management
- Wareneingang -> Inbound-Handling (Vereinnahmung)
`;
  const terms = service.parseUserGlossary(md);
  const fulfil = terms.find((t) => t.ourTerm.startsWith('Order Fulfillment'))!;
  assert.deepEqual(fulfil.customerTerms, ['Kommissionierung', 'Auftragskommissionierung']);
  assert.equal(fulfil.definition, 'inkl. Verpackung');
  assert.equal(fulfil.source, 'user');
  assert.deepEqual(terms.find((t) => t.ourTerm === 'WMS')!.customerTerms, ['LVS']);
  assert.deepEqual(terms.find((t) => t.ourTerm === 'Returns Management')!.customerTerms, ['Retourenabwicklung']);
  assert.equal(terms.find((t) => t.ourTerm === 'Inbound-Handling')!.definition, 'Vereinnahmung');
  assert.equal(terms.length, 4);
  pass('parseUserGlossary: table + bullet forms, merge by our term');
}

// 2. render is bounded and lists customer terms
{
  const text = service.render({
    language: 'de',
    catalogSha256: 'x',
    builtAt: '',
    terms: [
      { ourTerm: 'WMS', definition: 'Warehouse Management System', synonyms: ['Lagerverwaltung'], customerTerms: ['LVS', 'Lagerverwaltungssystem'], source: 'catalog' },
      { ourTerm: 'Returns Management', definition: '', synonyms: [], customerTerms: ['Retourenabwicklung'], source: 'user' },
    ],
  });
  assert.ok(text.includes('- WMS — Kundenbegriffe: LVS, Lagerverwaltungssystem — Synonyme: Lagerverwaltung — Warehouse Management System'));
  assert.ok(text.includes('- Returns Management — Kundenbegriffe: Retourenabwicklung'));
  assert.equal(service.render(null), '');
  const bounded = service.render(
    { language: 'de', catalogSha256: 'x', builtAt: '', terms: Array.from({ length: 500 }, (_, i) => ({ ourTerm: `Term ${i}`, definition: 'x'.repeat(50), synonyms: [], customerTerms: [], source: 'catalog' as const })) },
    2000,
  );
  assert.ok(bounded.length <= 2000);
  pass('render: format + size bound');
}

console.log(`\n${passed} checks passed`);
