/**
 * 24 daily machine-status JSON files (8 days × 3 machines).
 *
 * Day axis: TODAY-7 .. TODAY (8 days).
 *
 * Seeded incidents:
 *   - TODAY-4 on CNC-5AX: ~25 min hard downtime mid-morning labelled
 *     "chip_evacuation_jam" (the chip-bin / conveyor jam from the PRD).
 *   - TODAY-2 on CNC-5AX: ~3 h "degraded" stretch in the afternoon labelled
 *     "coolant_quality_degraded" — runs but at reduced effective performance.
 *
 * Other days are mostly green; small routine downtime (coffee break, tool
 * change) is included to make the dashboard look realistic.
 */

import { TODAY } from './mission';
import { MACHINES } from './machines';

export type MachineState =
  | 'running'
  | 'idle'
  | 'maintenance'
  | 'error'
  | 'degraded'
  | 'offline';

export interface StatusTimelineEntry {
  start: string; // HH:MM (24h, local)
  end: string;
  state: MachineState;
  /** Reason if state !== running; e.g. "tool_change", "coolant_change", "chip_evacuation_jam". */
  reason: string | null;
  /** Optional free text for the dashboard tooltip. */
  note?: string;
}

export interface MachineStatusReport {
  machine_id: string;
  date: string; // YYYY-MM-DD
  shift_pattern: '1-shift' | '2-shift';
  timeline: StatusTimelineEntry[];
  total_runtime_min: number;
  total_downtime_min: number;
  downtime_breakdown: Record<string, number>;
  oee_metrics: {
    availability_pct: number;
    performance_pct: number;
    quality_pct: number;
  };
  /** Counters CNC-5AX cares about; 0 / absent for the others. */
  chip_bin_emptied_count?: number;
  coolant_changed?: boolean;
  tool_changes?: number;
  /** ISO timestamp of last upload — supports the "can be updated" PRD requirement. */
  last_updated: string;
}

function dateMinus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

function minutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function sumStates(timeline: StatusTimelineEntry[], state: MachineState): number {
  return timeline.filter((e) => e.state === state).reduce((a, e) => a + minutes(e.start, e.end), 0);
}

function buildBreakdown(timeline: StatusTimelineEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of timeline) {
    if (e.state === 'running') continue;
    const key = e.reason ?? e.state;
    out[key] = (out[key] ?? 0) + minutes(e.start, e.end);
  }
  return out;
}

