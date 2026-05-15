---
title: TCO model — 10-year horizon
slug: tco-model
status: stable
confidence: medium
tags:
  - stub
  - economics
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:29.415Z'
    note: auto-created from pv-array-sizing
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:29.415Z'
last_updated: '2026-05-14T22:22:47.670Z'
supersedes: []
aliases:
  - Tco Model
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:47.670Z'
---
# TCO model — 10-year horizon

A back-of-envelope for the 5 m³/day pilot, both scenarios.

**Capex** (one-off, EUR, 2026 reference)
| Item | Pacific atoll | Caribbean island |
|---|---:|---:|
| RO skid + ERD | 18 000 | 18 000 |
| Pre/post-treatment + dosing | 6 000 | 7 000 |
| 7 kWp PV + mounts | 7 500 | 7 500 |
| 10 kWh LFP battery | 4 500 | 4 500 |
| Diesel genset (5 kVA, backup) | 2 500 | 3 000 |
| Hardened enclosure | 3 500 | 5 000 |
| Install + logistics | 8 000 | 6 000 |
| **Total capex** | **50 000** | **51 000** |

**Opex** (annual, EUR)
- Membranes (1/5th of stack/year) ≈ 250
- Cartridges, antiscalant, chlorine ≈ 800
- Electricity (genset fuel only) ≈ 300
- Maintenance labour (1 day/month at local rate) ≈ 1 500
- **Annual opex ≈ 2 850**

**Major replacements**
- Year 5: full membrane set (~1 200).
- Year 8: battery replacement (~4 500).

**10-year TCO**: ~50 000 + 10 × 2 850 + 1 200 + 4 500 ≈ **84 200 EUR**.

**Per m³ produced** (5 m³/day × 365 × 0.85 availability = ~1 550 m³/year over 10 years):
**~5.4 EUR/m³** — well below the 10-20 EUR/m³ trucked-in / bottled baseline
for these regions.

## Backlinks

- [PV array sizing](../topics/pv-array-sizing.md)
