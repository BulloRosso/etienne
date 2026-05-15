---
title: Data — quality reports (xlsx)
slug: data-quality-reports-xlsx
status: stable
confidence: high
tags:
  - data
  - schema
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:46.343Z'
last_updated: '2026-05-15T11:19:46.343Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:46.343Z'
---
# Quality reports — xlsx schema

Inspectors upload a workbook to `quality-reports/`. Filename convention:

```
<YYYY-MM-DD>_<MACHINE_ID>_<ORDER_ID>[-dayN].xlsx
```

Each row is one item passing through QA-INSP.

| Column | Type | Notes |
|---|---|---|
| `production_order_id` | string | e.g. `PO-1003` |
| `part_number` | string | per the production order |
| `machine_id` | string | always `QA-INSP` for now |
| `item_id` | string | unique within the order |
| `defect_type` | enum | `pass`, `dimensional`, `surface_finish`, `surface_staining`, `edge`, `foreign_material`, `other` |
| `defect_severity` | enum | `none`, `minor`, `major`, `critical` |
| `measurement_value` | number | the measured value (units depend on defect_type) |
| `specification_min`/`max` | number | spec band |
| `inspector_id` | string | e.g. `INS-Maria` |
| `timestamp` | ISO 8601 | when this item was inspected |
| `notes` | string | free-text observation |

Files can be uploaded once. There is no merge — a re-upload replaces.

## Backlinks

_none yet_
