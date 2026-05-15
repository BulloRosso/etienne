---
title: Battery storage
slug: battery-storage
status: draft
confidence: medium
tags:
  - stub
  - energy
  - design
mission_relevance: 0.75
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:29.415Z'
    note: auto-created from pv-array-sizing
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:29.415Z'
last_updated: '2026-05-14T22:22:43.828Z'
supersedes: []
aliases:
  - Battery Storage
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:31.332Z'
---
# Battery storage

We size for ~6 hours of autonomy at half the daytime production rate — enough
to finish a [pre-treatment](../topics/pre-treatment.md) backwash after sunset
and to ride out a cloudy 24-hour window.

**Chemistry**: LFP (LiFePO₄) is the default for tropical island operation:
- Tolerates 45 °C ambient.
- 6 000-cycle life at 80 % DoD.
- ~€450/kWh installed (2026), 10-year warranty common.

**Lead-acid alternative**: AGM 3 000 cycles, half the price; sensible if
maintenance staff are unfamiliar with Li-ion and disposal is hard.

For the 5 m³/day pilot: 7 kWh usable is enough. We size to 10 kWh.

## Backlinks

- [Maintenance schedule](../topics/maintenance-schedule.md)
- [PV array sizing](../topics/pv-array-sizing.md)
- [Pacific island pilots](../topics/pacific-island-pilots.md)
