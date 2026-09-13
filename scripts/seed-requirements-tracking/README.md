# seed-requirements-tracking

Seeds a fresh **`tendertrace-analysis`** example project: the TenderTrace
**tender-analysis showcase** (domain: Lagerlogistik / Kontraktlogistik).

The Nordland Handels AG tenders the operation of its central warehouse
("Logistikzentrum Nord", `T-2026-031`); we are Hansa Logistik GmbH and want
to know how well our service catalog fulfils the tender and what must be
clarified with the customer before bidding. The project ships the folder
contract of the **Analyse-Cockpit** and synthetic customer documents:

| Path | Content |
|---|---|
| `tender/01-leistungsbeschreibung-lagerlogistik.docx` | 8 numbered chapters: Mengengerüst, Wareneingang, Lagerung, Kommissionierung, Retouren, IT, Service-Level |
| `tender/02-vertragsbedingungen.docx` | Laufzeit 48 Monate, Jahresbudget 1,45 Mio. €, Bonus/Malus, § 613a, Haftung |
| `tender/Mengengeruest.xlsx` | sheets Flächen / Mengen / Budget / KPIs — the raw figures (two cells deliberately disagree with the text) |
| `servicecatalog/leistungskatalog.md` | OUR catalog in OUR vocabulary (Inbound-Handling, Order Fulfillment, WMS, Returns Management …) |
| `servicecatalog/glossary.md` | customer term → our term (Kommissionierung → Order Fulfillment, LVS → WMS, …) |
| `analysis-template/management-analyse.md` | the house template for the management analysis |

Built-in demo hooks (asserted by the dry run and the integration test):

- **two contradictions**, in different sheets and units: 12.400 Palettenstellplätze (text) vs 12.000 (`Mengen!B2`), and Wareneingangsbuchung 4 Stunden (text) vs 6 Std. (`KPIs!B3`)
- **no false alert** on the budget: "1,45 Mio. €" equals 1.450.000 €
- a **vague clause** ("Retouren sind zeitnah zu bearbeiten") → customer clarification
- **Gefahrgut Klasse 3** is excluded in our catalog → PARTIAL / NON_COMPLIANT
- a "muss … buchen können" sentence → exercises the one-obligation heuristic

## Prerequisites

| Service | Port | Required |
|---|---|---|
| Backend (NestJS) | 6060 | yes |
| OAuth server | 5950 | yes |
| RDF store (Quadstore) | 7000 | yes |
| Vector store (Chroma) | 7100 | optional — without it phase B compares all services directly |
| LLM key (or `AZURE_AI_CONNECTION`) | — | needed for phase A (`SEED_RUN_ANALYSIS=1`) and for the cockpit |

**Build the viewer first** — otherwise the `.tendertrace.json` pages show nothing:

```bash
cd mcp-app-requirements-tracking
npm install && npm run build
```

## Run

```bash
# from the repo root — creates the project and the files, nothing else
npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts

# additionally start phase A and wait until the run is "awaiting review"
SEED_RUN_ANALYSIS=1 npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
```

Dry run — validates fixture integrity offline (every headline figure of the
DOCX text exists in the workbook except the two deliberate contradictions,
each of which is asserted cell by cell; the catalog excludes Gefahrgut; the
template carries the mandatory blocks) and renders the DOCX/XLSX into a
temp folder:

```bash
SEED_DRY_RUN=1 npx tsx scripts/seed-requirements-tracking/seed-requirements-tracking.ts
```

| Variable | Default |
|---|---|
| `WORKSPACE_ROOT` | `C:/Data/GitHub/claude-multitenant/workspace` |
| `OAUTH_BASE` / `BACKEND_BASE` | `http://localhost:5950` / `http://localhost:6060` |
| `SEED_USERNAME` / `SEED_PASSWORD` | `admin` / `admin123` |
| `SEED_PROJECT_NAME` | `tendertrace-analysis` |
| `SEED_RUN_ANALYSIS` | unset — `1` starts phase A after seeding |
| `SEED_ANALYSIS_TIMEOUT_MS` | `1200000` (20 min) |
| `SEED_FORCE` | unset — `1` seeds even if the project dir exists |
| `SEED_DRY_RUN` | unset — `1` for the offline fixture check |

The seed **refuses to run** if `workspace/tendertrace-analysis/` already exists.

## Demo walkthrough (the cockpit)

1. Open the project — the **Analyse-Cockpit** auto-opens at step 1.
2. **Analyse starten** — the progress bar names every file and action
   (parse → figures → glossary → extract → consistency → catalog).
3. Step 2 **Zur Prüfung** — approve cards in the Review Queue (domain text in
   our vocabulary, term chips, the Palettenstellplatz alert card is excluded
   from bulk approve).
4. Step 3 — resolve both contradictions: *Beim Kunden klären*.
5. Step 4 unlocks only now — **Abgleich starten**; the verdict chips show the
   Gefahrgut requirement as not/partially covered.
6. Step 5 — **Bericht öffnen** (MD/DOCX). The banner reads "Analyse mit
   Vorbehalten: n Kundenklärungen …"; the clarification section lists both
   figure questions (Palettenstellplätze, Wareneingangsbuchung) and the
   vague "zeitnah".

## Re-running

Delete `workspace/tendertrace-analysis/`, drop the project's Chroma
collections and Quadstore graphs, and re-run. Dropping new documents into
`tender/` and pressing **Erneut einlesen** in the cockpit is the intended
way to iterate — unchanged files are skipped by content hash.
