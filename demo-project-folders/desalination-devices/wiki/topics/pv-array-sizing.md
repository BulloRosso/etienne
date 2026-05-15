---
title: PV array sizing
slug: pv-array-sizing
status: stable
confidence: medium
tags:
  - energy
  - design
mission_relevance: 0.85
sources:
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:29.415Z'
last_updated: '2026-05-14T22:22:29.415Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:29.415Z'
---
# PV array sizing

Rule of thumb for the Pacific/Caribbean: assume 4.5 peak sun-hours/day, 80 %
inverter+battery round-trip efficiency.

Required PV kWp = daily kWh / (4.5 × 0.8)

**Example — 5 m³/day RO with ERD**
- Energy at the pump shaft: ~3.5 kWh/m³ × 5 = 17.5 kWh/day.
- Including [pre-treatment](../topics/pre-treatment.md) and [post-treatment](../topics/post-treatment.md)
  loads (UV, calcite contactor pump, chlorine doser): ~22 kWh/day total.
- PV: 22 / 3.6 ≈ 6.1 kWp. We size to 7 kWp to cover cloudy spells and
  membrane-cleaning cycles.

Pair with [battery-storage](../topics/battery-storage.md) for evening top-up
and emergency runs. See [tco-model](../topics/tco-model.md) for capex/opex.

## Backlinks

_none yet_
