# scripts/

Utility scripts for the etienne workspace population with demo data. The four **seed scripts**
under this folder each populate a fresh example project that demonstrates one
end-to-end pattern from the *Agents that help humans decide* article series.

## The four example projects

Each seed creates a self-contained project under `workspace/<project-name>/`
(wiki pages, knowledge graph, RAG documents, chat sessions, dreaming run, and
where applicable hypothesis workflows + scrapbook projection or a coverage
dashboard). They are designed to be explored from the frontend at
http://localhost:5000 after seeding.

| Preview | Seed | Project | Article it implements |
|---|---|---|---|
| <img src="factory-line-sim.jpg" height="250" alt="factory-line-sim"/> | [`seed-factory-line-sim/`](seed-factory-line-sim/) | `factory-line-sim` — a quality production line with line-dashboard, event simulator, and decision graphs | [Part 1 — Quality Production Line](https://www.linkedin.com/pulse/agents-help-humans-decide-part-1-quality-production-line-navasardyan-r9kcf/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) |
| <img src="desalination.jpg" height="250" alt="desalination"/> | [`seed-desalination/`](seed-desalination/) | `desalination-devices` — Engineering Design Support System for a small-island desalination device, with mission→hypothesis→decision graph and a Refuted→cascade workflow | [Part 2 — Engineering Device](https://www.linkedin.com/pulse/agents-help-humans-decide-part-2-engineering-device-ralph-navasardyan-5oecf/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) |
| <img src="requirements-hv.jpg" height="250" alt="requirements-hv"/> | [`seed-requirements-hv/`](seed-requirements-hv/) | `requirements-hv` — turning ~900 pages of German grid-connection requirements (525 kV / 2 GW HVDC converter station bid) into a complete, traceable, German technical specification through the parse → normalize-EARS → structure → transform → export pipeline | [Part 3 — From requirements to specification](https://www.linkedin.com/pulse/agents-help-humans-decide-part-3-from-requirements-ralph-navasardyan-1jvjf/) |
| <img src="long-horizon-commitments.jpg" height="250" alt="long-horizon-commitments"/> | [`seed-long-horizon-commitments/`](seed-long-horizon-commitments/) | `tanker-long-horizon` — a 5-vessel midsize crude tanker fleet whose only job is to keep multi-year bets honest (expired assumptions, breached projection cones, gate countdown) | [Part 4 — Projection vs. reality on a tanker fleet](https://www.linkedin.com/pulse/agents-help-humans-decide-part-4-projection-vs-tanker-navasardyan-h545f/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) |

## Setup

### 1. Install and start the platform

Use the bootstrap installer from the repo root. It clones the repo, installs
dependencies for every service, and launches them in dependency order
(oauth/rdf/chroma → kg/webserver/backend → frontend).

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.sh | bash -s -- ~/etienne
```

```powershell
# Windows
iwr -useb https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.ps1 | iex
```

Set `SKIP_START=1` if you only want to install and start services later.

### 2. Confirm all services are up

The seeds talk to four services. All four must be reachable before you run
any seed:

| Service | Default port |
|---|---|
| OAuth server | 5950 |
| Backend (NestJS) | 6060 |
| Vector store (Chroma) | 7100 |
| RDF store (Quadstore) | 7000 |

```bash
curl -s -m 2 http://localhost:5950/auth/health
curl -s -m 2 http://localhost:7100/api/v1/heartbeat
curl -s -m 2 http://localhost:7000/health
curl -s -m 2 -o /dev/null -w "%{http_code}\n" http://localhost:6060/docs
```

The frontend (port 5000) is not required to *run* the seed, but you'll want
it for inspecting the result.

### 3. Run a seed

From the repo root, pick one:

```bash
npx tsx scripts/seed-factory-line-sim/seed-factory-line-sim.ts
npx tsx scripts/seed-desalination/seed-desalination.ts
npx tsx scripts/seed-requirements-hv/seed-requirements-hv.ts
npx tsx scripts/seed-long-horizon-commitments/seed-long-horizon-commitments.ts
```

Each seed takes a few minutes (the dreaming step waits up to 5 min for the
artefact). Per-script details, expected output, environment variables, and
re-run instructions live in each seed's own README:

- [seed-factory-line-sim](seed-factory-line-sim/) (no README yet — see the
  comment block at the top of `seed-factory-line-sim.ts`)
- [seed-desalination/README.md](seed-desalination/README.md)
- [seed-requirements-hv/README.md](seed-requirements-hv/README.md)
- [seed-long-horizon-commitments/README.md](seed-long-horizon-commitments/README.md)

### Shared environment variables

All three seeds honour the same defaults; override only if your local setup
differs:

| Variable | Default | Purpose |
|---|---|---|
| `WORKSPACE_ROOT` | `C:/Data/GitHub/claude-multitenant/workspace` | Where seeded projects are written. Must match the backend's workspace root. |
| `OAUTH_BASE` | `http://localhost:5950` | OAuth server URL. |
| `BACKEND_BASE` | `http://localhost:6060` | Backend URL. |
| `SEED_USERNAME` | `admin` | OAuth login. |
| `SEED_PASSWORD` | `admin123` | OAuth login. |

### Re-running a seed

Each seed is **project-level idempotent**: if the target project directory
already exists, it errors out at step 2. To re-seed cleanly, delete the
project directory under `workspace/`, drop the matching Chroma + Quadstore
entries, and re-run. The per-seed READMEs spell this out for each project.

> **Note on `requirements-hv`:** the current `workspace/requirements-hv/` is
> a thin instantiation of the `document-management` template, *not* the
> seeded example. Delete it before running `seed-requirements-hv` for the
> first time, otherwise the seed's idempotency guard will refuse to
> overwrite it.

## Further reading

The four articles that motivate these examples — each one introduces the
pattern that the matching seed makes runnable:

1. [Agents that help humans decide — Part 1: Quality Production Line](https://www.linkedin.com/pulse/agents-help-humans-decide-part-1-quality-production-line-navasardyan-r9kcf/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) — implemented by [`seed-factory-line-sim/`](seed-factory-line-sim/).
2. [Agents that help humans decide — Part 2: Engineering Device](https://www.linkedin.com/pulse/agents-help-humans-decide-part-2-engineering-device-ralph-navasardyan-5oecf/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) — implemented by [`seed-desalination/`](seed-desalination/).
3. [Agents that help humans decide — Part 3: From requirements to specification](https://www.linkedin.com/pulse/agents-help-humans-decide-part-3-from-requirements-ralph-navasardyan-1jvjf/) — implemented by [`seed-requirements-hv/`](seed-requirements-hv/).
4. [Agents that help humans decide — Part 4: Projection vs. reality on a tanker fleet](https://www.linkedin.com/pulse/agents-help-humans-decide-part-4-projection-vs-tanker-navasardyan-h545f/?lipi=urn%3Ali%3Apage%3Ad_flagship3_publishing_published%3BLax6UkZOQbarJqL5ffu5Fw%3D%3D) — implemented by [`seed-long-horizon-commitments/`](seed-long-horizon-commitments/).

## Other scripts in this folder

- `install.sh` / `install.ps1` — bootstrap installer (clone + install + start
  services); see step 1 above.
- `split-i18n.mjs`, `update-components-i18n.mjs`, `validate-i18n.mjs` — i18n
  catalogue maintenance.
- `disable-auto-workflows.ts` — one-off toggle for the auto-workflows worker.
