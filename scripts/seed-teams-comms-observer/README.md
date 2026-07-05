# seed-teams-comms-observer

Seeds the **`teams-comms-observer`** example project: a **silent observer**
for Microsoft Teams channels that diagnoses the **Hyperactive Hive Mind**
(Cal Newport) — coordination through a constant, unstructured message stream
instead of explicit workflow agreements.

What the seeded project contains:

- **Sample transcripts** — 5 workdays of channel history for
  `hive-alpha--general` and `hive-alpha--dev` (dates relative to the seed
  day), deliberately exhibiting the pattern taxonomy: a ping-storm morning, a
  26 h unanswered blocker, an after-hours exchange, an undocumented decision,
  a jargon mismatch, and an @mention cascade. **No Teams tenant required.**
- **Knowledge graph** — patterns as first-class citizens: `Person`,
  `Channel`, `PatternOccurrence`, `Decision`, `AgreementNorm`,
  `MetricSnapshot` (+ `exhibits` / `occursIn` / `wouldPrevent` / …).
- **hive-analytics project skill** — deterministic metrics
  (reply-latency distributions, after-hours share, burst index, unanswered
  blockers, cascade depth) computed from `data/teams/*/messages.jsonl`.
  The seed runs it once so all numbers are real.
- **Three hyperscreen dashboards** (auto-open on first project load):
  Hive Pulse (health/trends), Pattern Radar (heatmap + incident timeline +
  evidence links), Agreement Scoreboard (norms, compliance, prevention
  potential). They read `reports/data/*.json` and live-refresh when the
  agent rewrites those files.
- **Wiki** — pattern taxonomy, team-agreement playbook, research basis
  (Newport; MIT Sloan 2022 meeting-free days), methodology, privacy
  guardrails, respectful per-person profiles.
- **Reports** — `out/hive-mind-report.md` (standing analysis) and
  `out/team-agreement-draft.md` (the living deliverable).
- **Nightly cron** (02:00 UTC) — metrics → classification → KG → profiles →
  reports → dashboard data.

## Run

```bash
# from the repo root; services on :5950 / :6060 / :7000 / :7100 must be up
npx tsx scripts/seed-teams-comms-observer/seed-teams-comms-observer.ts
```

Environment (same defaults as the other seeds): `WORKSPACE_ROOT`,
`OAUTH_BASE`, `BACKEND_BASE`, `SEED_USERNAME`, `SEED_PASSWORD`,
`SEED_ACCESS_TOKEN`. Optional: `SEED_RUN_ANALYSIS=1` fires one unattended
analysis run at the end (adds a few minutes).

## Re-running

Project-level idempotent: delete `workspace/teams-comms-observer/` (and the
matching Chroma + Quadstore entries) before re-running.

## Connecting a real Teams tenant

The seed writes `.etienne/teams-observer.json` with `enabled: false` and
placeholder team/channel ids. To observe real channels:

1. Add the delegated Graph scopes `Team.ReadBasic.All Channel.ReadBasic.All
   ChannelMessage.Read.All` to the Entra app registration
   (`ChannelMessage.Read.All` needs tenant-admin consent) and (re-)connect
   MS365 for the project with an account that is a **member of the observed
   teams**.
2. Pick channels in the UI (Connectivity → MS Teams tab) or via
   `PUT /api/msteams-observer/teams-comms-observer/channels`.
3. Optional @mention answering in channels: install the bot into the team —
   see `ms-teams/appPackage/README.md`.

Full architecture and the internal/external post-impact matrix:
`ms-teams-integration.md` at the repo root.
