# Adaptive Memory

**Triple-P agent memory for `claude-multitenant`** — Picker / Packer / Ponderer.
This document describes the architecture, storage layout, classification firewall,
APIs, and configuration. It is the long-form companion to the short overview in
the root [README.md](README.md).

The system implements the design from
[requirements-docs/prd-revised-dreaming.md](requirements-docs/prd-revised-dreaming.md).
Where this document and the PRD disagree, this document reflects what is
actually built; deliberate divergences are called out with **NOTE**.

---

## 1. Overview

Adaptive Memory gives the agent two coordinated loops:

- A **within-task loop** that, for every user prompt, assembles a context
  package from the project's stores, lets the model run a multi-step tool
  loop with classification-gated writebacks, and persists what happened.
- A **between-task (Ponderer) loop** that runs on cron, scores recent
  sessions, prunes stale state, induces cross-project personality
  principles, rewrites the dreaming skill from user feedback, and publishes
  a Review Queue of proposals the user can approve, reject, or down-rank.

The classification firewall (`public` / `private` / `secret`) is enforced
at five places. Personality is the only cross-project store; everything
else is per-project.

---

## 2. Memory components

| Component | Role | Scope |
|---|---|---|
| **Picker** | Pulls candidate context from every source the active skills declare. Whole pages, no splitting. | within-task |
| **Packer** | Trims overshoot to fit the token budget. Applies the firewall first. | within-task |
| **Ponderer** | 5-stage nightly reflection. | between-task |
| **TaskFraming** | Extracts intent + keywords + activeSkillIds from a prompt. Deterministic, with optional LLM refinement. | within-task |
| **WikiService** | Façade over the existing `wiki` skill at `skill-repository/standard/wiki/`. | per-project |
| **KGAdapter** | Wraps `KnowledgeGraphService` (Quadstore on :7000). | per-project |
| **RAGAdapter** | Wraps `RagService` (ChromaDB on :7100). | per-project |
| **SORAdapter** | Read-only wrapper over `McpRegistryService`. | per-project |
| **PreferencesAdapter** | Wraps `MemoriesService` (extracted facts with decay). | per-project |
| **SessionsStore** | Adaptive-Memory snapshot record per session: workspace git refs + per-turn `storeWrites`. | per-project |
| **SkillsStore** | Reads `.claude/skills/<name>/SKILL.md`; tracks `originalHash` cross-project so the Ponderer's diff baseline survives project switches. | mixed |
| **PersonalityStore** | Cross-project operating principles (`PersonalityEntry`). Picker **must not** depend on it. | cross-project |
| **ReviewQueueStore** | JSONL + tombstones for ReviewItems; cross-project cycle summary for the Settings UI. | mixed |

---

## 3. The two loops

### 3.1 Within-task loop (PRD §5)

```
POST /api/adaptive-memory/:project/task
  └─ AdaptiveMemoryAgent.runTask
       1. AdaptiveMemoryConfigService.isActive(project)       # activation gate
       2. TaskFraming.frame(prompt)                             # → intent, keywords, activeSkillIds
       3. Picker.assemble(framing, project)                     # → CandidateContext
            ├─ wikiAdapter.search + getPage  (whole pages)
            ├─ kgAdapter.subgraph(rootId, depth=1)
            ├─ ragAdapter.query (classificationFilter from ceiling)
            ├─ preferencesAdapter.matching
            └─ sorAdapter.listAvailable + read
       4. Packer.pack(candidate, prompt, {tokenBudget})         # → ContextPackage
            ├─ classification ceiling (FIREWALL POINT 2)
            ├─ source priority (skill-declared)
            ├─ recency within store
            └─ whole-page protection
       5. LlmService.runWithTools({ tools: writeback })
            └─ each tool: enforceWriteClassification()           # FIREWALL POINT 1
       6. SessionsStore.close(session)
       └─ events stream over SSE multiplex channel 'adaptive-memory'
```

### 3.2 Between-task loop / Ponderer (PRD §6)

```
POST /api/adaptive-memory/:project/run-now  (or cron)
  └─ Ponderer.run
       Stage 1  quality-scoring         per-session score on [0,1]
       Stage 2  maintenance             prune orphan KG entities, flag stale wiki pages
       Stage 3  personality-induction   delegates strategy-mining to DreamingService
                                          (with sessionFilesOverride);
                                          admits PersonalityCandidate through
                                          FIREWALL POINT 3 to PersonalityStore
       Stage 4  self-edit               rewrites skills/dreaming/SKILL.md from feedback
       Stage 5  publish-review          writes ReviewItems into ReviewQueueStore
```

The Ponderer cron is **gated on `AdaptiveMemoryConfigService.isActive(project)`**.
Inactive projects have no cron registered and `run-now` returns `409`.

---

## 4. Classification firewall

