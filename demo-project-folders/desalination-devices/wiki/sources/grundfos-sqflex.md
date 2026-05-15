---
title: 'Source: Grundfos SQFlex solar-direct pump'
slug: grundfos-sqflex
status: stable
confidence: medium
tags:
  - stub
  - 'source:manufacturer'
  - component
mission_relevance: 0.75
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:26.518Z'
    note: auto-created from high-pressure-pump
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:26.518Z'
last_updated: '2026-05-14T22:22:53.455Z'
supersedes: []
aliases:
  - Grundfos Sqflex
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:53.455Z'
---
# Grundfos SQFlex 5A-7

Public manufacturer data, paraphrased.

- Helical-rotor pump tuned for PV-direct (no inverter needed).
- Flow @ 8 m head: ~5 m³/h.
- Power: 30-1400 W (depends on solar irradiance).
- Built-in MPP tracker; runs off bare PV between 30-300 V DC.
- IP68 submersible; tropical-salt-air tolerant in surface-pump config.

In the [pilot](../topics/pacific-island-pilots.md) we'd use this NOT as the
high-pressure RO pump, but as the **feed booster** between the intake and
pre-treatment, leaving the [high-pressure-pump](../topics/high-pressure-pump.md)
for downstream.

## Backlinks

- [High-pressure pump](../topics/high-pressure-pump.md)
