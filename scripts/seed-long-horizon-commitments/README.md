# seed-long-horizon-commitments

Seeds a fresh `tanker-long-horizon` example project: a 5-vessel
midsize crude tanker fleet whose only job for the agent is to keep multi-
year bets honest. Built as the worked example for *Agents that help humans
decide — Part 4: Projection vs. reality on a tanker fleet*.

Headlined by the **Meridian** — the off-strategy vessel from the article,
with three expired assumptions, a breached projection cone, and a dry-dock
window 14 months out — plus four sister vessels (Aurora, Nordic Star, Cape
Pioneer, Orion) sized so the fleet-alignment dashboard from the article
renders end-to-end.

The seed is structurally a port of `seed-desalination`. It uses the same
15-step shape, the same lib/api+auth+wiki-shell wrappers, and the same
design-support stack (hypothesis workflows, mission-derivation, scrapbook
projection, dreaming, curator cron). Only the fixtures and the event-rule
content differ.

## What the script does

1. **Authenticates** against the OAuth server (`POST /auth/login`,
   default `admin/admin123`).
2. **Creates the project** via `POST /api/projects/create` — auto-provisions
   every standard skill including `wiki` and `dreaming`.
   2b. **Provisions MCP servers** via `POST /api/claude/mcp/config/save`
   (`kg`, `workflows`, `scrapbook`).
3. **Writes `wiki/_meta/mission.md`**.
4. **Writes ~18 wiki pages** by invoking the provisioned `wiki-add.ts`:
   the fleet overview, one page per vessel, the *Meridian* commitment
   lifeline, projection-vs-reality, dry-dock windows, scrubber economics,
   retrofit payback, the regulatory backdrop (EU ETS + FuelEU + IMO 2027),
   charter strategy, drift scoring, and the agent's three operating rules
   (quarterly cadence, no silent default, red-team on irreversibles).
5. **POSTs ~35 KG entities and ~30 relationships**: 5 vessels, 4 historical
   Meridian decisions, 8 Meridian assumptions (with `ageingState`), 5 gates
   (one per vessel), 3 deferred items parked at the 2027 gate, 5 projection
   cones, 4 regulatory entities, counterparty + yard.
6. **Writes ~18 short markdown documents** under `documents/` and POSTs
   each to the RAG indexer: 3 charter excerpts, 4 regulatory summaries, 3
   retrofit quotes (2018 / 2023 / 2026 — the cost-window differential the
   article hinges on), 2 special-survey reports, 3 broker valuations, 3
   analyst notes (fuel spread + EUA), 2 internal post-mortems.
7. **Writes three JSONL session histories** + updates `chat.sessions.json`:
   *Why is the Meridian off-strategy?*, *Projection-vs-reality on the
   Meridian*, *Gate countdown + the deferred items*.
8. **Enables dreaming** and triggers a run.
9. **Waits up to 5 minutes** for the dream file.
10. **Installs design-support + scrapbook + stateful-workflows** skills and
    scaffolds the runtime dirs.
11. **POSTs the design-support typed graph** — mission v1 nodes (intent,
    constraints, non-goals, acceptance criteria), working-graph nodes
    (decisions, evidence, open questions), and 6 hypothesis nodes.
12. **Creates one workflow per hypothesis** and drives each to its target
    state via the REST event endpoint. Includes:
    - one **Refuted→cascade** (`hypothesis-eua-price-stable`, which
      `entails` `hypothesis-retrofit-payback-2027` and is `dependsOn` by
      `ds-decision-comply-via-allowances-2025`),
    - one **mission-derived** (`hypothesis-meridian-off-strategy`),
      `contradicts` the `<=1 vessel off-strategy` acceptance criterion.
12b. **Creates the fleet scrapbook** — writes `scrapbook.fleet.scbk` plus
    a quarterly-packet projection: root → *Assumptions expired (3)* /
    *Gates approaching (1)* / *Projection breached (1)* / *Drift (1)* →
    the article's exact red/amber leaves with `[kg:<id>]` round-trip
    tokens and wiki cross-links.
13. **Writes `documentation.md`** to the project root and registers it in
    `.etienne/user-interface.json` `previewDocuments` so it auto-opens.
    13b. **Assigns the `long-horizon-commitments` application type** —
    writes `.etienne/application-type.json` so the `MinimalisticSidebar`'s
    `ApplicationSection` renders the 5-item *Fleet commitments* menu
    (Open the quarterly packet / Why is the Meridian off-strategy? / Gate
    countdown / Red-team the Meridian retrofit / Score the fleet). The
    application type itself lives at
    `application-types-repository/long-horizon-commitments/config.json`.
