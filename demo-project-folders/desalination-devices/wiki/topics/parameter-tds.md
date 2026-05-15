---
title: 'Parameter: TDS (total dissolved solids)'
slug: parameter-tds
status: stable
confidence: high
tags:
  - stub
  - parameter
  - compliance
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:23.632Z'
    note: auto-created from post-treatment
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:23.632Z'
last_updated: '2026-05-14T22:22:38.975Z'
supersedes: []
aliases:
  - Parameter Tds
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:38.975Z'
---
# Parameter: TDS

Bulk measure of dissolved minerals, salts, and small organics. Reported in
mg/L; for our brackish/seawater feed it's the headline number.

**WHO GDWQ taste tiers** ([who-gdwq-overview](../topics/who-gdwq-overview.md))
- <300: excellent.
- 300-600: good (our target after [post-treatment](../topics/post-treatment.md)).
- 600-900: fair.
- 900-1200: poor.
- >1200: unacceptable.

**Feed-side TDS** drives technology choice:
- <1 500 mg/L → consider [ED/EDR](../topics/electrodialysis.md) first.
- 1 500-10 000 mg/L → brackish-water RO, single pass.
- 10 000-45 000 mg/L → seawater RO, single pass with [ERD](../topics/energy-recovery-device.md).
- >45 000 mg/L → two-pass or alternative technology.

## Backlinks

- [Post-treatment](../topics/post-treatment.md)
- [WHO GDWQ — overview](../topics/who-gdwq-overview.md)
