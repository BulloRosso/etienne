---
title: MQTT event catalogue
slug: mqtt-event-catalog
status: stable
confidence: high
tags:
  - mqtt
  - events
mission_relevance: 0.9
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:49.332Z'
last_updated: '2026-05-15T11:19:49.332Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:49.332Z'
---
# MQTT event catalogue

The 8 event types the line emits, in rough order of operational urgency:

| Event | Topic | Trigger | Payload essentials |
|---|---|---|---|
| `coolant_temp_high` | `cnc-5ax/telemetry` | sump T > 65 °C | `temp`, `threshold` |
| `spindle_load_warn` | `cnc-5ax/telemetry` | load_pct > 90 | `load_pct`, `tool_id` |
| `tool_change_overdue` | `cnc-5ax/maintenance` | cycles_used ≥ life | `tool_id`, `cycles_used`, `life` |
| `bin_full` | `cnc-5ax/chip-evacuation` | fill_pct = 100 | `fill_pct` |
| `conveyor_jam_detected` | `cnc-5ax/chip-evacuation` | torque spike | `jam_location` |
| `fixture_clamp_pressure_low` | `cnc-5ax/telemetry` | pressure < 5 bar | `axis`, `pressure_bar`, `min` |
| `camera_focus_drift` | `qa-insp/telemetry` | blur_score > 5 | `blur_score`, `threshold` |
| `ambient_temp_deviation` | `line/environment` | Δ > 2 °C/hr | `temp_delta_from_baseline` |

All payloads carry: `type`, `machine`, `ts` (ISO timestamp), and the
event-specific fields above.

## Backlinks

_none yet_
