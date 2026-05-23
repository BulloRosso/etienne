# Document management — turn requirements into a controlled deliverable

Welcome. This project helps you take a customer requirements document — a
hundred-page PDF you cannot avoid reading carefully — and respond to every
requirement inside it, traceably, without committing your company to
anything you did not personally sign off.

The project is **pre-loaded with a worked example** so the workflow is
visible the moment you open it. Scroll to "What's already here" at the
bottom if you want to see it first; everything else explains how to drive
the workflow against your own documents.

## What this project does

It runs a five-step pipeline on a requirements document:

1. **Parse** — extract the text from the PDF.
2. **Normalize** — rewrite each requirement into a single, numbered
   sentence using the EARS syntax (the "shall / when / while / if-then /
   where" patterns); flag anything ambiguous instead of inventing a
   number.
3. **Structure** — lay out the deliverable's chapters and map every
   requirement to one of them. Every requirement gets a row; no row goes
   missing.
4. **Transform** — for each row, draft a response by retrieving relevant
   passages from past deliverables and adapting them.
5. **Export** — assemble the committed drafts into a single deliverable,
   with the compliance matrix included inside it.

Steps 1 and 2 are handled automatically by the platform — when you open
the `.requirements.json` file under `out/requirements-analysis/` for the
first time, the platform parses the PDF and extracts EARS requirements.
The Coverage matrix view in the sidebar takes you straight there.

Steps 4 and 5 are handled by two subagents shipped with this project:
**Draft responses** and **Export deliverable** in the sidebar.

## Where to put things

| Folder | What it holds |
|---|---|
| `source/` | The customer's requirements PDF (and any clarifications or annexes). |
| `knowledge/past-deliverables/` | Markdown files from prior projects that the drafter will pull from. The more you put in here, the better the drafts. |
| `target/` | The outline of the final deliverable, in `deliverable-template.md`. The exporter will write the finished file next to it. |
| `progress/tracking.md` | The per-requirement status. Owned by **you** — the agent never writes here. |
| `out/requirements-analysis/` | The extracted requirements as JSON. The Coverage matrix view in the sidebar opens this. |
| `out/drafts/` | One Markdown file per drafted response. |

## The one rule that matters

Only **you** mark a requirement Done. The drafter writes proposals to
`out/drafts/`. The parser and the EARS extractor fill `out/requirements-analysis/`.
The exporter assembles what's already Done. None of them changes
`progress/tracking.md`. The transition from ToDo to Done is your
signature — the click you make in the Coverage matrix view.

That restraint is on purpose. A specification is a set of promises, and
those belong to a person, not an agent.

## How to drive the workflow

1. Drop the customer's PDF into `source/`.
2. Open the **Coverage matrix** menu item in the sidebar (or
   double-click the `.requirements.json` file once it exists). If the JSON
   does not exist yet, the platform calls the EARS extraction
   automatically.
3. For each row in the Coverage matrix: mark it **ToDo**, **Done**, or
   **Ignore**.
4. Click **Draft responses** in the sidebar — the drafter writes a
   `.md` file in `out/drafts/` for every requirement that is ToDo,
   citing the past deliverable it pulled from.
5. Read each draft. Refine it in chat if you want. When you're happy,
   change the row from ToDo to Done in the Coverage matrix.
6. When every row is Done or Ignore, click **Export deliverable**. If
   anything is still ToDo, the exporter refuses to run and tells you which
   rows are blocking.

## What's already here

This project arrives with a worked example so the views are not empty
on first open:

- `source/sample-customer-requirements.pdf` — a synthetic ~40-requirement
  procurement document for a **525 kV / 2 GW HVDC converter station**
  (onshore terminal of an offshore wind connection, issued by a German
  TSO). Topics cover AC/DC interfaces, MMC topology, performance and
  availability, protection and control (IEC 61850, IEC 62271,
  IEC 60076), reporting, and lifecycle. It contains three deliberately
  tricky cases the demo is built around:
  - a requirement that pulls in an external standard by reference
    (IEC 62443-3-3 cybersecurity controls — REQ-017);
  - an Annex C that quietly overrides four clauses in the main body
    (alarm latency 500 → 250 ms, redispatch headroom, fault-ride-through
    with Liquidated Damages, incident response in/out of operating
    hours);
  - an ambiguous "shall provide adequate …" requirement with no
    measurable criterion (REQ-030, §9.1 reactive-power support).
- `out/requirements-analysis/sample-customer-requirements.requirements.json` —
  the extracted requirements as the EARS pipeline produced them
  (40 requirements, 14 sections, 2 ambiguity flags, 4 Annex C
  contradictions surfaced).
- `progress/tracking.md` — pre-populated with a mix of Done, ToDo, and
  Ignore so the Coverage matrix shows a partially-worked project.
- `out/drafts/` — four drafted responses with citations into the
  reference deliverable: `REQ-007.md` (DC-voltage regulation),
  `REQ-012.md` (single-submodule ride-through), `REQ-018.md`
  (tamper-evident records), and `REQ-024.md` (alarm latency under
  Annex C.1 — **written in German**, demonstrating the
  translated-reuse-of-English-past-material pattern).
- `knowledge/past-deliverables/reference-deliverable.md` — a prior
  HVDC converter station delivery (DolWin-X, 320 kV / 900 MW) the
  drafter pulls from.
- `target/deliverable-template.md` — the outline of the final deliverable.

To start from scratch on the same PDF: delete the `out/` folder and the
Coverage matrix will rebuild it on next open. To use a different
document: delete everything in `source/`, drop your PDF in, and start at
step 1 above.
