# seed-requirements-hv

Seeds a fresh `requirements-hv` example project: a stylised composite of a
German TSO's procurement (**Nordseeübertragungs-Netz GmbH**, project
**NU-525-Lot-3**) for the onshore end of a **525 kV / 2 GW HVDC converter
station**. Built as the worked example for *Agents that help humans
decide — Part 3: From 900 pages of grid-code requirements to a binding
technical specification.*

Headlined by **REQ-247 (FRT-250ms)** — the single *muss* hiding under a
harmonics-table footnote in Annex A that the agent surfaces during the
*parse* step — plus the **REQ-184 late-clarification override** (the
2026-04-18 memo amended the reactive-power range from ±0.95/±0.95 to
±0.90 leading / ±0.95 lagging) and the **REQ-303 cluster reuse-mismatch**
(Reefnet-2020 delivered THD ≤ 1.5%, NSÜN requires ≤ 0.9% — REQ-304/305/307
inherit the rework).

Structurally a slimmer port of `seed-long-horizon-commitments`. It uses
the same `lib/api`+`lib/auth`+`lib/wiki-shell` wrappers, the same wiki +
KG + RAG + chats + dreaming pipeline, the same documentation +
application-type + event-rules + curator-cron tail. **Steps 10–12 from
the long-horizon seed (design-support graph, hypothesis workflows,
scrapbook projection) are intentionally dropped** — Part 3's pattern is
document-transformation, not hypothesis-driven design. The
**coverage dashboard** (`out/coverage/current.coverage.json`) plays the
role the quarterly packet plays in the long-horizon seed.

## What the script does

1. **Authenticates** against the OAuth server (`POST /auth/login`,
   default `admin/admin123`).
2. **Creates the project** via `POST /api/projects/create` — auto-
   provisions every standard skill including `wiki` and `dreaming`.
   2b. **Provisions MCP servers** via `POST /api/claude/mcp/config/save`
   (`kg`, `workflows`, `scrapbook`).
3. **Writes `wiki/_meta/mission.md`**.
4. **Writes ~18 wiki pages** by invoking the provisioned `wiki-add.ts`:
   the bid overview, the five pipeline steps (parse / normalize-EARS /
   structure-coverage / transform-draft / export), the FRT-250ms case
   study, the late-clarification overrides, the coverage dashboard +
   states + gates, the reuse base + reuse-mismatch on Annex C, the
   MMC control scheme, the German-language drafting style, the
   standards backdrop, the clarify queue, and the agent's three
   operating rules (no silent commitment, flag-don't-invent,
   traceability survives export).
5. **POSTs ~40 EARS requirements + ~6 reuse sources + 8 source volumes +
   8 standards + 5 engineers + 1 customer** plus the relationships:
   `sourcedFrom`, `draftedFrom`, `responsibleEngineer`, `overrides`
   (REQ-184 ← 2026-04-18 memo, REQ-411 ← 2026-04-18 memo),
   `typeTestEvidence` (REQ-247 ← Northshore-2022 FRT report),
   `cascadesTo` (REQ-303 → REQ-304/305/307), `doesNotMeet` (Reefnet-2020
   → REQ-303), `references` (requirements → standards), and
   `authored` (customer → source volumes).
6. **Writes ~17 short markdown documents** under `documents/` and POSTs
   each to the RAG indexer: paraphrased German source-volume excerpts
   (Vol.1 / Annex A / Annex B / Annex C / Annexes D-F / Vol.6), the
   2026-04-18 clarifications memo (German), English past-spec excerpts
   from the reuse base (Northshore-2022 MMC control + FRT type-test,
   Capeline-2023 protection, Reefnet-2020 harmonic filters,
   Aurora-2024 reactive-power), the internal German style guide, two
   engineer handover notes (Vogt on controls, Haag on harmonics), the
   2024 bid-loss post-mortem, and the coverage-dashboard internal spec.
7. **Writes three JSONL session histories** + updates `chat.sessions.json`:
   *parse + normalize walk-through* (how REQ-247 surfaced), *late-
   clarification override on REQ-184*, and *reuse mismatch on the
   Annex C cluster*.
8. **Enables dreaming** and triggers a run.
9. **Waits up to 5 minutes** for the dream file.
10. **Writes the coverage dashboard** at
    `out/coverage/current.coverage.json` — the load-bearing artefact
    (per-row state, override + reuse-mismatch + load-bearing chips,
    per-engineer aggregate, gates G1/G2/G3 + submission deadline). This
    is the equivalent of the long-horizon seed's quarterly packet.
11. **Writes `documentation.md`** to the project root and registers it
    (alongside the coverage dashboard) in
    `.etienne/user-interface.json` `previewDocuments` so both
    auto-open.
    11b. **Assigns the `requirements-hv` application type** — writes
    `.etienne/application-type.json` so the `MinimalisticSidebar`'s
    `ApplicationSection` renders the article-aligned 5-item *Bid
    pipeline* menu (Open the coverage dashboard / Which requirements
    are still open? / Show me the late-clarification overrides / Draft
    a response for the next open requirement / Export the current
    specification). The application type itself lives at
    `application-types-repository/requirements-hv/config.json`.
