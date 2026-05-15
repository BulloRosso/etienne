---
title: Reverse osmosis (RO)
slug: reverse-osmosis
status: stable
confidence: high
tags:
  - technology
  - membrane
mission_relevance: 1
sources:
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:17.846Z'
last_updated: '2026-05-14T22:22:49.586Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:17.846Z'
---
# Reverse osmosis

Membrane-based desalination. A high-pressure pump forces seawater across a
semi-permeable membrane; salt and most contaminants stay on the reject side
("brine"), permeate passes through as product water.

**Why we lean RO for the pilot**
- Lowest specific energy of mature small-scale options: 3-5 kWh/m³ at 5 m³/day
  with an [energy recovery device](../topics/energy-recovery-device.md).
- Commercial-off-the-shelf modules ([FILMTEC SW30](../sources/dow-filmtec-sw30.md),
  [Spectra Cape Horn](../sources/spectra-cape-horn.md)) tuned for the 700-1500 GPD
  range we need.
- Hurricane-resilient and well-suited to PV+battery operation.

**Pitfalls**
- Boron rejection is the weak spot: a single seawater pass typically clears
  85-92 % of boron — see [parameter-boron](../topics/parameter-boron.md).
- Membrane fouling demands [pre-treatment](../topics/pre-treatment.md);
  skipping it shortens membrane life from 5 years to 12-18 months.

**Rule we keep coming back to**: always validate the proposed RO design against
both [WHO GDWQ](../topics/who-gdwq-overview.md) AND [EU DWD 2020/2184](../topics/eu-2020-2184.md)
separately — they diverge on boron and turbidity.

## Backlinks

- [EU Drinking Water Directive 2020/2184](../topics/eu-2020-2184.md)
- [Electrodialysis (ED / EDR)](../topics/electrodialysis.md)
- [Multi-effect distillation (MED)](../topics/multi-effect-distillation.md)
- [Parameter: boron](../topics/parameter-boron.md)
- [Solar still](../topics/solar-still.md)
- [Source: DOW FILMTEC SW30-2540 data sheet](../sources/dow-filmtec-sw30.md)
