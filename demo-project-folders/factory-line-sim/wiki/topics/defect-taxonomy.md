---
title: Defect taxonomy
slug: defect-taxonomy
status: stable
confidence: high
tags:
  - quality
  - taxonomy
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:52.377Z'
last_updated: '2026-05-15T11:19:52.377Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:52.377Z'
---
# Defect taxonomy

Used in the `defect_type` column of every quality report.

| Type | Means | Most likely root cause |
|---|---|---|
| `pass` | within all specs | — |
| `dimensional` | a measurement is outside spec band | tool wear, fixture drift, chip-jam chatter, thermal drift |
| `surface_finish` | Ra above spec | coolant degradation, tool wear |
| `surface_staining` | discoloration / deposit | coolant degradation |
| `edge` | sharp edge or burr or chipped flange | deburring miss, chip-jam tool damage |
| `foreign_material` | swarf or chip embedded | chip-evacuation failure |
| `other` | catch-all | inspector free-text in `notes` |

## Backlinks

_none yet_