12. **Seeds three event rules** in `.etienne/event-handling.json` + the
    matching prompts in `.etienne/prompts.json`:
    - `rag-auto-index-documents` (enabled — always on).
    - `late-clarification-amends-requirement` (seeded DISABLED — the
      2026-04-18 memo is already loaded at seed time, so an always-on
      KG rule would re-fire indefinitely; operator enables once they
      want the live wire for subsequent memos).
    - `reuse-mismatch-detected` (seeded DISABLED for the same reason
      — the Reefnet/Annex-C mismatch is already present).
13. **Registers the nightly curator cron** (`0 3 * * *` UTC) that
    operationalises the no-silent-default rule: walk the coverage
    matrix, refuse to advance any row on the agent's authority, freeze
    the bid on any row whose responsible engineer has been idle past
    their gate.

### Three-location sync

The seed is the single source of truth. After a successful run against
a clean project:

- the **fixtures** (`fixtures/*.ts`) define the data;
- `workspace/requirements-hv/` is the **live copy** the seed writes (use
  this one for testing);
- sync `demo-project-folders/requirements-hv/` **from** the workspace
  copy afterward (exclude live churn: `.etienne/chat.*`, `costs.json`,
  `agent-logs/`, `session.id`) to keep the golden reference current.

## Prerequisites

All four services must be running:

| Service | Default port |
|---|---|
| OAuth server | 5950 |
| Backend (NestJS) | 6060 |
| Vector store (Chroma) | 7100 |
| RDF store (Quadstore) | 7000 |

Confirm with:

```bash
curl -s -m 2 http://localhost:5950/auth/health
curl -s -m 2 http://localhost:7100/api/v1/heartbeat
curl -s -m 2 http://localhost:7000/health
curl -s -m 2 -o /dev/null -w "%{http_code}\n" http://localhost:6060/docs
```

## Running

The existing `workspace/requirements-hv/` is a thin template
instantiation, **not** the seeded example — the seed's project-level
idempotency guard will refuse to overwrite it. Delete it first:

```bash
# Windows PowerShell
Remove-Item -Recurse -Force workspace/requirements-hv

# macOS / Linux
rm -rf workspace/requirements-hv
```

Then from the repo root:

```bash
cd c:\Data\GitHub\claude-multitenant
npx tsx scripts/seed-requirements-hv/seed-requirements-hv.ts
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WORKSPACE_ROOT` | `C:/Data/GitHub/claude-multitenant/workspace` | Where the seeded project is written. Must match what the backend itself is configured to use. |
| `OAUTH_BASE` | `http://localhost:5950` | OAuth server URL. |
| `BACKEND_BASE` | `http://localhost:6060` | Backend URL. |
| `SEED_USERNAME` | `admin` | OAuth login. |
| `SEED_PASSWORD` | `admin123` | OAuth login. |

## Re-running

The script is **only project-level idempotent**: if the project
directory already exists it errors out at step 2 to avoid duplicating
data.

To re-seed cleanly:

```bash
# 1. Delete the project directory.
rm -rf workspace/requirements-hv

# 2. Drop the Chroma collections for this project.

# 3. Drop the Quadstore entries.

# 4. Re-run.
```

## Smoke test after seeding

1. Open the project in the frontend at http://localhost:5000 —
   `documentation.md` should auto-open and the coverage dashboard
   should be the first preview.
2. Open the wiki — `wiki/_meta/mission.md` plus ~18 topic pages should
   render and cross-link (look for the *FRT-250ms* case study and the
   *late-clarification overrides* page).
3. Open the KG viewer — 40 requirements with `state` and chip flags
   visible, 8 source volumes, 6 reuse sources, 8 standards, 5 named
   engineers, the customer. The override edges (memo → REQ-184,
   memo → REQ-411), the type-test edge (REQ-247 →
   Northshore-2022 FRT type-test), and the cascade edges
   (REQ-303 → REQ-304/305/307) should be navigable.
4. Open the coverage dashboard JSON in the preview pane — counts per
   state (committed / drafted / reviewed / deviation / clarify / open),
   chip counts (override / reuse-mismatch / load-bearing), gates G1/G2/G3
   with their due dates.
5. Sidebar — left rail renders the 5 `requirements-hv` quick actions
   under the *Bid pipeline* heading; clicking each fires the configured
   subagent prompt.
6. In chat, ask *"How did the agent end up with REQ-247?"* — the agent
   should walk through the parse step and cite Annex A §7.4.3 footnote
   2 + the Northshore-2022 FRT type-test (KEMA-NS22-FRT-014).
7. Enable the two seed-DISABLED rules under Settings → Event handling
   if you want to see the live wire fire on a new clarification or a
   new reuse-mismatch.
