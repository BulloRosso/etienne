---
title: Energy recovery device (ERD)
slug: energy-recovery-device
status: stable
confidence: high
tags:
  - stub
  - component
  - energy
mission_relevance: 0.85
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:17.846Z'
    note: auto-created from reverse-osmosis
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:17.846Z'
last_updated: '2026-05-14T22:22:51.520Z'
supersedes: []
aliases:
  - Energy Recovery Device
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:28.450Z'
---
# Energy recovery device

Recovers ~96 % of the pressure energy in the brine reject stream by
transferring it directly to incoming feed. Cuts [high-pressure-pump](../topics/high-pressure-pump.md)
energy by ~50 % at our scale.

**Types**
- *Pressure exchanger* (rotary, Energy Recovery Inc. PX): mature, expensive
  below 5 m³/h. Eligible for our larger pilot variant.
- *Clark pump* (Spectra): hydraulic intensifier; tuned for 0.5-2 m³/h
  watermaker market. Default for the 4-person village scenario.

Without an ERD the pilot's PV array needs to roughly double.

## Backlinks

- [High-pressure pump](../topics/high-pressure-pump.md)
- [Parameter: TDS (total dissolved solids)](../topics/parameter-tds.md)
- [Reverse osmosis (RO)](../topics/reverse-osmosis.md)
- [Source: Spectra Cape Horn watermaker (Extreme series)](../sources/spectra-cape-horn.md)
