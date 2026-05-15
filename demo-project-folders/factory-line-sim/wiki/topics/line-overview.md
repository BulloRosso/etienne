---
title: Line overview
slug: line-overview
status: stable
confidence: high
tags:
  - line
  - overview
mission_relevance: 1
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:35.144Z'
last_updated: '2026-05-15T11:19:35.144Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:35.144Z'
---
# Line overview

Three machines in series, one production order on the line at a time:

```
  raw stock ─▶ [CNC-5AX] ─▶ [DEBURR-HAND] ─▶ [QA-INSP] ─▶ shipped
                Cell A         Cell B          Cell C
```

- [CNC-5AX](./machine-cnc-5ax.md) — 5-axis mill, the throughput bottleneck.
- [DEBURR-HAND](./machine-deburr-hand.md) — manual; operator-paced.
- [QA-INSP](./machine-qa-insp.md) — automated 3D vision; emits pass/fail.

A part can spend a few hours to two days on the line depending on size and
complexity. CNC dominates the cycle time; DEBURR is the variability source;
QA is fast but the bottleneck for *judgement* (it's where defects are first
seen).

Read alongside [defect-taxonomy](./defect-taxonomy.md) and the
[mqtt-event-catalog](./mqtt-event-catalog.md).

## Backlinks

_none yet_
