[← back to README](../README.md)

# Dreaming: Reviewing Yesterday's Sessions, Researching What's Missing, Proposing What to Remember

## What dreaming is

**Dreaming is an offline operation whose purpose is to optimise an agent.** It runs outside the user-facing chat loop — typically on a nightly cron — and uses the quiet hours to do work that would be too slow, too expensive, or too risky to do mid-conversation.

What kind of optimisation is performed depends entirely on the use case. Two recurring ideas are useful as anchors:

- **Reorganise, update or enrich the agent's knowledge base.** In Etienne, that knowledge base is the wiki structure of markdown files that the `auto-wiki` skill maintains when activated. A dream pass can deduplicate entries, mark stale ones, link new facts to existing topics, or summarise long-lived threads into a tighter index.
- **Focus on learning.** "What strategies worked well in recent sessions? Which ones haven't been tried yet? Where did the agent get stuck twice in the same way?" These insights are extracted into an overarching strategy store the agent consults next time, separate from the factual wiki.

Whichever flavour you pick, three constraints are non-negotiable:

1. **Cap the LLM budget.** Worst case, an unconstrained dreaming agent decides to crawl the open web, fan out subagents, and burn through a month of inference budget in one night. A hard cap (calls or money) and a soft pre-flight check are mandatory, not optional.
2. **Give clear, concise instructions about the expected optimisation.** Vague "improve the agent" prompts produce hallucinated improvements. The more narrowly scoped the dream task — "consolidate near-duplicate strategy cards in this domain", "extract WHEN/DO/BECAUSE patterns from sessions tagged `migration`" — the more reliable the output. The shorter the instruction, the better, *provided* it is precise.
3. **Keep a human in the loop.** Agents cannot be trusted to grade their own work. Every dream must surface its changes — proposed wiki edits, new strategy cards, items it wants to deepen — to a person who reviews and approves before the changes affect the agent's future behaviour. Even a fast "thumbs-up / thumbs-down / deepen" pass is enough; silent self-improvement is not.

The rest of this article describes how Etienne implements dreaming with those three constraints baked in.

## What it changes — the impact of dreaming

A well-run dream loop is invisible most of the time. What you notice instead is what *stops happening*. Concretely:

- **The agent learns over the long term without bothering the user.** Improvement happens in the quiet hours. No "please rate this answer" prompts mid-task, no interrupting flow to ask "did this work?". The signal comes from existing session traces and from feedback the user already wanted to give the next morning.
- **Unsuccessful strategies get retired, not just buried.** When a strategy keeps producing follow-up errors or the user repeatedly thumbs-it-down, it transitions to `deprecated` and stops surfacing in autonomous skill selection. The card stays on disk for audit, but the agent stops betting on it.
- **Contradictions become visible instead of silently flipping.** When new evidence directly opposes an existing strategy, dreaming marks the result `contested` and shows both sides to the human. The agent is not allowed to "decide" which is right — a person does, and the verdict feeds the next pass.
- **Tacit knowledge that lived only in chat history gets written down.** The "we always do X for this project" patterns that previously evaporated when the session closed become inspectable markdown — readable, editable, deletable, version-controllable. A new teammate joining the project sees what the agent has learnt about it.
- **Cross-session compounding without cross-project leakage.** Strategies live per-project. Lessons learnt from your PostgreSQL migration do not leak into someone else's React refactor. Each project develops its own dialect of what works there.
- **Cost is predictable.** Because dreaming runs against a configured budget (calls or money) with a soft pre-flight check, the user-facing chat budget is not at risk from offline learning. Worst case the dream skips a night; the chat path is untouched.
- **The agent's memory is auditable.** Every strategy card includes provenance: which sessions supported it, which web sources verified it, what its confidence score was on the day it was promoted. When a recommendation looks wrong, you can trace it back to the trajectory it came from.

The net effect is an agent whose strategic judgment about a specific project compounds quietly over weeks, while still being something a person can read, override, or delete with one click.

## Why an agent needs this at all

Imagine you're a senior engineer reviewing a junior's pull requests. You don't just merge what works — you remember the patterns. Three weeks later when the junior asks "should I add a unique constraint here?", you don't re-derive the answer. You recall it. Strategies accumulate. Mistakes leave fingerprints. Your judgment compounds.

LLM coding agents have no such mechanism by default. Every session starts fresh. The same trap is fallen into seven times in seven projects. The same insight is rediscovered, used once, and forgotten by the time the conversation closes.

**Dreaming** is Etienne's attempt to fix that — not by claiming "real memory," but by building a small, opinionated nightly process that turns recent sessions into a curated strategy library the agent can autonomously consult tomorrow.

## What dreaming actually does

Every night (or whenever you set the cron), Etienne does this for each enabled project:

