/**
 * Test 1 — line-quality-insights skill: data-grounding + prompt contract.
 *
 * The skill itself is a Claude Code markdown skill — there is no in-process
 * service to invoke. What we CAN verify (and what's load-bearing for the
 * demo) is that:
 *
 *   1. The skill's SKILL.md exists and declares the right name/description
 *   2. The "process flow", "data source map", and "default time window"
 *      sections promised by the skill prompt are actually present
 *   3. The seeded data the skill claims to query matches reality:
 *      - quality-reports/ contains an xlsx that names PO-1003 with
 *        surface_finish defects on the coolant day (TODAY-1, inspected
 *        from TODAY-2 machining)
 *      - status/status_CNC-5AX_<TODAY-2>.json contains a 'degraded' block
 *        with reason 'coolant_quality_degraded'
 *      - The wiki has a root-cause-coolant-degradation.md page
 *      - The decision-graph for coolant-degradation-response exists
 *   4. The "worst day" claim the demo relies on is FALSIFIABLE from the
 *      seeded data alone — no LLM needed:
 *        worst day = the date with the largest count of major+critical
 *        defects in quality-reports/, which MUST be TODAY-1 (May 14)
 *        with the PO-1003 day-2 inspection.
 *
 * This test catches: data fixtures drift, wiki page renames, skill prompt
 * deletions, and any change that makes the demo's pitch claim false.
 *
 * Run with: npx tsx backend/test/line-quality-insights-skill.test.ts
 */

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// adm-zip parses xlsx (which is a zip). Already a backend dep — see
// scripts/seed-factory-line-sim/fixtures/xlsx-writer.ts for the reverse use.
import AdmZip from 'adm-zip';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const PROJECT_ROOT = join(REPO_ROOT, 'workspace', 'factory-line-sim');
const TODAY = '2026-05-15'; // hardcoded to match the seed fixtures

function dateMinus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

/** Extract all <t>...</t> text nodes from an xlsx sharedStrings.xml. */
function extractXlsxStrings(xlsxPath: string): string[] {
  const zip = new AdmZip(xlsxPath);
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  if (!ssEntry) return [];
  const xml = ssEntry.getData().toString('utf8');
  const out: string[] = [];
  const re = /<t[^>]*>([^<]*)<\/t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!);
  return out;
}

