---
title: Root cause — chip evacuation failure
slug: root-cause-chip-evacuation
status: stable
confidence: high
tags:
  - root-cause
  - cnc
mission_relevance: 0.95
sources:
  - kind: conversation
    turn: '2026-05-15T08:00:00Z'
    note: seeded by seed-factory-line-sim.ts
created: '2026-05-15T11:19:41.335Z'
last_updated: '2026-05-15T11:19:41.335Z'
supersedes: []
aliases: []
classification: private
provenance:
  sourceSessions: []
  sourceEntries: []
  createdBy: user
  createdAt: '2026-05-15T08:00:00Z'
  updatedAt: '2026-05-15T11:19:41.335Z'
---
# Root cause — chip evacuation failure

The auger conveyor behind CNC-5AX moves chips from the cutting zone to a
60 L bin. If the bin overflows or the conveyor jams, chips re-circulate
into the cutting zone, causing chatter and tool damage. The downstream
symptoms — chipped tool edges, dimensional chatter — show up at QA-INSP
on the next day's parts.

## Originates at
[CNC-5AX](./machine-cnc-5ax.md).

## Quality symptom
- `dimensional` defects with chatter signature (oscillating measurements
  across consecutive items).
- `edge` defects (chipped flange edges) when the tool itself was
  damaged.

## Status symptom
- Status report shows a `state: error` block with reason
  `chip_evacuation_jam`. Typical clear time 15–30 min.
- A subsequent `tool_change` is often logged at end of day.

## MQTT events
- `bin_full` (fill_pct = 100)
- `conveyor_jam_detected` (jam_location: chip_bin)

## Where to look
1. The day's status JSON for a `chip_evacuation_jam` entry.
2. Quality report for the *next* day's QA-INSP — defects lag by 1 day.
3. Was a tool changed at EOD with note "chip damage"? Strong signal.

## Backlinks

_none yet_
