---
title: 'Machine: DEBURR-HAND (manual deburring)'
slug: machine-deburr-hand
status: stable
confidence: high
tags:
  - machine
  - deburr
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:37.277Z'
last_updated: '2026-05-15T11:19:37.277Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:37.277Z'
---
# DEBURR-HAND — manual deburring station

Cell B. One operator (typically two on rotating shifts).

## Role
Removes burrs and sharp edges left by 5-axis milling. Uses rotary tools
and hand files. Throughput depends on operator skill and how aggressive
the prior CNC pass was.

## What goes wrong here
- Operator handling can introduce new edge defects (over-deburred edges,
  scratches near mating faces). These show up at QA-INSP as `edge`
  defects when the upstream CNC report is otherwise clean.
- Long idle stretches when CNC output is slow → a downstream symptom,
  not a root cause.

## Data signature
- Status report often shows long `idle / no_input_parts` blocks on days
  when CNC is degraded — useful corroboration when investigating CNC.

## Backlinks

_none yet_
