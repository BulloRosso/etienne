---
title: 'Parameter: coliforms / E. coli'
slug: parameter-coliform
status: stable
confidence: high
tags:
  - stub
  - parameter
  - compliance
  - microbiology
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:33.222Z'
    note: auto-created from who-gdwq-overview
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:33.222Z'
last_updated: '2026-05-14T22:22:40.892Z'
supersedes: []
aliases:
  - Parameter Coliform
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:40.892Z'
---
# Parameter: coliforms / *E. coli*

The microbiological backbone of every modern drinking-water regulation.

- **Required value (WHO + EU)**: 0 *E. coli* per 100 mL, 0 coliforms per 100
  mL in treated water leaving the works.
- **Method**: EN ISO 9308-1 (membrane filtration) or 9308-2 (MPN). Field-
  portable kits exist; we send confirmation samples to an accredited lab
  monthly.

**Failure mode we worry about**: post-treatment recontamination via the
calcite contactor or storage tank. Mitigation:
- Free chlorine residual 0.2-0.5 mg/L at the network entry.
- UV at the unit boundary (256 nm, ≥40 mJ/cm²) as belt-and-braces.

See [post-treatment](../topics/post-treatment.md) for the dosing layout.

## Backlinks

- [WHO GDWQ — overview](../topics/who-gdwq-overview.md)
