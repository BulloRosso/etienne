/**
 * 6 quality reports. The seed script renders each into an actual .xlsx file
 * (via exceljs) so the "challenge: parse xlsx uploads" is real.
 *
 * Schema matches what wiki/topics/data-quality-reports-xlsx.md documents,
 * so a fresh agent reading the wiki can know what columns to expect.
 *
 * Defect distribution:
 *   - PO-1003 on TODAY-2 (coolant day): 9 defects, all 'surface_finish'
 *     and 'surface_staining' — the signature of degraded coolant.
 *   - PO-1005 on TODAY-4 (chip-jam day): 6 defects, mix of 'dimensional'
 *     and 'edge' (chatter from chip-jam → tool damage → bad cuts).
 *   - PO-1001, PO-1002, PO-1003 (clean rows), PO-1005 (clean rows): mostly
 *     pass, with 0-1 minor defects to make it look like real data.
 */

import { TODAY } from './mission';

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

function timeOnDay(date: string, hh: number, mm: number): string {
  return `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`;
}

function passRow(
  order: string,
  part: string,
  i: number,
  date: string,
  hh: number,
  mm: number,
  inspector: string,
): QualityReportRow {
  return {
    production_order_id: order,
    part_number: part,
    machine_id: 'QA-INSP',
    item_id: `${order}-item-${String(i).padStart(3, '0')}`,
    defect_type: 'pass',
    defect_severity: 'none',
    measurement_value: 12.005 + (Math.random() - 0.5) * 0.01,
    specification_min: 11.99,
    specification_max: 12.02,
    inspector_id: inspector,
    timestamp: timeOnDay(date, hh, mm),
    notes: '',
  };
}

// Use a deterministic pseudo-random so reruns produce identical xlsx files.
let _seed = 1337;
function rand(): number {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}
function jitter(base: number, range: number): number {
  return Math.round((base + (rand() - 0.5) * range) * 1000) / 1000;
}

function generateRows(
  order: string,
  part: string,
  date: string,
  count: number,
  inspector: string,
  defectiveCount: number,
  defectFactory: (i: number) => Partial<QualityReportRow>,
): QualityReportRow[] {
  const rows: QualityReportRow[] = [];
  for (let i = 1; i <= count; i++) {
    const hh = 11 + Math.floor((i - 1) / 20);
    const mm = ((i - 1) * 3) % 60;
    if (i <= defectiveCount) {
      rows.push({
        ...passRow(order, part, i, date, hh, mm, inspector),
        defect_type: 'dimensional',
        defect_severity: 'major',
        ...defectFactory(i),
      });
    } else {
      rows.push(passRow(order, part, i, date, hh, mm, inspector));
    }
  }
  return rows;
}