async function main(): Promise<void> {
  console.log(`# project root: ${PROJECT_ROOT}`);

  assert.ok(existsSync(PROJECT_ROOT), 'factory-line-sim must be seeded before running this test');

  // ── 1. SKILL.md exists and declares the right metadata ────────────
  const skillPath = join(PROJECT_ROOT, '.claude', 'skills', 'line-quality-insights', 'SKILL.md');
  assert.ok(existsSync(skillPath), 'SKILL.md must exist at ' + skillPath);
  const skill = readFileSync(skillPath, 'utf8');

  // YAML frontmatter sanity
  assert.match(skill, /^---/, 'SKILL.md starts with YAML frontmatter');
  assert.match(skill, /name:\s*line-quality-insights/, 'skill name field present');
  assert.match(skill, /description:.*[Qq]uality/, 'description mentions quality');
  console.log('  PASS  SKILL.md frontmatter declares name + description');

  // Required sections the demo prompt relies on
  for (const heading of ['Process flow', 'Machine roles', 'Data source map', 'Default time window', 'Emit-Insight procedure']) {
    assert.ok(
      new RegExp('##? +' + heading, 'i').test(skill),
      `SKILL.md must contain section "${heading}" (the demo prompt relies on it)`,
    );
  }
  console.log('  PASS  SKILL.md declares all 5 required sections');

  // The skill MUST forbid proposing fixes — that's a hard out-of-scope rule
  // Tolerate markdown emphasis like "do **not** propose a fix".
  assert.match(skill, /do[\s*_]+not[\s*_]+propose.{0,40}fix/i, 'skill must explicitly forbid proposing fixes');
  console.log('  PASS  SKILL.md explicitly forbids proposing fixes');

  // The skill MUST point at the data sources by path
  for (const p of ['quality-reports/', 'status/', 'production-orders/', 'external-events']) {
    assert.ok(skill.includes(p), `SKILL.md must reference data source "${p}"`);
  }
  console.log('  PASS  SKILL.md references all 4 data sources by path');

  // ── 2. The seeded data matches the skill's claims ────────────────
  // 2a. The coolant-day status block exists with the right reason.
  const coolantDay = dateMinus(2); // 2026-05-13
  const cncStatusPath = join(PROJECT_ROOT, 'status', `status_CNC-5AX_${coolantDay}.json`);
  assert.ok(existsSync(cncStatusPath), `status JSON missing: ${cncStatusPath}`);
  const cncStatus = JSON.parse(readFileSync(cncStatusPath, 'utf8'));
  const degradedBlock = cncStatus.timeline.find((e: any) => e.state === 'degraded');
  assert.ok(degradedBlock, 'expected a degraded block in CNC-5AX on the coolant day');
  assert.equal(degradedBlock.reason, 'coolant_quality_degraded', 'degraded block has correct reason');
  console.log(`  PASS  CNC-5AX status on ${coolantDay} contains the coolant_quality_degraded block`);

  // 2b. The PO-1003 day-2 quality report contains surface_finish defects.
  const inspectionDay = dateMinus(1); // 2026-05-14
  const po1003Xlsx = join(PROJECT_ROOT, 'quality-reports', `${inspectionDay}_QA-INSP_PO-1003-day2.xlsx`);
  assert.ok(existsSync(po1003Xlsx), `expected xlsx missing: ${po1003Xlsx}`);
  const strings = extractXlsxStrings(po1003Xlsx);
  assert.ok(strings.includes('PO-1003'), 'xlsx mentions PO-1003');
  assert.ok(strings.includes('surface_finish'), 'xlsx contains surface_finish defect rows');
  assert.ok(strings.includes('surface_staining'), 'xlsx contains surface_staining defect rows');
  // Count surface defect rows (each row has one defect_type cell; the
  // sharedStrings table will have at least one occurrence each — that's
  // enough to prove they're there. The actual count check is in 2d.)
  console.log(`  PASS  ${inspectionDay} PO-1003 xlsx contains surface_finish + surface_staining rows`);

  // 2c. Wiki root-cause page exists.
  const wikiPath = join(PROJECT_ROOT, 'wiki', 'topics', 'root-cause-coolant-degradation.md');
  assert.ok(existsSync(wikiPath), 'root-cause-coolant-degradation wiki page must exist');
  const wikiBody = readFileSync(wikiPath, 'utf8');
  assert.match(wikiBody, /coolant_temp_high/i, 'wiki page documents coolant_temp_high MQTT event');
  assert.match(wikiBody, /65\s*°?C/, 'wiki page cites the 65 °C threshold');
  console.log('  PASS  wiki root-cause-coolant-degradation page documents the trigger');

  // 2d. Decision graph file exists with the matching trigger.
  const graphPath = join(PROJECT_ROOT, 'decision-graphs', 'coolant-degradation-response.json');
  assert.ok(existsSync(graphPath));
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  assert.equal(graph.id, 'coolant-degradation-response');
  const triggerCondition = graph.conditions.find((c: any) => c.zeromqEvent?.includes('coolant_temp_high'));
  assert.ok(triggerCondition, 'decision graph has a condition watching coolant_temp_high');
  console.log('  PASS  decision-graphs/coolant-degradation-response.json triggers on coolant_temp_high');

  // ── 3. The "worst day" claim is falsifiable + provably TODAY-1 ────
  // Count ALL non-pass defects per inspection day across all xlsx files
  // (any severity — minor staining still counts as a quality finding).
  const qualityDir = join(PROJECT_ROOT, 'quality-reports');
  const defectsByDay = new Map<string, number>();
  // Defect-type values that should NOT be counted (a 'pass' row).
  const PASS = 'pass';
  for (const filename of readdirSync(qualityDir).filter((f) => f.endsWith('.xlsx'))) {
    const xlsxStrings = extractXlsxStrings(join(qualityDir, filename));
    const zip = new AdmZip(join(qualityDir, filename));
    const sheet = zip.getEntry('xl/worksheets/sheet1.xml');
    if (!sheet) continue;
    const sheetXml = sheet.getData().toString('utf8');
    // Count rows: total minus passes.
    const passIdx = xlsxStrings.indexOf(PASS);
    const totalRows = (sheetXml.match(/<row /g) ?? []).length - 1; // minus header
    let passCount = 0;
    if (passIdx !== -1) {
      const re = new RegExp(`<c[^>]*t="s"[^>]*><v>${passIdx}</v></c>`, 'g');
      passCount = (sheetXml.match(re) ?? []).length;
    }
    const defectCount = totalRows - passCount;
    const day = filename.slice(0, 10);
    defectsByDay.set(day, (defectsByDay.get(day) ?? 0) + defectCount);
  }

  console.log('  DEBUG defects by inspection day (any severity):');
  for (const [day, n] of [...defectsByDay.entries()].sort()) {
    console.log(`         ${day}: ${n} defects`);
  }

  // The worst day MUST be the inspection day of PO-1003 day-2 (TODAY-1),
  // because the coolant cluster produced 6 surface_finish + 3 surface_staining
  // = 9 defects. The chip-jam day produces 6 defects total.
  const worstDay = [...defectsByDay.entries()].sort((a, b) => b[1] - a[1])[0]!;
  assert.equal(worstDay[0], inspectionDay,
    `worst day must be ${inspectionDay} (PO-1003 coolant cluster); got ${worstDay[0]}`);
  assert.ok(worstDay[1] >= 9,
    `worst day must have ≥9 defects (6 surface_finish + 3 surface_staining); got ${worstDay[1]}`);
  console.log(`  PASS  worst day this week is ${worstDay[0]} with ${worstDay[1]} defects (PO-1003 coolant cluster)`);

  // ── 4. The skill's "Emit-Insight" contract is self-consistent ─────
  // The skill MUST document the previewFile pattern, the required prompt
  // field, and the react-icons naming convention. Without these, the
  // skill would produce malformed quick-actions that crash the UI.
  assert.match(skill, /insights\/insight-/, 'skill documents the insights/insight-*.md path pattern');
  assert.match(skill, /previewFile/, 'skill documents the previewFile field');
  assert.match(skill, /required[\s`]+prompt|prompt[\s`]+field.{0,40}required/i, 'skill documents that prompt is required');
  assert.match(skill, /Fa[A-Z]\w+|Md[A-Z]\w+/, 'skill documents react-icons naming');
  console.log('  PASS  SKILL.md Emit-Insight contract is self-consistent');

  console.log('\n[32m✓ line-quality-insights-skill.test passed[0m');
}

main().catch((err) => {
  console.error(`\n[31m✗ FAILED:[0m`, err instanceof Error ? err.stack : err);
  process.exit(1);
});