1. **Reads** the `.etienne/chat.history-*.jsonl` session files modified since the last run.
2. **Cuts** them into trajectory windows (12 turns each, sliding step 6) and tags coarse outcome signals (tool errors, retries).
3. **Asks an LLM** to extract `WHEN/DO/BECAUSE` candidate strategies from each trajectory. Empty trajectories produce no candidates — invention is forbidden.
4. **Clusters** near-duplicate candidates inside the run via embedding cosine ≥ 0.85.
5. **Web-grounds** each cluster: the LLM nominates 3–8 plausible authoritative sources from training knowledge and classifies each as supports/contradicts/neutral.
6. **Consolidates** with existing strategy cards: if cosine > 0.88 to an existing skill, run a MERGE pass. Direct contradictions get marked `contested`.
7. **Promotes** through three gates: G1 confidence + support, G2 web evidence or cross-trajectory support, G3 composite score ≥ 0.78. G1/G2 rejects buffer for the next run.
8. **Indexes** survivors as Anthropic-format SKILL.md cards under `.claude/skills/strategies/<domain>/<id>/`. The card's frontmatter `description` is what the inference agent retrieves on autonomously — Voyager's "skill indexed by description" pattern, but as a first-class Anthropic concept.

The pipeline's terminal artifact is `dreaming/dream-<YYYY-MM-DD>.dreams.json` — the top N items by composite score, surfaced for your review the next morning.

## Why bother with the human in the loop

Offline self-improvement loops have a well-known failure mode: the agent decides its own training signal, drifts in unhelpful directions, and you only notice three weeks later when the suggestions feel weirdly off. Dreaming explicitly resists this with a feedback artifact and a quick action above the chat input.

When you open a project with an undismissed dream file, a cloud-moon icon appears above the chat input. Click it and the preview pane opens a questionnaire. Each item gets three buttons:

- **Thumbs-up** (`good`): keep — strategy looks useful → status `active`
- **Thumbs-down** (`bad`): reject — discard → status `deprecated`
- **Shovel** (`deepen`): investigate further next run → status `investigating`

Your verdicts get written to `.agent/wiki/dreaming-feedback/<date>.md`, which the *next* HARVEST reads as additional context. The agent doesn't act on your feedback immediately — it just remembers it for tomorrow's REFLECT pass. Slow, but legible.

## The wiki structure

Dreaming is the second of two markdown memory stores in an Etienne project. They share a layout but mean different things.

```mermaid
flowchart LR
    SESS(chat history jsonl)
    WIKI(wiki factual memory)
    AWIKI(agent wiki strategy notes)
    CARDS(skills strategies SKILL md)
    DREAMS(dreams json review artifact)
    FEEDBACK(dreaming feedback verdicts)

    SESS -->|HARVEST| AWIKI
    WIKI -.->|background facts| AWIKI
    AWIKI -->|INDEX| CARDS
    AWIKI -->|run summary| DREAMS
    DREAMS -->|thumbs up down deepen| FEEDBACK
    FEEDBACK -->|next REFLECT| AWIKI

    style SESS fill:#e3f2fd,stroke:#1565c0
    style WIKI fill:#e3f2fd,stroke:#1565c0
    style AWIKI fill:#fff3e0,stroke:#e65100
    style CARDS fill:#fff3e0,stroke:#e65100
    style DREAMS fill:#fce4ec,stroke:#ad1457
    style FEEDBACK fill:#fce4ec,stroke:#ad1457
```

`wiki/` answers "what is true about this project." `.agent/wiki/` answers "what does the agent know about how to *work* on this project." Different lifecycles, different invariants, different skills maintain them.

## Dreaming is a research topic, not a defined process

There is no canonical "dreaming algorithm." The [PRD that sparked this implementation](../requirements-docs/prd-dreaming.md) explicitly frames it as a research question with multiple valid answers depending on what you want the agent to optimise for. Several approaches are actively circulating:

- **Anthropic's *memory store* objects** — the best-known reference point. The Claude platform exposes first-class memory-store objects that an agent can read from and write to across sessions, with retention, scoping and retrieval handled by the cloud runtime. The trade-off is straightforward: it works well, but it is **only available in the cloud**. You cannot run it on a laptop, in an air-gapped environment, or against an alternative provider. For organisations whose data residency or sovereignty rules forbid that path, it is a non-starter.
- **Voyager-style skill libraries indexed by description** — strategies as markdown cards, retrieved by their natural-language description rather than by ID. This is the pattern Etienne adopts (see further down).
- **Self-RAG / Reflexion-style approaches** — keep a running buffer of (situation, action, outcome) tuples, periodically re-summarise into a smaller prompt.
- **CoALA / Generative-Agents-style architectures** — separate working / episodic / semantic memory stores with explicit consolidation passes.
- **Sleep-time compute** — schedule heavy reasoning during idle periods, materialise the conclusions for the next online turn.

Each of these is "dreaming" in the broad sense — offline optimisation of an agent's future behaviour — and each makes different trade-offs around cloud vs. local, structured vs. unstructured, automated vs. reviewed.

The PRD that sparked this implementation includes an aspirational "Architektur-Blueprint v2" describing a much heavier system: Claude Agent SDK runtime, dedicated SQLite-MQ DAG engine, a `chokidar` filesystem watcher syncing wiki chunks to ChromaDB in real time, a bespoke MCP server for `mcp__wiki__search`, and a real WebSearch integration. None of those are intrinsically wrong — they reflect a particular research direction.

