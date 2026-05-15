---
title: Electrodialysis (ED / EDR)
slug: electrodialysis
status: draft
confidence: medium
tags:
  - technology
  - brackish
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:20.728Z'
last_updated: '2026-05-14T22:22:55.411Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:20.728Z'
---
# Electrodialysis (ED / EDR)

Ion-exchange membranes driven by a DC field. EDR (reversal) periodically
flips polarity to slough fouling layers.

**Sweet spot**: brackish water (1 000-10 000 mg/L TDS), which matches some
Pacific atoll lens-aquifers that are too salty to drink but cheaper to
treat than seawater. Specific energy 1.0-1.5 kWh/m³ at brackish TDS — half
the [RO](../topics/reverse-osmosis.md) figure for the same water — but the
unit is more capital-intensive at 5 m³/day scale.

Decision rule: pick ED only when feed TDS is below 10 000 mg/L AND we don't
need to remove neutral organics (ED doesn't).

## Backlinks

- [Parameter: TDS (total dissolved solids)](../topics/parameter-tds.md)
- [Source: WHO GDWQ §6 (Drinking-water quality in specific circumstances)](../sources/who-gdwq-section-6.md)