Three levels, totally ordered: `public < private < secret`.

| # | Point | Where enforced | What it blocks |
|---|---|---|---|
| 1 | Write-time | every writeback tool's `execute` calls `enforceWriteClassification` first | Missing / invalid classification → tool returns `{ok:false, error:'writeback_missing_or_invalid_classification'}`; no underlying write happens. |
| 2 | Pack-time | `Packer.pack()` calls `applyClassificationCeiling(candidate, strictestCeiling(activeSkills))` line 1 | Entries above the ceiling are dropped; count surfaced in `pkg.meta.droppedForClassification`. |
| 3 | Personality admission | `PersonalityStore.admitAndWrite()` calls `personalityAdmissionCheck()` | `secret` evidence → never admit. `private` evidence → admit only if `isAbstract`. |
| 4 | Personality access | **Enforced structurally**: `Picker`'s constructor parameter types do not include `PersonalityStore` (verified by reflect-metadata in tests). | Personality cannot reach the within-task context package. |
| 5 | RAG query-time | `RAGAdapter.query` filters by `classificationFilter` derived from the strictest active-skill ceiling | Higher-classification fragments never come back from the store. |

Strictest ceiling rules:

- The **strictest** ceiling across active skills is the lowest classification level (e.g. `public` wins over `private`).
- With **no** active skills, the ceiling defaults to `secret` (loosest) — without an opinion the firewall passes everything; the user prompt has no skill governing it.

---

## 5. Storage map

Everything that must outlive a project, or that the agent should remember
across project switches, lives in `workspace/.agent/`. Per-project state
lives under `workspace/<project>/.etienne/`. Wiki pages live in
`workspace/<project>/wiki/` (owned by the `wiki` skill).

| Component | Scope | Location | Owned by |
|---|---|---|---|
| **Activation file** | per-project | `workspace/<project>/.etienne/adaptive-memory.config.json` | `AdaptiveMemoryConfigService` |
| **Per-project review queue** | per-project | `workspace/<project>/.etienne/adaptive-memory/review-queue.jsonl` | `ReviewQueueStore` |
| **Per-project cycle index** | per-project | `workspace/<project>/.etienne/adaptive-memory/review-queue.index.json` | `ReviewQueueStore` |
| **Per-project session snapshots** | per-project | `workspace/<project>/.etienne/adaptive-memory/sessions/<sessionId>.snapshot.json` | `SessionsStore` |
| **Wiki pages** | per-project | `workspace/<project>/wiki/{topics,sources,queries}/<slug>.md` | `WikiService` ← `wiki` skill scripts |
| **Preferences** | per-project | existing `workspace/<project>/.etienne/long-term-memory/` | `MemoriesService` |
| **Session history** | per-project | existing `workspace/<project>/.etienne/chat.history-*.jsonl` | `SessionsService` |
| **KG entities + edges** | per-project | Quadstore on :7000 | `KnowledgeGraphService` |
| **RAG fragments** | per-project | ChromaDB on :7100 | `RagService` |
| **Personality entries** | cross-project | `workspace/.agent/personality/<inferenceTag>.md` + `index.json` | `PersonalityStore` |
| **Skill state** (originalHash, currentHash) | cross-project | `workspace/.agent/adaptive-memory/skills.state.json` | `SkillsStore` |
| **Cycle summary** (all projects) | cross-project | `workspace/.agent/adaptive-memory/cycles.json` | `ReviewQueueStore` |
| **System defaults config** | cross-project | `workspace/.agent/adaptive-memory/config.defaults.json` | `AdaptiveMemoryConfigService` |

---

## 6. Integration with existing modules

| Existing module | How Adaptive Memory uses it |
|---|---|
| `DreamingService` | Ponderer's personality-induction stage calls `dreaming.triggerRun(project, { sessionFilesOverride })` to feed curated high-quality sessions through the existing 8-stage strategy-mining pipeline. The dreaming module's REST surface, `.dreams.json` artefacts, and SSE events are untouched. |
| `SkillsService` | Indirectly via `SkillsStore.list`/`byIds` reading `.claude/skills/<name>/SKILL.md`. The wiki skill is bumped to 1.1.0 with `classification?` and `provenance?` in its frontmatter schema, plus a new `wiki-delete.ts`. |
| `RagService` | `RealRAGAdapter` wraps it. Classification is carried as Chroma metadata; no new collections. |
| `KnowledgeGraphService` | `RealKGAdapter` wraps it. Classification is reified as RDF properties on each triple. `subgraph(rootId, depth)` is built via BFS using `findRelationshipsByEntity` rather than a new SPARQL CONSTRUCT. |
| `SessionsService` | `SessionsStore` writes its own `.snapshot.json` next to the existing JSONL chat history — does not modify session-service files. |
| `MemoriesService` | `RealPreferencesAdapter` surfaces hits as `Preference` records. `record()` is a stub pending a public upsert on MemoriesService. |
| `PersonaManagerService` | **Different concept** — persona identity at `workspace/.agent/personality.json`. Adaptive Memory's `PersonalityStore` lives at `workspace/.agent/personality/` (directory). The two are intentionally separate. |
| `WikiService` | NEW façade over the `wiki` skill at `skill-repository/standard/wiki/`. Writes/deletes shell out to the skill's `tsx` scripts so agent-written and service-written pages are byte-identical. |
| `SseMultiplexController` | Subscribes to the per-project `AdaptiveMemoryAgent` and `Ponderer` subjects and re-emits them on the new `adaptive-memory` mux channel. |
| `LlmService` | Extended with `runWithTools({ tools, maxSteps, ... })` built on the Vercel `ai` SDK's native tool-use (`tool()` + `stopWhen: stepCountIs(N)`). **NOTE**: the PRD names "Claude Agent SDK"; we use the `ai` SDK so multi-provider routing (Anthropic / OpenAI / DeepSeek) keeps working. |

