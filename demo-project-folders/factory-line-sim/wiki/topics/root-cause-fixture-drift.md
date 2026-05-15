---
title: Root cause — fixture clamping drift
slug: root-cause-fixture-drift
status: stable
confidence: medium
tags:
  - root-cause
  - cnc
  - fixture
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:42.324Z'
last_updated: '2026-05-15T11:19:42.324Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:42.324Z'
---
# Root cause — fixture clamping drift

The hydraulic clamp on CNC-5AX can lose pressure slowly over a run. The
part shifts a few hundredths of a millimetre during cutting, producing
*positional* dimensional defects that are usually one-sided (always too
short, always too narrow on one axis).

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- `dimensional` defects on a single axis, biased always one direction.
- Often only the *first few parts* of a run, then operator notices and
  re-clamps.

## MQTT events
- `fixture_clamp_pressure_low` (pressure_bar below min)

## Backlinks

_none yet_
