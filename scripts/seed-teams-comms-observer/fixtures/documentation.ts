/**
 * documentation.md — the auto-opened landing document of the project.
 */

import { shiftWorkdays } from './transcripts';

export function documentationMd(base: Date): string {
  const day = (offset: number) => shiftWorkdays(base, offset).toISOString().slice(0, 10);

  return `# Teams Communication Observer — demo guide

This project observes the Microsoft Teams channels of the fictional team
**Hive Alpha** and diagnoses the **Hyperactive Hive Mind** (Cal Newport):
coordination through a constant, unstructured message stream instead of an
explicit workflow — collective activity without collective intelligence.

The seed ships **five days of sample channel transcripts**
(${day(-5)} … ${day(-1)}) with deliberately planted patterns, so everything
works without a live Teams tenant.

## Start here

1. **Hyperscreen** (opens automatically; lotus button re-opens it):
   - **Hive Pulse** — health score, KPI trends, per-person signals.
   - **Pattern Radar** — weekday×hour heatmap + incident timeline with
     evidence links.
   - **Agreement Scoreboard** — the remedy: proposed norms, compliance,
     prevention potential.
2. **Ask the agent** (chat):
   - "Where is our hive mind worst?"
   - "Draft the team agreement for the Friday retro."
   - "How does Priya prefer to communicate?" (respectful profiles in
     \`wiki/topics/person-*.md\`)
3. **Reports**: \`out/hive-mind-report.md\` (standing analysis),
   \`out/team-agreement-draft.md\` (the living deliverable).

## What is planted in the sample data

| Pattern | Where | Cost |
|---|---|---|
| Ping-storm (7 msgs / 4 min) | #general, ${day(-4)} 09:02 | 2 immediate context switches |
| Unanswered blocker (26 h) | #dev, ${day(-3)} 10:05 | ≈ one lost working day |
| After-hours exchange 22:10–22:36 | #general, ${day(-3)} | evening response pressure |
| Undocumented decision (auth v2) | #dev, ${day(-2)} 14:38 | load-bearing decision without artifact |
| Jargon mismatch ("AC") | #dev, ${day(-2)} 15:05 | repeated clarification round |
| @mention cascade (3 people) | #dev, ${day(-1)} 09:10 | 3 context switches before 09:30 |

Each is recorded in the **knowledge graph** as a \`PatternOccurrence\` with
\`evidencedBy\`/\`wouldPrevent\` relationships — explore it in the KG view.

## How the analysis works

- The backend **teams-channel-sync** mirrors channels into
  \`data/teams/<channel>/\` (\`messages.jsonl\` + daily \`.md\`). In this demo
  the transcripts are pre-seeded and the sync is **disabled**
  (\`.etienne/teams-observer.json\` → \`"enabled": false\`).
- The **hive-analytics** skill computes deterministic metrics
  (\`npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts\`) into
  \`reports/data/hive-metrics.json\` — the dashboards read these files and
  refresh automatically when the agent rewrites them.
- A **nightly cron** (02:00 UTC) runs the full loop: metrics → pattern
  classification → KG → profiles → reports → dashboard data.

## Connecting a real Teams tenant

1. Connect MS365 for this project (Entra app needs the delegated scopes
   \`Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All\` —
   the last one requires admin consent). The connected account must be a
   member of the observed teams.
2. Pick channels: \`PUT /api/msteams-observer/teams-comms-observer/channels\`
   (or the Connectivity → MS Teams tab) and set \`"enabled": true\`.
3. Optional — let the team address the observer: install the bot into the
   team (see \`ms-teams/appPackage/README.md\`) and @mention it. Details:
   \`ms-teams-integration.md\` at the repo root.

## The observer's contract

**Silent observer**: it never posts to Teams proactively; the only externally
visible output is the in-thread answer when someone @-mentions it. Findings
are phrased pattern-not-character and must pass the read-aloud test —
see \`wiki/topics/privacy-and-ethics-guardrails.md\`.
`;
}
