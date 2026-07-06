# Requirements Tracking (TenderTrace)

Implementation of `requirements-docs/requirements-tracking/requirements-tracking.md` (v0.9.6) as the platform's sixth seed project: agentic tender management with EARS-based requirement traceability — intake → extraction → human review → baseline freeze → drift detection → issue linking with derived implementation status → deviation reports → claims (Nachtrag).

One etienne workspace project = one tender workspace (the spec's per-tenant `DATA_ROOT`).

## Storage mapping (no new base services)

| Spec §11 | Implementation |
|---|---|
| quadstore knowledge graph | existing `rdf-store` :7000, extended with an optional 4th `graph` term, typed/language literals, `POST /:project/batch` (multiDel+multiPut) and `DELETE /:project/graph`. Fully backward compatible — omitted `graph` = default graph, so the existing knowledge-graph feature is untouched. |
| named graphs | `id:graph/tender`, `id:graph/catalog`, `id:graph/tracker` (rewritten on sync), `id:graph/audit` (append-only: agent runs, decisions, `tt:StatusChange`) — vocabulary in [tt-vocab.ts](../backend/src/requirements-tracking/graph/tt-vocab.ts) |
| PostgreSQL tables | graph classes; each node carries typed structural quads + one `tt:record` JSON literal (crash-safe via embedded `_rev`), see [tt-repository.ts](../backend/src/requirements-tracking/graph/tt-repository.ts) |
| object storage | workspace FS under `workspace/<p>/requirements-tracking/{uploads,parsed,artifacts,response,exports,catalog,tracker,reports,captures,tmp}` — atomic write-temp-then-rename + sha256 ([files.service.ts](../backend/src/requirements-tracking/store/files.service.ts)) |
| SQLite FTS/vector projections | `RagService` hybrid (ChromaDB dense + BM25 sparse, RRF) in the dedicated `reqtrack_<project>` scope; stable ids via the new `RagService.indexTextWithId` — rebuildable via `POST /api/requirements-tracking/:project/projections/rebuild` |
| SPARQL | none in v1 — hot path uses `match()` fan-out (thread assembly), analytics use a whole-graph in-memory join snapshot ([tt-snapshot.ts](../backend/src/requirements-tracking/graph/tt-snapshot.ts)) |
| SSE | `reqtrack` channel on `GET /api/sse/stream/:project` for the host; the sandboxed MCP-app iframe polls `rt_get_events {sinceSeq}` (backed by `events.jsonl`) |

## Pipelines (all LLM calls via the backend `LlmService`)

Extraction (P-EXTRACT), drift screening/analysis/conflict-check (P-DRIFT-S/A/C, screening on the `small` tier), compliance (P-RESP-C with the scope-exclusion-overrides-FULL server check), response drafting (P-RESP-D), claim narratives (P-CLAIM), catalog import (mammoth DOCX→markdown → P-CAT-I), auto-mapping (P-CAT-M), issue linking (deterministic REQ-id pre-pass → P-LINK), shadow scope (P-SHADOW), deviation narrative (P-DEVREP), and the one interactive pipeline: Quick Capture (P-CAPTURE via `runWithTools`; `ask_user` suspends on a promise resolved by `POST /api/requirements-tracking/:project/captures/:cid/answers`, 15-min timeout → skipped).

Prompt files live verbatim (extracted from spec §5) under [backend/src/requirements-tracking/prompts/](../backend/src/requirements-tracking/prompts/); every run records prompt version + hash + model in the audit graph. Structured outputs run through [structured-run.ts](../backend/src/requirements-tracking/pipelines/structured-run.ts) (zod-enforced, retry-with-error, deterministic post-validators incl. the verbatim-quote substring check).

## Write path & invariants

`ProposalService` is the ONLY write path into requirement content: agents (pipelines and the project's Claude agent via `submit_proposal`) propose; humans decide via `rt_decide_proposal`. Decisions are first-writer-wins under a per-project mutex (`{conflict:true, winning}` on a lost race). Kind-specific effects (versions, links, mappings, publishes, claims, staleness fan-out, status derivation per spec §3.5) are registered in [decision-effects.service.ts](../backend/src/requirements-tracking/decision-effects.service.ts). Baseline freeze and response export return `{blocked, blockers[]}` on unresolved conflicts / `[MISSING]` placeholders.

## UI

`mcp-app-requirements-tracking/` — one MCP app, all 14 spec pages, internal navigation (every REQ id links to the Thread view). Hosted as the backend group `requirements-tracking` (`:6060/mcp/requirements-tracking`); `.tendertrace.json` sentinel files route to pages via the previewer (`backend/src/previewers/previewer-metadata.json`). Build it with `npm install && npm run build` in the app folder — the backend serves `dist/mcp-app.html` at runtime (not committed).

## Seed

`scripts/seed-requirements-tracking/` provisions the demo project `tendertrace-stadtwerke` mid-story (German content, spec §2 narrative) by replaying phases through the product's own MCP tools; mutating tools accept a seed-only `_seed {at, by}` backdating override (admin-guarded endpoint). Sidebar menu: `application-types-repository/requirements-tracking/config.json`.
