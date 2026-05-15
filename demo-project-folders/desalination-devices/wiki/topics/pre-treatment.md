---
title: Pre-treatment
slug: pre-treatment
status: stable
confidence: high
tags:
  - stub
  - process
  - fouling
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:17.846Z'
    note: auto-created from reverse-osmosis
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:17.846Z'
last_updated: '2026-05-14T22:22:51.520Z'
supersedes: []
aliases:
  - Pre Treatment
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:22.653Z'
---
# Pre-treatment

Everything between the seawater intake and the high-pressure pump. Pre-
treatment is the single biggest determinant of [RO membrane](../topics/ro-membrane-spiral-wound.md)
life: a clean feed at SDI<3 lets a [FILMTEC SW30](../sources/dow-filmtec-sw30.md)
last its rated 5 years; a dirty feed at SDI>5 kills it in 18 months.

**Standard stack for our pilot**
1. Coarse strainer (200 µm) at the intake — pebbles, fish, seaweed.
2. Multimedia filter (anthracite/sand/garnet) — removes turbidity.
3. Cartridge filter (5 µm absolute) — final polish.
4. Antiscalant dosing — citric or phosphonate, 2-4 ppm.
5. Sodium-bisulfite dosing if any chlorine residual is present (membranes hate it).

See [maintenance-schedule](../topics/maintenance-schedule.md) for the cleaning cadence.

## Backlinks

- [Battery storage](../topics/battery-storage.md)
- [PV array sizing](../topics/pv-array-sizing.md)
- [RO membrane (spiral-wound)](../topics/ro-membrane-spiral-wound.md)
- [Reverse osmosis (RO)](../topics/reverse-osmosis.md)
- [Source: Spectra Cape Horn watermaker (Extreme series)](../sources/spectra-cape-horn.md)