---

## 7. Lifecycle of a Review Item

```
session ends
      │
      ▼
SessionsStore.close()                            (records workspaceSnapshotAfter)
      │
      ▼
cron fires (or POST /run-now)
      │
      ▼
Ponderer.run
   Stage 1  quality-scoring     → SessionsStore.setQualityScore
   Stage 2  maintenance         → orphans pruned silently <5; flagged for review otherwise
   Stage 3  personality-induction
        ├─ filter sessions to qualityScore ≥ threshold
        ├─ delegate to DreamingService.triggerRun (sessionFilesOverride)
        └─ admit PersonalityCandidate via firewall point 3
   Stage 4  self-edit           → reads ReviewQueueStore.listByProject for prior feedback
                                  → LLM rewrites skills/dreaming/SKILL.md
                                  → SkillsStore.write (preserves originalHash)
   Stage 5  publish-review      → ReviewQueueStore.publish appends to JSONL
                                  → cross-project cycles.json updated
      │
      ▼
frontend Review tab fetches /api/adaptive-memory/:project/review
      │
      ▼
user clicks Good / Badly reasoned / Unusable
      │
      ▼
POST /api/adaptive-memory/:project/review/:id/verdict
   → ReviewQueueStore.setVerdict appends a tombstone event to JSONL
   → cycle's verdict tally on cycles.json refreshed
      │
      ▼
next Ponderer cycle aggregates feedback by inferenceTag and
either reinforces, rewrites, or retires that tag in the dreaming SKILL.md.
```

---

## 8. Configuration reference

Per-project config at `workspace/<project>/.etienne/adaptive-memory.config.json`
(Zod schema in `backend/src/adaptive-memory/config/adaptive-memory-config.service.ts`).
**Its existence is the activation switch.**

```jsonc
{
  "projectId": "<project>",
  "wikiBaseUrl": "https://wiki.internal/api",      // optional
  "kgSparqlEndpoint": "https://rdf.internal/sparql", // optional
  "ragServiceUrl": "https://rag.internal/api",      // optional
  "mcpConnectors": ["lims", "supplier-erp"],
  "skillsRepo": "skill-repository",
  "ponderer": {
    "schedule": "0 22 * * *",                       // cron expression
    "timeZone": "UTC",
    "qualityThresholdForInduction": 0.7,
    "maxReviewItemsPerCycle": 25
  },
  "classificationPolicy": {
    "defaultForAgentWrites": "private",
    "secretSorTags": []
  },
  "tokenBudget": 100000
}
```

Optional cross-project defaults at
`workspace/.agent/adaptive-memory/config.defaults.json` are deep-merged
**under** the per-project config. Per-project always wins.

---

## 9. API surface

