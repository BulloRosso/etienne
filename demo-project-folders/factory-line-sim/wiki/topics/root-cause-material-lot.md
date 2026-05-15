---
title: Root cause — material lot variation
slug: root-cause-material-lot
status: stable
confidence: medium
tags:
  - root-cause
  - material
mission_relevance: 0.6
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:45.330Z'
last_updated: '2026-05-15T11:19:45.330Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:45.330Z'
---
# Root cause — material lot variation

Different batches of Al-7075 or Steel-304 can have measurably different
hardness within spec. A harder lot stresses tools more, accelerates wear,
and can shift surface finish. See
[material-cert-al-7075-lot-B](../sources/material-cert-al-7075-lot-b.md)
for an example of a "bad lot" we've seen.

## Telltale
- Spindle load surge on the *first part* of a new lot.
- Tool wear accelerates across the run.

## MQTT events
- `material_hardness_change` (spindle load on first cut deviates from
  baseline by > 10 %)

## Backlinks

_none yet_
