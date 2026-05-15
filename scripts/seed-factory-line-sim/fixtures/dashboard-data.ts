/**
 * Dashboard JSON payloads, schema-adapted to the manufacturing domain
 * but keeping the original PRD field names so the HTML works unchanged.
 *
 * Field-name mapping (data → display):
 *   clusters    → Defect categories
 *   patents     → Production orders
 *   companies   → Machines (their cell == "country" in the schema)
 *   keywords    → Defect signature keywords per category
 *   ipc         → Process step codes (MILL-5AX, DEBURR-MAN, etc.)
 *   region      → Plant
 */

import { MACHINES } from './machines';
import { PRODUCTION_ORDERS } from './production-orders';
import { QUALITY_REPORTS } from './quality-reports';

// ── categories.json ─────────────────────────────────────────────────────
export const CATEGORIES_JSON = (() => {
  // Group orders by their dominant defect category. An order with no
  // defects falls into "On-spec".
  const buckets: Record<string, { id: string; name: string; orderIds: Set<string> }> = {
    C001: { id: 'C001', name: 'On-spec', orderIds: new Set() },
    C002: { id: 'C002', name: 'Surface finish issues', orderIds: new Set() },
    C003: { id: 'C003', name: 'Dimensional drift', orderIds: new Set() },
    C004: { id: 'C004', name: 'Edge / chip damage', orderIds: new Set() },
  };

  // Tally defects per order.
  const orderDefects: Record<string, Record<string, number>> = {};
  for (const file of QUALITY_REPORTS) {
    for (const row of file.rows) {
      if (row.defect_type === 'pass') continue;
      orderDefects[row.production_order_id] ??= {};
      const counts = orderDefects[row.production_order_id]!;
      counts[row.defect_type] = (counts[row.defect_type] ?? 0) + 1;
    }
  }

  for (const order of PRODUCTION_ORDERS) {
    const counts = orderDefects[order.order_id] ?? {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      buckets.C001.orderIds.add(order.order_id);
      continue;
    }
    // Categorise by dominant defect family.
    const surface = (counts['surface_finish'] ?? 0) + (counts['surface_staining'] ?? 0);
    const dim = counts['dimensional'] ?? 0;
    const edge = (counts['edge'] ?? 0) + (counts['foreign_material'] ?? 0);
    if (surface >= dim && surface >= edge) buckets.C002.orderIds.add(order.order_id);
    else if (dim >= edge) buckets.C003.orderIds.add(order.order_id);
    else buckets.C004.orderIds.add(order.order_id);
  }

  return {
    title: 'Production Categories — by dominant defect family',
    clusters: Object.values(buckets).map((b) => ({
      id: b.id,
      name: b.name,
      items: b.orderIds.size,
      patents: [...b.orderIds],
    })),
  };
})();

// ── jobs.json ───────────────────────────────────────────────────────────
export const JOBS_JSON = {
  patents: PRODUCTION_ORDERS.map((o) => ({
    id: o.order_id,
    status: o.status,
    assignee: `${o.customer} — ${o.qty_completed}/${o.qty_ordered} units · ${o.qty_scrapped} scrapped`,
    title: `${o.part_number} (${o.material}, ${o.tolerance_grade}, prio ${o.priority})`,
    company: o.routing[0]!.machine, // primary machine
    ipc: o.routing.map((r) => r.machine.replace('CNC-5AX', 'MILL-5AX').replace('DEBURR-HAND', 'DEBURR-MAN').replace('QA-INSP', 'INSP-3D')),
    year: 2026,
  })),
};

// ── machines.json ────────────────────────────────────────────────────────
export const MACHINES_JSON = {
  companies: MACHINES.map((m) => ({
    name: m.id,
    country: m.cell,
    region: m.region,
  })),
};

