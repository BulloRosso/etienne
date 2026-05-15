/**
 * 5 quality reports. The seed script renders each into an actual .xlsx file
 * (via exceljs) so the "challenge: parse xlsx uploads" is real.
 *
 * Schema matches what wiki/topics/data-quality-reports-xlsx.md documents,
 * so a fresh agent reading the wiki can know what columns to expect.
 *
 * Internal-consistency invariants (enforced by the validator in
 * dashboard-data.ts):
 *
 *   1. Every row's timestamp must fall inside QA-INSP's scheduled
 *      running window for its production order on that date
 *      (`ORDER_SCHEDULE[order].find(r => r.machine === 'QA-INSP')`).
 *      No row may be stamped at an hour when QA-INSP wasn't running.
 *
 *   2. The file's date is the same date as the QA-INSP run for that order.
 *
 *   3. Hours are derived from `qaInspRunFor(order)` via `inspectionStamp`,
 *      never hand-typed. This is the only safe way to keep the dashboard's
 *      "Quality Findings" row inside QA-INSP's idle/running timeline.
 *
 * Defect distribution:
 *   - PO-1003 inspected on TODAY-1: 6 surface_finish + 3 surface_staining
 *     defects (signature of the coolant degradation that happened during
 *     the prior day's CNC-5AX run) plus 3 dimensional defects (signature
 *     of the T12 flute chip that happened two days prior on CNC-5AX),
 *     mixed with pass rows. Single inspection file.
 *   - PO-1005 inspected on TODAY-3: 4 dimensional + 2 edge defects
 *     (chatter from chip-jam on CNC-5AX two days prior).
 *   - PO-1001 / PO-1002: clean inspection runs with at most a couple of
 *     defects to make it look like real data.
 */

import { TODAY } from './mission';
import { qaInspRunFor } from './production-orders';

export interface QualityReportRow {
  production_order_id: string;
  part_number: string;
  machine_id: string;
  item_id: string; // e.g. "PO-1003-item-027"
  defect_type:
    | 'pass'
    | 'dimensional'
    | 'surface_finish'
    | 'surface_staining'
    | 'edge'
    | 'foreign_material'
    | 'other';
  defect_severity: 'none' | 'minor' | 'major' | 'critical';
  measurement_value: number | null;
  specification_min: number | null;
  specification_max: number | null;
  inspector_id: string;
  /** ISO timestamp. */
  timestamp: string;
  notes: string;
}

export interface QualityReportFile {
  /** Filename written under quality-reports/. */
  filename: string;
  rows: QualityReportRow[];
}

function dateMinus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

/**
 * Produce a stamp for inspection item `i` of `total` items in QA-INSP's
 * scheduled window for `order`. Distributes items evenly across the
 * window so every row is provably inside the running block.
 *
 * Throws if `order` has no QA-INSP run on file — failing loudly is the
 * point: callers must keep QUALITY_REPORTS aligned with ORDER_SCHEDULE.
 */
