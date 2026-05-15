---
title: Maintenance schedule
slug: maintenance-schedule
status: stable
confidence: medium
tags:
  - stub
  - operations
mission_relevance: 0.8
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:22.653Z'
    note: auto-created from pre-treatment
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:22.653Z'
last_updated: '2026-05-14T22:22:37.060Z'
supersedes: []
aliases:
  - Maintenance Schedule
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:37.060Z'
---
# Maintenance schedule

The discipline that turns a 5 m³/day pilot from a press release into a 10-year
asset.

| Cadence | Task | Why |
|---|---|---|
| Daily | Read inlet pressure, permeate conductivity, recovery | Catch fouling fast |
| Weekly | Cartridge filter inspection, antiscalant tank top-up | Cheap, high-leverage |
| Monthly | SDI test on raw feed; chlorine dose verification at network | Compliance evidence |
| 6-monthly | CIP (alkaline then acid) of [RO membrane](../topics/ro-membrane-spiral-wound.md) | Restores flux without replacement |
| Annually | Replace cartridge filters, recalibrate sensors, refill calcite | |
| 5-yearly | Replace [RO membrane](../topics/ro-membrane-spiral-wound.md) elements | Beyond this, salt rejection drops |
| 8-10 yearly | Replace [battery-storage](../topics/battery-storage.md), high-pressure-pump rebuild | |

Skipping the 6-monthly CIP is the single most common reason small RO units
fail at year 2-3 in tropical service.

## Backlinks

- [Pre-treatment](../topics/pre-treatment.md)
