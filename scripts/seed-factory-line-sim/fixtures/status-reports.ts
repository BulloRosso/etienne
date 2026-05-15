/**
 * 24 daily machine-status JSON files (8 days × 3 machines).
 *
 * Day axis: TODAY-7 .. TODAY (8 days).
 *
 * Single source of truth: ORDER_SCHEDULE in production-orders.ts.
 * A machine is `running` only inside an order block; outside those
 * blocks the timeline shows idle/break/lunch/no_active_order. This
 * keeps the dashboard's machine-state row and production-order row
 * always consistent.
 *
 * Seeded incidents (overlay on top of order-driven running blocks):
 *   - TODAY-6 on CNC-5AX: ~35 min downtime — T18 carbide insert fracture
 *   - TODAY-4 on CNC-5AX: ~25 min downtime — chip-evacuation jam
 *   - TODAY-3 on CNC-5AX: ~20 min downtime — T12 end-mill flute chipped
 *   - TODAY-2 on CNC-5AX: ~3 h `degraded` block — coolant quality degraded
 */

import { TODAY } from './mission';
import { MACHINES } from './machines';
import { ORDER_SCHEDULE } from './production-orders';

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

// ── Shift / break configuration ─────────────────────────────────────
const SHIFT_START = '07:30';
const SHIFT_WARMUP_END = '08:00';
const SHIFT_END = '17:00';
const BREAKS: Array<{ start: string; end: string; reason: string }> = [
  { start: '10:30', end: '10:45', reason: 'operator_break' },
  { start: '12:00', end: '12:45', reason: 'lunch_break' },
];

