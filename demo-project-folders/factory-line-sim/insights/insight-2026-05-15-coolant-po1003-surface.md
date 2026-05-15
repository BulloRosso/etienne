---
title: Coolant degradation drove PO-1003 surface defects
date: 2026-05-15
window: 2026-05-13 .. 2026-05-14
machines: [CNC-5AX]
orders: [PO-1003]
root_cause: root-cause-coolant-degradation
severity: major
---

# Coolant degradation drove PO-1003 surface defects

PO-1003 (Acme Aerospace, TURB-AL75-65X22, IT7) finished yesterday with
**9 defects in its second-day inspection batch** out of 52 inspected
items: 6 `surface_finish` (Ra > 1.6 µm) and 3 `surface_staining`. This
is the largest single-PO defect cluster of the past 7 days.

## Origin

The defective parts were machined on **2026-05-13** on **CNC-5AX**.
That day's status JSON (`status/status_CNC-5AX_2026-05-13.json`)
shows a **`degraded` block from 12:45 to 15:45** with reason
`coolant_quality_degraded` — the machine kept running at reduced
surface-finish quality.

Three matching MQTT `coolant_temp_high` events on
`cnc-5ax/telemetry`:

| Time | Temperature | Threshold |
|---|---|---|
| 13:08 | 67.2 °C | 65 °C |
| 14:12 | 69.0 °C | 65 °C |
| 15:30 | 66.3 °C | 65 °C |

Per the [coolant spec sheet](../wiki/sources/coolant-spec-sheet.md),
65 °C is where surface-finish quality begins to degrade measurably.

## Possible contributor

PO-1003 used **Al-7075 Lot B** (see
`documents/material-cert-al-7075-lot-B.md`). That lot's hardness is
right at the spec ceiling (HV 172 vs ceiling 170) and is documented to
elevate spindle load by ~8 % vs Lot A. More cutting energy → more sump
heating. The coolant was *not* due for change (only ~38 hours into the
120-hour service life), so the trigger was thermal not contamination.

## Pattern (for future watch)

`coolant_temp_high` crossing 65 °C is a leading indicator for
`surface_finish` defects on the *next* QA-INSP run of those parts. A
targeted coolant check at the first 65 °C event would have caught this
2–3 hours earlier.

Root-cause taxonomy: [root-cause-coolant-degradation](../wiki/topics/root-cause-coolant-degradation.md).