// ── keywords.json ────────────────────────────────────────────────────────
export const KEYWORDS_JSON = {
  keywords: [
    { cluster_id: 'C001', cluster_name: 'On-spec', keyword: 'within tolerance', count: 130 },
    { cluster_id: 'C001', cluster_name: 'On-spec', keyword: 'pass', count: 130 },
    { cluster_id: 'C002', cluster_name: 'Surface finish issues', keyword: 'Ra above 1.6', count: 6 },
    { cluster_id: 'C002', cluster_name: 'Surface finish issues', keyword: 'staining', count: 3 },
    { cluster_id: 'C002', cluster_name: 'Surface finish issues', keyword: 'coolant', count: 9 },
    { cluster_id: 'C002', cluster_name: 'Surface finish issues', keyword: 'smeary finish', count: 5 },
    { cluster_id: 'C003', cluster_name: 'Dimensional drift', keyword: 'length tolerance', count: 4 },
    { cluster_id: 'C003', cluster_name: 'Dimensional drift', keyword: 'chatter', count: 4 },
    { cluster_id: 'C003', cluster_name: 'Dimensional drift', keyword: 'fixture', count: 1 },
    { cluster_id: 'C004', cluster_name: 'Edge / chip damage', keyword: 'chipped flange', count: 2 },
    { cluster_id: 'C004', cluster_name: 'Edge / chip damage', keyword: 'tool damage', count: 2 },
    { cluster_id: 'C004', cluster_name: 'Edge / chip damage', keyword: 'chip-jam', count: 2 },
  ],
};

// ── per-day timeline JSON for line-timeline.html ─────────────────────────
import { TODAY } from './mission';
import { ORDER_SCHEDULE } from './production-orders';
import { STATUS_REPORTS } from './status-reports';

export interface LineDashboardDay {
  date: string;
  machines: Array<{
    machine_id: string;
    name: string;
    image: string;
    /** Production orders on this machine on this day. */
    orders: Array<{ order_id: string; start_hour: number; end_hour: number }>;
    /** Machine state timeline (start/end hour, state, reason). */
    state_timeline: Array<{
      start_hour: number;
      end_hour: number;
      state: string;
      reason: string | null;
    }>;
    /** Quality findings — only for QA-INSP, but populated per-machine
     * so the dashboard can show the upstream-machine attribution. */
    quality_findings: Array<{
      hour: number; // hour-of-day the defect was logged
      severity: 'minor' | 'major' | 'critical';
      defect_type: string;
      order_id: string;
      attributable_to: string; // machine the defect originated at
      note: string;
    }>;
  }>;
  /** Pre-computed list of MQTT events to show in the side panel. The
   * simulator emits live events; this is the seed/backfill set. */
  recent_events: Array<{
    type: string;
    machine: string;
    ts: string;
    payload: Record<string, unknown>;
  }>;
}

function dateMinus(days: number): string {
  const t = new Date(TODAY + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

function hourFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m ?? 0) / 60;
}

function buildSeedEvents(date: string, dayOffset: number): LineDashboardDay['recent_events'] {
  const events: LineDashboardDay['recent_events'] = [];
  // Routine "low-noise" telemetry every day.
  for (const hh of [9, 11, 14, 16]) {
    events.push({
      type: 'spindle_load_warn',
      machine: 'CNC-5AX',
      ts: `${date}T${String(hh).padStart(2, '0')}:00:00Z`,
      payload: { load_pct: 78 + Math.floor(Math.random() * 8), tool_id: 'T12' },
    });
  }
  if (dayOffset === 4) {
    events.push(
      { type: 'bin_full', machine: 'CNC-5AX', ts: `${date}T09:48:00Z`, payload: { fill_pct: 100 } },
      { type: 'conveyor_jam_detected', machine: 'CNC-5AX', ts: `${date}T09:50:00Z`, payload: { jam_location: 'chip_bin' } },
      { type: 'spindle_load_warn', machine: 'CNC-5AX', ts: `${date}T09:51:00Z`, payload: { load_pct: 96, tool_id: 'T07' } },
    );
  }
  if (dayOffset === 2) {
    events.push(
      { type: 'coolant_temp_high', machine: 'CNC-5AX', ts: `${date}T13:08:00Z`, payload: { temp: 67.2, threshold: 65 } },
      { type: 'coolant_temp_high', machine: 'CNC-5AX', ts: `${date}T14:12:00Z`, payload: { temp: 69.0, threshold: 65 } },
      { type: 'coolant_temp_high', machine: 'CNC-5AX', ts: `${date}T15:30:00Z`, payload: { temp: 66.3, threshold: 65 } },
    );
  }
  if (dayOffset === 6) {
    // Tool-break on Steel-304: T18 carbide insert fractured at 14:20.
    events.push(
      { type: 'spindle_load_warn',  machine: 'CNC-5AX', ts: `${date}T14:18:00Z`, payload: { load_pct: 94, tool_id: 'T18' } },
      { type: 'spindle_load_warn',  machine: 'CNC-5AX', ts: `${date}T14:19:30Z`, payload: { load_pct: 99, tool_id: 'T18' } },
      { type: 'tool_breakage_alarm', machine: 'CNC-5AX', ts: `${date}T14:20:00Z`, payload: { tool_id: 'T18', material: 'Steel-304', spindle_load_pct: 99 } },
    );
  }
  if (dayOffset === 3) {
    // Tool-break on Al-7075: T12 end-mill flute chipped at 11:15.
    events.push(
      { type: 'spindle_load_warn',  machine: 'CNC-5AX', ts: `${date}T11:13:00Z`, payload: { load_pct: 92, tool_id: 'T12' } },
      { type: 'tool_breakage_alarm', machine: 'CNC-5AX', ts: `${date}T11:15:00Z`, payload: { tool_id: 'T12', material: 'Al-7075', spindle_load_pct: 96 } },
      { type: 'tool_change_overdue', machine: 'CNC-5AX', ts: `${date}T11:16:00Z`, payload: { tool_id: 'T12', cycles_used: 1003, life: 1000 } },
    );
  }
  return events;
}

