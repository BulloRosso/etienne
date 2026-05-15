---
title: Source — tool life policy
slug: tool-life-policy
status: stable
confidence: high
tags:
  - stub
  - source
  - tooling
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-15T11:19:36.135Z'
    note: auto-created from machine-cnc-5ax
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:36.135Z'
last_updated: '2026-05-15T11:19:58.441Z'
supersedes: []
aliases:
  - Tool Life Policy
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:58.441Z'
---
# Source — tool life policy

Per-tool-type cycle limits before mandatory replacement:

| Tool family | Cycles | Override threshold |
|---|---|---|
| End mill (3-flute carbide) | 1000 | 850 (Al), 700 (Steel) |
| Boring bar (precision) | 600 | 500 |
| Face mill | 1500 | 1300 |

A `tool_change_overdue` MQTT event fires at 100 % of the family limit;
operators are expected to swap by 90 % when running a tight-tolerance
(IT7) order.

## Backlinks

- [Machine: CNC-5AX (5-axis mill)](../topics/machine-cnc-5ax.md)
- [Root cause — tool wear](../topics/root-cause-tool-wear.md)
