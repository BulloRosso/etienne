---
title: OEE basics
slug: oee-basics
status: stable
confidence: high
tags:
  - reference
  - oee
mission_relevance: 0.4
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:51.366Z'
last_updated: '2026-05-15T11:19:51.366Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:51.366Z'
---
# OEE basics

Overall Equipment Effectiveness = Availability × Performance × Quality.

- **Availability** = (planned production time − downtime) / planned production time
- **Performance** = ideal cycle time × total count / runtime
- **Quality** = good count / total count

We log the three components in every machine status report's
`oee_metrics`. World-class OEE is ~85 %; our line runs ~75–85 % on
clean days.

## Backlinks

_none yet_
