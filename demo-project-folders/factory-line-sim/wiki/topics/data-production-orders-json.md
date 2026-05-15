---
title: Data — production orders (json)
slug: data-production-orders-json
status: stable
confidence: high
tags:
  - data
  - schema
mission_relevance: 0.8
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:48.334Z'
last_updated: '2026-05-15T11:19:48.334Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:48.334Z'
---
# Production orders — json schema

One file per order under `production-orders/`:

```json
{
  "order_id": "PO-1003",
  "part_number": "TURB-AL75-65X22",
  "customer": "Acme Aerospace",
  "priority": "high",
  "qty_ordered": 80,
  "qty_completed": 80,
  "qty_scrapped": 9,
  "due_date": "2026-05-14",
  "created_date": "2026-05-07",
  "material": "Al-7075",
  "tolerance_grade": "IT7",
  "status": "Completed",
  "routing": [
    { "sequence": 1, "machine": "CNC-5AX", "est_cycle_min": 12 },
    { "sequence": 2, "machine": "DEBURR-HAND", "est_cycle_min": 5 },
    { "sequence": 3, "machine": "QA-INSP", "est_cycle_min": 2 }
  ]
}
```

`status` ∈ {`Queued`, `Running`, `Completed`}. The `est_cycle_min`
field on each routing step is the **per-part** estimate; multiply by
`qty_ordered` for total expected machine time.

## Backlinks

_none yet_
