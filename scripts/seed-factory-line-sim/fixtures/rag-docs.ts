/**
 * 8 RAG documents written to documents/ and indexed via
 * /api/workspace/factory-line-sim/rag/index-document.
 *
 * Substantive enough that semantic search produces useful hits when the
 * skill asks "what's the coolant change procedure" or "what's lot B
 * known for".
 */

export interface RagDoc {
  filename: string;
  body: string;
}

export const RAG_DOCS: RagDoc[] = [
  {
    filename: 'operator-manual-cnc-5ax.md',
    body: `# Operator Manual — CNC-5AX

## Daily startup
1. Power on, wait 30 minutes for thermal equilibrium before any IT7 part.
2. Verify coolant temperature is below 50 °C and sump level is full.
3. Verify chip bin is empty (or at most 25 % full).
4. Run the daily warm-up cycle (program 9001) — 8 minutes of no-load
   spindle and axis travel.
5. Mount fixture, apply hydraulic clamp, verify clamp pressure is between
   5.5 and 6.5 bar.

## Daily shutdown
1. Park spindle, retract all axes to home.
2. Inspect tools in the magazine for visible wear or chip damage.
3. Empty chip bin if more than 50 % full.
4. Wipe down sump and check coolant temperature, pH (target 8.7–9.0).

## Coolant management
- Change cycle: every 120 operating hours (about every 2 weeks at our
  current load).
- Top up between changes: keep sump within 90 % of full.
- If \`coolant_temp_high\` MQTT event fires, do not continue an IT7 run.
  Pause, let the system cool, and confirm pH is in band before resuming.

## Chip evacuation
- Bin capacity: 60 L.
- The auger conveyor torque sensor will trip at ~85 % of rated load and
  emit \`conveyor_jam_detected\`. Stop, clear chips back into the bin,
  reset.
- A \`bin_full\` event halts new tool engagements; you must empty the bin
  to resume.

## Tool changes
- Follow [tool-life-policy](../wiki/sources/tool-life-policy.md).
- After any chip-jam event during the day, inspect every tool used since
  the jam for visible chip damage; swap any tool that shows it.
`,
  },
  {
    filename: 'coolant-spec-sheet.md',
    body: `# Coolant — Castrol Hysol XF Specification

## Composition
Synthetic emulsion. 5 % vol in deionised water.

## Operational thresholds
- Working temperature: 40–60 °C
- Action threshold: **65 °C** (MQTT \`coolant_temp_high\`)
- Critical: 75 °C — full stop required
- pH: 8.5–9.2 (drift below 8.0 indicates bacterial contamination)
- Service life: 120 operating hours between sump drains

## Failure modes and signatures
- **Bacterial degradation**: pH drops, "rotten" smell, surface-staining
  defects on aluminium parts.
- **Thermal degradation**: oil droplets on sump surface, "smeary"
  surface finish on machined parts (Ra above 1.6 µm), reduced
  lubricity.
- **Concentration drift**: 5 % concentration drops to 3 % over time as
  carry-off accumulates; corrosion appears on steel parts.

## Change procedure
1. Drain sump completely (gravity, then suction).
2. Wash sump with 1 % cleaner solution, drain.
3. Refill with fresh 5 % emulsion, agitate via spindle for 5 min.
4. Test pH and concentration before resuming production.
5. Log \`coolant_changed: true\` in the day's status JSON.
`,
  },
  {
    filename: 'deburring-sop.md',
    body: `# Deburring SOP

## Tools
- Rotary file (carbide, 3 mm) for accessible edges
- Hand file (medium, half-round) for fine edges and mating-face fillets
- Inspection light (5×) and fingertip pass

## Method
1. Inspect every flange, hole edge, and mating face for visible burrs.
2. File at a consistent 30° angle relative to the cut face. Do not
   round mating faces — keep edges crisp.
3. After deburring, run a fingertip pass under the light. Any "catch"
   means a residual burr.
4. Wipe with isopropanol, store in the buffer rack.

## Quality risks
- **Over-deburring**: rounding off a mating face shows up at QA-INSP as
  a dimensional defect on the contact dimension. Caution near press-fit
  features.
- **Scratches**: rotary file in direct contact with a finished face
  leaves visible marks → \`surface_finish\` defect. Always file on edges
  only, never across faces.

## Throughput notes
- A clean 12 cm aluminium part takes 4–6 minutes per piece.
- A steel bracket with multiple pockets can take 8–10 minutes.
- Backlog from CNC > 12 parts? Call for second-shift help.
`,
  },
  {
    filename: 'vision-system-calibration-procedure.md',
    body: `# QA-INSP — Vision System Calibration Procedure

## When to recalibrate
- Every 1000 inspection cycles (logged in QA-INSP daily counter).
- Whenever \`camera_focus_drift\` MQTT event fires.
- After any move of the inspection cell.

## Procedure (15 min)
1. Mount the calibration plate (KEYENCE master block, p/n MB-035) in the
   nominal part position.
2. Run program \`CAL-9000\`. The system captures 5 reference images and
   computes a focus score.
3. If focus score < 5.0, accept; > 5.0 indicates focus drift — physically
   adjust the lens per machine label, repeat.
4. If lighting non-uniformity > 8 %, run \`CAL-9001\` to re-balance the
   ring light.
5. Log calibration in the QA-INSP shift log; reset the cycle counter.

## Symptoms of overdue calibration
- Sudden spike in reject rate on QA-INSP **without any upstream signal**
  (no MQTT alarms, CNC-5AX status clean, coolant fine).
- Defects of *all the same type* with similar measurement jitter (this
  is the camera's noise, not the part's variation).

If you see this pattern, recalibrate before assuming an upstream root
cause.
`,
  },
  {
    filename: 'material-cert-al-7075-lot-A.md',
    body: `# Material Certificate — Al-7075 Lot A

Supplier: Bremen Metals (lot ref: BM-AL75-A-2026-04)

| Property | Spec | Measured |
|---|---|---|
| Composition Zn | 5.1–6.1 % | 5.7 % |
| Composition Mg | 2.1–2.9 % | 2.5 % |
| Composition Cu | 1.2–2.0 % | 1.6 % |
| Hardness HV | 150–170 | 158 |
| Tensile strength | ≥ 540 MPa | 568 MPa |

This is the **standard lot**. PO-1001, PO-1004 use this lot.

Machining notes: standard feed/speed; tool wear consistent with
[tool-life-policy](../wiki/sources/tool-life-policy.md).
`,
  },
  {
    filename: 'material-cert-al-7075-lot-B.md',
    body: `# Material Certificate — Al-7075 Lot B

Supplier: Bremen Metals (lot ref: BM-AL75-B-2026-05)

| Property | Spec | Measured |
|---|---|---|
| Composition Zn | 5.1–6.1 % | 6.0 % |
| Composition Mg | 2.1–2.9 % | 2.85 % |
| Composition Cu | 1.2–2.0 % | 1.95 % |
| Hardness HV | 150–170 | **172** (one point above spec ceiling) |
| Tensile strength | ≥ 540 MPa | 591 MPa |

This lot is at the **high end of hardness**. PO-1003 used this lot.

> ⚠️ Machining notes: spindle load reads ~8 % higher than Lot A on
> identical programs. Recommend reducing feed rate by 5 % and watching
> tool life closely; expect tool changes 10–15 % earlier than nominal.

This lot is not out-of-spec, but the harder material may have contributed
to elevated coolant temperature on PO-1003 (more cutting energy →
more sump heating).
`,
  },
  {
    filename: 'tool-life-policy.md',
    body: `# Tool Life Policy

## Family limits
| Tool family | Cycles | Material override |
|---|---|---|
| End mill, 3-flute carbide | 1000 | Al: 850 / Steel: 700 |
| Boring bar, precision | 600 | — |
| Face mill | 1500 | Steel: 1300 |
| Drill (twist, 6 mm) | 800 | — |

## Cycle counter
The CNC controller logs cycles per tool slot. \`tool_change_overdue\`
MQTT event fires at 100 % of the family limit.

For tight-tolerance (IT7) orders: swap at **90 %** of the limit, not
100 %. The last 10 % of life is where dimensional drift accelerates.

## Mid-run swap
If you swap mid-run because of an alarm or visible damage:
1. Note in the day's status JSON: \`tool_changes\` += 1, with note.
2. Inspect the parts produced since the *last* swap for damage signs;
   route any suspect parts to QA-INSP for 100 % inspection.
`,
  },
  {
    filename: 'shift-handover-template.md',
    body: `# Shift Handover Template

(Filled out by the outgoing shift lead, read by the incoming.)

\`\`\`
Date: _________      Shift: ☐ AM  ☐ PM
Lead (out): _____    Lead (in): _____

Machine status:
  CNC-5AX:    ☐ ok  ☐ degraded  ☐ down — notes:
  DEBURR-HAND: ☐ ok  ☐ down — notes:
  QA-INSP:    ☐ ok  ☐ recal due  ☐ down — notes:

Active orders:
  PO-____  on machine ____  ~__ % complete  next step: ____

Open MQTT alarms:
  ☐ none   ☐ see attached list

Quality events of note (today):
  -

Carryover for next shift:
  -
\`\`\`
`,
  },
];
