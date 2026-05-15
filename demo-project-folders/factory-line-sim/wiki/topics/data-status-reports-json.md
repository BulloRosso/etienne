---
title: Data — machine status reports (json)
slug: data-status-reports-json
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
created: '2026-05-15T11:19:47.345Z'
last_updated: '2026-05-15T11:19:47.345Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:47.345Z'
---
# Machine status reports — json schema

One file per machine per day under `status/`:

```
status/status_<MACHINE_ID>_<YYYY-MM-DD>.json
```

The same day can be uploaded multiple times — each upload **merges into
the existing file**: timeline entries are union-ed and re-sorted, and
`oee_metrics` are recomputed.

```json
{
  "machine_id": "CNC-5AX",
  "date": "2026-05-13",
  "shift_pattern": "1-shift",
  "timeline": [
    { "start": "08:00", "end": "10:30", "state": "running", "reason": null }
  ],
  "total_runtime_min": 410,
  "total_downtime_min": 60,
  "downtime_breakdown": { "operator_break": 15, "lunch_break": 45 },
  "oee_metrics": { "availability_pct": 87.2, "performance_pct": 96.0, "quality_pct": 98.5 },
  "chip_bin_emptied_count": 1,
  "coolant_changed": false,
  "tool_changes": 1,
  "last_updated": "2026-05-13T17:30:00Z"
}
```

States: `running`, `idle`, `maintenance`, `error`, `degraded`,
`offline`. The `degraded` state is the one easy to miss — the machine
keeps running but produces lower-quality output.

## Backlinks

_none yet_