14. **Seeds three event rules** in `.etienne/event-handling.json` + the
    matching prompts in `.etienne/prompts.json`:
    - `rag-auto-index-documents` (enabled — always on).
    - `assumption-expired-triggers-review` (seeded DISABLED — three
      assumptions are already expired at seed time, so an always-on KG
      rule would re-fire indefinitely; the operator enables it once they
      want the live wire).
    - `gate-approaching-triggers-redteam` (seeded DISABLED for the same
      reason — the Meridian gate is 14 months out).
13d. **Writes the canonical nightly fleet-alignment report** at
    `out/nightly-alignment/2026-05-26.alignment.json`. Rendered by the
    Fleet Alignment MCP UI previewer (`mcp-app-alignment/` + backend
    `alignment-tools.ts`; registered against `.alignment.json` in
    `backend/src/previewers/previewer-metadata.json`). The curator cron
    (step 15) overwrites this each night.
15. **Registers the nightly curator cron** (`0 3 * * *` UTC) with a prompt
    that operationalises the no-silent-default rule: re-age, score, freeze
    any commitment whose packet went un-actioned past its gate.

Steps 10–15 are additive and idempotent on the design-support artefacts;
the project-level idempotency guard (step 2) still errors if the project
dir already has a `wiki/` or `.claude/`.

### Three-location sync

The seed is the single source of truth. After a successful run against a
clean project:

- the **fixtures** (`fixtures/*.ts`) define the data;
- `workspace/tanker-long-horizon/` is the **live copy** the seed writes
  (use this one for testing);
- sync `demo-project-folders/tanker-long-horizon/` **from** the
  workspace copy afterward (exclude live churn: `.etienne/chat.*`,
  `costs.json`, `agent-logs/`, `session.id`) to keep the golden reference
  current.

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

From the repo root:

```bash
cd c:\Data\GitHub\claude-multitenant
npx tsx scripts/seed-long-horizon-commitments/seed-long-horizon-commitments.ts
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

The script is **only project-level idempotent**: if the project directory
already exists it errors out at step 2 to avoid duplicating data.

To re-seed cleanly:

```bash
# 1. Delete the project directory.
rm -rf workspace/tanker-long-horizon

# 2. Drop the Chroma collections for this project.

# 3. Drop the Quadstore entries.

# 4. Re-run.
```

## What the workflows now carry (new)

Each hypothesis workflow now ships with the assumption it tests and the
evidence behind any human-attributed transition:

- **`assumptionWikiSlugs`** on the workflow file — wiki slugs of the pages
  that captured the starting assumption. The workflow detail view shows
  these as chips at the top of the side panel; clicking opens the wiki
  page in the preview pane.
- **`initialRationale`** — `DecisionRationale` recorded at workflow
  creation (`reasoning` + `evidenceDocuments[]`). Renders as the
  *Initial rationale* card with clickable document chips.
- **`history[].rationale` + `history[].decidedBy: 'human'`** — attached
  to transitions the human drove. The `hypothesis-eua-price-stable`
  workflow has two: `PROVISIONAL_REFUTE` cites `analyst-eua-price-2026.md`;
  `CONFIRM_REFUTE` cites the same document plus the
  `out/quarterly-packets/2026-Q2.quarterly.json` packet.

These fields are also mirrored into the KG as `describedBy` edges
(`hypothesis-<id> describedBy wiki:<slug>`), so anything that reads the
graph sees the workflow → assumption link without re-fetching the
workflow file.

The shared `DecisionRationale` type lives in
[backend/src/hitl-protocol/interfaces/hitl-protocol.interface.ts](../../backend/src/hitl-protocol/interfaces/hitl-protocol.interface.ts)
and is validated via
[backend/src/hitl-protocol/decision-rationale.validator.ts](../../backend/src/hitl-protocol/decision-rationale.validator.ts)
— evidence paths must be project-relative, resolve under
`workspace/<project>/`, and exist on disk.

## Smoke test after seeding

1. Open the project in the frontend at http://localhost:5000 —
   `documentation.md` should auto-open.
2. Open the wiki — `wiki/_meta/mission.md` plus ~18 topic pages should
   render and cross-link.
3. Open the KG viewer — 5 vessels, 4 historical Meridian decisions, 8
   assumptions (3 expired, 3 ageing, 2 fresh — and `ageingState` exposed),
   5 gates, 3 deferred items, 5 projections.
4. Open the design scrapbook — root → 4 categories → 6 leaves matching
   the article's quarterly packet view.
5. Open the workflows panel — 6 hypothesis workflows + `mission-derivation`,
   one of which is `Refuted` (eua-price-stable).
6. In chat, ask *"Why did we skip the scrubber in 2018?"* — the agent
   should cite `memo-no-scrubber-2018-rationale.md` and
   `analyst-fuel-spread-2024.md`.
7. Try the **Open the quarterly packet** quick action on the welcome page.
8. Enable the two seed-DISABLED rules under Settings → Event handling if
   you want to see the live wire fire.
