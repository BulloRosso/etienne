---
title: High-pressure pump
slug: high-pressure-pump
status: stable
confidence: high
tags:
  - component
  - mechanical
mission_relevance: 0.85
sources:
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:26.518Z'
last_updated: '2026-05-14T22:22:53.455Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:26.518Z'
---
# High-pressure pump

Lifts feed water to the 55-70 bar needed across a seawater RO membrane.
Positive-displacement plunger pumps dominate at our scale; centrifugals
take over above ~10 m³/h.

**Candidates**
- [Grundfos SQFlex](../sources/grundfos-sqflex.md) — solar-direct, no
  battery required for daytime operation, 1.5-7 m³/h depending on head.
- Cat Pump 5CP — workhorse, needs a separate VFD + battery bank.
- Danfoss APP — high-efficiency axial-piston, pairs well with [erd](../topics/energy-recovery-device.md).

Energy budget at 800 psi and 5 m³/day: ~30 kWh/day (≈6 kWh/m³) before
[ERD](../topics/energy-recovery-device.md); ~15-20 kWh/day with one.

## Backlinks

- [Energy recovery device (ERD)](../topics/energy-recovery-device.md)
- [Source: Grundfos SQFlex solar-direct pump](../sources/grundfos-sqflex.md)