/** Convert HH:MM string to minutes since midnight. */
function hhmmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToHHMM(m: number): string {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Order blocks for a given machine on a given date, sorted by startHour. */
function orderBlocksFor(machineId: string, date: string): Array<{ start: string; end: string; order_id: string }> {
  const blocks: Array<{ start: string; end: string; order_id: string }> = [];
  for (const [orderId, runs] of Object.entries(ORDER_SCHEDULE)) {
    for (const r of runs) {
      if (r.machine !== machineId || r.date !== date) continue;
      blocks.push({
        start: `${String(r.startHour).padStart(2, '0')}:00`,
        end: `${String(r.endHour).padStart(2, '0')}:00`,
        order_id: orderId,
      });
    }
  }
  return blocks.sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
}

/**
 * Build a default "clean" timeline derived from the order schedule.
 *
 * Contract: machine is `running` only inside an order block. Breaks and
 * lunch slice through running blocks. Outside order blocks (and during
 * the morning warmup) the machine is `idle` with reason
 * `no_active_order` (or `shift_warmup` / `operator_break` / `lunch_break`).
 *
 * The result is a fully-tiled SHIFT_START..SHIFT_END timeline with no
 * gaps or overlaps. Incident days override slices of this with
 * `applyIncidentOverlay`.
 */
function buildOrderDrivenDay(machineId: string, date: string): StatusTimelineEntry[] {
  const orders = orderBlocksFor(machineId, date);
  const segments: StatusTimelineEntry[] = [];

  // Walk minute-by-minute through the shift, deciding the state of each
  // span and coalescing same-state runs.
  const shiftStart = hhmmToMin(SHIFT_START);
  const shiftEnd = hhmmToMin(SHIFT_END);
  const warmupEnd = hhmmToMin(SHIFT_WARMUP_END);

  type SegState = { state: MachineState; reason: string | null };
  const stateAt = (mm: number): SegState => {
    if (mm < warmupEnd) return { state: 'idle', reason: 'shift_warmup' };
    for (const b of BREAKS) {
      if (mm >= hhmmToMin(b.start) && mm < hhmmToMin(b.end)) {
        return { state: 'idle', reason: b.reason };
      }
    }
    for (const o of orders) {
      if (mm >= hhmmToMin(o.start) && mm < hhmmToMin(o.end)) {
        return { state: 'running', reason: null };
      }
    }
    return { state: 'idle', reason: 'no_active_order' };
  };

  let cur: SegState | null = null;
  let segStart = shiftStart;
  for (let mm = shiftStart; mm < shiftEnd; mm++) {
    const here = stateAt(mm);
    if (!cur) { cur = here; segStart = mm; continue; }
    if (here.state !== cur.state || here.reason !== cur.reason) {
      segments.push({ start: minToHHMM(segStart), end: minToHHMM(mm), state: cur.state, reason: cur.reason });
      cur = here; segStart = mm;
    }
  }
  if (cur) segments.push({ start: minToHHMM(segStart), end: minToHHMM(shiftEnd), state: cur.state, reason: cur.reason });
  return segments;
}

/**
 * Splice an incident overlay onto an order-driven timeline.
 *
 * The incident replaces whatever state the machine had during its
 * window (typically a `running` block) with the incident's state +
 * reason. Surrounding segments are preserved.
 *
 * If the incident covers a span that was already idle (no active
 * order), the incident still applies — useful when a coolant alarm
 * fires during a no-PO window, for example.
 */
function applyIncidentOverlay(
  base: StatusTimelineEntry[],
  incident: { start: string; end: string; state: MachineState; reason: string; note?: string },
): StatusTimelineEntry[] {
  const out: StatusTimelineEntry[] = [];
  const iStart = hhmmToMin(incident.start);
  const iEnd = hhmmToMin(incident.end);
  for (const seg of base) {
    const sStart = hhmmToMin(seg.start);
    const sEnd = hhmmToMin(seg.end);
    if (sEnd <= iStart || sStart >= iEnd) {
      out.push(seg);
      continue;
    }
    // Segment overlaps the incident — emit the pre-overlap part, the
    // incident slice (only once, when we hit the first overlapping seg),
    // then the post-overlap part.
    if (sStart < iStart) {
      out.push({ ...seg, end: incident.start });
    }
    if (!out.some((s) => s.start === incident.start && s.end === incident.end && s.reason === incident.reason)) {
      out.push({ start: incident.start, end: incident.end, state: incident.state, reason: incident.reason, note: incident.note });
    }
    if (sEnd > iEnd) {
      out.push({ ...seg, start: incident.end });
    }
  }
  return out;
}

// ── Incident overlays ───────────────────────────────────────────────
// Each incident is an explicit (start, end, state, reason) span that is
// spliced into the order-driven base timeline via applyIncidentOverlay.
// Multiple overlays for the same day are applied in order.

interface IncidentSpec {
  start: string;
  end: string;
  state: MachineState;
  reason: string;
  note?: string;
}

/** TODAY-6 — T18 carbide insert fractured during PO-1002 steel run. */
const INCIDENT_TOOL_BREAK_STEEL: IncidentSpec[] = [
  { start: '14:20', end: '14:55', state: 'error', reason: 'tool_breakage',
    note: 'T18 carbide insert fractured mid-cut on Steel-304; spindle load alarm 99%; emergency stop, debris clear, replace insert' },
  { start: '14:55', end: '15:25', state: 'maintenance', reason: 'tool_change',
    note: 'T18 replacement + verify next 2 parts' },
];

/** TODAY-4 — chip-evacuation jam during PO-1005 run, plus EOD tool change. */
const INCIDENT_CHIP_JAM: IncidentSpec[] = [
  { start: '09:50', end: '10:15', state: 'error', reason: 'chip_evacuation_jam',
    note: 'Conveyor jammed; chip bin overflow detected. Manual clear + bin empty.' },
  { start: '16:30', end: '17:00', state: 'maintenance', reason: 'tool_change',
    note: 'T07 swap; flagged for chip damage during morning jam' },
];

/** TODAY-3 — T12 end-mill flute chipped early during PO-1003 run. */
const INCIDENT_TOOL_BREAK_ALU: IncidentSpec[] = [
  { start: '11:15', end: '11:35', state: 'error', reason: 'tool_breakage',
    note: 'T12 end-mill flute chipped (audible report); spindle load spike 96%; controller halt' },
  { start: '11:35', end: '12:00', state: 'maintenance', reason: 'tool_change',
    note: 'T12 swap; inspect last 5 parts for chatter' },
];

/** TODAY-2 — coolant temperature elevated for ~3h during PO-1003 afternoon. */
const INCIDENT_COOLANT_DEGRADED: IncidentSpec[] = [
  { start: '12:45', end: '15:45', state: 'degraded', reason: 'coolant_quality_degraded',
    note: 'Coolant temperature elevated (>65°C); cycle continued at reduced surface-finish quality' },
];

function applyIncidents(base: StatusTimelineEntry[], incidents: IncidentSpec[]): StatusTimelineEntry[] {
  return incidents.reduce((tl, inc) => applyIncidentOverlay(tl, inc), base);
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
        : machineId === 'CNC-5AX' && timeline.some((e) => e.reason === 'tool_breakage')
          ? 91.0
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

/**
 * For "today" we want only the morning shift to have happened — anything
 * scheduled past 12:00 is treated as not-yet-run. We truncate the
 * timeline at noon to reflect the current state.
 */
function truncateAtNoon(timeline: StatusTimelineEntry[]): StatusTimelineEntry[] {
  const NOON = 12 * 60;
  const out: StatusTimelineEntry[] = [];
  for (const seg of timeline) {
    const end = hhmmToMin(seg.end);
    const start = hhmmToMin(seg.start);
    if (start >= NOON) break;
    if (end > NOON) {
      out.push({ ...seg, end: minToHHMM(NOON) });
      break;
    }
    out.push(seg);
  }
  return out;
}

/** Build all 24 reports. */
export const STATUS_REPORTS: MachineStatusReport[] = (() => {
  const out: MachineStatusReport[] = [];
  for (let d = 7; d >= 0; d--) {
    const date = dateMinus(d);

    // ── CNC-5AX ─────────────────────────────────────────────────
    let cncTimeline = buildOrderDrivenDay('CNC-5AX', date);
    let cncExtras: Record<string, unknown> = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 1 };
    if (d === 6) {
      cncTimeline = applyIncidents(cncTimeline, INCIDENT_TOOL_BREAK_STEEL);
      cncExtras = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 2 };
    } else if (d === 4) {
      cncTimeline = applyIncidents(cncTimeline, INCIDENT_CHIP_JAM);
      cncExtras = { chip_bin_emptied_count: 2, coolant_changed: false, tool_changes: 2 };
    } else if (d === 3) {
      cncTimeline = applyIncidents(cncTimeline, INCIDENT_TOOL_BREAK_ALU);
      cncExtras = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 2 };
    } else if (d === 2) {
      cncTimeline = applyIncidents(cncTimeline, INCIDENT_COOLANT_DEGRADED);
      cncExtras = { chip_bin_emptied_count: 1, coolant_changed: false, tool_changes: 1 };
    }
    if (d === 0) {
      cncTimeline = truncateAtNoon(cncTimeline);
      cncExtras = { chip_bin_emptied_count: 0, coolant_changed: false, tool_changes: 0 };
    }
    out.push(buildReport('CNC-5AX', date, cncTimeline, cncExtras));

    // ── DEBURR-HAND ─────────────────────────────────────────────
    let deburrTimeline = buildOrderDrivenDay('DEBURR-HAND', date);
    if (d === 0) deburrTimeline = truncateAtNoon(deburrTimeline);
    out.push(buildReport('DEBURR-HAND', date, deburrTimeline));

    // ── QA-INSP ─────────────────────────────────────────────────
    let inspTimeline = buildOrderDrivenDay('QA-INSP', date);
    if (d === 0) inspTimeline = truncateAtNoon(inspTimeline);
    out.push(buildReport('QA-INSP', date, inspTimeline));
  }
  return out;
})();
