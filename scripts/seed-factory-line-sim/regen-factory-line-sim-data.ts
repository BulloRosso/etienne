/**
 * Slim regenerator that rewrites just the per-day dashboard JSONs, the
 * status/production-order JSONs, and the quality-report xlsx files in
 * workspace/factory-line-sim/. No backend, no auth, no wiki re-seed.
 *
 * Importing `LINE_DASHBOARD_DAYS` runs the consistency validator in
 * dashboard-data.ts — if any QA-INSP finding falls outside QA-INSP's
 * running window or is attributed to an upstream machine that didn't
 * actually run the order earlier the same day, this script throws.
 *
 * Run with:
 *   cd c:/Data/GitHub/claude-multitenant
 *   npx tsx scripts/seed-factory-line-sim/regen-factory-line-sim-data.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PROJECT_NAME } from './fixtures/mission';
import { PRODUCTION_ORDERS } from './fixtures/production-orders';
import { STATUS_REPORTS } from './fixtures/status-reports';
import { QUALITY_REPORTS } from './fixtures/quality-reports';
import {
  CATEGORIES_JSON,
  JOBS_JSON,
  MACHINES_JSON,
  KEYWORDS_JSON,
  LINE_DASHBOARD_DAYS,
} from './fixtures/dashboard-data';
import { writeXlsx } from './fixtures/xlsx-writer';

const REPO_ROOT = 'C:/Data/GitHub/claude-multitenant';
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || join(REPO_ROOT, 'workspace');
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

async function main(): Promise<void> {
  console.log(`▸ Regenerating data for ${PROJECT_ROOT}`);

  // production-orders/
  const ordersDir = join(PROJECT_ROOT, 'production-orders');
  await mkdir(ordersDir, { recursive: true });
  for (const o of PRODUCTION_ORDERS) {
    await writeFile(join(ordersDir, `${o.order_id}.json`), JSON.stringify(o, null, 2), 'utf8');
  }
  console.log(`  ✓ production-orders: ${PRODUCTION_ORDERS.length} files`);

  // status/
  const statusDir = join(PROJECT_ROOT, 'status');
  await mkdir(statusDir, { recursive: true });
  for (const r of STATUS_REPORTS) {
    await writeFile(
      join(statusDir, `status_${r.machine_id}_${r.date}.json`),
      JSON.stringify(r, null, 2),
      'utf8',
    );
  }
  console.log(`  ✓ status: ${STATUS_REPORTS.length} files`);

  // quality-reports/
  const qualityDir = join(PROJECT_ROOT, 'quality-reports');
  await mkdir(qualityDir, { recursive: true });
  const headers = [
    'production_order_id', 'part_number', 'machine_id', 'item_id',
    'defect_type', 'defect_severity', 'measurement_value',
    'specification_min', 'specification_max',
    'inspector_id', 'timestamp', 'notes',
  ];
  for (const file of QUALITY_REPORTS) {
    const rows: Array<Array<string | number | null>> = [headers];
    for (const r of file.rows) {
      rows.push([
        r.production_order_id, r.part_number, r.machine_id, r.item_id,
        r.defect_type, r.defect_severity,
        r.measurement_value, r.specification_min, r.specification_max,
        r.inspector_id, r.timestamp, r.notes,
      ]);
    }
    const buf = await writeXlsx(rows);
    await writeFile(join(qualityDir, file.filename), buf);
    console.log(`  · ${file.filename} (${file.rows.length} rows)`);
  }
  console.log(`  ✓ quality-reports: ${QUALITY_REPORTS.length} xlsx files`);

  // linedashboard/
  const dashboardDir = join(PROJECT_ROOT, 'linedashboard');
  await mkdir(dashboardDir, { recursive: true });
  await writeFile(join(dashboardDir, 'categories.json'), JSON.stringify(CATEGORIES_JSON, null, 2), 'utf8');
  await writeFile(join(dashboardDir, 'jobs.json'), JSON.stringify(JOBS_JSON, null, 2), 'utf8');
  await writeFile(join(dashboardDir, 'machines.json'), JSON.stringify(MACHINES_JSON, null, 2), 'utf8');
  await writeFile(join(dashboardDir, 'keywords.json'), JSON.stringify(KEYWORDS_JSON, null, 2), 'utf8');
  for (const day of LINE_DASHBOARD_DAYS) {
    await writeFile(
      join(dashboardDir, `machines_line_${day.date}.linedashboard.json`),
      JSON.stringify(day, null, 2),
      'utf8',
    );
  }
  await writeFile(
    join(dashboardDir, 'line-timeline-index.json'),
    JSON.stringify({ days: LINE_DASHBOARD_DAYS.map((d) => d.date) }, null, 2),
    'utf8',
  );
  console.log(`  ✓ linedashboard: ${LINE_DASHBOARD_DAYS.length} per-day JSONs + 5 index files`);

  console.log('\n✓ Regeneration complete.');
}

main().catch((err) => {
  console.error('\n✗ Regeneration failed:', err.message ?? err);
  process.exit(1);
});