/** Standard "clean day" timeline for CNC-5AX. */
function cncCleanDay(): StatusTimelineEntry[] {
  return [
    { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
    { start: '08:00', end: '10:30', state: 'running', reason: null },
    { start: '10:30', end: '10:45', state: 'idle', reason: 'operator_break' },
    { start: '10:45', end: '12:00', state: 'running', reason: null },
    { start: '12:00', end: '12:45', state: 'idle', reason: 'lunch_break' },
    { start: '12:45', end: '14:30', state: 'running', reason: null },
    { start: '14:30', end: '14:50', state: 'maintenance', reason: 'tool_change', note: 'T12 swap, scheduled at 1000 cycles' },
    { start: '14:50', end: '17:00', state: 'running', reason: null },
  ];
}

function deburrCleanDay(): StatusTimelineEntry[] {
  return [
    { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
    { start: '08:00', end: '10:30', state: 'running', reason: null },
    { start: '10:30', end: '10:45', state: 'idle', reason: 'operator_break' },
    { start: '10:45', end: '12:00', state: 'running', reason: null },
    { start: '12:00', end: '12:45', state: 'idle', reason: 'lunch_break' },
    { start: '12:45', end: '15:30', state: 'running', reason: null },
    { start: '15:30', end: '17:00', state: 'idle', reason: 'no_input_parts', note: 'Waiting on CNC-5AX output' },
  ];
}

function inspCleanDay(): StatusTimelineEntry[] {
  return [
    { start: '08:00', end: '11:00', state: 'idle', reason: 'no_input_parts' },
    { start: '11:00', end: '13:00', state: 'running', reason: null },
    { start: '13:00', end: '13:30', state: 'idle', reason: 'lunch_break' },
    { start: '13:30', end: '15:30', state: 'running', reason: null },
    { start: '15:30', end: '17:00', state: 'idle', reason: 'no_input_parts' },
  ];
}

/** TODAY-4 on CNC-5AX — chip-jam incident. */
function cncChipJamDay(): StatusTimelineEntry[] {
  return [
    { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
    { start: '08:00', end: '09:50', state: 'running', reason: null },
    { start: '09:50', end: '10:15', state: 'error', reason: 'chip_evacuation_jam', note: 'Conveyor jammed; chip bin overflow detected. Manual clear + bin empty.' },
    { start: '10:15', end: '10:45', state: 'idle', reason: 'operator_break' },
    { start: '10:45', end: '12:00', state: 'running', reason: null },
    { start: '12:00', end: '12:45', state: 'idle', reason: 'lunch_break' },
    { start: '12:45', end: '16:30', state: 'running', reason: null },
    { start: '16:30', end: '17:00', state: 'maintenance', reason: 'tool_change', note: 'T07 swap; flagged for chip damage during morning jam' },
  ];
}

/** TODAY-2 on CNC-5AX — coolant degradation; degraded state for ~3h. */
function cncCoolantDegradedDay(): StatusTimelineEntry[] {
  return [
    { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
    { start: '08:00', end: '10:30', state: 'running', reason: null },
    { start: '10:30', end: '10:45', state: 'idle', reason: 'operator_break' },
    { start: '10:45', end: '12:00', state: 'running', reason: null },
    { start: '12:00', end: '12:45', state: 'idle', reason: 'lunch_break' },
    { start: '12:45', end: '15:45', state: 'degraded', reason: 'coolant_quality_degraded', note: 'Coolant temperature elevated (>65°C); cycle continued at reduced surface-finish quality' },
    { start: '15:45', end: '17:00', state: 'running', reason: null },
  ];
}

function buildReport(
  machineId: string,
  date: string,
  timeline: StatusTimelineEntry[],
  extras: {
    chip_bin_emptied_count?: number;
    coolant_changed?: boolean;
    tool_changes?: number;
  } = {},
): MachineStatusReport {
  const total_runtime_min = sumStates(timeline, 'running');
  const total_degraded_min = sumStates(timeline, 'degraded');
  const total_downtime_min = timeline.reduce((a, e) => a + minutes(e.start, e.end), 0) - total_runtime_min - total_degraded_min;
  const totalShiftMin = timeline.reduce((a, e) => a + minutes(e.start, e.end), 0);
  const availability_pct = Math.round(((total_runtime_min + total_degraded_min) / totalShiftMin) * 1000) / 10;
  // Performance penalty when degraded: degraded time counts at 70%.
  const perf_effective = total_runtime_min + total_degraded_min * 0.7;
  const performance_pct = totalShiftMin === 0
    ? 0
    : Math.round((perf_effective / (total_runtime_min + total_degraded_min || 1)) * 1000) / 10;
  const quality_pct =
    machineId === 'CNC-5AX' && timeline.some((e) => e.reason === 'coolant_quality_degraded')
      ? 88.5
      : machineId === 'CNC-5AX' && timeline.some((e) => e.reason === 'chip_evacuation_jam')
        ? 85.0
        : 98.5;

  return {
    machine_id: machineId,
    date,
    shift_pattern: '1-shift',
    timeline,
    total_runtime_min,
    total_downtime_min,
    downtime_breakdown: buildBreakdown(timeline),
    oee_metrics: { availability_pct, performance_pct, quality_pct },
    ...extras,
    last_updated: `${date}T17:30:00Z`,
  };
}

/** Build all 24 reports. */
export const STATUS_REPORTS: MachineStatusReport[] = (() => {
  const out: MachineStatusReport[] = [];
  for (let d = 7; d >= 0; d--) {
    const date = dateMinus(d);

    // CNC-5AX
    let cncTimeline = cncCleanDay();
    let cncExtras: Record<string, unknown> = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 1 };
    if (d === 4) {
      cncTimeline = cncChipJamDay();
      cncExtras = { chip_bin_emptied_count: 2, coolant_changed: false, tool_changes: 2 };
    }
    if (d === 2) {
      cncTimeline = cncCoolantDegradedDay();
      cncExtras = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 1 };
    }
    if (d === 0) {
      // Today: only a partial day of running so far (current shift in progress)
      cncTimeline = [
        { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
        { start: '08:00', end: '10:30', state: 'running', reason: null },
        { start: '10:30', end: '10:45', state: 'idle', reason: 'operator_break' },
        { start: '10:45', end: '12:00', state: 'running', reason: null },
      ];
      cncExtras = { chip_bin_emptied_count: 0, coolant_changed: false, tool_changes: 0 };
    }
    out.push(buildReport('CNC-5AX', date, cncTimeline, cncExtras));

    // DEBURR-HAND
    let deburrTimeline = deburrCleanDay();
    if (d === 0) {
      deburrTimeline = [
        { start: '07:30', end: '08:00', state: 'idle', reason: 'shift_warmup' },
        { start: '08:00', end: '12:00', state: 'idle', reason: 'no_input_parts', note: 'Waiting on CNC-5AX output for PO-1004' },
      ];
    }
    out.push(buildReport('DEBURR-HAND', date, deburrTimeline));

    // QA-INSP
    let inspTimeline = inspCleanDay();
    if (d === 0) {
      inspTimeline = [
        { start: '08:00', end: '12:00', state: 'idle', reason: 'no_input_parts' },
      ];
    }
    out.push(buildReport('QA-INSP', date, inspTimeline));
  }
  return out;
})();