All routes are gated by `AdaptiveMemoryConfigService.isActive(project)` **except** the
settings routes themselves (those control activation).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/adaptive-memory/:project/task` | Run a within-task agent loop. Body: `{ "prompt": string }`. Returns `{ sessionId, text, toolCalls, steps, durationMs, meta }`. Returns `409 adaptive_memory_inactive` if not opted in. |
| `POST` | `/api/adaptive-memory/:project/run-now` | Trigger a Ponderer cycle immediately. Returns `PondererReport`. |
| `GET`  | `/api/adaptive-memory/:project/review` | List ReviewItems (with latest verdicts applied). |
| `POST` | `/api/adaptive-memory/:project/review/:itemId/verdict` | Body: `{ "verdict": "good" \| "badly_reasoned" \| "unusable" \| "pending" }`. |
| `GET`  | `/api/adaptive-memory/cycles` | Cross-project cycle summary. |
| `GET`  | `/api/adaptive-memory/:project/settings` | Returns `{ active, config }`. |
| `POST` | `/api/adaptive-memory/:project/settings` | Saves config; **creates the activation file** if absent; re-registers the cron. |
| `DELETE` | `/api/adaptive-memory/:project/settings` | Deletes the activation file; unregisters the cron. |

Live updates flow over the existing SSE multiplex at
`GET /api/sse/stream/:project` on the new `adaptive-memory` channel.
Event types: `task-started`, `frame`, `pick`, `pack`, `tool-use`,
`task-completed`, `task-failed`, `cycle-started`, `stage-completed`,
`cycle-completed`.

---

## 10. Testing the firewall

Every enforcement point has unit / integration coverage in `backend/test/`:

| Point | Test file |
|---|---|
| 1 — Write-time | `adaptive-memory-writeback.test.ts` |
| 2 — Pack-time | `adaptive-memory-packer.test.ts` |
| 3 — Personality admission | `adaptive-memory-personality-store.test.ts` |
| 4 — Picker access (structural) | `adaptive-memory-picker.test.ts` (uses `reflect-metadata`) |
| 5 — RAG query-time | `adaptive-memory-fakes.test.ts` + `adaptive-memory-picker.test.ts` |

End-to-end orchestrator coverage in `adaptive-memory-agent.test.ts` includes the
"agent attempts a writeback without classification" scenario — the firewall
fires inside the LLM tool loop, the user gets the model's final text, and no
rogue write reaches the underlying store.

Run any test directly: `tsx backend/test/<file>.test.ts`. There is no test
framework configured for this backend; tests are ad-hoc scripts that exit
non-zero on failure. See [backend/test/README.md](backend/test/README.md) for
the integration tests that run against live Chroma + Quadstore.

---

## 11. Activation

Opt a project in by creating
`workspace/<project>/.etienne/adaptive-memory.config.json` — easiest via
`POST /api/adaptive-memory/:project/settings`. The module then:

- Registers a Ponderer cron `adaptive_memory__ponderer__<project>` using
  the schedule + timezone from the merged config.
- Lets `POST /api/adaptive-memory/:project/task` succeed.
- Lets `POST /api/adaptive-memory/:project/run-now` succeed.

Deactivate via `DELETE /api/adaptive-memory/:project/settings`. The module:

- Deletes the file.
- Unregisters the Ponderer cron.
- Causes subsequent `task` / `run-now` calls to return `409 adaptive_memory_inactive`.

Existing data — review queue JSONL, sessions snapshots, personality entries —
**is not deleted on deactivation**. Removing it is explicit fs work.

---

## 12. References

- [requirements-docs/prd-revised-dreaming.md](requirements-docs/prd-revised-dreaming.md) — the PRD
- [README.md](README.md) — short overview + link to this doc
- [backend/src/adaptive-memory/](backend/src/adaptive-memory/) — implementation
- [backend/test/](backend/test/) — every test described above
- [skill-repository/standard/wiki/SKILL.md](skill-repository/standard/wiki/SKILL.md) — the evolved wiki skill (1.1.0)
- [backend/src/dreaming/](backend/src/dreaming/) — the strategy-mining pipeline the Ponderer delegates to

### PRD cross-reference

| PRD section | Implementation |
|---|---|
| §2 component map | `backend/src/adaptive-memory/` module layout |
| §3 data models | `backend/src/memory/types.ts` |
| §4 Skill format | `SkillsStore` parses YAML frontmatter + body; rewrites via `write()` |
| §5 within-task | `AdaptiveMemoryAgent.runTask` |
| §5.1 Picker | `subagents/picker.service.ts` |
| §5.2 Packer | `subagents/packer.service.ts` (4 levers, classification ceiling first) |
| §5.3 writeback tools | `tools/writeback.ts` (5 tools, all require classification) |
| §6 between-task | `subagents/ponderer.service.ts` |
| §6.1 quality scoring | `stages/quality-scoring.ts` |
| §6.2 maintenance | `stages/maintenance.ts` |
| §6.3 personality induction | `Ponderer.runPersonalityInduction` |
| §6.4 classification firewall | `memory/classification.ts:personalityAdmissionCheck` |
| §6.5 self-edit | `Ponderer.applyFeedbackToDreamingSkill` |
| §7 frontend | `frontend/src/pages/AdaptiveMemoryPage.jsx` (single tabbed page) |
| §8.1 Wiki | `backend/src/wiki/` façade + the `wiki` skill |
| §8.2 KG | `RealKGAdapter` over `KnowledgeGraphService` |
| §8.3 RAG | `RealRAGAdapter` over `RagService` |
| §8.4 SOR (MCP) | `RealSORAdapter` over `McpRegistryService` |
| §9 firewall enforcement points | this document §4 |
| §10 configuration | `AdaptiveMemoryConfigService` + this document §8 |
| §13 testing | this document §10 + `backend/test/` |
