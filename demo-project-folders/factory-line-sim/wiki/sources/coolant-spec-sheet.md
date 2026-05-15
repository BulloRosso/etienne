---
title: Source — Coolant spec sheet (synthetic emulsion)
slug: coolant-spec-sheet
status: stable
confidence: high
tags:
  - stub
  - source
  - coolant
mission_relevance: 0.8
sources:
  - kind: conversation
    turn: '2026-05-15T11:19:36.135Z'
    note: auto-created from machine-cnc-5ax
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:36.135Z'
last_updated: '2026-05-15T11:19:56.406Z'
supersedes: []
aliases:
  - Coolant Spec Sheet
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:56.406Z'
---
# Source — coolant spec sheet

Vendor: Castrol Hysol XF. Concentration 5 % in water.

- Operating temperature: **40–60 °C**
- Action threshold: **65 °C** — at this point, surface-finish quality
  begins to degrade measurably and bacterial growth accelerates.
- Service life: **120 operating hours** between sump drain + refill.
- pH spec: 8.5–9.2.

These thresholds drive the `coolant_temp_high` MQTT event.

## Backlinks

- [Machine: CNC-5AX (5-axis mill)](../topics/machine-cnc-5ax.md)
- [Root cause — coolant degradation](../topics/root-cause-coolant-degradation.md)
