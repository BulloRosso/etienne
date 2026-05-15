---
name: dreaming
description: Offline reflection on the project's recent chat sessions. Use when the user asks "what did I learn last week?", "summarize my recent sessions", "what strategies emerged?", or wants to see/manage the strategy memory under .agent/wiki/. Provides background on the dreaming pipeline (HARVEST/SEGMENT/REFLECT/DISTILL/GROUND/CONSOLIDATE/PROMOTE/INDEX) that runs nightly to maintain strategy SKILL.md cards under .claude/skills/strategies/<domain>/<id>/, and a feedback artifact at dreaming/dream-<date>.dreams.json. Reads .agent/wiki/ for prior strategies, never invents one without trajectory support, and asks the user before acting on a contested strategy.
allowed-tools: Read Grep Glob
license: MIT
metadata:
  version: "1.0.0"
  author: etienne
---

# Dreaming — offline strategy memory for the agent

The dreaming pipeline is the agent's offline self-improvement loop. It runs nightly (configurable) over the project's `.etienne/chat.history-*.jsonl` session files and produces two outputs:

1. **Strategy SKILL.md cards** under `.claude/skills/strategies/<domain>/<id>/SKILL.md`. Each card is a Voyager-style "skill indexed by description": its YAML frontmatter `description` is what the inference agent uses to autonomously select the strategy when relevant. The body holds Provenance / WHEN / DO / BECAUSE / EVIDENCE / WEB SOURCES.
2. **A human-feedback artifact** at `dreaming/dream-<YYYY-MM-DD>.dreams.json` listing the top N items by composite score, with `dismissedByUser: false`. The user reviews each item with thumbs-up / thumbs-down / "deepen" verdicts. Verdicts are appended to `.agent/wiki/dreaming-feedback/<date>.md` and consumed by the next HARVEST.

## When to invoke this skill

Read this skill when the user asks about the dreaming process itself, or wants to inspect/curate the strategy store. Do not invoke dreaming-stage logic from chat — that is backend code that runs on a cron trigger. Your role here is to:

- Explain the pipeline if asked.
- Read `dreaming/dream-*.dreams.json` and summarize the latest items if requested.
- Read `.claude/skills/strategies/<domain>/<id>/SKILL.md` to surface a specific strategy.
- Read `.agent/wiki/dreaming-feedback/*.md` to remind the user what they previously rejected or asked to investigate.

## Pipeline overview (read-only — do not run)

```
HARVEST → SEGMENT → REFLECT → DISTILL → GROUND → CONSOLIDATE → PROMOTE → INDEX
```

- **HARVEST** finds session JSONL files newer than `last_run_ts` and groups by domain (heuristic: `contextName` on the first user turn).
- **SEGMENT** windows each session into trajectories (12 turns, step 6) and tags coarse outcome signals (tool errors, retries).
- **REFLECT** asks an LLM to extract WHEN/DO/BECAUSE candidate strategies per trajectory. Output is Zod-validated; up to two retries on schema failure.
- **DISTILL** clusters near-duplicate candidates within the run via embedding cosine ≥ 0.85.
- **GROUND** asks the LLM to classify 3–8 plausible authoritative web sources as supports/contradicts/neutral.
- **CONSOLIDATE** searches the existing strategy collection (cosine > 0.88) and runs a MERGE LLM pass when an overlap is found. Direct contradictions are marked `status: contested`.
- **PROMOTE** filters by three gates (G1 confidence/support → G2 web evidence or cross-trajectory support → G3 composite score ≥ 0.78). G1/G2 rejects buffer for the next run.
- **INDEX** writes SKILL.md atomically, embeds the description into ChromaDB collection `strategy_descriptions_<project>_<dim>`, and appends to the per-domain `log.md`.

## Storage layout

```
<project>/
├── .claude/skills/strategies/<domain>/<id>/SKILL.md   ← strategy cards (Voyager pattern)
├── .claude/skills/strategies/<domain>/log.md          ← append-only promotion log
├── .agent/wiki/                                       ← strategy memory (mission/index/...)
├── .agent/wiki/dreaming-feedback/<date>.md            ← user verdicts for next REFLECT
├── .etienne/dreaming.settings.json                    ← user-facing config
├── .etienne/dreaming/queue.db                         ← SQLite-MQ for the pipeline
├── .etienne/chat.history-<sessionId>.jsonl            ← raw session (HARVEST input)
└── dreaming/dream-<date>.dreams.json                  ← feedback artifact
```

## Configuration surfaces

User configures via Settings → Dreaming tile in the Etienne frontend:

- Daily start time (cron expression; default `0 22 * * *`)
- Maximum LLM calls per run **or** maximum daily budget
- Maximum items to surface per dream artifact (default 10)

A soft pre-flight budget check reads `.etienne/costs.json` and refuses to enqueue if today's spend already exceeds the configured maximum. Mid-run hard enforcement is out of scope for v1.

## Reading the dream artifact

A `dreams.json` file looks like:

```json
{
  "runId": "run-2026-05-09-abcd1234",
  "generatedAt": "2026-05-09T22:01:13.512Z",
  "items": [
    {
      "id": "pg-migration-large-oltp",
      "domain": "postgres",
      "title": "Schema-First + Parallel COPY for Large OLTP Migrations",
      "body": "<full SKILL.md body>",
      "evidence": ["sess_2026-05-02 turns 14-26", "..."],
      "compositeScore": 0.83,
      "status": "active",
      "dismissedByUser": false
    }
  ]
}
```

When the user reviews, each item gets one of: `good` (sets status `active`), `bad` (sets status `deprecated`), `deepen` (sets status `investigating`). The frontend submits the verdicts atomically; once all items are dismissed, the cloud-moon quick action above the chat input disappears.

## Anti-patterns

- **Do not** invent a strategy that has no support in any session trajectory. The pipeline enforces this in REFLECT, but a chat-side suggestion bypasses the gate.
- **Do not** rewrite an existing strategy SKILL.md without going through CONSOLIDATE. Manual edits are permitted, but the next dream run may merge them in unexpected ways.
- **Do not** treat `wiki/` (factual memory, maintained by the `wiki` skill) and `.agent/wiki/` (strategy memory, maintained by dreaming) as the same store. They have different lifecycles and different invariants.