function inspectionStamp(order: string, i: number, total: number): { date: string; hh: number; mm: number; iso: string } {
  const run = qaInspRunFor(order);
  if (!run) {
    throw new Error(`No QA-INSP run scheduled for ${order}; cannot stamp inspection rows. Fix ORDER_SCHEDULE first.`);
  }
  const windowMin = (run.endHour - run.startHour) * 60;
  // Spread items across the window, half-open at the end so the last item
  // doesn't land exactly on `endHour`.
  const offsetMin = total <= 1 ? 0 : Math.floor(((i - 1) * (windowMin - 1)) / (total - 1));
  const totalMin = run.startHour * 60 + offsetMin;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return {
    date: run.date,
    hh,
    mm,
    iso: `${run.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
  };
}

// Deterministic pseudo-random so reruns produce identical xlsx files.
let _seed = 1337;
function rand(): number {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}
function jitter(base: number, range: number): number {
  return Math.round((base + (rand() - 0.5) * range) * 1000) / 1000;
}

function passRow(
  order: string,
  part: string,
  i: number,
  total: number,
  inspector: string,
): QualityReportRow {
  const stamp = inspectionStamp(order, i, total);
  return {
    production_order_id: order,
    part_number: part,
    machine_id: 'QA-INSP',
    item_id: `${order}-item-${String(i).padStart(3, '0')}`,
    defect_type: 'pass',
    defect_severity: 'none',
    measurement_value: 12.005 + (rand() - 0.5) * 0.01,
    specification_min: 11.99,
    specification_max: 12.02,
    inspector_id: inspector,
    timestamp: stamp.iso,
    notes: '',
  };
}

/**
 * Build a sequential set of inspection rows for `order`, total `count`
 * items, where the first `defectiveCount` items get the defect profile
 * returned by `defectFactory`.
 */
function generateRows(
  order: string,
  part: string,
  count: number,
  inspector: string,
  defectiveCount: number,
  defectFactory: (i: number) => Partial<QualityReportRow>,
): QualityReportRow[] {
  const rows: QualityReportRow[] = [];
  for (let i = 1; i <= count; i++) {
    const base = passRow(order, part, i, count, inspector);
    if (i <= defectiveCount) {
      rows.push({
        ...base,
        defect_type: 'dimensional',
        defect_severity: 'major',
        ...defectFactory(i),
      });
    } else {
      rows.push(base);
    }
  }
  return rows;
}

export const QUALITY_REPORTS: QualityReportFile[] = [
  // -- PO-1001: clean run, single minor scrap ---------------------------
  {
    filename: `${qaInspRunFor('PO-1001')!.date}_QA-INSP_PO-1001.xlsx`,
    rows: generateRows('PO-1001', 'BR-AL75-12X40', 50, 'INS-Maria', 0, () => ({})),
  },

  // -- PO-1002: tool-break incident ------------------------------------
  // T18 carbide insert fractured mid-run on TODAY-6 at 14:20. Parts cut
  // 13:30 → 14:20 (~17 items) show progressively worse bore-diameter
  // drift; 4 fall outside spec by inspection (next morning, TODAY-5).
  {
    filename: `${qaInspRunFor('PO-1002')!.date}_QA-INSP_PO-1002.xlsx`,
    rows: generateRows('PO-1002', 'HSG-ST304-90', 30, 'INS-Maria', 4, (i) => ({
      defect_type: 'dimensional',
      defect_severity: 'major',
      measurement_value: jitter(89.92, 0.05),
      specification_min: 89.95,
      specification_max: 90.05,
      notes: `Bore diameter below spec on item ${i}; chatter signature consistent with T18 deteriorating before fracture (T18 broke at 14:20 the prior day on this part lot).`,
    })),
  },

  // -- PO-1005: chip-jam incident ---------------------------------------
  // Chip-jam happened on TODAY-4 during machining; defects show up at
  // inspection on TODAY-3 when these parts hit QA-INSP. Single QA-INSP
  // window per ORDER_SCHEDULE; the day1/day2 split that earlier versions
  // of this fixture used was a presentational fiction that pushed rows
  // outside the actual inspection window. The file now covers all 40
  // inspected items.
  {
    filename: `${qaInspRunFor('PO-1005')!.date}_QA-INSP_PO-1005.xlsx`,
    rows: (() => {
      const rows: QualityReportRow[] = [];
      const N = 40;
      for (let i = 1; i <= N; i++) {
        const base = passRow('PO-1005', 'BRACKET-ST304-180', i, N, 'INS-Tomek');
        if (i >= 19 && i <= 22) {
          rows.push({
            ...base,
            defect_type: 'dimensional',
            defect_severity: 'major',
            measurement_value: jitter(179.92, 0.06),
            specification_min: 179.95,
            specification_max: 180.05,
            notes: 'Length tolerance exceeded; pattern matches chatter from chip-evacuation jam earlier in the run.',
          });
        } else if (i >= 23 && i <= 24) {
          rows.push({
            ...base,
            defect_type: 'edge',
            defect_severity: 'major',
            measurement_value: null,
            specification_min: null,
            specification_max: null,
            notes: 'Chipped edge on flange; consistent with damaged tool from morning chip-jam (T07 swapped EOD).',
          });
        } else {
          rows.push(base);
        }
      }
      return rows;
    })(),
  },

  // -- PO-1003: coolant-degradation + T12 flute-chip incident -----------
  // QA-INSP only inspects PO-1003 once (TODAY-1), so this is a single
  // file. Earlier fixture versions split it into "day1" (stamped TODAY-2)
  // and "day2" (stamped TODAY-1), but TODAY-2 has no QA-INSP run for
  // this order — that produced the inconsistency where the dashboard
  // showed inspection findings on a day QA-INSP was idle.
  //
  // 52 morning items (items 29..80) on the post-coolant batch carry
  // 6 surface_finish + 3 surface_staining defects (signature of the
  // 12:45–15:45 coolant_quality_degraded block on CNC-5AX on TODAY-2).
  // 28 earlier items (items 1..28) machined the day before include
  // 3 dimensional defects (T12 flute chip on TODAY-3 at 11:15).
  {
    filename: `${qaInspRunFor('PO-1003')!.date}_QA-INSP_PO-1003.xlsx`,
    rows: (() => {
      const rows: QualityReportRow[] = [];
      const N = 80;
      for (let i = 1; i <= N; i++) {
        const base = passRow('PO-1003', 'TURB-AL75-65X22', i, N, 'INS-Maria');
        if (i <= 3) {
          // T12 flute-chip cluster from TODAY-3.
          rows.push({
            ...base,
            defect_type: 'dimensional',
            defect_severity: 'major',
            measurement_value: jitter(22.04, 0.04),
            specification_min: 21.99,
            specification_max: 22.02,
            notes: `Diameter above spec on item ${i}; chatter signature consistent with T12 flute chipping that triggered the 11:15 alarm on the prior CNC-5AX run.`,
          });
        } else if (i >= 29 && i <= 34) {
          // Coolant-degradation surface_finish cluster.
          rows.push({
            ...base,
            defect_type: 'surface_finish',
            defect_severity: 'major',
            measurement_value: jitter(2.4, 0.6), // Ra in µm; spec is <1.6
            specification_min: 0,
            specification_max: 1.6,
            notes: 'Surface roughness above Ra 1.6 µm spec; finish appears smeary — coolant suspected.',
          });
        } else if (i >= 35 && i <= 37) {
          rows.push({
            ...base,
            defect_type: 'surface_staining',
            defect_severity: 'minor',
            measurement_value: null,
            specification_min: null,
            specification_max: null,
            notes: 'Mild discoloration / staining consistent with degraded coolant deposit during finish pass.',
          });
        } else {
          rows.push(base);
        }
      }
      return rows;
    })(),
  },
];
