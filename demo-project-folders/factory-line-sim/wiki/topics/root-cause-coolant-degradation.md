---
title: Root cause — coolant degradation
slug: root-cause-coolant-degradation
status: stable
confidence: high
tags:
  - root-cause
  - cnc
  - coolant
mission_relevance: 1
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:40.299Z'
last_updated: '2026-05-15T11:34:59.899Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:40.299Z'
---
# Root cause — coolant degradation

The synthetic coolant emulsion in CNC-5AX's sump degrades over time:
bacteria grow, pH drifts, lubricity drops. A run that exceeds 65 °C
coolant temperature for an extended window will produce parts with
visibly poor surface finish and occasional staining.

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- `surface_finish` defects (Ra > 1.6 µm) — the dominant signal.
- `surface_staining` — secondary, often cosmetic.
- Effect is **time-correlated**: once coolant is bad, *every* part in the
  affected window is affected.

## Status symptom
- Status report shows `state: degraded` with reason
  `coolant_quality_degraded`. Machine doesn't stop — that's why this is
  insidious.

## MQTT events
- `coolant_temp_high` (temp > 65 °C, threshold from the
  [coolant-spec-sheet](../sources/coolant-spec-sheet.md))

## Where to look
1. The day's status JSON for any `degraded` block.
2. Quality reports for that day's PO at QA-INSP, filtered to
   `surface_finish` and `surface_staining` defect types.
3. Recent `coolant_temp_high` events on the MQTT topic
   `cnc-5ax/telemetry`.

## Backlinks

- [Coolant additive monitoring](../topics/test-coolant-additive-monitoring.md)
