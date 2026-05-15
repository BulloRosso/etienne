---
title: 'Machine: QA-INSP (3D vision inspection)'
slug: machine-qa-insp
status: stable
confidence: high
tags:
  - machine
  - inspection
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:38.305Z'
last_updated: '2026-05-15T11:19:38.305Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:38.305Z'
---
# QA-INSP — automated 3D vision inspection

Cell C. Where every defect is *first observed*.

## Role
3D vision system measures critical dimensions and surface finish; emits
one row per item to the quality report (`pass` or a defect type). Does
not stop the line — even rejected parts continue to ship to scrap.

## What goes wrong here
Most QA-INSP "issues" are upstream symptoms surfacing here. The one
*originating* root cause is
[vision system calibration drift](./root-cause-vision-calibration.md):
after ~1000 cycles the camera focus or lighting drifts and you start
getting false rejects (or worse, false passes).

Calibration is logged manually; if the QA report shows a
`camera_focus_drift` MQTT event around the same time as a reject spike,
*the spike may be QA's fault, not CNC's*. Always check.

## Backlinks

_none yet_
