/**
 * documentation.md + user-interface.json fixtures for the requirements-hv
 * project.
 *
 * `documentation.md` is written to the project root in step 13 and
 * auto-opened via .etienne/user-interface.json previewDocuments. The five
 * quickActions mirror the article-aligned sidebar menu items in the
 * application-type config — keep both lists in sync if either is edited.
 */

export const USER_INTERFACE_JSON = {
  appBar: {
    title: 'Requirements → Specification (NU-525-Lot-3)',
    fontColor: 'white',
    backgroundColor: '#1e3a8a',
  },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      {
        title: 'Open the coverage dashboard',
        prompt:
          'Open out/coverage/current.coverage.json. Show the per-state counts, the override + reuse-mismatch chips, and which requirements are still blocking which gate. Do not propose state transitions — convene the conversation with the responsible engineers.',
        sortOrder: 1,
      },
      {
        title: 'Which requirements are still open?',
        prompt:
          'List every requirement currently in state "open". For each one, name the source volume + section, the responsible engineer, the gate it is blocking, and any candidate reuse source from the knowledge base. Do not draft yet — surface the queue.',
        sortOrder: 2,
      },
      {
        title: 'Show me the late-clarification overrides',
        prompt:
          'List every requirement amended by the 2026-04-18 late-clarifications memo. For each one, show the original clause text, the amended text, the cited reason, and the responsible engineer. Highlight any row where the current draft was pulled from a reuse passage that answered the ORIGINAL (pre-amendment) clause.',
        sortOrder: 3,
      },
      {
        title: 'Draft a response for the next open requirement',
        prompt:
          'Pick the highest-priority requirement in state "open" (load-bearing first, then by source volume order). Run the transform step: retrieve the matching reuse passage from the knowledge base, adapt it to this requirement\'s specifics, translate the draft into German per the internal style guide, and move the row to "drafted". Do NOT commit. Show me which reuse source you used and what you adapted.',
        sortOrder: 4,
      },
      {
        title: 'Export the current specification',
        prompt:
          'Run the export step on the current coverage matrix. Refuse to render if any row is still in state open / drafted / reviewed and list the blockers with owners. Otherwise render the technical specification + compliance matrix into the customer\'s required Word/PDF template, stamping every section with the requirement IDs it answers and any override edges.',
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
Part 3*: how an agent turns ~900 pages of German grid-connection
requirements into a complete, traceable, German technical specification
— by doing the structured grind no engineer has the patience for, and
committing the company to nothing.

## The bid

Nordseeübertragungs-Netz GmbH (NSÜN) — a stylised North-Sea TSO — is
procuring the onshore end of a **525 kV / 2 GW HVDC converter station**.
The requirements arrive in eight volumes (Volume 0 + six annexes A–F +
Volume 6 grid-code compliance), plus a late-clarifications memo issued
on 2026-04-18 that quietly amended 41 clauses after the bidders'
questions closed.

| | |
|---|---|
| Source language | German |
| Deliverable language | German |
| Reuse-base language | English |
| Pages | ~900 |
| Notional requirements | ~1,800 |
| Demo slice in this workspace | 40 representative requirements |

## The agent's job

A technical specification is a set of **engineering promises**. Whether
to *comply / comply partially / propose alternative / declare deviation /
raise clarification* — these are engineering and commercial commitments
backed by liquidated damages, and they belong to a responsible engineer
who will sign their name under each one.

The agent's job is **not** to make those promises. Its job is the
structured grind that has to happen first:

1. **Parse** the requirements pack — split it into segments, classify
   each (requirement / definition / context / standard reference / late
   clarification override). Anything ambiguous is flagged, not dropped.
2. **Normalize** to single, atomic, numbered EARS requirements (*when /
   while / if-then / where / shall*). The agent does **not** invent a
   measurable criterion to make an ambiguous source look answered.
3. **Structure** the deliverable — chapters of the technical
   specification + compliance matrix; map every requirement to a slot.
4. **Transform** — for each requirement, retrieve a matching passage
   from the reuse base of past English specifications, adapt it, and
   translate into German. **Drafted, not answered.**
5. **Export** — render the approved structure into the customer's
   required Word/PDF format, stamping every section with the requirement
   IDs it answers. **Traceability survives the export.**

## What this workspace contains

| Where | What |
|---|---|
| \`wiki/_meta/mission.md\` | The mission (long form). |
| \`wiki/topics/\` | 18 pages: the 5 pipeline steps, EARS, the load-bearing FRT-250ms case, the late-clarification overrides, the reuse base, the coverage states, the agent's three operating rules. |
| \`documents/\` | ~17 RAG documents: German source-volume excerpts, the clarifications memo, English past-spec excerpts (the reuse base), type-test reports, internal style guide + handover notes. |
| Knowledge graph | ~40 EARS requirements, 8 source volumes, the clarifications memo, 6 reuse sources, 8 standards, 5 named engineers, the customer. Override edges, type-test evidence edges, and reuse-mismatch \`cascadesTo\` edges. |
| \`out/coverage/current.coverage.json\` | The coverage dashboard — every requirement, every state, every chip. Auto-opens in the preview pane. |
| \`.etienne/chat.history-*.jsonl\` | Three sessions: parse-normalize walk-through, late-clarification override on REQ-184, reuse mismatch on the Annex C cluster. |

## The three load-bearing examples

- **REQ-247 (FRT-250ms)** — the single *muss* under a harmonics table in
  Annex A §7.4.3 footnote 2 that the agent surfaces as its own atomic
  requirement. Drafted from the Northshore-2022 MMC control scheme
  (32 ms type-test margin). The kind of clause humans miss at 11 pm.
- **REQ-184 (reactive-power range)** — amended by the 2026-04-18
  clarifications memo from ±0.95/±0.95 to ±0.90 leading / ±0.95 lagging.
  Override edge in the KG; *override* chip on the dashboard. The current
  draft was pulled from Aurora-2024 and answers the **original** profile
  — silent commit would miss the leading-side range.
- **REQ-303 cluster (Annex C, THD ≤ 0.9%)** — Reefnet-2020 delivered
  ≤ 1.5%. The cluster head and three dependents (REQ-304/305/307) carry
  the *reuse-mismatch* chip. Bernd Haag's call: re-tune, deviate, or
  clarify.

## What the agent will not do

- It will not move a row to *committed* on its own. The dashboard shows
  drafted-vs-committed counts at all times. There is no auto-answer-all
  button.
- It will not invent a measurable acceptance criterion for an ambiguous
  source requirement. It flags for the clarify queue instead.
- It will not silently merge a late clarification into the original
  clause. Overrides are tracked as separate KG nodes with their own
  edges.
- It will not export a coverage matrix with rows still in *open /
  drafted / reviewed*. The G3 commit gate is enforced by the export
  step itself.

## Start here

Click **Open the coverage dashboard** in the left rail. Then walk a
single requirement end-to-end — *Why is REQ-247 drafted? Where did the
agent pull the draft from? What is the type-test margin? Who signs?*
The same question, answered visibly in the system, is the entire
point of the article.
`;
