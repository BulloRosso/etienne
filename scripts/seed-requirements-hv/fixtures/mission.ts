/**
 * Mission brief and wiki/_meta/mission.md content for the
 * `requirements-hv` seed project.
 *
 * The project is the worked example for *Agents that help humans decide —
 * Part 3: From 900 pages of grid-code requirements to a binding technical
 * specification.* A German TSO is procuring a 525 kV / 2 GW HVDC converter
 * station; the contractor must return a German technical specification that
 * responds to every requirement, drafted from its English-language past
 * specifications and type-test evidence.
 *
 * Used by:
 *   - POST /api/projects/create (missionBrief body field — short version)
 *   - wiki/_meta/mission.md (long form — every wiki write inherits relevance from this)
 */

export const PROJECT_NAME = 'requirements-hv';

export const MISSION_BRIEF =
  'Turn ~900 pages of German grid-code and functional-specification ' +
  'requirements for a 525 kV / 2 GW HVDC converter station bid into a ' +
  'complete, traceable, German technical specification — by parsing the ' +
  'source pack into atomic EARS requirements, mapping each one to a slot ' +
  'in the deliverable, drafting a response by reusing the firm\'s past ' +
  'English specifications and type-test evidence, and stopping there so a ' +
  'responsible engineer signs every promise. No silent commitments.';

export const MISSION_MD = `# Mission — Requirements → Specification (HVDC bid)

## The project
A German transmission system operator (stylised: **Nordseeübertragungs-Netz GmbH**,
"NSÜN") is procuring the onshore end of a **525 kV / 2 GW HVDC converter
station** — the landing point of an offshore-wind connection in the
North Sea. Internal project name: **NU-525-Lot-3**. The requirements
arrive as a stack of volumes: a functional specification, six technical
annexes (A–F), a grid-code compliance volume, and a set of late
clarifications that quietly amended several dozen clauses after the
bidders' questions closed. Total: **~900 pages, in German.**

The contractor — a multinational EPC — must return a **technical
specification, in German**, that responds to every requirement. The
firm's reusable engineering content (proven MMC control schemes, type-test
reports, protection philosophy) lives in past specifications written in
**English**, on past projects on three continents.

## What the agent is for
A technical specification is a set of **engineering promises**. Whether to
comply, comply partially, propose an alternative, declare a deviation, or
raise a clarification — these are engineering commitments, backed by
liquidated damages on a contract worth several hundred million euros, and
they belong to a **responsible engineer** who will sign their name under
each one.

The agent's job is *not* to make those promises. Its job is the structured
grind that has to happen before a promise can be made well:

1. **Parse** the requirements pack — split it into segments, classify each
   one (requirement / definition / context / standard reference / late
   clarification override). Anything ambiguous is flagged, not dropped.
2. **Normalize** to single, atomic, numbered **EARS** requirements
   (*Easy Approach to Requirements Syntax*: when / while / if-then / where
   / shall). A paragraph that smuggled in three obligations becomes three
   numbered requirements. The agent does **not** invent a number to make
   an ambiguous requirement look answered.
3. **Structure** the deliverable — lay out the chapters of the technical
   specification and the compliance matrix; map every requirement to a
   slot. The result is a coverage view: every requirement is a row, every
   row has a state, nothing can fall through.
4. **Transform** — for each requirement, retrieve the matching reusable
   passage from the firm's past specifications, adapt it to this
   requirement's specifics, and translate the draft into German.
   Drafted, not answered.
5. **Export** — render the approved structure into the customer's required
   format (Word + PDF, with the compliance matrix inside the deliverable),
   stamping every section with the requirement IDs it answers so
   traceability survives outside the tool.

## Hard rules — non-negotiable
- **The agent never commits a response.** A requirement moves to
  *committed* only through an explicit human decision, one at a time or in
  reviewed batches. There is no "auto-answer all" button.
- **The agent never invents a measurable acceptance criterion** to make an
  ambiguous source requirement look answered. Ambiguity is surfaced as a
  *clarify* flag.
- **The agent never silently overrides one requirement with another.**
  Late clarifications that amend earlier clauses are tracked explicitly,
  with a visible override edge in the knowledge graph.
- **Traceability survives the export.** Every committed section in the
  exported specification carries the requirement IDs it answers; the
  compliance matrix ships inside the deliverable.

## Acceptance criteria
- **Completeness**: every requirement in the source pack has a row in
  the coverage matrix; zero requirements with no row at submission.
- **State discipline**: at submission, zero requirements remain in
  *open* or *drafted*; every row is *committed*, *deviation* or
  *clarify*.
- **Provenance**: every *drafted* response cites the past specification
  or type-test report it was pulled from; every *committed* response
  cites the responsible engineer.
- **Override safety**: every late-clarification override is linked to
  the clause it amends; no buried "shall" goes undetected.

## Scope
- The NU-525-Lot-3 functional specification (volumes 0–6), the six
  technical annexes (A–F), the grid-code compliance volume, and the
  late-clarifications memo.
- The firm's internal reuse base of past specifications, type-test
  reports, and delivered designs.
- The deliverable: the contractor's technical specification + compliance
  matrix, in German, in the customer's required format.

## Out of scope
- Commercial pricing, schedule, and risk submissions (separate workstreams).
- Subcontractor selection beyond what each technical clause names.
- Site-acceptance testing (post-award).

## Provenance
Mission set 2026-05-25 by the proposal-desk lead, drawing on the worked
example in Part 3 of *Agents that help humans decide* (the German TSO
HVDC converter station). Update only with an explicit mission-change
decision recorded in the changelog.
`;
