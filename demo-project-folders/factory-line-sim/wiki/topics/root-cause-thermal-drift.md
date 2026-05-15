---
title: Root cause — thermal drift
slug: root-cause-thermal-drift
status: stable
confidence: medium
tags:
  - root-cause
  - cnc
  - inspection
mission_relevance: 0.5
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:43.347Z'
last_updated: '2026-05-15T11:19:43.347Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:43.347Z'
---
# Root cause — thermal drift

Both CNC-5AX and QA-INSP are sensitive to ambient temperature. A 2 °C
shift over a few hours can produce dimensional drift of ~10 µm on
precision parts, which can push tight-tolerance parts (IT7) just over.

This is rare and usually only visible when no other root cause fits.

## MQTT events
- `ambient_temp_deviation` (temp_delta_from_baseline > 2 °C)

## Backlinks

_none yet_
