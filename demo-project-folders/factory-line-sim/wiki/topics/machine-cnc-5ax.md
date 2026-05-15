---
title: 'Machine: CNC-5AX (5-axis mill)'
slug: machine-cnc-5ax
status: stable
confidence: high
tags:
  - machine
  - cnc
mission_relevance: 1
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:36.135Z'
last_updated: '2026-05-15T11:19:36.135Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:36.135Z'
---
# CNC-5AX — 5-axis mill

DMG MORI NHX-5500 class. Cell A. The first machine in the line.

## Role
Roughs and finishes the part from raw bar stock. Performs operations
`MILL-5AX` (multi-axis milling) and `BORE-PREC` (precision boring).

## Consumables and ancillary systems
- **Coolant** — 5 % synthetic emulsion, ~60 L sump. Spec sheet:
  [coolant-spec-sheet](../sources/coolant-spec-sheet.md). Degrades after
  ~120 operating hours; coolant temperature should stay below 60 °C.
- **Chip evacuation** — auger conveyor drops chips into a 60 L bin behind
  the machine. Bin must be emptied manually; the
  [chip-evacuation root cause](./root-cause-chip-evacuation.md) page
  describes what happens when this is missed.
- **Tools** — magazine of 24, plus a wear-tracking policy described in
  [tool-life-policy](../sources/tool-life-policy.md).

## What goes wrong here
Most of the line's quality issues originate at this machine. Top hitters:
[tool wear](./root-cause-tool-wear.md),
[coolant degradation](./root-cause-coolant-degradation.md),
[chip evacuation](./root-cause-chip-evacuation.md),
[fixture drift](./root-cause-fixture-drift.md),
[thermal drift](./root-cause-thermal-drift.md),
[material lot variation](./root-cause-material-lot.md).

## Data signature
- Status report shows `state: degraded` (coolant) or `state: error`
  (jam/alarm) on bad days; otherwise `state: running` with routine
  break/lunch idle blocks.
- Quality reports for the *next-day* QA-INSP run are the lagging
  indicator — defects from a CNC issue typically surface 4–24 h later.

## Backlinks

_none yet_
