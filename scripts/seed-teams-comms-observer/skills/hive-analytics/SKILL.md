---
name: hive-analytics
description: Deterministic communication metrics for the mirrored Teams channels. Computes reply-latency distributions, after-hours share, burst/fragmentation index, unanswered blockers, and interruption-cascade depth from data/teams/*/messages.jsonl, and refreshes the hyperscreen dashboard data. Use before making ANY quantitative claim about team communication.
---

# Hive Analytics

You are the Hive Communication Observer. Use this skill whenever an analysis
needs **numbers** — never estimate a metric that this script can compute.

## Run

```bash
npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts
```

(from the project root). The script:

1. reads every `data/teams/<channel>/messages.jsonl` (latest line per id
   wins; deleted messages excluded),
2. computes per-day, per-channel, and per-person metrics,
3. writes the full result to `data/metrics/<today>.json`,
4. refreshes `reports/data/hive-metrics.json` — the **Hive Pulse**
   hyperscreen dashboard reads this file and live-updates.

## Metrics (definitions in wiki/topics/metrics-reference.md)

| Metric | Meaning | Hive-mind signal when… |
|---|---|---|
| `messages` | non-deleted messages | volume spikes in focus hours |
| `medianReplyLatencyMin` | median minutes to first reply by another person | *very low* → instant-response pressure; blockers *high* → waiting cost |
| `afterHoursSharePct` | share of messages outside 08:00–18:00 UTC Mon–Fri | > 5 % |
| `burstIndexPct` | share of messages < 2 min after the sender's own previous message | > 25 % → fragmentation / ping-storms |
| `unansweredBlockers` | blocker questions without a reply within 4 h | > 0 |
| `cascadeDepth` | max distinct authors in an @mention chain ≤ 30 min | > 2 → interruption cascade |
| `healthScore` | 100 − weighted penalties vs targets | trend matters more than the level |

## After computing

- Interpret the numbers against the taxonomy
  (`wiki/topics/hive-mind-pattern-taxonomy.md`) and record new
  `PatternOccurrence` entities in the knowledge graph with evidence links.
- Update `out/hive-mind-report.md` and, where evidence changed,
  `out/team-agreement-draft.md`; regenerate
  `reports/data/pattern-occurrences.json` and
  `reports/data/agreement-norms.json` so the Pattern Radar and Agreement
  Scoreboard stay current.
- Append findings to `reports/comms-insights-log.md` and advance the
  `<!-- last-processed: ... -->` marker.

## Never

- Never hand-estimate a metric this script computes.
- Never write into `data/teams/` (sync-owned).
- Never phrase findings as judgments of people — patterns and costs only.
