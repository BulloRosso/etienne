/**
 * documentation.md + user-interface.json fixtures for the requirements-hv
 * project.
 *
 * `documentation.md` is written to the project root in step 13 and
 * auto-opened via .etienne/user-interface.json previewDocuments. The five
 * quickActions mirror the article-aligned sidebar menu items in the
 * application-type config — keep both lists in sync if either is edited.
 *
 * Language: German (part of the working wiki). The only English narrative
 * in the seed is .claude/CLAUDE.md (Claude Code's own system prompt) and
 * the inbox/*.docx files (incoming customer specifications).
 */

export const USER_INTERFACE_JSON = {
  appBar: {
    title: 'Anforderungen → Spezifikation (NU-525-Lot-3)',
    fontColor: 'white',
    backgroundColor: '#1e3a8a',
  },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      {
        title: 'Coverage-Dashboard öffnen',
        prompt:
          'Öffne out/compliance/current.compliance.json (das ist die Cockpit-Sicht — sie liest die Coverage-Matrix aus out/coverage/current.coverage.json und das Team aus wiki/topics/team.md serverseitig). Zeige die Zählungen pro Zustand, die Override- und Reuse-Mismatch-Chips und welche Anforderungen noch welches Gate blockieren. Schlage keine Zustandsübergänge vor — moderiere die Diskussion mit den verantwortlichen Ingenieuren.',
        sortOrder: 1,
      },
      {
        title: 'Welche Anforderungen sind noch offen?',
        prompt:
          'Liste jede Anforderung im Zustand "open". Nenne für jede das Quellvolume + den Abschnitt, den verantwortlichen Ingenieur, das von ihr blockierte Gate und etwaige Wiederverwendungskandidaten aus der Wissensbasis. Entwirf noch nicht — oberfläche die Warteschlange.',
        sortOrder: 2,
      },
      {
        title: 'Späte Klarstellungs-Overrides anzeigen',
        prompt:
          'Liste jede Anforderung, die durch das Klarstellungsmemo vom 2026-04-18 geändert wurde. Zeige für jede den Originalklauseltext, den geänderten Text, den zitierten Grund und den verantwortlichen Ingenieur. Hebe Zeilen hervor, in denen der aktuelle Entwurf aus einer Wiederverwendungsstelle gezogen wurde, die die URSPRÜNGLICHE (Vor-Änderungs-) Klausel beantwortet hat.',
        sortOrder: 3,
      },
      {
        title: 'Posteingang prüfen und übersetzen',
        prompt:
          'Prüfe inbox/ auf neue oder geänderte englische Word-Dokumente. Für jedes neue Dokument: extrahiere den Text (office-and-pdf-documents-Skill), übersetze in die Arbeitssprache Deutsch und lege das Ergebnis als documents/source-*-excerpt.md ab. Indiziere die deutschen Dateien im RAG; den Posteingang selbst NICHT indizieren.',
        sortOrder: 4,
      },
      {
        title: 'Aktuelle Spezifikation exportieren',
        prompt:
          'Führe den Exportschritt auf der aktuellen Coverage-Matrix aus. Verweigere das Rendern, wenn eine Zeile noch in open / drafted / reviewed ist, und liste die Blocker mit Inhabern. Andernfalls rendere die technische Spezifikation + Konformitätsmatrix in das vom Kunden geforderte Word/PDF-Template; stemple jeden Abschnitt mit den IDs der beantworteten Anforderungen und etwaigen Override-Kanten; annotiere jede deutsche Antwort mit ihrer englischen Rückübersetzung Seite an Seite.',
        sortOrder: 5,
      },
    ],
    showWelcomeMessage: true,
  },
  previewDocuments: ['documentation.md'],
  autoFilePreviewExtensions: [] as string[],
};