Etienne's implementation deliberately picks a different point on the design space:

| Question | v2 blueprint | Etienne's dreaming |
|---|---|---|
| Pipeline runtime | Standalone Claude Agent SDK | Existing `LlmService` (any provider) |
| Job queue | Bespoke DAG engine | Per-project SQLite + worker tick loop |
| ChromaDB | New subprocess managed by dreaming | Reuse existing instance on :7100 |
| Wiki indexing | `chokidar` watcher, real-time | INDEX-stage upserts after each run |
| Wiki MCP | New `mcp__wiki__search` server | Reuse the existing `wiki` skill's scripts |
| Web grounding | Real WebSearch | LLM nominates plausible sources from training |
| Strategy cards | Anthropic SKILL.md (Voyager pattern) | Anthropic SKILL.md (Voyager pattern) |

The shared anchor — Voyager-style strategy cards as the inference-time retrieval signal — is the part that matters most. Everything around it can shift toward the heavier or lighter end of the spectrum depending on what fails first in your deployment.

If you find that:
- Your projects accumulate hundreds of strategy cards and the SDK's autonomous selection slows down → wire `StrategyPrefilterService` into the inference path and use the ChromaDB collection.
- The "LLM-nominates-sources" trick produces too many hallucinated URLs → plug a real WebSearch tool into the GROUND stage.
- A single backend instance can't keep up with the dream queue → shard the worker by hostname.

The pipeline is intentionally easy to grow into.

## What we adopted from the blueprint, in the end

- **Voyager skill-by-description pattern**: strategies are SKILL.md cards under `.claude/skills/strategies/<domain>/<id>/`, retrieved by their frontmatter `description`. Promoted-by-dreaming cards are first-class skills the inference agent already knows how to load.
- **8-stage HARVEST → SEGMENT → REFLECT → DISTILL → GROUND → CONSOLIDATE → PROMOTE → INDEX pipeline**: each stage as a distinct job type in SQLite-MQ.
- **Three-gate threshold filter**: G1 light, G2 evidence, G3 composite ≥ 0.78. G1/G2 rejects buffer for next run.
- **Karpathy-wiki dual-store layout**: factual `wiki/` separate from strategic `.agent/wiki/`, both pure markdown.
- **Provenance, confidence, support count, contested-status**: all captured in the SKILL.md card body, not the frontmatter (which stays small for retrieval-time efficiency).

## What we cut, on purpose

- No standalone Claude Agent SDK runtime — `LlmService` already routes to anthropic/openai/deepseek with cost tracking.
- No standalone Chroma subprocess — the existing `ProcessManagerService` already manages one on port 7100.
- No real-time `chokidar` wiki sync — INDEX-stage upserts after each dream run are good enough.
- No `mcp__wiki__search` MCP server — the existing `wiki` skill already has search/add scripts.
- No real WebSearch tool integration in v1 — LLM-nominated sources are a known weak signal, gated by PROMOTE's G2 fallback to cross-trajectory support.
- No structured-output mode (`generateObject`) — `generateText` + Zod parsing with retries works across providers, including DeepSeek's Anthropic-compat endpoint.

These are recorded in [ADR-012](../adrs/012-dreaming-offline-strategy-memory.md) as deliberate deviations.

## Configuring dreaming

Open Settings → Dreaming. The modal lets you set:

- Daily start time (cron expression; default `0 22 * * *`)
- IANA time zone
- Maximum items per dream (default 10)
- Either a maximum daily budget OR a maximum LLM-call count per run

A soft pre-flight check reads `.etienne/costs.json`, sums today's project spend, and refuses to enqueue if you're already over budget. Mid-run hard enforcement is out of scope for v1.

The "Run now" button enqueues a HARVEST immediately — useful for testing or when you want to compress a long session you just finished into strategy without waiting for tomorrow.

## What this looks like in practice

You finish a long PostgreSQL migration debugging session at 7 PM. Dreaming fires at 22:00. By the time you open the project the next morning, a cloud-moon icon sits above the chat input. You click it. The preview pane shows three items: a strategy about parallel COPY ordering for OLTP migrations, a lesson about `pg_restore -j` not working the way you'd expect, and a "deepen" candidate about WAL archiving during bulk loads that the LLM thinks might generalize but isn't sure about.

You thumbs-up the first two, deepen the third, submit. The cloud-moon icon disappears. Tomorrow, when you ask the agent about a different migration in a different project, the strategy SKILL.md card is sitting there waiting. The agent's frontmatter description retrieval picks it up autonomously, loads it into context, and the conversation skips two of the three rounds you'd otherwise have spent re-deriving the same plan.

That's the loop. It is not magic; it is markdown plus discipline. The discipline lives mostly in the human-in-the-loop verdicts. The markdown is what lets you read everything the agent decided to remember and edit it directly when it's wrong.