export const LINE_DASHBOARD_DAYS: LineDashboardDay[] = (() => {
  const days: LineDashboardDay[] = [];
  for (let d = 7; d >= 0; d--) {
    const date = dateMinus(d);
    const day: LineDashboardDay = {
      date,
      machines: MACHINES.map((m) => {
        const status = STATUS_REPORTS.find((r) => r.machine_id === m.id && r.date === date);
        const orders = Object.entries(ORDER_SCHEDULE).flatMap(([order_id, runs]) =>
          runs
            .filter((r) => r.machine === m.id && r.date === date)
            .map((r) => ({ order_id, start_hour: r.startHour, end_hour: r.endHour })),
        );
        const state_timeline = (status?.timeline ?? []).map((e) => ({
          start_hour: hourFromHHMM(e.start),
          end_hour: hourFromHHMM(e.end),
          state: e.state,
          reason: e.reason,
        }));
        return {
          machine_id: m.id,
          name: m.name,
          image: m.image,
          orders,
          state_timeline,
          quality_findings: [], // populated below
        };
      }),
      recent_events: buildSeedEvents(date, d),
    };
    days.push(day);
  }

  // Attach quality findings to QA-INSP rows; mark the originating machine.
  //
  // Attribution rule (this line's heuristic — captured in
  // wiki/topics/root-cause-attribution.md):
  //
  //   1. Default to the **earliest** upstream machine in the order's
  //      routing that ran the order before this inspection hour. In this
  //      3-step line that's CNC-5AX (mill → deburr → inspect). Most
  //      defects surfaced at QA-INSP are upstream mill symptoms.
  //
  //   2. Override to DEBURR-HAND only when the inspector notes
  //      explicitly point at the manual deburring step (e.g. "deburr
  //      slip", "hand-tool", "missed deburr"). The fixture currently
  //      has no such rows, but the rule is here so future rows can be
  //      attributed honestly without changing code.
  //
  //   3. Tool-damage / coolant signatures stay on CNC-5AX even if
  //      DEBURR-HAND ran the part later (these are mill-origin defects
  //      that survive deburring).
  //
  // The validator below enforces that whichever machine we attribute to
  // actually ran the order earlier — so we cannot silently pick a
  // machine that never touched the part.
  const DEBURR_RE = /deburr slip|hand[- ]tool|missed deburr/i;
  for (const file of QUALITY_REPORTS) {
    for (const row of file.rows) {
      if (row.defect_type === 'pass') continue;
      const date = row.timestamp.slice(0, 10);
      const day = days.find((dd) => dd.date === date);
      if (!day) continue;
      const inspRow = day.machines.find((m) => m.machine_id === 'QA-INSP');
      if (!inspRow) continue;
      const hour = parseInt(row.timestamp.slice(11, 13), 10);
      const min = parseInt(row.timestamp.slice(14, 16), 10);
      const hourDecimal = hour + min / 60;

      // Upstream runs of this order that ended before this inspection hour.
      const upstreamRuns = (ORDER_SCHEDULE[row.production_order_id] ?? [])
        .filter((r) => r.machine !== 'QA-INSP')
        .filter((r) => r.date < date || (r.date === date && r.endHour <= hourDecimal))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);

      // Earliest upstream run (= the mill, in this line). Fall back to
      // CNC-5AX so attribution is never undefined.
      let attributable_to = upstreamRuns[0]?.machine ?? 'CNC-5AX';
      if (DEBURR_RE.test(row.notes)) attributable_to = 'DEBURR-HAND';

      inspRow.quality_findings.push({
        hour,
        severity: row.defect_severity as 'minor' | 'major' | 'critical',
        defect_type: row.defect_type,
        order_id: row.production_order_id,
        attributable_to,
        note: row.notes,
      });
    }
  }

  // ── Consistency validator ────────────────────────────────────────────
  // Guardrail against the class of bug where a QA-INSP finding lands at
  // an hour QA-INSP wasn't running, or is attributed to an upstream
  // machine that didn't actually run the order earlier the same day.
  // If either invariant is violated, fail loudly at seed-time so the
  // fixtures can't drift apart silently again.
  const violations: string[] = [];
  for (const day of days) {
    const inspRow = day.machines.find((m) => m.machine_id === 'QA-INSP');
    if (!inspRow) continue;

    // Pre-compute the running intervals for the day (in hours, fractional).
    const runningWindows = inspRow.state_timeline
      .filter((s) => s.state === 'running')
      .map((s) => ({ start: s.start_hour, end: s.end_hour }));

    for (const f of inspRow.quality_findings) {
      // Invariant 1: QA-INSP must be running at hour `f.hour`.
      const inWindow = runningWindows.some((w) => f.hour >= Math.floor(w.start) && f.hour < Math.ceil(w.end));
      if (!inWindow) {
        violations.push(
          `${day.date}: QA-INSP finding at hour ${f.hour} for ${f.order_id} ` +
            `falls outside QA-INSP's running windows ${JSON.stringify(runningWindows)}.`,
        );
      }

      // Invariant 2: attributed upstream machine must have run this order
      // earlier on the same day OR on an earlier day this week.
      const upstream = (ORDER_SCHEDULE[f.order_id] ?? []).find((r) => r.machine === f.attributable_to);
      if (!upstream) {
        violations.push(
          `${day.date}: finding for ${f.order_id} attributed to ${f.attributable_to}, ` +
            `but that machine has no run scheduled for the order.`,
        );
        continue;
      }
      // Earlier same day or any prior day is fine; same day after the
      // inspection hour or future days are not.
      if (upstream.date > day.date || (upstream.date === day.date && upstream.endHour > f.hour)) {
        violations.push(
          `${day.date}: finding at hour ${f.hour} for ${f.order_id} attributed to ` +
            `${f.attributable_to}, but that machine's run for the order is on ` +
            `${upstream.date} ${upstream.startHour}-${upstream.endHour} — not earlier.`,
        );
      }
    }

    // Invariant 3: if QA-INSP has zero running windows on a day, it must
    // have zero findings on that day.
    if (runningWindows.length === 0 && inspRow.quality_findings.length > 0) {
      violations.push(
        `${day.date}: QA-INSP has no running windows but ${inspRow.quality_findings.length} ` +
          `findings are attached. Either the inspection date in QUALITY_REPORTS is wrong, ` +
          `or ORDER_SCHEDULE is missing a QA-INSP run.`,
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Dashboard data is internally inconsistent (${violations.length} violation${violations.length === 1 ? '' : 's'}):\n  - ` +
        violations.join('\n  - ') +
        `\n\nFix QUALITY_REPORTS row timestamps or ORDER_SCHEDULE entries so every QA-INSP ` +
        `finding lands inside QA-INSP's running window and the attributed upstream ran earlier.`,
    );
  }

  return days;
})();
