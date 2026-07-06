# seed-requirements-tracking

Seeds a fresh **`tendertrace-stadtwerke`** example project: the
**TenderTrace** requirements-tracking feature caught *mid-story*
(spec: `requirements-docs/requirements-tracking/requirements-tracking.md` §2).

Lena, bid manager at **NovaSys GmbH**, wins tender **T-2026-014
"Kundenselfservice-Portal Stadtwerke Musterstadt"**; Sara leads the
implementation after award. The seed replays the whole history with
backdated timestamps (the `_seed {at, by}` override on the MCP tools) so
that "today" (2026-07-06) the project looks lived-in:

- **2026-04-01** — 3 German tender documents registered and parsed
  (Leistungsbeschreibung, Technische Anlage Sicherheit & Betrieb,
  Vertragsbedingungen)
- **early April** — 24 extraction proposals reviewed by Lena:
  **22 approved → REQ-001..REQ-022** (incl. the failover sentence split
  into TWO requirements sharing one quote → `derived_from_same_clause`),
  1 rejected (a client duty misread), **1 still pending** in the Review
  Queue
- **2026-04-12** — 5 service-catalog entries published (v1); mappings +
  compliance verdicts approved: FULL (Schulung, Verbrauchsübersicht),
  **PARTIAL** for the PDF-export requirement citing the catalog's
  `XML-Export` scope exclusion, **NEEDS_INPUT** naming the Security
  Officer; 3 response sections, one with a saved body carrying
  `<!-- trace: … -->` markers and a visible `[MISSING: …]` placeholder
- **2026-04-30** — **baseline v1.0 frozen** (Lena)
- **2026-05-12** — mock Jira board seeded (12 issues) + 5 approved
  requirement↔issue links (PORTAL-231 "Berichtsexport PDF" →
  the export requirement)
- **2026-06-02/03** — Jour-Fixe KW23 drift: export formats
  *PDF → PDF, CSV oder XML* accepted as **change order** (which
  auto-stales the PORTAL-231 link and drafts the Jira notice), the
  500-concurrent-users load clarification accepted **in-scope**, plus a
  noted CONFIRMATION
- **2026-06-18** — Cloud-storage email from Fr. Kern → **CONFLICT card**
  against the On-Premises requirement, **left undecided** (the blocking
  card in the Drift Inbox)
- **2026-06-25** — shadow-scope card for the unlinked **PORTAL-310**
  ("XML-Export gegen Kunden-XSD validieren"), left undecided
- **today** — deviation report since v1.0 + claim
  **"Nachtrag 01 — Exportformate"** (1 priced change-order item)

Everything flows through the product's own MCP group
(`http://localhost:6060/mcp/requirements-tracking`, headers
`Authorization: test123` + `X-Project-Name`), so the seeded state is
exactly what the app produces in real use — REQ/SVC/proposal ids are
**captured from tool results**, never hardcoded.

## Prerequisites

| Service | Port | Required |
|---|---|---|
| Backend (NestJS) | 6060 | yes |
| OAuth server | 5950 | yes |
| RDF store (Quadstore) | 7000 | yes |
| Vector store (Chroma) | 7100 | optional — powers `search_requirements` / `search_catalog` / `search_issues`; seeding works without it |

**Build the viewer first** — otherwise the `.tendertrace.json` pages show
nothing:

```bash
cd mcp-app-requirements-tracking
npm install && npm run build
```

An LLM API key is **optional**: the deviation-report and claim
*narratives* degrade gracefully without one (the deterministic data is
still snapshotted); the seed tolerates those failures.

## Run

```bash
# from the repo root
npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
```

Dry run — validates fixture integrity offline (every evidence quote must
be a verbatim substring of its source document, section refs must match
the backend's sectionizer, all cross-references must resolve) and exits 0
without touching the network:

```bash
SEED_DRY_RUN=1 npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
```

Environment variables (same defaults as the other seeds):

| Variable | Default |
|---|---|
| `WORKSPACE_ROOT` | `C:/Data/GitHub/claude-multitenant/workspace` |
| `OAUTH_BASE` | `http://localhost:5950` |
| `BACKEND_BASE` | `http://localhost:6060` |
| `SEED_USERNAME` / `SEED_PASSWORD` | `admin` / `admin123` |
| `SEED_FORCE` | unset — set `1` to seed even if the project dir exists |
| `SEED_DRY_RUN` | unset — set `1` for the offline fixture check |

The seed **refuses to run** if `workspace/tendertrace-stadtwerke/`
already exists (delete it — plus matching Chroma/Quadstore entries — or
set `SEED_FORCE=1`).

## What gets seeded

- Project `tendertrace-stadtwerke` with mission brief, `.claude/CLAUDE.md`
  (agent contract: `submit_proposal` is the only write path; a human
  decides every proposal) and `.mcp.json` (`requirements-tracking` + `kg`)
- Tender meta `T-2026-014`, phase `implementation`, language `de`
- 3 tender docs + 2 implementation artifacts (KW23 minutes, Cloud email)
- 22 approved requirements + 1 pending + 1 rejected extraction card;
  manual `depends_on`/`refines` relations; baseline **v1.0**
- 5 published catalog services, 5 approved mappings, 5 approved verdicts
- 3 response sections (one saved body with trace markers + `[MISSING]`)
- 12 mock Jira issues, 5 links (1 auto-staled by the change order,
  with a drafted stale notice), 1 pending shadow-scope card
- 4 drift cards (change_order / in_scope / noted / **pending CONFLICT**)
- 1 accepted requirement (Abnahme by Sara), 1 deviation report,
  1 claim with pricing
- 14 page sentinels under `out/tendertrace/pages/*.tendertrace.json`,
  `documentation.md` (German quick tour), `.etienne/user-interface.json`
  (auto-opens Drift Inbox + Dashboard + documentation) and
  `.etienne/application-type.json` → the **TenderTrace** sidebar menu
  (`application-types-repository/requirements-tracking/config.json`)

## Demo walkthrough

1. Open the project — the **Drift Inbox** auto-opens with the unresolved
   **Cloud vs. On-Premises CONFLICT** card.
2. Decide cards: the conflict blocks until a human resolves which
   requirement wins; the KW23 cards show what decided cards look like.
3. Open the export requirement's **Thread**: tender quote → v1.0 →
   change-order diff with evidence → current text → stale PORTAL-231 link
   with the drafted Jira comment.
4. **Simulate an issue event** (e.g. PORTAL-240 → done) and watch the
   derived implementation status react.
5. Generate/open the **deviation report** since v1.0.
6. Open **Claims**: "Nachtrag 01 — Exportformate" with baseline text,
   changed text, evidence and pricing.

## Re-running

Delete `workspace/tendertrace-stadtwerke/`, drop the project's Chroma
collections and Quadstore graphs, and re-run. (`SEED_FORCE=1` skips the
guard but re-seeds *on top* of existing state — ids will diverge; prefer
a clean delete.)
