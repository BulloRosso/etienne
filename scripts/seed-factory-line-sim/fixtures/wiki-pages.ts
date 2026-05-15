/**
 * 20 wiki pages for the factory-line-sim project.
 *   - 14 in topics/  (line, machines, root causes, data schemas, dashboards)
 *   -  4 in topics/  (oee/defect-taxonomy/tolerance/glossary)
 *   -  2 in sources/ (operator-manual + standards reference)
 *
 * Cross-links use [label](../topics/<slug>.md) so wiki-add.ts auto-creates
 * any missing backlinks.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stable' | 'draft' | 'stub';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
  classification?: 'public' | 'private' | 'secret';
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // ─── overview & machines ──────────────────────────────────────────────
  {
    title: 'Line overview',
    slug: 'line-overview',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['line', 'overview'],
    mission_relevance: 1.0,
    body:
`# Line overview

Three machines in series, one production order on the line at a time:

\`\`\`
  raw stock ─▶ [CNC-5AX] ─▶ [DEBURR-HAND] ─▶ [QA-INSP] ─▶ shipped
                Cell A         Cell B          Cell C
\`\`\`

- [CNC-5AX](./machine-cnc-5ax.md) — 5-axis mill, the throughput bottleneck.
- [DEBURR-HAND](./machine-deburr-hand.md) — manual; operator-paced.
- [QA-INSP](./machine-qa-insp.md) — automated 3D vision; emits pass/fail.

A part can spend a few hours to two days on the line depending on size and
complexity. CNC dominates the cycle time; DEBURR is the variability source;
QA is fast but the bottleneck for *judgement* (it's where defects are first
seen).

Read alongside [defect-taxonomy](./defect-taxonomy.md) and the
[mqtt-event-catalog](./mqtt-event-catalog.md).`,
  },
  {
    title: 'Machine: CNC-5AX (5-axis mill)',
    slug: 'machine-cnc-5ax',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['machine', 'cnc'],
    mission_relevance: 1.0,
    body:
`# CNC-5AX — 5-axis mill

DMG MORI NHX-5500 class. Cell A. The first machine in the line.

## Role
Roughs and finishes the part from raw bar stock. Performs operations
\`MILL-5AX\` (multi-axis milling) and \`BORE-PREC\` (precision boring).

## Consumables and ancillary systems
- **Coolant** — 5 % synthetic emulsion, ~60 L sump. Spec sheet:
  [coolant-spec-sheet](../sources/coolant-spec-sheet.md). Degrades after
  ~120 operating hours; coolant temperature should stay below 60 °C.
- **Chip evacuation** — auger conveyor drops chips into a 60 L bin behind
  the machine. Bin must be emptied manually; the
  [chip-evacuation root cause](./root-cause-chip-evacuation.md) page
  describes what happens when this is missed.
- **Tools** — magazine of 24, plus a wear-tracking policy described in
  [tool-life-policy](../sources/tool-life-policy.md).

## What goes wrong here
Most of the line's quality issues originate at this machine. Top hitters:
[tool wear](./root-cause-tool-wear.md),
[coolant degradation](./root-cause-coolant-degradation.md),
[chip evacuation](./root-cause-chip-evacuation.md),
[fixture drift](./root-cause-fixture-drift.md),
[thermal drift](./root-cause-thermal-drift.md),
[material lot variation](./root-cause-material-lot.md).

## Data signature
- Status report shows \`state: degraded\` (coolant) or \`state: error\`
  (jam/alarm) on bad days; otherwise \`state: running\` with routine
  break/lunch idle blocks.
- Quality reports for the *next-day* QA-INSP run are the lagging
  indicator — defects from a CNC issue typically surface 4–24 h later.`,
  },
  {
    title: 'Machine: DEBURR-HAND (manual deburring)',
    slug: 'machine-deburr-hand',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['machine', 'deburr'],
    mission_relevance: 0.7,
    body:
`# DEBURR-HAND — manual deburring station

Cell B. One operator (typically two on rotating shifts).

## Role
Removes burrs and sharp edges left by 5-axis milling. Uses rotary tools
and hand files. Throughput depends on operator skill and how aggressive
the prior CNC pass was.

## What goes wrong here
- Operator handling can introduce new edge defects (over-deburred edges,
  scratches near mating faces). These show up at QA-INSP as \`edge\`
  defects when the upstream CNC report is otherwise clean.
- Long idle stretches when CNC output is slow → a downstream symptom,
  not a root cause.

## Data signature
- Status report often shows long \`idle / no_input_parts\` blocks on days
  when CNC is degraded — useful corroboration when investigating CNC.`,
  },
  {
    title: 'Machine: QA-INSP (3D vision inspection)',
    slug: 'machine-qa-insp',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['machine', 'inspection'],
    mission_relevance: 0.9,
    body:
`# QA-INSP — automated 3D vision inspection

Cell C. Where every defect is *first observed*.

## Role
3D vision system measures critical dimensions and surface finish; emits
one row per item to the quality report (\`pass\` or a defect type). Does
not stop the line — even rejected parts continue to ship to scrap.

## What goes wrong here
Most QA-INSP "issues" are upstream symptoms surfacing here. The one
*originating* root cause is
[vision system calibration drift](./root-cause-vision-calibration.md):
after ~1000 cycles the camera focus or lighting drifts and you start
getting false rejects (or worse, false passes).

Calibration is logged manually; if the QA report shows a
\`camera_focus_drift\` MQTT event around the same time as a reject spike,
*the spike may be QA's fault, not CNC's*. Always check.`,
  },

  // ─── root causes (7) ───────────────────────────────────────────────────
  {
    title: 'Root cause — tool wear',
    slug: 'root-cause-tool-wear',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['root-cause', 'cnc', 'tooling'],
    mission_relevance: 0.95,
    body:
`# Root cause — tool wear

A milling tool dulls progressively over its life. Past ~80 % of rated
cycles, surface finish degrades and dimensions drift toward the upper
spec limit (the dull tool deflects rather than cuts).

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- \`surface_finish\` defects with Ra creeping above 1.6 µm.
- \`dimensional\` drift, often biased to one side of the spec band.

## Status symptom
- Spindle load creeping up over the run.
- Cycle time slowly increasing (operator may compensate by feed-rate cut).

## MQTT events that precede or accompany
- \`spindle_load_warn\` (load_pct > 90)
- \`tool_change_overdue\` (cycles_used >= life threshold)

## Where to look
1. [tool-life-policy](../sources/tool-life-policy.md) — current cycle limits.
2. Status report's \`tool_changes\` counter — was a scheduled change skipped?`,
  },
  {
    title: 'Root cause — coolant degradation',
    slug: 'root-cause-coolant-degradation',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['root-cause', 'cnc', 'coolant'],
    mission_relevance: 1.0,
    body:
`# Root cause — coolant degradation

The synthetic coolant emulsion in CNC-5AX's sump degrades over time:
bacteria grow, pH drifts, lubricity drops. A run that exceeds 65 °C
coolant temperature for an extended window will produce parts with
visibly poor surface finish and occasional staining.

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- \`surface_finish\` defects (Ra > 1.6 µm) — the dominant signal.
- \`surface_staining\` — secondary, often cosmetic.
- Effect is **time-correlated**: once coolant is bad, *every* part in the
  affected window is affected.

## Status symptom
- Status report shows \`state: degraded\` with reason
  \`coolant_quality_degraded\`. Machine doesn't stop — that's why this is
  insidious.

## MQTT events
- \`coolant_temp_high\` (temp > 65 °C, threshold from the
  [coolant-spec-sheet](../sources/coolant-spec-sheet.md))

## Where to look
1. The day's status JSON for any \`degraded\` block.
2. Quality reports for that day's PO at QA-INSP, filtered to
   \`surface_finish\` and \`surface_staining\` defect types.
3. Recent \`coolant_temp_high\` events on the MQTT topic
   \`cnc-5ax/telemetry\`.`,
  },
  {
    title: 'Root cause — chip evacuation failure',
    slug: 'root-cause-chip-evacuation',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['root-cause', 'cnc'],
    mission_relevance: 0.95,
    body:
`# Root cause — chip evacuation failure

The auger conveyor behind CNC-5AX moves chips from the cutting zone to a
60 L bin. If the bin overflows or the conveyor jams, chips re-circulate
into the cutting zone, causing chatter and tool damage. The downstream
symptoms — chipped tool edges, dimensional chatter — show up at QA-INSP
on the next day's parts.

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- \`dimensional\` defects with chatter signature (oscillating measurements
  across consecutive items).
- \`edge\` defects (chipped flange edges) when the tool itself was
  damaged.

## Status symptom
- Status report shows a \`state: error\` block with reason
  \`chip_evacuation_jam\`. Typical clear time 15–30 min.
- A subsequent \`tool_change\` is often logged at end of day.

## MQTT events
- \`bin_full\` (fill_pct = 100)
- \`conveyor_jam_detected\` (jam_location: chip_bin)

## Where to look
1. The day's status JSON for a \`chip_evacuation_jam\` entry.
2. Quality report for the *next* day's QA-INSP — defects lag by 1 day.
3. Was a tool changed at EOD with note "chip damage"? Strong signal.`,
  },
  {
    title: 'Root cause — fixture clamping drift',
    slug: 'root-cause-fixture-drift',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['root-cause', 'cnc', 'fixture'],
    mission_relevance: 0.7,
    body:
`# Root cause — fixture clamping drift

The hydraulic clamp on CNC-5AX can lose pressure slowly over a run. The
part shifts a few hundredths of a millimetre during cutting, producing
*positional* dimensional defects that are usually one-sided (always too
short, always too narrow on one axis).

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- \`dimensional\` defects on a single axis, biased always one direction.
- Often only the *first few parts* of a run, then operator notices and
  re-clamps.

## MQTT events
- \`fixture_clamp_pressure_low\` (pressure_bar below min)`,
  },
  {
    title: 'Root cause — thermal drift',
    slug: 'root-cause-thermal-drift',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['root-cause', 'cnc', 'inspection'],
    mission_relevance: 0.5,
    body:
`# Root cause — thermal drift

Both CNC-5AX and QA-INSP are sensitive to ambient temperature. A 2 °C
shift over a few hours can produce dimensional drift of ~10 µm on
precision parts, which can push tight-tolerance parts (IT7) just over.

This is rare and usually only visible when no other root cause fits.

## MQTT events
- \`ambient_temp_deviation\` (temp_delta_from_baseline > 2 °C)`,
  },
  {
    title: 'Root cause — vision calibration drift',
    slug: 'root-cause-vision-calibration',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['root-cause', 'inspection'],
    mission_relevance: 0.85,
    body:
`# Root cause — vision system calibration drift

After ~1000 inspection cycles, QA-INSP's camera focus or lighting can
drift. Symptoms are *false rejects* (parts marked bad that are actually
good) or — much worse — *false passes* (defective parts marked good).

## Originates at
[QA-INSP](./machine-qa-insp.md).

## Telltale
- Reject rate spikes on QA-INSP *without a corresponding upstream signal*
  (no MQTT alarms, no CNC degradation, status of CNC-5AX is clean).
- Pattern affects defect *type* uniformly (e.g. all rejects are
  \`dimensional\` with similar jitter, not a coherent failure mode).

## MQTT events
- \`camera_focus_drift\` (blur_score above threshold)
- \`light_recalibration_needed\``,
  },
  {
    title: 'Root cause — material lot variation',
    slug: 'root-cause-material-lot',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['root-cause', 'material'],
    mission_relevance: 0.6,
    body:
`# Root cause — material lot variation

Different batches of Al-7075 or Steel-304 can have measurably different
hardness within spec. A harder lot stresses tools more, accelerates wear,
and can shift surface finish. See
[material-cert-al-7075-lot-B](../sources/material-cert-al-7075-lot-b.md)
for an example of a "bad lot" we've seen.

## Telltale
- Spindle load surge on the *first part* of a new lot.
- Tool wear accelerates across the run.

## MQTT events
- \`material_hardness_change\` (spindle load on first cut deviates from
  baseline by > 10 %)`,
  },

  // ─── data schemas (3) ─────────────────────────────────────────────────
  {
    title: 'Data — quality reports (xlsx)',
    slug: 'data-quality-reports-xlsx',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['data', 'schema'],
    mission_relevance: 0.9,
    body:
`# Quality reports — xlsx schema

Inspectors upload a workbook to \`quality-reports/\`. Filename convention:

\`\`\`
<YYYY-MM-DD>_<MACHINE_ID>_<ORDER_ID>[-dayN].xlsx
\`\`\`

Each row is one item passing through QA-INSP.

| Column | Type | Notes |
|---|---|---|
| \`production_order_id\` | string | e.g. \`PO-1003\` |
| \`part_number\` | string | per the production order |
| \`machine_id\` | string | always \`QA-INSP\` for now |
| \`item_id\` | string | unique within the order |
| \`defect_type\` | enum | \`pass\`, \`dimensional\`, \`surface_finish\`, \`surface_staining\`, \`edge\`, \`foreign_material\`, \`other\` |
| \`defect_severity\` | enum | \`none\`, \`minor\`, \`major\`, \`critical\` |
| \`measurement_value\` | number | the measured value (units depend on defect_type) |
| \`specification_min\`/\`max\` | number | spec band |
| \`inspector_id\` | string | e.g. \`INS-Maria\` |
| \`timestamp\` | ISO 8601 | when this item was inspected |
| \`notes\` | string | free-text observation |

Files can be uploaded once. There is no merge — a re-upload replaces.`,
  },
  {
    title: 'Data — machine status reports (json)',
    slug: 'data-status-reports-json',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['data', 'schema'],
    mission_relevance: 0.9,
    body:
`# Machine status reports — json schema

One file per machine per day under \`status/\`:

\`\`\`
status/status_<MACHINE_ID>_<YYYY-MM-DD>.json
\`\`\`

The same day can be uploaded multiple times — each upload **merges into
the existing file**: timeline entries are union-ed and re-sorted, and
\`oee_metrics\` are recomputed.

\`\`\`json
{
  "machine_id": "CNC-5AX",
  "date": "2026-05-13",
  "shift_pattern": "1-shift",
  "timeline": [
    { "start": "08:00", "end": "10:30", "state": "running", "reason": null }
  ],
  "total_runtime_min": 410,
  "total_downtime_min": 60,
  "downtime_breakdown": { "operator_break": 15, "lunch_break": 45 },
  "oee_metrics": { "availability_pct": 87.2, "performance_pct": 96.0, "quality_pct": 98.5 },
  "chip_bin_emptied_count": 1,
  "coolant_changed": false,
  "tool_changes": 1,
  "last_updated": "2026-05-13T17:30:00Z"
}
\`\`\`

States: \`running\`, \`idle\`, \`maintenance\`, \`error\`, \`degraded\`,
\`offline\`. The \`degraded\` state is the one easy to miss — the machine
keeps running but produces lower-quality output.`,
  },
  {
    title: 'Data — production orders (json)',
    slug: 'data-production-orders-json',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['data', 'schema'],
    mission_relevance: 0.8,
    body:
`# Production orders — json schema

One file per order under \`production-orders/\`:

\`\`\`json
{
  "order_id": "PO-1003",
  "part_number": "TURB-AL75-65X22",
  "customer": "Acme Aerospace",
  "priority": "high",
  "qty_ordered": 80,
  "qty_completed": 80,
  "qty_scrapped": 9,
  "due_date": "2026-05-14",
  "created_date": "2026-05-07",
  "material": "Al-7075",
  "tolerance_grade": "IT7",
  "status": "Completed",
  "routing": [
    { "sequence": 1, "machine": "CNC-5AX", "est_cycle_min": 12 },
    { "sequence": 2, "machine": "DEBURR-HAND", "est_cycle_min": 5 },
    { "sequence": 3, "machine": "QA-INSP", "est_cycle_min": 2 }
  ]
}
\`\`\`

\`status\` ∈ {\`Queued\`, \`Running\`, \`Completed\`}. The \`est_cycle_min\`
field on each routing step is the **per-part** estimate; multiply by
\`qty_ordered\` for total expected machine time.`,
  },

  // ─── MQTT + dashboard ────────────────────────────────────────────────
  {
    title: 'MQTT event catalogue',
    slug: 'mqtt-event-catalog',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['mqtt', 'events'],
    mission_relevance: 0.9,
    body:
`# MQTT event catalogue

The 8 event types the line emits, in rough order of operational urgency:

| Event | Topic | Trigger | Payload essentials |
|---|---|---|---|
| \`coolant_temp_high\` | \`cnc-5ax/telemetry\` | sump T > 65 °C | \`temp\`, \`threshold\` |
| \`spindle_load_warn\` | \`cnc-5ax/telemetry\` | load_pct > 90 | \`load_pct\`, \`tool_id\` |
| \`tool_change_overdue\` | \`cnc-5ax/maintenance\` | cycles_used ≥ life | \`tool_id\`, \`cycles_used\`, \`life\` |
| \`bin_full\` | \`cnc-5ax/chip-evacuation\` | fill_pct = 100 | \`fill_pct\` |
| \`conveyor_jam_detected\` | \`cnc-5ax/chip-evacuation\` | torque spike | \`jam_location\` |
| \`fixture_clamp_pressure_low\` | \`cnc-5ax/telemetry\` | pressure < 5 bar | \`axis\`, \`pressure_bar\`, \`min\` |
| \`camera_focus_drift\` | \`qa-insp/telemetry\` | blur_score > 5 | \`blur_score\`, \`threshold\` |
| \`ambient_temp_deviation\` | \`line/environment\` | Δ > 2 °C/hr | \`temp_delta_from_baseline\` |

All payloads carry: \`type\`, \`machine\`, \`ts\` (ISO timestamp), and the
event-specific fields above.`,
  },
  {
    title: 'Dashboard anatomy',
    slug: 'dashboard-anatomy',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['dashboard'],
    mission_relevance: 0.7,
    body:
`# Dashboard anatomy

Two HTML pages live under \`linedashboard/\`. Both use Material UI and
the LiveHTMLPreview \`workspace:write\` bridge to persist selections.

## \`cnc-dashboard.html\`
Cross-cutting view of all production orders + defect categories +
machines. KPIs at the top, drilldown chart in the middle (Region →
Plant → Machine, or Category → Operation), filterable jobs table at the
bottom. Open it from the file tree in the IDE.

## \`line-timeline.html\`
Per-day timeline view (defaults to today; pick a date from the picker).
Three rows per machine:
1. **Production order assignment** (which PO ran when)
2. **Machine state** (running/idle/error/degraded/maintenance)
3. **Quality findings** (markers showing when QA-INSP rejected items
   that originated at this machine)

Plus the **latest 10 MQTT events** in a side panel.

Both dashboards read JSON from sibling files — the seed script writes
\`categories.json\`, \`jobs.json\`, \`machines.json\`, \`keywords.json\`
and one \`machines_line_<date>.linedashboard.json\` per day.`,
  },

  // ─── reference (4) ───────────────────────────────────────────────────
  {
    title: 'OEE basics',
    slug: 'oee-basics',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['reference', 'oee'],
    mission_relevance: 0.4,
    body:
`# OEE basics

Overall Equipment Effectiveness = Availability × Performance × Quality.

- **Availability** = (planned production time − downtime) / planned production time
- **Performance** = ideal cycle time × total count / runtime
- **Quality** = good count / total count

We log the three components in every machine status report's
\`oee_metrics\`. World-class OEE is ~85 %; our line runs ~75–85 % on
clean days.`,
  },
  {
    title: 'Defect taxonomy',
    slug: 'defect-taxonomy',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['quality', 'taxonomy'],
    mission_relevance: 0.7,
    body:
`# Defect taxonomy

Used in the \`defect_type\` column of every quality report.

| Type | Means | Most likely root cause |
|---|---|---|
| \`pass\` | within all specs | — |
| \`dimensional\` | a measurement is outside spec band | tool wear, fixture drift, chip-jam chatter, thermal drift |
| \`surface_finish\` | Ra above spec | coolant degradation, tool wear |
| \`surface_staining\` | discoloration / deposit | coolant degradation |
| \`edge\` | sharp edge or burr or chipped flange | deburring miss, chip-jam tool damage |
| \`foreign_material\` | swarf or chip embedded | chip-evacuation failure |
| \`other\` | catch-all | inspector free-text in \`notes\` |`,
  },
  {
    title: 'Tolerance grades (IT7 / IT8)',
    slug: 'tolerance-grades',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['reference'],
    mission_relevance: 0.3,
    body:
`# Tolerance grades

ISO 286 standard tolerance grades. A higher grade number = wider tolerance.

- **IT7** — typical for press fits and precision turbine parts. ~15 µm
  on a 20 mm feature.
- **IT8** — typical for general machined parts. ~25 µm on a 20 mm
  feature.

Most line orders are IT8. Aerospace orders for Acme are often IT7 — these
are the parts most sensitive to thermal drift and tool wear.`,
  },
  {
    title: 'Glossary',
    slug: 'glossary',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['reference'],
    mission_relevance: 0.3,
    body:
`# Glossary

- **Cell** — physical area on the shop floor for one machine. Cells A/B/C
  hold CNC-5AX, DEBURR-HAND, QA-INSP respectively.
- **OEE** — Overall Equipment Effectiveness. See [oee-basics](./oee-basics.md).
- **Ra** — arithmetic mean roughness. Surface-finish quality metric.
- **PO** — production order; identifier prefix \`PO-\`.
- **Sump** — coolant reservoir under CNC-5AX.`,
  },

  // ─── sources (2) ─────────────────────────────────────────────────────
  {
    title: 'Source — Coolant spec sheet (synthetic emulsion)',
    slug: 'coolant-spec-sheet',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source', 'coolant'],
    mission_relevance: 0.8,
    body:
`# Source — coolant spec sheet

Vendor: Castrol Hysol XF. Concentration 5 % in water.

- Operating temperature: **40–60 °C**
- Action threshold: **65 °C** — at this point, surface-finish quality
  begins to degrade measurably and bacterial growth accelerates.
- Service life: **120 operating hours** between sump drain + refill.
- pH spec: 8.5–9.2.

These thresholds drive the \`coolant_temp_high\` MQTT event.`,
  },
  {
    title: 'Source — tool life policy',
    slug: 'tool-life-policy',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['source', 'tooling'],
    mission_relevance: 0.7,
    body:
`# Source — tool life policy

Per-tool-type cycle limits before mandatory replacement:

| Tool family | Cycles | Override threshold |
|---|---|---|
| End mill (3-flute carbide) | 1000 | 850 (Al), 700 (Steel) |
| Boring bar (precision) | 600 | 500 |
| Face mill | 1500 | 1300 |

A \`tool_change_overdue\` MQTT event fires at 100 % of the family limit;
operators are expected to swap by 90 % when running a tight-tolerance
(IT7) order.`,
  },
];
