---
title: Post-treatment
slug: post-treatment
status: stable
confidence: high
tags:
  - process
  - compliance
mission_relevance: 0.95
sources:
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:23.632Z'
last_updated: '2026-05-14T22:22:40.892Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:23.632Z'
---
# Post-treatment

RO permeate is essentially distilled — TDS often below 100 mg/L. That's
*below* the desirable taste range (300-600 mg/L per WHO panels) AND
unstable: aggressive, low-buffered, picks up metals from distribution pipes.

**Standard stack after the membrane**
1. **Remineralisation** — calcite contactor adds 40-60 mg/L of Ca²⁺ and
   ~80 mg/L of HCO₃⁻. Targets [parameter-tds](../topics/parameter-tds.md)
   around 300 mg/L.
2. **pH adjustment** — to 7.5-8.0 (calcite output is typically pH 8 already).
3. **Disinfection** — free chlorine 0.2-0.5 mg/L at the network entry, or
   UV at the unit boundary if the distribution loop is short.
4. **Boron polishing** — only if a [boron](../topics/parameter-boron.md) lab
   test flags the first-pass permeate above 1.5 mg/L (WHO) / 1.0 mg/L (EU).

If we skip post-treatment we fail [WHO GDWQ](../topics/who-gdwq-overview.md)
on taste/corrosion grounds and [EU DWD 2020/2184](../topics/eu-2020-2184.md)
on free chlorine residual.

## Backlinks

- [PV array sizing](../topics/pv-array-sizing.md)
- [Parameter: TDS (total dissolved solids)](../topics/parameter-tds.md)
- [Parameter: coliforms / E. coli](../topics/parameter-coliform.md)