export const QUALITY_REPORTS: QualityReportFile[] = [
  // -- PO-1001: clean run, single minor scrap ---------------------------
  {
    filename: `${dateMinus(6)}_QA-INSP_PO-1001.xlsx`,
    rows: generateRows('PO-1001', 'BR-AL75-12X40', dateMinus(6), 50, 'INS-Maria', 0, () => ({})),
  },

  // -- PO-1002: clean run, 1 dimensional reject -------------------------
  {
    filename: `${dateMinus(5)}_QA-INSP_PO-1002.xlsx`,
    rows: (() => {
      const rows = generateRows('PO-1002', 'HSG-ST304-90', dateMinus(5), 30, 'INS-Maria', 1, (i) => ({
        defect_type: 'dimensional',
        defect_severity: 'major',
        measurement_value: jitter(89.97, 0.04),
        specification_min: 89.95,
        specification_max: 90.05,
        notes: `Bore diameter below spec on item ${i}; suspected fixture clamp slip on first part of run.`,
      }));
      return rows;
    })(),
  },

  // -- PO-1005 day 1 (TODAY-5): clean morning before the jam -----------
  {
    filename: `${dateMinus(3)}_QA-INSP_PO-1005-day1.xlsx`,
    rows: generateRows('PO-1005', 'BRACKET-ST304-180', dateMinus(3), 18, 'INS-Tomek', 0, () => ({})),
  },

  // -- PO-1005 day 2 (TODAY-3): inspected after the chip-jam day --------
  // Chip-jam happened on TODAY-4 during machining; defects show up at
  // inspection on TODAY-3 when these parts hit QA-INSP.
  {
    filename: `${dateMinus(3)}_QA-INSP_PO-1005-day2.xlsx`,
    rows: (() => {
      const rows: QualityReportRow[] = [];
      const N = 22;
      for (let i = 1; i <= N; i++) {
        const date = dateMinus(3);
        const itemId = `PO-1005-item-${String(18 + i).padStart(3, '0')}`;
        const hh = 13 + Math.floor((i - 1) / 12);
        const mm = ((i - 1) * 4) % 60;
        if (i <= 4) {
          rows.push({
            production_order_id: 'PO-1005',
            part_number: 'BRACKET-ST304-180',
            machine_id: 'QA-INSP',
            item_id: itemId,
            defect_type: 'dimensional',
            defect_severity: 'major',
            measurement_value: jitter(179.92, 0.06),
            specification_min: 179.95,
            specification_max: 180.05,
            inspector_id: 'INS-Tomek',
            timestamp: timeOnDay(date, hh, mm),
            notes: 'Length tolerance exceeded; pattern matches chatter from chip-evacuation jam earlier in the run.',
          });
        } else if (i <= 6) {
          rows.push({
            production_order_id: 'PO-1005',
            part_number: 'BRACKET-ST304-180',
            machine_id: 'QA-INSP',
            item_id: itemId,
            defect_type: 'edge',
            defect_severity: 'major',
            measurement_value: null,
            specification_min: null,
            specification_max: null,
            inspector_id: 'INS-Tomek',
            timestamp: timeOnDay(date, hh, mm),
            notes: 'Chipped edge on flange; consistent with damaged tool from morning chip-jam (T07 swapped EOD).',
          });
        } else {
          rows.push(passRow('PO-1005', 'BRACKET-ST304-180', 18 + i, date, hh, mm, 'INS-Tomek'));
        }
      }
      return rows;
    })(),
  },

  // -- PO-1003 day 1 (TODAY-3): clean morning before coolant problems --
  {
    filename: `${dateMinus(2)}_QA-INSP_PO-1003-day1.xlsx`,
    rows: generateRows('PO-1003', 'TURB-AL75-65X22', dateMinus(2), 28, 'INS-Maria', 0, () => ({})),
  },

  // -- PO-1003 day 2 (TODAY-1): inspections after the coolant-degraded day
  // Surface-finish issues appear at inspection on TODAY-1 from the
  // coolant-degraded TODAY-2 machining.
  {
    filename: `${dateMinus(1)}_QA-INSP_PO-1003-day2.xlsx`,
    rows: (() => {
      const rows: QualityReportRow[] = [];
      const N = 52;
      for (let i = 1; i <= N; i++) {
        const date = dateMinus(1);
        const itemId = `PO-1003-item-${String(28 + i).padStart(3, '0')}`;
        const hh = 11 + Math.floor((i - 1) / 18);
        const mm = ((i - 1) * 2) % 60;
        if (i <= 6) {
          rows.push({
            production_order_id: 'PO-1003',
            part_number: 'TURB-AL75-65X22',
            machine_id: 'QA-INSP',
            item_id: itemId,
            defect_type: 'surface_finish',
            defect_severity: 'major',
            measurement_value: jitter(2.4, 0.6), // Ra in µm; spec is <1.6
            specification_min: 0,
            specification_max: 1.6,
            inspector_id: 'INS-Maria',
            timestamp: timeOnDay(date, hh, mm),
            notes: 'Surface roughness above Ra 1.6 µm spec; finish appears smeary — coolant suspected.',
          });
        } else if (i <= 9) {
          rows.push({
            production_order_id: 'PO-1003',
            part_number: 'TURB-AL75-65X22',
            machine_id: 'QA-INSP',
            item_id: itemId,
            defect_type: 'surface_staining',
            defect_severity: 'minor',
            measurement_value: null,
            specification_min: null,
            specification_max: null,
            inspector_id: 'INS-Maria',
            timestamp: timeOnDay(date, hh, mm),
            notes: 'Mild discoloration / staining consistent with degraded coolant deposit during finish pass.',
          });
        } else {
          rows.push(passRow('PO-1003', 'TURB-AL75-65X22', 28 + i, date, hh, mm, 'INS-Maria'));
        }
      }
      return rows;
    })(),
  },
];
