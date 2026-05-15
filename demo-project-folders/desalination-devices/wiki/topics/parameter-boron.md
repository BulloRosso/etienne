---
title: 'Parameter: boron'
slug: parameter-boron
status: stable
confidence: high
tags:
  - stub
  - parameter
  - compliance
  - membrane
mission_relevance: 0.95
sources:
  - kind: conversation
    turn: '2026-05-14T22:22:17.846Z'
    note: auto-created from reverse-osmosis
  - kind: conversation
    turn: '2026-05-14T09:00:00Z'
    note: seeded by seed-desalination.ts
created: '2026-05-14T22:22:17.846Z'
last_updated: '2026-05-14T22:22:57.312Z'
supersedes: []
aliases:
  - Parameter Boron
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-14T09:00:00Z'
  updatedAt: '2026-05-14T22:22:42.848Z'
---
# Parameter: boron

Seawater contains ~4-5 mg/L of boron, almost entirely as boric acid. At the
membrane operating pH (8.0) the acid is uncharged, so a single-pass seawater
[RO](../topics/reverse-osmosis.md) clears only 85-92 % of it.

**Limits**
- WHO GDWQ: 2.4 mg/L (provisional).
- EU DWD 2020/2184: **1.5 mg/L** (binding).
- WHO desalinated-water guidance: extra caution because permeate is the
  *only* water source.

**Why this is the load-bearing rule**
- A standard SW30-2540 with 5 ppm B feed and 8 % recovery produces ~0.4-0.6
  mg/L B in permeate — safely under both limits at low recovery.
- At 30-40 % recovery (which we need for energy economy) permeate B climbs
  to 0.8-1.2 mg/L — still WHO-compliant, marginal under EU.
- For an EU-regulated deployment (or anywhere using EU values), we plan a
  partial second pass with pH raised to ~10 to ionise the boric acid
  before the membrane.

**Always test boron against WHO AND EU separately** — this is the parameter
where the two regimes most often disagree on a given design.

## Backlinks

- [EU Drinking Water Directive 2020/2184](../topics/eu-2020-2184.md)
- [Post-treatment](../topics/post-treatment.md)
- [RO membrane (spiral-wound)](../topics/ro-membrane-spiral-wound.md)
- [Reverse osmosis (RO)](../topics/reverse-osmosis.md)
- [Source: EU DWD 2020/2184 Annex I (parametric values)](../sources/eu-dwd-annex-i.md)
- [Source: WHO GDWQ §6 (Drinking-water quality in specific circumstances)](../sources/who-gdwq-section-6.md)
- [WHO GDWQ — overview](../topics/who-gdwq-overview.md)
