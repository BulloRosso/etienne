---
title: Root cause — vision calibration drift
slug: root-cause-vision-calibration
status: stable
confidence: high
tags:
  - root-cause
  - inspection
mission_relevance: 0.85
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:44.341Z'
last_updated: '2026-05-15T11:19:44.341Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:44.341Z'
---
# Root cause — vision system calibration drift

After ~1000 inspection cycles, QA-INSP's camera focus or lighting can
drift. Symptoms are *false rejects* (parts marked bad that are actually
good) or — much worse — *false passes* (defective parts marked good).

## Originates at
[QA-INSP](./machine-qa-insp.md).

## Telltale
- Reject rate spikes on QA-INSP *without a corresponding upstream signal*
  (no MQTT alarms, no CNC degradation, status of CNC-5AX is clean).
- Pattern affects defect *type* uniformly (e.g. all rejects are
  `dimensional` with similar jitter, not a coherent failure mode).

## MQTT events
- `camera_focus_drift` (blur_score above threshold)
- `light_recalibration_needed`

## Backlinks

_none yet_
