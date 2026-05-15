---
title: Root cause — tool wear
slug: root-cause-tool-wear
status: stable
confidence: high
tags:
  - root-cause
  - cnc
  - tooling
mission_relevance: 0.95
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:39.312Z'
last_updated: '2026-05-15T11:19:39.312Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:39.312Z'
---
# Root cause — tool wear

A milling tool dulls progressively over its life. Past ~80 % of rated
cycles, surface finish degrades and dimensions drift toward the upper
spec limit (the dull tool deflects rather than cuts).

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- `surface_finish` defects with Ra creeping above 1.6 µm.
- `dimensional` drift, often biased to one side of the spec band.

## Status symptom
- Spindle load creeping up over the run.
- Cycle time slowly increasing (operator may compensate by feed-rate cut).

## MQTT events that precede or accompany
- `spindle_load_warn` (load_pct > 90)
- `tool_change_overdue` (cycles_used >= life threshold)

## Where to look
1. [tool-life-policy](../sources/tool-life-policy.md) — current cycle limits.
2. Status report's `tool_changes` counter — was a scheduled change skipped?

## Backlinks

_none yet_