export const DOCUMENTATION_MD = `# Requirements → Specification (NU-525-Lot-3)

This project is the worked example for *Agents that help humans decide —
Part 3*: how an agent turns ~900 pages of English grid-connection
requirements into a complete, traceable German technical specification
— by doing the structured groundwork no engineer has patience for, and
committing the firm to nothing.

## The bid

Nordseeübertragungs-Netz GmbH (NSÜN) — a stylised North-Sea TSO — is
procuring the onshore end of a **525 kV / 2 GW HVDC converter station**.
Requirements arrive in eight volumes (Volume 0 + six annexes A–F +
Volume 6 grid-code compliance), plus a clarifications memo dated
2026-04-18 that quietly amended 41 clauses after the bidder Q&A window
closed.

## Language flow in this workspace

| Area | Language | Location |
|---|---|---|
| Inbox (original specification) | **English** | \`inbox/*.docx\` |
| Working language (in-house translation) | **German** | \`documents/*.md\` |
| Reuse base (past bids) | **German** | \`documents/reuse-*.md\` |
| Wiki, mission, documentation | **English** | \`wiki/\`, \`documentation.md\` |
| Deliverable | **German** | \`out/\` (exported Word/PDF) |
| Export annotation | **English back-translation** side by side | inside the exported Word/PDF |
| Claude Code system prompt | **English** | \`.claude/CLAUDE.md\` |

The inbox \`inbox/\` contains the English Word originals as delivered by
the customer. The in-house translation into the German working language
lives under \`documents/\` as Markdown and is the material the agent
parses, normalises, and retrieves. The RAG index targets
\`documents/\` — \`inbox/\` is **not** indexed.

## The agent's job

A technical specification is a collection of **technical commitments**.
Whether *comply / partially comply / offer alternative / declare
deviation / request clarification* — these are technical and
commercial obligations, backed by penalty clauses, and they belong to
a responsible engineer who puts their name underneath.

The agent's job is **not** to make these commitments. Its job is the
structured groundwork that must be done first:

0. **Translate the inbox** — the English \`inbox/*.docx\` files are
   translated into the German working language and stored as
   \`documents/source-volume-*-excerpt.md\`.
1. **Parse** — split the German requirement stack into segments and
   classify each one (requirement / definition / context / standard
   reference / late-clarification override). Ambiguous content is
   flagged, not discarded.
2. **Normalise** to single, atomic, numbered EARS requirements
   (*when / while / if / where / shall*). The agent **never** invents
   a measurable criterion to make an ambiguous source look answered.
3. **Structure** the deliverable — technical-specification chapters
   + compliance matrix; every requirement gets a slot.
4. **Transform** — for each requirement, retrieve a fitting German
   reuse passage from the past-bid base, adapt it, and render it in
   the house style. **Drafted, not committed.**
5. **Export** — render the approved structure into the customer's
   required Word/PDF; stamp every section with the requirement IDs
   it answers; annotate each German response with its **English
   back-translation side by side**. **Traceability survives the
   export.**

## What this workspace contains

| Where | What |
|---|---|
| \`inbox/*.docx\` | 7 English Word documents: the incoming original customer specification. Not indexed in RAG. |
| \`inbox/PQQ-2026.xlsx\` | The pre-qualification questionnaire — five sheets, ~46 questions. Second RFP in this project. |
| \`wiki/_meta/mission.md\` | The mission (long form, German). |
| \`wiki/topics/\` | Wiki pages: the 5 pipeline steps, EARS, the load-bearing FRT-250 ms case, the late-clarification overrides, the reuse base, the coverage states, the three agent rules, plus the [three ways to author a planned response](wiki/topics/creating-planned-responses.md). |
| \`documents/\` | ~17 RAG documents: German source-volume excerpts, the clarifications memo, German past-bid excerpts (the reuse base), type-test reports, the house-style guide + handover notes. |
| Knowledge graph | ~40 EARS requirements, 8 source volumes, the clarifications memo, 6 reuse sources, 8 standards, 5 named engineers, the customer. Override edges, type-test evidence edges, and reuse-mismatch \`cascadesTo\` edges. |
| \`out/coverage/current.coverage.json\` | The tender coverage dashboard — every requirement, every state, every chip. Opens automatically in the preview pane. |
| \`out/coverage/questionnaire.coverage.json\` | The questionnaire coverage dashboard. |
| \`out/rfps/{main,questionnaire}.json\` | RFP registry — one entry per RFP in the project. |
| \`.etienne/chat.history-*.jsonl\` | Three sessions: parse-normalise pass, late-clarification override on REQ-184, reuse-mismatch on the Annex-C cluster. |

## The three load-bearing examples

- **REQ-247 (FRT-250 ms)** — the single *shall* under a harmonics
  table in Annex A §7.4.3, footnote 2, which the agent surfaces as
  an independent atomic requirement. Drafted from the Northshore-2022
  MMC control scheme (32 ms type-test margin). The kind of clause
  humans miss at 11 pm. Also flagged as a **knockout** — non-compliance
  disqualifies the bid.
- **REQ-184 (reactive-power range)** — amended by the 2026-04-18
  clarifications memo from ±0.95/±0.95 to ±0.90 leading / ±0.95
  lagging. Override edge in the KG; *override* chip on the dashboard.
  The current draft was pulled from Aurora-2024 and answers the
  **original** envelope — silently committing would miss the leading
  range.
- **REQ-303 cluster (Annex C, THD ≤ 0.9 %)** — Reefnet-2020 delivered
  ≤ 1.5 %. The cluster head and three dependents (REQ-304/305/307)
  carry the *reuse-mismatch* chip. Bernd Haag's decision: re-tune,
  deviate, or clarify.

## How wiki topic pages are structured

The canonical template for every per-topic wiki page is
[wiki/topics/team.md](wiki/topics/team.md). The pattern:

1. **Frontmatter** — \`status\`, \`confidence\`, \`tags\`,
   \`mission_relevance\`, \`classification\`.
2. **Title** — \`# <Topic>\`.
3. **Single-paragraph intro** — what the page is and who/what
   consumes it.
4. **The body** — usually a Markdown table when the page is a list
   of items the cockpit resolves by key (like the team table);
   otherwise free prose with cross-references to other wiki pages
   via \`[label](../topics/<slug>.md)\`.
5. **"How the cockpit uses this"** — a short usage section that
   explains which UI element resolves against the page and how
   adding/removing entries affects the cockpit.

Wiki pages produced by \`fixtures/wiki-pages.ts\` already follow
this pattern; this documentation makes the rule explicit.

## What the agent does NOT do

- It never moves a row to *committed* on its own. The dashboard shows
  *drafted vs. committed* counts at all times. There is no
  answer-everything-automatically button.
- It never invents a measurable acceptance criterion for an ambiguous
  source requirement. It flags it for the clarification queue
  instead.
- It never silently merges a late clarification into the original
  clause. Overrides are tracked as separate KG nodes with their own
  edges.
- It never exports a coverage matrix with rows still in *open /
  drafted / reviewed*. The g3 commit gate is enforced by the export
  step itself.

## The cockpit — what you actually do

The coverage dashboard is not a passive report but a workspace. The
order in which a bid manager actually uses it typically looks like
this:

### 1. Top: the **Go / Caution / No-Go** banner

Before you look at anything else, read the banner. It is the answer
to the question *"Is this bid still winnable, or are we burning
time?"*. Three states:

- **Green (GO)** — all minimum requirements met, no overdue gates,
  weighted coverage above the threshold.
- **Amber (CAUTION)** — bid still alive, but blockers exist. E.g.
  *"Weighted coverage 45 % below 60 % past engineering review"* or
  *"3 of 40 mandatory rows have no planned response yet"*.
- **Red (NO-GO)** — a **knockout requirement** (minimum requirement,
  exclusion criterion) is non-compliant. Example in the seed:
  *"1 knockout requirement(s) non-compliant: REQ-247"* — the 250 ms
  FRT clause sits in *drafted*, which the buyer would read as
  "you have not committed to my minimum requirement."

Click the banner to expand the reasons. Every reason has a **Show**
button that filters the matrix below to exactly the responsible
rows — you jump straight to the problem, no search needed.

How to clear a NO-GO: open the named row's kebab menu and pick
**Status → committed** (or *reviewed*, or *clarify* — depending on
whether the draft is already clean, under review, or needs a buyer
clarification first). The banner flips colour immediately.

### 2. Below: the **Award-criteria card** (MEAT scoring)

Expandable. Shows the customer's published scoring matrix —
Price 30 %, Quality 70 % (Q1 Technical 40, Q2 Programme 15, Q3 HSE
10, Q4 References 5). Per sub-criterion you see:

- how many points it carries,
- a small green bar: how much of it is already *committed*.

Clicking a criterion filters the matrix to its rows — you work
focused on *Q1 Technical* rather than scrolling 150 rows.

**Why this matters**: Three drafting hours spent on a 25-point
clause move the score; the same hours on a 1-point clause just
burn time. The card tells you where to look.

### 3. The toolbar — what you find there

- **Search** — full-text over ID, EARS text, source, and notes.
- **Status / Review / Owner** — the standard filters (state, review
  status, responsible engineer).
- **Validation** (only appears when the EARS validator found
  something to flag) — filters to rows with structural problems or
  ambiguity.
- **Weight** — filters by point value: *top-25 %*, *top-50 %*,
  *has-weight*, *mandatory*, *scored*, *optional*, or by a specific
  criterion *Q1 Technical merit (40)* etc.
- **Duplicates** (appears after clustering, see point 7) —
  *canonical-only*, *show-duplicates*, or *all*.
- **Cluster** (button) — kicks off the dedup pass. More in point 7.
- **w** (icon) — toggles the optional Weight column in the table.
  Preference persisted per project.
- **Clear** — reset all filters.

### 4. The matrix itself — what the chips mean

Each row shows the requirement ID, EARS text, source, responsible
engineer, and status. Next to that, small coloured chips:

- **purple *knockout*** — minimum requirement. Non-compliance =
  bid disqualification.
- **amber warning icon** — the EARS validator detected structural
  issues. Hover for the detail list:
  *missing-trigger* (event requirement without a trigger),
  *missing-state* (state requirement without a named state),
  *missing-measurable* (vague words like *adequate*, *sufficient*
  with no number), *vague-modal* (*should ideally*, *where
  appropriate*), *compound-suspected* (two verbs in one
  requirement).
- **blue *from REQ-X*** — this row is an atomic split from an
  originally compound requirement. It can be committed independently
  of its sibling.
- **load-bearing / override / reuse-mismatch** — the day-one chips:
  does this row carry the bid, did the clarifications memo amend
  it, does a reuse passage import a non-conformity?
- **blue *×N*** (cluster chip) — this row is the canonical
  representative of a group of N near-identical rows. Click opens
  a popover with all members verbatim. More in point 7.

### 5. The optional **Weight column**

Toggle it on via the *w* button in the toolbar. Per row you then
see the point value (red ≥ 20, amber ≥ 10) and a small chip with
the priority class: *mandatory* (red), *scored* (blue), *optional*
/ *informational* (grey). Hidden by default because not every
session needs it.

### 6. Per row: the **kebab menu** (right edge, three dots)

This is where actual state changes happen — the agent never makes
them itself.

- **Status → open / drafted / reviewed / committed / deviation /
  clarify** — the only place a row moves toward delivery. The bid
  gate, award card, and footer counts react immediately.
- **Review → pending / in-review / approved / rejected** — the
  orthogonal engineering-review axis.
- **Mark as knockout / Unmark knockout** — flag the row as a
  minimum requirement (or remove the flag if extraction misfired).
- **Open in wiki editor** — opens the row's planned-response wiki
  page for editing.

### 7. **Cluster** — duplicates across volumes

Real tenders repeat the same clause: once in the requirements
document, once in the annex, once in the Q&A addendum. Three rows,
one question. Without dedup, an engineer answers three times.

Press the **Cluster** button in the toolbar. Behind the scenes:

1. The server embeds the EARS text of every row.
2. Rows are grouped by cosine similarity above a conservative
   threshold (0.92).
3. Per group a **canonical** is chosen (the row furthest along —
   *committed > reviewed > drafted > open*); the rest are marked
   as **duplicates**.

The cockpit then shows **canonical rows only** by default and
displays a hint bar: *"N duplicates collapsed — Show all"*. The
canonical row gets a blue **×N** chip; click opens a popover with
every member (full text, state, source section) so you can
visually verify they really mean the same thing.

**Important**: State changes on the canonical are **not
automatically** mirrored onto the duplicates. That's deliberate —
embedding-based clustering can wrongly group *"voltage shall be
525 kV"* and *"voltage shall not exceed 525 kV"*. You decide per
row, deliberately.

### 8. **Multiple RFPs in one project** (RFP picker)

A project can carry more than one tender at once — in this seed:
the **technical tender** (seven DOCX volumes) and the
**pre-qualification questionnaire** (one XLSX file with five
sheets). Both have their own coverage matrix, own award card, own
bid gate.

An **RFP** picker appears in the toolbar as soon as more than one
RFP is registered. Switching resets all filters and loads the
selected RFP's coverage matrix. The export modal automatically
picks the right mode (DOCX comments for the technical tender,
XLSX response column for the questionnaire).

### 9. Right pane — detail of a selected row

Clicking a row opens on the right:

- **Planned response** — click to open the wiki page for reading
  or editing. If none exists: a split button with the
  [three ways to author one](wiki/topics/creating-planned-responses.md)
  (empty stub, from an existing source document, from the knowledge
  base).
- **Source citation** — click opens the source document in the
  preview pane.
- **Clarification candidate** (amber background, only when the row
  is flagged as ambiguous) — a templated question to the buyer,
  ready to copy into the Q&A correspondence.
- **Split-from notice** (when the row came from a compound split)
  — pointer back to the original row.
- **Notes** — free text, saved per row.

### 10. Export

The **Export** button in the cockpit opens a modal that:

- assumes the active RFP (or offers the choice if there is more
  than one),
- offers the matching export modes:
  - *Fresh deliverable* — render the complete specification from
    scratch,
  - *Fill-back annotate* — insert committed responses as Word
    comments into a copy of the original DOCX,
  - *Fill-back replace* — insert committed responses as a styled
    paragraph after the source clause,
  - *Fill-back XLSX* — write committed responses into the Response
    column of the questionnaire workbook.

In all cases the original under \`inbox/\` or \`documents/\` is
**never overwritten** — the output lands in \`out/fill-back/\`.

## Start here

Click **Open the coverage dashboard** in the left rail. Then walk a
single requirement from end to end — *Why is REQ-247 drafted? Where
did the agent pull the draft from? What's the type-test margin? Who
signs?* The same question, answered visibly inside the system, is
the whole point of the article.

If the row you're looking at has no planned response yet, the right
pane shows a split button with the
[three ways to author a planned response
](wiki/topics/creating-planned-responses.md): empty stub, pull from
existing content (documents or wiki), or ask the knowledge base.
`;
