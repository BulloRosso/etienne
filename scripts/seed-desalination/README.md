# seed-desalination

Seeds a fresh `desalination-devices` example project with realistic data
(wiki, knowledge graph, RAG documents, three chat sessions) and then runs
the dreaming pipeline to produce a `.dreams.json` artefact.

The project is a sample deployment of the **Adaptive Memory** feature — it
gives the agent enough on-topic material to discover and surface non-trivial
strategy candidates during dreaming, and exercises the wiki/KG/RAG stores at
realistic scale.

## What the script does

1. **Authenticates** against the OAuth server (`POST /auth/login`,
   default `admin/admin123`).
2. **Creates the project** via `POST /api/projects/create` — this auto-
   provisions every standard skill including `wiki` and `dreaming`. No
   separate skill-provisioning step is needed.
3. **Writes `wiki/_meta/mission.md`** (the wiki skill anchors mission
   relevance on this file).
4. **Writes 25 substantive wiki pages** (20 in `topics/`, 5 in `sources/`)
   by invoking the provisioned `wiki-add.ts` per page. Cross-links may
   produce a few auto-stubs; that's expected.
5. **POSTs ~30 KG entities and ~40 relationships** across 8 conceptual
   domains (technology, component, manufacturer, product, regulation,
   parameter, region, pilot).
6. **Writes 40 short markdown documents** under
   `workspace/desalination-devices/documents/` and `POST`s each to the
   RAG indexer.
7. **Writes three JSONL session histories** + updates `chat.sessions.json`.
   Sessions are written directly to disk because there is no public REST
   surface that appends turns.
8. **Enables dreaming** for the project (`POST .../settings { enabled: true, ... }`)
   and triggers a run (`POST .../run-now`).
9. **Waits up to 5 minutes** for the dream file to appear at
   `workspace/desalination-devices/dreaming/dream-YYYY-MM-DD.dreams.json`.

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
# backend has no /health, but /docs (Swagger) should respond:
curl -s -m 2 -o /dev/null -w "%{http_code}\n" http://localhost:6060/docs
```

## Running

From the repo root:

```bash
cd c:\Data\GitHub\claude-multitenant
npx tsx scripts/seed-desalination/seed-desalination.ts
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WORKSPACE_ROOT` | `C:/Data/GitHub/claude-multitenant/workspace` | Where the seeded project is written. Must match what the backend itself is configured to use. |
| `OAUTH_BASE` | `http://localhost:5950` | OAuth server URL. |
| `BACKEND_BASE` | `http://localhost:6060` | Backend URL. |
| `SEED_USERNAME` | `admin` | OAuth login. |
| `SEED_PASSWORD` | `admin123` | OAuth login. |

## Expected output

```
Seeding desalination-devices
workspace: C:/Data/GitHub/claude-multitenant/workspace

▸ 1. Authenticate
  ✓ authenticated as admin (admin)

▸ 2. Create project (auto-provisions standard skills)
  ✓ project created: desalination-devices
  ✓ wiki skill provisioned (.claude/skills/wiki/)

▸ 3. Write wiki/_meta/mission.md
  ✓ mission.md written

▸ 4. Seed wiki pages via provisioned wiki-add.ts
  · topics/reverse-osmosis
  · topics/multi-effect-distillation
  · …
  ✓ wiki: 25 pages written + N auto-stubs created

▸ 5. Seed knowledge graph
  ✓ kg: 30 entities
  ✓ kg: 40 relationships

▸ 6. Seed RAG documents
  · indexed 10/40…
  · indexed 20/40…
  · indexed 30/40…
  · indexed 40/40…
  ✓ rag: 40/40 documents indexed

▸ 7. Seed chat sessions
  · chat.history-d1f0c4a2-1111-…
  · chat.history-d1f0c4a2-2222-…
  · chat.history-d1f0c4a2-3333-…
  ✓ sessions: 3 sessions written, ~47 turns total

▸ 8. Enable dreaming + trigger run-now
  ✓ dreaming settings enabled
  ✓ dreaming run enqueued: run-2026-05-14-xxxxxxxx

▸ 9. Wait for dream file
  · expected: workspace/desalination-devices/dreaming/dream-2026-05-14.dreams.json
  · waiting…
  ✓ dream file produced: workspace/desalination-devices/dreaming/dream-2026-05-14.dreams.json (N items, M bytes)

✓ done
  inspect:  …/dreaming/dream-2026-05-14.dreams.json
  ui:       open the Adaptive Memory tile on the dashboard and pick "desalination-devices"
```

## Re-running

The script is **only project-level idempotent**: if the project directory
already exists it errors out at step 2 to avoid duplicating data.

To re-seed cleanly:

```bash
# 1. Delete the project directory.
rm -rf workspace/desalination-devices

# 2. Drop the Chroma collections for this project (use the vector-store admin
#    UI or DELETE :7100/api/v1/desalination-devices/collections/*).

# 3. Drop the Quadstore entries (DELETE :7000/desalination-devices or your
#    rdf-store's reset endpoint).

# 4. Re-run.
npx tsx scripts/seed-desalination/seed-desalination.ts
```

## Inspecting the result

- **Dream file**: `workspace/desalination-devices/dreaming/dream-YYYY-MM-DD.dreams.json`.
  Each item has `title`, `body`, `evidence[]`, and `compositeScore`. The three
  chat sessions share three recurring strategic patterns by design (validate
  against WHO+EU separately; pre-treatment + 6-monthly CIP discipline;
  layered supply outperforms single-source RO), so the dreaming pipeline
  should cluster them into ≥3 dream items.
- **Frontend**: open the **Adaptive Memory** tile on the dashboard,
  pick `desalination-devices`, and explore the four tabs:
  - **Task** — chat with the agent against this project's stores.
  - **Review queue** — empty until you run a Ponderer cycle (separate from
    dreaming); click *Run cycle now* on this tab to populate it.
  - **Skill diff** — view the dreaming SKILL.md.
  - **Settings** — Adaptive Memory cron, classification policy.

## Fixture data sources

The hand-authored fixture data paraphrases (or summarises) public material
from the following sources. None is shipped verbatim.

- **WHO Guidelines for Drinking-water Quality** (4th ed. + 2022 addendum).
- **EU Drinking Water Directive 2020/2184** Annex I.
- **DOW FILMTEC SW30-2540** public data sheet (DuPont Water Solutions).
- **Grundfos SQFlex** product brief.
- **Spectra Cape Horn Extreme** product brief.
- **Energy Recovery Inc. PX** pressure-exchanger spec.
- **IRENA / OAS / Pacific Community (SPC) / CARICOM** small-island
  desalination case studies.
- Pilot lessons are stylised composites of real reported deployments
  (Funafuti, Bequia, Tokelau, Kiribati, Antigua, Cape Verde, Saint Helena,
  Boavista, Maldives) — names retained where the lesson is widely published,
  numerical specifics paraphrased.
