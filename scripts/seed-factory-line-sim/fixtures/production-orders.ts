/**
 * 5 production orders. Hand-tied to the seeded incidents:
 *   - PO-1003 runs on the coolant-degradation day (TODAY-2) → surface-finish defects.
 *   - PO-1005 runs on the chip-jam day (TODAY-4) → dimensional + edge defects.
 *
 * Other orders (1001, 1002, 1004) are the "background" of clean days that
 * make the bad days actually stand out.
 */

import { TODAY } from './mission';

export type OrderStatus = 'Completed' | 'Running' | 'Queued';

export interface ProductionOrder {
  order_id: string;
  part_number: string;
  customer: string;
  priority: 'normal' | 'high' | 'rush';
  qty_ordered: number;
  qty_completed: number;
  qty_scrapped: number;
  due_date: string; // ISO date
  created_date: string; // ISO date
  material: string;
  tolerance_grade: 'IT7' | 'IT8' | 'IT9';
  status: OrderStatus;
  /** Sequence of steps across the line; est_cycle_min is per-part. */
  routing: Array<{
    sequence: number;
    machine: string;
    est_cycle_min: number;
  }>;
}

/** Days relative to TODAY (TODAY = 2026-05-15). */
function dateMinus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}
function datePlus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const STANDARD_ROUTING = [
  { sequence: 1, machine: 'CNC-5AX', est_cycle_min: 12 },
  { sequence: 2, machine: 'DEBURR-HAND', est_cycle_min: 5 },
  { sequence: 3, machine: 'QA-INSP', est_cycle_min: 2 },
];

export const PRODUCTION_ORDERS: ProductionOrder[] = [
  // PO-1001 — completed cleanly on TODAY-7..TODAY-6
  {
    order_id: 'PO-1001',
    part_number: 'BR-AL75-12X40',
    customer: 'Acme Aerospace',
    priority: 'normal',
    qty_ordered: 50,
    qty_completed: 50,
    qty_scrapped: 0,
    due_date: dateMinus(5),
    created_date: dateMinus(10),
    material: 'Al-7075',
    tolerance_grade: 'IT8',
    status: 'Completed',
    routing: STANDARD_ROUTING,
  },
  // PO-1002 — completed cleanly TODAY-6..TODAY-5
  {
    order_id: 'PO-1002',
    part_number: 'HSG-ST304-90',
    customer: 'Bremen Maritime',
    priority: 'normal',
    qty_ordered: 30,
    qty_completed: 30,
    qty_scrapped: 1,
    due_date: dateMinus(3),
    created_date: dateMinus(9),
    material: 'Steel-304',
    tolerance_grade: 'IT8',
    status: 'Completed',
    routing: [
      { sequence: 1, machine: 'CNC-5AX', est_cycle_min: 18 },
      { sequence: 2, machine: 'DEBURR-HAND', est_cycle_min: 7 },
      { sequence: 3, machine: 'QA-INSP', est_cycle_min: 3 },
    ],
  },
  // PO-1003 — the coolant-incident order, ran TODAY-3..TODAY-2,
  // completed with elevated surface defect rate.
  {
    order_id: 'PO-1003',
    part_number: 'TURB-AL75-65X22',
    customer: 'Acme Aerospace',
    priority: 'high',
    qty_ordered: 80,
    qty_completed: 80,
    qty_scrapped: 9, // surface-finish rejects from the coolant degradation
    due_date: dateMinus(1),
    created_date: dateMinus(8),
    material: 'Al-7075',
    tolerance_grade: 'IT7',
    status: 'Completed',
    routing: STANDARD_ROUTING,
  },
  // PO-1004 — running today, on schedule.
  {
    order_id: 'PO-1004',
    part_number: 'BR-AL75-12X40',
    customer: 'Acme Aerospace',
    priority: 'normal',
    qty_ordered: 60,
    qty_completed: 22,
    qty_scrapped: 0,
    due_date: datePlus(2),
    created_date: dateMinus(3),
    material: 'Al-7075',
    tolerance_grade: 'IT8',
    status: 'Running',
    routing: STANDARD_ROUTING,
  },
  // PO-1005 — the chip-jam-incident order, ran TODAY-5..TODAY-4,
  // completed with dimensional + edge defects clustered around the jam.
  {
    order_id: 'PO-1005',
    part_number: 'BRACKET-ST304-180',
    customer: 'Bremen Maritime',
    priority: 'normal',
    qty_ordered: 40,
    qty_completed: 40,
    qty_scrapped: 6, // dimensional + edge rejects from chip-jam day
    due_date: dateMinus(2),
    created_date: dateMinus(9),
    material: 'Steel-304',
    tolerance_grade: 'IT7',
    status: 'Completed',
    routing: [
      { sequence: 1, machine: 'CNC-5AX', est_cycle_min: 22 },
      { sequence: 2, machine: 'DEBURR-HAND', est_cycle_min: 8 },
      { sequence: 3, machine: 'QA-INSP', est_cycle_min: 3 },
    ],
  },
];

/** Day each PO ran on machine M (used by status JSON generator + dashboard timeline). */
export const ORDER_SCHEDULE: Record<string, { machine: string; date: string; startHour: number; endHour: number }[]> = {
  'PO-1001': [
    { machine: 'CNC-5AX', date: dateMinus(7), startHour: 8, endHour: 16 },
    { machine: 'DEBURR-HAND', date: dateMinus(6), startHour: 8, endHour: 12 },
    { machine: 'QA-INSP', date: dateMinus(6), startHour: 13, endHour: 15 },
  ],
  'PO-1002': [
    { machine: 'CNC-5AX', date: dateMinus(6), startHour: 8, endHour: 17 },
    { machine: 'DEBURR-HAND', date: dateMinus(5), startHour: 8, endHour: 12 },
    { machine: 'QA-INSP', date: dateMinus(5), startHour: 13, endHour: 15 },
  ],
  'PO-1003': [
    { machine: 'CNC-5AX', date: dateMinus(3), startHour: 8, endHour: 17 },
    { machine: 'CNC-5AX', date: dateMinus(2), startHour: 8, endHour: 15 }, // the coolant day
    { machine: 'DEBURR-HAND', date: dateMinus(2), startHour: 13, endHour: 17 },
    { machine: 'DEBURR-HAND', date: dateMinus(1), startHour: 8, endHour: 11 },
    { machine: 'QA-INSP', date: dateMinus(1), startHour: 11, endHour: 14 },
  ],
  'PO-1004': [
    { machine: 'CNC-5AX', date: dateMinus(0), startHour: 8, endHour: 16 },
  ],
  'PO-1005': [
    { machine: 'CNC-5AX', date: dateMinus(5), startHour: 8, endHour: 17 },
    { machine: 'CNC-5AX', date: dateMinus(4), startHour: 8, endHour: 16 }, // the chip-jam day
    { machine: 'DEBURR-HAND', date: dateMinus(4), startHour: 13, endHour: 17 },
    { machine: 'DEBURR-HAND', date: dateMinus(3), startHour: 8, endHour: 11 },
    { machine: 'QA-INSP', date: dateMinus(3), startHour: 11, endHour: 13 },
  ],
};
