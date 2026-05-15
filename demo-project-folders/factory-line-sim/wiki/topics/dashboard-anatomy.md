---
title: Dashboard anatomy
slug: dashboard-anatomy
status: stable
confidence: high
tags:
  - dashboard
mission_relevance: 0.7
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:50.356Z'
last_updated: '2026-05-15T11:19:50.356Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:50.356Z'
---
# Dashboard anatomy

Two HTML pages live under `linedashboard/`. Both use Material UI and
the LiveHTMLPreview `workspace:write` bridge to persist selections.

## `cnc-dashboard.html`
Cross-cutting view of all production orders + defect categories +
machines. KPIs at the top, drilldown chart in the middle (Region →
Plant → Machine, or Category → Operation), filterable jobs table at the
bottom. Open it from the file tree in the IDE.

## `line-timeline.html`
Per-day timeline view (defaults to today; pick a date from the picker).
Three rows per machine:
1. **Production order assignment** (which PO ran when)
2. **Machine state** (running/idle/error/degraded/maintenance)
3. **Quality findings** (markers showing when QA-INSP rejected items
   that originated at this machine)

Plus the **latest 10 MQTT events** in a side panel.

Both dashboards read JSON from sibling files — the seed script writes
`categories.json`, `jobs.json`, `machines.json`, `keywords.json`
and one `machines_line_<date>.linedashboard.json` per day.

## Backlinks

_none yet_
