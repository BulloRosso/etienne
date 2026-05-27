/**
 * Wiki pages for the requirements-hv seed project.
 *
 * Eighteen pages organised around the article's narrative: the NU-525-Lot-3
 * source pack, the 5-step pipeline (parse / normalize / structure /
 * transform / export), EARS, the FRT-250ms load-bearing example, the late-
 * clarification override, the firm's reuse base, the coverage dashboard,
 * and the agent's three operating rules.
 *
 * Cross-links use `[label](../topics/<slug>.md)` so wiki-add.ts auto-creates
 * backlinks and stub pages where the target does not yet exist.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stable' | 'draft' | 'stub';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
  classification?: 'public' | 'private' | 'secret';
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // -- Bid + source pack overview ---------------------------------------
  {
    title: 'NU-525-Lot-3 bid overview',
    slug: 'nu-525-lot-3-bid-overview',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['bid', 'overview'],
    mission_relevance: 1.0,
    body: `# NU-525-Lot-3 bid overview

**Customer:** Nordseeübertragungs-Netz GmbH (NSÜN) — stylised North-Sea TSO.
**Scope:** Onshore end of a 525 kV / 2 GW HVDC converter station, landing
point of a North Sea offshore-wind connection.
**Source language:** German. **Deliverable language:** German.
**Reuse-base language:** English.

## Source-document stack
~900 pages across:

- [Volume 0 — General conditions](../sources/source-volume-0-general-conditions.md)
- [Volume 1 — Functional specification](../sources/source-volume-1-functional-spec.md)
- [Volume 2 — Annex A: Electrical performance](../sources/source-volume-2-annex-a-electrical-performance.md)
- [Volume 3 — Annex B: Protection & control](../sources/source-volume-3-annex-b-protection-control.md)
- [Volume 4 — Annex C: Harmonics & power-quality limits](../sources/source-volume-4-annex-c-harmonics.md)
- [Volume 5 — Annex D-F: Auxiliaries, cooling, civil](../sources/source-volume-5-annex-def-auxiliaries.md)
- [Volume 6 — Grid-code compliance volume](../sources/source-volume-6-grid-code.md)
- [Late clarifications memo (2026-04-18)](../sources/source-late-clarifications-2026-04-18.md)

The late clarifications memo arrived **after** the bidders'-questions window
closed and quietly amended several dozen clauses in Volumes 1–4. See
[late-clarification overrides](../topics/late-clarification-overrides.md).

## Submission gate
Coverage matrix must be 100% *committed / deviation / clarify* by the
proposal desk's internal commit-gate (see [coverage states + gates
](../topics/coverage-states-and-gates.md)).
`,
  },

  // -- Pipeline (5 pages) ------------------------------------------------
  {
    title: 'Pipeline — Parse',
    slug: 'pipeline-parse',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'parse'],
    mission_relevance: 1.0,
    body: `# Pipeline — Parse

Refuse to treat the requirements document as one blob. Split each volume
into segments and classify them:

- **Requirement** — contains a normative *shall / muss / ist auszulegen*.
- **Definition** — a term or symbol used elsewhere.
- **Context** — narrative; not normative on its own.
- **Standard reference** — pulls in sub-requirements from an external
  standard (IEC 62271, IEC 61850, IEC 60076, EU NC-HVDC, BNetzA-TAB-HS).
- **Late-clarification override** — amends a clause already in scope.
  Tracked as a separate edge; see [late-clarification overrides
  ](../topics/late-clarification-overrides.md).

Anything the parser cannot classify confidently is **flagged for a human,
not dropped**. The pile is too big for "best-effort" silent loss.
`,
  },
  {
    title: 'Pipeline — Normalize (EARS)',
    slug: 'pipeline-normalize-ears',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'normalize', 'ears'],
    mission_relevance: 1.0,
    body: `# Pipeline — Normalize (EARS)

Rewrite messy source paragraphs into single, numbered, **atomic** EARS
requirements. EARS — *Easy Approach to Requirements Syntax* — was developed
by Mavin et al. at Rolls-Royce (IEEE RE 2009) for high-stakes airworthiness
domains. It constrains a requirement into a small set of patterns:

- **Ubiquitous:** *The converter shall <do thing>.*
- **Event-driven:** *When <trigger>, the converter shall <do thing>.*
- **State-driven:** *While <state>, the converter shall <do thing>.*
- **Unwanted behaviour:** *If <condition>, then the converter shall <do thing>.*
- **Optional feature:** *Where <feature is present>, the converter shall <do thing>.*

A paragraph that smuggled in three obligations becomes three numbered
requirements (REQ-247.a / REQ-247.b / REQ-247.c). See the
[FRT-250ms case study](../topics/case-frt-250ms.md) for what missing one
costs.

## Restraint
When the source is genuinely ambiguous — *"the converter shall provide
adequate reactive-power support"*, no setpoint, no operating range — the
agent does **not** invent a number. It surfaces a *clarify* flag and the
gap moves to the engineer's queue. Inventing measurable criteria to make
ambiguity look answered is how disputes happen at site-acceptance.
`,
  },
  {
    title: 'Pipeline — Structure (coverage matrix)',
    slug: 'pipeline-structure-coverage',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'structure', 'coverage'],
    mission_relevance: 1.0,
    body: `# Pipeline — Structure (coverage matrix)

With a clean list of EARS requirements, lay out the skeleton of the
deliverable — chapters of the technical specification and the compliance
matrix — and map every requirement to a slot.

The result is the [coverage dashboard
](../topics/coverage-dashboard.md): every requirement is a row, every row
has a state. **A requirement with no row cannot exist.** That is the
guarantee the structure step makes; everything downstream depends on it.

State machine:

\`\`\`
open  →  drafted  →  reviewed  →  committed
                  ↘  deviation  ↗
                  ↘  clarify   ↗
\`\`\`

See [coverage states + gates](../topics/coverage-states-and-gates.md).
`,
  },
  {
    title: 'Pipeline — Transform (draft + translate)',
    slug: 'pipeline-transform-draft',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'transform', 'reuse'],
    mission_relevance: 1.0,
    body: `# Pipeline — Transform (draft + translate)

For each requirement, the agent:

1. Searches the [reuse base](../topics/reuse-base.md) of past technical
   specifications and type-test reports.
2. Pulls the passage that answered the same kind of requirement before.
3. Adapts it to this requirement's specifics (setpoints, ranges,
   timing).
4. Translates the result from English into German.
5. Marks it **drafted, awaiting decision** — not *answered*.

The engineer reads source and draft side by side, sees which past spec
the draft was pulled from, and makes the call: *comply / comply partially
/ deviation / clarify*. The agent has done the retrieval, adaptation,
and translation. The engineer keeps authorship of the promise.

The principal engineer who "just knows" you answer fault-ride-through by
referencing the Northshore-2022 MMC control scheme — that judgment is
captured in the reuse base and now reusable by anyone on the team.
`,
  },
  {
    title: 'Pipeline — Export',
    slug: 'pipeline-export',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'export'],
    mission_relevance: 0.9,
    body: `# Pipeline — Export

Render the approved structure into the customer's required format — the
contractor's own Word/PDF specification template — with the compliance
matrix included as the customer requested.

**Traceability survives the export.** Every committed section in the
exported specification is stamped with the requirement IDs it answers.
The compliance matrix ships *inside* the deliverable. A coverage matrix
that lives only inside the tool is worthless the moment the spec becomes
a PDF on the customer's desk; the same way a finding that lived only in
a chat thread was as good as lost (Part 1, defects dashboard).

## Hard rule
Nothing in state *open* or *drafted* exports. The export step refuses to
run if any row is not *committed / deviation / clarify*.
`,
  },

  // -- The article's two load-bearing examples ---------------------------
  {
    title: 'Case study — FRT-250ms (REQ-247)',
    slug: 'case-frt-250ms',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['case-study', 'frt', 'req-247'],
    mission_relevance: 1.0,
    body: `# Case study — FRT-250ms (REQ-247)

The single "shall" the proposal team almost missed on the last project.

## The source clause
**Volume 2, Annex A, §7.4.3, footnote 2**, sitting under a table of
harmonic limits. Translated and EARS-normalised:

> **REQ-247.** *When a three-phase fully-depressed-voltage fault occurs
> at the converter AC bus, the converter shall remain connected and
> resume pre-fault active-power output within 250 ms.*

A single sentence under a harmonics table. A naïve control response
would trip the station offline — non-compliant, blocking, awarded with
liquidated damages if discovered after award.

## What it depends on
- The [MMC control scheme](../topics/mmc-control-scheme.md) on the
  Northshore-2022 project rides through this exact profile (type-test
  evidence: [northshore-2022-frt-type-test
  ](../sources/source-northshore-2022-frt-type-test.md)).
- The protection philosophy in [Annex B
  ](../sources/source-volume-3-annex-b-protection-control.md) interacts
  with the FRT setpoint; both must commit consistently.

## State
*Drafted* by the agent (reuse from Northshore-2022). Awaiting principal-
engineer decision. See [coverage dashboard](../topics/coverage-dashboard.md).
`,
  },
  {
    title: 'Late-clarification overrides',
    slug: 'late-clarification-overrides',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['overrides', 'clarifications', 'risk'],
    mission_relevance: 1.0,
    body: `# Late-clarification overrides

The [clarifications memo (2026-04-18)
](../sources/source-late-clarifications-2026-04-18.md) arrived after the
bidders'-questions window closed. It silently amended **41 clauses**
across Volumes 1–4.

The agent does not merge override text into the original clause. Each
override is tracked as a **separate node** in the knowledge graph with
an explicit \`overrides\` edge to the clause it amends — so the engineer
reading REQ-184 sees both the original obligation and the amendment, and
the export carries the amended text *with the override provenance
attached*.

## The dangerous override (REQ-184)
The original Volume 1 §4.2 set reactive-power range at ±0.95 leading/
lagging at full active output. The clarifications memo amended this to
**±0.90 leading / ±0.95 lagging at full active output**, citing local
grid-stability requirements. A reuse-based draft pulled from a project
that answered the original ±0.95/±0.95 profile would silently miss the
narrower leading-side range — and a missed range is a missed setpoint
on a binding deliverable.

The agent flags overrides loudly on the [coverage dashboard
](../topics/coverage-dashboard.md): every requirement amended by a late
clarification carries a red **override** chip until the engineer
reviews the amended text on the record.
`,
  },

  // -- Coverage + state machine -----------------------------------------
  {
    title: 'Coverage dashboard',
    slug: 'coverage-dashboard',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['dashboard', 'coverage'],
    mission_relevance: 1.0,
    body: `# Coverage dashboard

The single view where the state of the whole effort is legible without
asking. A lead engineer can open it and answer the only question that
keeps them up: *what have we not addressed yet*. Weeks out, instead of
the morning it is due.

## What it shows
- Every requirement (~1,800 at full scale; ~40 are seeded in the demo).
- Per-row state: *open / drafted / reviewed / committed / deviation /
  clarify*.
- Per-row chips: **override** (amended by late clarification),
  **clarify** (ambiguous, awaiting customer answer),
  **reuse: <source>** (which past spec the draft was pulled from).
- Per-row source location (volume / section / page).
- Aggregate counts by state, by source volume, and by responsible engineer.

## Rendered by
\`out/coverage/current.coverage.json\` — registered against \`.coverage.json\`
in viewerRegistry.jsx (same mechanism as the long-horizon seed's
QuarterlyViewer).
`,
  },
  {
    title: 'Coverage states + gates',
    slug: 'coverage-states-and-gates',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['states', 'gates'],
    mission_relevance: 0.95,
    body: `# Coverage states + gates

## State definitions
- **open** — requirement parsed and normalised; nothing drafted yet.
- **drafted** — the agent has retrieved a reuse passage, adapted, and
  translated it. *No engineer has read it yet.*
- **reviewed** — an engineer has read the draft and the source. May
  still iterate.
- **committed** — explicit decision by a named engineer that this is the
  bid response. Locked.
- **deviation** — the bid will deliberately deviate from the
  requirement. Carries a *deviation rationale* and the commercial
  implication.
- **clarify** — the requirement is ambiguous or contradicted; a
  customer clarification is requested.

## Submission gates
- **G1 — Internal completeness gate (T-30 days):** every requirement has
  a row; zero in *open*.
- **G2 — Engineering review gate (T-14 days):** every row is *reviewed*,
  *committed*, *deviation*, or *clarify*.
- **G3 — Commit gate (T-3 days):** every row is *committed*, *deviation*,
  or *clarify*. Export refuses to run otherwise.

The agent enforces G3: \`pipeline-export\` checks the coverage matrix
before writing the .docx and aborts with a list of non-committed rows
if any remain.
`,
  },

  // -- Reuse base --------------------------------------------------------
  {
    title: 'Reuse base',
    slug: 'reuse-base',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['reuse', 'past-specs'],
    mission_relevance: 0.95,
    body: `# Reuse base

The firm's accumulated engineering content. Each entry is an English-
language passage from a past technical specification or type-test report,
indexed for retrieval by topic + setpoint range + standard.

## Notable reuse sources for this bid
- **[Northshore-2022 — MMC control scheme](../sources/source-northshore-2022-mmc-control.md)**:
  the FRT-250ms reference design.
- **[Northshore-2022 — FRT type-test report
  ](../sources/source-northshore-2022-frt-type-test.md)**: certified
  ride-through of the exact profile in REQ-247.
- **[Capeline-2023 — Protection philosophy
  ](../sources/source-capeline-2023-protection.md)**: pulled for the
  Annex B requirements.
- **[Reefnet-2020 — Harmonic filter design
  ](../sources/source-reefnet-2020-harmonic-filters.md)**: pulled for
  Annex C; **does not** meet NSÜN's stricter THD limits — see
  [reuse mismatch — harmonic filter](../topics/reuse-mismatch-harmonic-filter.md).
- **[Aurora-2024 — Reactive-power capability curve
  ](../sources/source-aurora-2024-reactive-power.md)**: needs adapting
  for the REQ-184 override (±0.90 leading instead of ±0.95).
- **[Internal — German style guide
  ](../sources/source-internal-german-style-guide.md)**: governs the
  translation step (tone, term consistency, normative verb usage).

The reuse base is the captured judgment of the principal engineers — the
ones who "just know" which past project answers a new requirement.
Captured here, it survives them moving on.
`,
  },
  {
    title: 'Reuse mismatch — harmonic filter (Annex C)',
    slug: 'reuse-mismatch-harmonic-filter',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['mismatch', 'annex-c', 'harmonics'],
    mission_relevance: 0.9,
    body: `# Reuse mismatch — harmonic filter (Annex C)

The natural reuse source for the harmonic-filter requirements
(REQ-301 through REQ-308) is the [Reefnet-2020 filter design
](../sources/source-reefnet-2020-harmonic-filters.md), which delivered
**THD ≤ 1.5%** at the PCC.

NSÜN's [Annex C](../sources/source-volume-4-annex-c-harmonics.md)
requires **THD ≤ 0.9%** at the PCC (REQ-303). The Reefnet design does
not meet that limit.

## Implication
Four requirement-responses (REQ-303, REQ-304, REQ-305, REQ-307) that the
agent initially drafted from Reefnet are flagged for **rework with a
re-tuned filter topology**. The current drafts are marked
*reuse-mismatch* on the [coverage dashboard
](../topics/coverage-dashboard.md) and require principal-engineer
intervention — either re-tune from a different past project, or formally
deviate, or clarify whether the THD limit applies at the PCC or at the
converter terminals.

This is the structural analogue of the long-horizon-commitments seed's
*Refuted→cascade*: one upstream reuse decision turns out to be wrong, and
four downstream responses inherit the rework.
`,
  },

  // -- MMC control scheme + the German-language angle -------------------
  {
    title: 'MMC control scheme (reuse from Northshore-2022)',
    slug: 'mmc-control-scheme',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['mmc', 'control', 'reuse'],
    mission_relevance: 0.85,
    body: `# MMC control scheme (reuse from Northshore-2022)

The firm's proven Modular-Multilevel-Converter control scheme, type-
tested on the Northshore-2022 project. Answers, with adaptation:

- **REQ-247** (FRT-250ms) — see [case-frt-250ms
  ](../topics/case-frt-250ms.md).
- **REQ-241–246** (active-power response, ramp limits, oscillation
  damping).
- **REQ-251–254** (reactive-power dynamic response).
- **REQ-261–268** (control-system architecture, redundancy, time
  synchronisation).

## What "reuse with adaptation" means here
The MMC control scheme is a proven design pattern; the setpoints, the
ramp limits, and the timing are project-specific. The agent pulls the
pattern, adapts the numbers from the requirement, and translates the
narrative into German.

The principal engineer reads source + draft side by side and decides.
`,
  },
  {
    title: 'German-language drafting + translation',
    slug: 'german-language-drafting',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['translation', 'german', 'style'],
    mission_relevance: 0.8,
    body: `# German-language drafting + translation

The reuse base is in English. The deliverable is in German. The agent
translates each drafted response, governed by the [internal German
style guide](../sources/source-internal-german-style-guide.md).

Conventions:

- Normative verbs: *muss* (mandatory) / *darf* (permitted) / *sollte*
  (recommended) — never the colloquial *soll*.
- Setpoints in SI with locale-appropriate decimal separator (1,5 MW).
- Standard references are not translated (IEC 62271-302 stays as-is).
- IDs (REQ-247, Annex C §7.4.3) stay as-is.

The agent does **not** post-edit the engineer's committed text. Once a
row is *committed*, the German wording is the engineer's, full stop.

Open question: should setpoint values in deviation rows carry the
English-language original alongside the German rendering? See
[clarify queue](../topics/clarify-queue.md).
`,
  },

  // -- Standards backdrop -----------------------------------------------
  {
    title: 'Standards & regulatory backdrop',
    slug: 'standards-regulatory-backdrop',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'regulatory'],
    mission_relevance: 0.9,
    body: `# Standards & regulatory backdrop

NSÜN's requirements document points heavily into external standards.
Each reference pulls in its own sub-requirements that the agent expands
during the *parse* step.

| Standard | Domain | Why it matters here |
|---|---|---|
| EU Reg. 2016/1447 (NC-HVDC) | Grid connection of HVDC systems | Mandatory compliance for connection |
| BNetzA TAB-HS 2024 | German technical connection conditions | Pulls in country-specific overlays |
| IEC 62271-1 / -302 | High-voltage switchgear | Annex A clauses on AC switchyard |
| IEC 61850 | Substation communications | Annex B clauses on protection & control |
| IEC 60076 (series) | Power transformers | Converter transformers |
| IEC 60633 / 60919 | HVDC terminology + system planning | Glossary + design assumptions |
| IEEE 1547 | (Informative) | Cited once in Annex E; **not normative** for this bid |

A non-compliant station does not energise. Compliance with NC-HVDC and
the TAB-HS overlay is not a nicety — it is the connection prerequisite.
`,
  },

  // -- Coverage dashboard runtime --------------------------------------
  {
    title: 'Clarify queue',
    slug: 'clarify-queue',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['clarify', 'queue'],
    mission_relevance: 0.85,
    body: `# Clarify queue

Requirements the agent refused to draft, because the source is genuinely
ambiguous and inventing a measurable criterion would create a
non-defensible promise.

The clarify queue ships as a separate exhibit to the customer ahead of
the submission, with each item phrased as a specific question. The
[FRT-250ms case](../topics/case-frt-250ms.md) is *not* in the clarify
queue — it has a measurable acceptance criterion in the source. The
*"adequate reactive-power support"* case **is** — no setpoint, no
operating range, not draftable as a binding promise.

Seeded clarify-queue items at demo time:

- **REQ-119** — *"the station shall be designed for adequate seismic
  resilience"* — no zone classification cited; clarify which IBC zone
  or DIN/EN 1998-1 ground type applies.
- **REQ-376** — translation/scope ambiguity for *"Hilfsbetriebe der
  Reservelinie"* (auxiliaries of the reserve line); clarify whether the
  cooling skid auxiliaries are included.
- **REQ-411** — implicit contradiction with the late-clarifications
  memo; clarify which prevails.
`,
  },

  // -- Operating rules (the agent's restraint) --------------------------
  {
    title: "Agent operating rule — no silent commitment",
    slug: 'rule-no-silent-commitment',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'restraint'],
    mission_relevance: 1.0,
    body: `# Operating rule — no silent commitment

A requirement moves to *committed* **only** through an explicit human
decision, one at a time or in reviewed batches. There is no
"auto-answer all" button. There is no batch transition that does not
record the deciding engineer.

The coverage view shows at all times how many entries are the agent's
drafts versus engineers' choices. A system that drafts everything has
to make sure a human still decides everything. That asymmetry is the
whole point.

The dangerous override (REQ-184, narrowed reactive-power range from
±0.95 to ±0.90 leading) demonstrates *why*: a drafted-from-reuse
response that gets bulk-committed without a human noticing the override
edge is the failure mode that costs the bid.
`,
  },
  {
    title: 'Agent operating rule — flag, do not invent',
    slug: 'rule-flag-do-not-invent',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'restraint', 'ears'],
    mission_relevance: 1.0,
    body: `# Operating rule — flag, do not invent

When a requirement is genuinely ambiguous, the agent flags it for the
[clarify queue](../topics/clarify-queue.md). It does not invent a
setpoint to make the row look answered.

An invented measurable criterion creates a promise nobody read. The
agent's value in this pipeline is that it *makes ambiguity visible*,
not that it papers over it. The [normalize step
](../topics/pipeline-normalize-ears.md) decides which side of that line
each source clause falls on.
`,
  },
  // -- Team (single source of truth for owner initials → engineer) -------
  //
  // The compliance-matrix previewer looks this page up by slug
  // (`team`, bucket `topics`) via WikiService.getPage and resolves the
  // "Initials" column to render owner cells. Rows whose
  // `responsibleEngineer` kg-id is not represented here fall back to the
  // raw id and get a "no team entry" hint chip in the cockpit.
  {
    title: 'Team',
    slug: 'team',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['team', 'owners'],
    mission_relevance: 1.0,
    body: `# Team

The bid team. The [compliance matrix previewer](../topics/coverage-dashboard.md)
resolves owner cells against this page — edit the table to change which
initials the cockpit recognises. One row per kg engineer-id keeps the
Owner filter free of duplicates.

| Initials | Engineer id              | Name              | Role                                                 | Areas                                  |
|----------|--------------------------|-------------------|------------------------------------------------------|----------------------------------------|
| E1       | engineer-anke-vogt       | Engineer One      | principal engineer — controls & protection           | REQ-241..268, FRT-250ms                |
| E2       | engineer-bernd-haag      | Engineer Two      | principal engineer — power-quality                   | REQ-301..308 (Annex C), harmonic filter|
| E3       | engineer-clara-mueller   | Engineer Three    | lead engineer — primary equipment                    | REQ-101..184 (Volume 1 + Annex A)      |
| E4       | engineer-dirk-stein      | Engineer Four     | proposal-desk lead                                   | coverage + commit-gate G3              |

## How the cockpit uses this

- Owner column on every requirement row resolves \`responsibleEngineer\`
  (a kg entity id like \`engineer-anke-vogt\`) → the **Initials** column
  here. The header on the matrix shows the initials; the tooltip on hover
  shows name + role.
- The Owner filter in the left rail enumerates this table.
- Removing a row from this table does not remove the engineer from the
  knowledge graph — it only stops the cockpit from resolving them. Rows
  whose owner cannot be resolved render with a "no team entry" hint chip.
- If you want one real person to own the workload of several fictional
  engineers, put a single row whose **Engineer id** cell lists multiple
  ids separated by commas. The cockpit's parser handles that — but each
  id still surfaces once in the Owner filter dropdown.
`,
  },

  // -- Planned-response pages (reuse content for committed/drafted rows) -
  //
  // Convention: \`planned-response/<req-id-lowercase>\`. The cockpit links
  // every CoverageRow to its slug; clicking a row in the matrix shows the
  // page in the right pane via WikiService.getPage. Pages for rows that
  // haven't been drafted yet are not seeded — the "Create planned
  // response" button in the cockpit calls create_planned_response_page to
  // stub them on first click.
  {
    title: 'Planned response — REQ-101 (rated DC voltage)',
    slug: 'planned-response/req-101',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-101', 'reuse-northshore-2022'],
    mission_relevance: 0.9,
    body: `# Planned response — REQ-101

> **Requirement (EARS):** The converter station shall be designed for a
> continuous rated DC voltage of ±525 kV.
> [[doc:documents/source-volume-1-functional-spec-excerpt.md]]

## Response (DE)

Die Umrichterstation wird für eine kontinuierliche Nenn-DC-Spannung von
**±525 kV** ausgelegt. Die Auslegung folgt der bewährten MMC-Topologie aus
dem Northshore-2022-Projekt und ist für den Dauerbetrieb am 525-kV-DC-Bus
qualifiziert.

## Reuse provenance

Drafted from the [Northshore-2022 MMC control scheme
](../topics/mmc-control-scheme.md). The rated-voltage section reuses the
type-tested envelope of the Northshore HVDC link bipoles (operational
since 2022).

## Status

Committed. Locked by C. Müller; carries no override or mismatch chip.
`,
  },
  {
    title: 'Planned response — REQ-184 (reactive-power range, amended)',
    slug: 'planned-response/req-184',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['planned-response', 'req-184', 'override', 'reuse-aurora-2024'],
    mission_relevance: 1.0,
    body: `# Planned response — REQ-184

> **Requirement (EARS, amended):** The converter shall provide reactive-power
> range of **±0.90 leading / ±0.95 lagging** at full active-power output,
> as amended by the 2026-04-18 clarifications memo.
> [[doc:documents/source-volume-1-functional-spec-excerpt.md]]
> [[doc:documents/source-late-clarifications-2026-04-18.md]]

## Response (DE) — DRAFT, awaiting principal-engineer decision

Der Umrichter stellt am Punkt des Netzanschlusses einen Blindleistungs-
bereich von **±0,90 voreilend / ±0,95 nacheilend** bei voller
Wirkleistungsabgabe bereit. Die Auslegung berücksichtigt die enger
gefasste voreilende Grenze aus der Klarstellungsmitteilung vom
2026-04-18.

## Reuse provenance — and the override edge

Drafted from the [Aurora-2024 reactive-power capability curve
](../topics/reuse-base.md). Aurora-2024 answered the **original**
±0.95/±0.95 envelope; the amended ±0.90 leading limit needs the
capability curve re-cut. See [late-clarification overrides
](../topics/late-clarification-overrides.md).

## What still needs to happen

- Re-cut the PQ envelope at ±0.90 leading; produce updated capability
  plot and verify thermal envelope at the new operating boundary.
- Confirm protection-coordination interaction at the narrowed
  leading-side limit.
- C. Müller signs off; row moves \`drafted → reviewed → committed\`.
`,
  },
  {
    title: 'Planned response — REQ-247 (FRT-250ms)',
    slug: 'planned-response/req-247',
    bucket: 'topics',
    status: 'draft',
    confidence: 'high',
    tags: ['planned-response', 'req-247', 'frt', 'load-bearing', 'reuse-northshore-2022'],
    mission_relevance: 1.0,
    body: `# Planned response — REQ-247

> **Requirement (EARS):** When a three-phase fully-depressed-voltage fault
> occurs at the converter AC bus, the converter shall remain connected
> and resume pre-fault active-power output within **250 ms**.
> [[doc:documents/source-volume-2-annex-a-electrical-performance-excerpt.md]]

## Response (DE) — DRAFT

Bei einem dreiphasigen Spannungseinbruch auf null Spannung am
AC-Sammelschienenanschluss bleibt der Umrichter am Netz und führt die
Wirkleistungsabgabe innerhalb von **250 ms** auf den Vorstörwert zurück.
Der Nachweis stützt sich auf das im Northshore-2022-Projekt typgeprüfte
MMC-Regelschema.

## Reuse provenance — type-test evidence on file

- Reference design: [MMC control scheme (Northshore-2022)
  ](../topics/mmc-control-scheme.md).
- Type-test evidence: [northshore-2022-frt-type-test
  ](../sources/source-northshore-2022-frt-type-test.md) — certified
  3-phase fully-depressed-voltage, 250 ms ride-through.

## State

Drafted by the agent (reuse + adaptation + DE translation). Awaiting
A. Vogt's review. Carries the *load-bearing* chip on the
[coverage dashboard](../topics/coverage-dashboard.md).

See also [case-frt-250ms](../topics/case-frt-250ms.md).
`,
  },
  {
    title: 'Planned response — REQ-303 (THD ≤ 0.9% at PCC)',
    slug: 'planned-response/req-303',
    bucket: 'topics',
    status: 'draft',
    confidence: 'low',
    tags: ['planned-response', 'req-303', 'reuse-mismatch', 'load-bearing'],
    mission_relevance: 1.0,
    body: `# Planned response — REQ-303

> **Requirement (EARS):** Total harmonic distortion at the point of common
> coupling shall not exceed **0.9%** at any operating point.
> [[doc:documents/source-volume-4-annex-c-harmonics-excerpt.md]]

## Response (DE) — DRAFT (reuse mismatch, not safe to commit)

Die Gesamtoberschwingungsverzerrung (THD) am Netzanschlusspunkt wird in
allen Betriebspunkten **≤ 0,9 %** gehalten. Hierfür wird die
Filterauslegung gegenüber der Reefnet-2020-Referenz neu abgestimmt; der
Nachweis erfolgt durch Site-Acceptance-Messung gemäss IEC 61000-4-7.

## Reuse provenance — and the cascade

- Initial draft pulled from [Reefnet-2020 harmonic-filter design
  ](../topics/reuse-base.md), which delivered **THD ≤ 1.5 %** — does
  *not* meet NSÜN's 0.9 % limit. See [reuse mismatch — harmonic filter
  ](../topics/reuse-mismatch-harmonic-filter.md).
- Three downstream requirements share the same filter topology and
  inherit the rework: REQ-304, REQ-305, REQ-307. The compliance matrix
  flags all four with the *reuse-mismatch* chip.

## Three paths (no agent recommendation)

1. Re-tune from a different past project's filter topology.
2. Formally deviate; document the rationale and commercial implication.
3. Clarify with the customer whether the THD limit applies at the PCC
   or at the converter terminals.

B. Haag owns the call. Row stays \`drafted\` with the *reuse-mismatch*
chip until the decision is on the record.
`,
  },
  {
    title: 'Planned response — REQ-211 (redundant differential protection)',
    slug: 'planned-response/req-211',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-211', 'reuse-capeline-2023'],
    mission_relevance: 0.85,
    body: `# Planned response — REQ-211

> **Requirement (EARS):** The protection system shall include redundant
> differential protection per IEC 61850-9-2.
> [[doc:documents/source-volume-3-annex-b-protection-control-excerpt.md]]

## Response (DE)

Das Schutzsystem umfasst eine **redundante Differentialschutzfunktion**
gemäss IEC 61850-9-2. Beide Pfade nutzen die Sampled-Value-Topologie
und werden durch unabhängige Merging Units mit getrennten
Zeitsynchronisations-Quellen versorgt.

## Reuse provenance

Drafted from the [Capeline-2023 protection philosophy
](../topics/reuse-base.md). The Capeline reference design implements
the same redundancy pattern and is type-test certified.

## Status

Committed by A. Vogt.
`,
  },
  {
    title: 'Planned response — REQ-601 (NC-HVDC compliance)',
    slug: 'planned-response/req-601',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-601', 'standards', 'nc-hvdc'],
    mission_relevance: 0.85,
    body: `# Planned response — REQ-601

> **Requirement (EARS):** The converter station shall comply with all
> mandatory provisions of EU Regulation 2016/1447 (NC-HVDC).
> [[doc:documents/source-volume-6-grid-code-excerpt.md]]

## Response (DE)

Die Umrichterstation erfüllt alle verbindlichen Anforderungen der
EU-Verordnung 2016/1447 (NC-HVDC). Der Konformitätsnachweis wird in der
[Konformitätsmatrix](../topics/coverage-dashboard.md) abschnittsweise
geführt, mit Verweis auf den jeweiligen Erfüllungsabschnitt des
technischen Pflichtenheftes.

## Status

Committed by D. Stein — load-bearing for the connection-prerequisite.
See [standards & regulatory backdrop
](../topics/standards-regulatory-backdrop.md).
`,
  },

  {
    title: 'Agent operating rule — traceability survives export',
    slug: 'rule-traceability-survives-export',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'export', 'traceability'],
    mission_relevance: 1.0,
    body: `# Operating rule — traceability survives the export

Every committed section in the exported specification carries the
requirement IDs it answers. The compliance matrix ships inside the
deliverable. The link from each engineering promise back to the
requirement that prompted it survives outside the tool — which is
exactly where the design review (and the dispute, if there ever is
one) happens.

A coverage matrix that only lives inside the tool is worthless the
moment the spec becomes a PDF on the customer's desk. The
[export step](../topics/pipeline-export.md) refuses to render a row
that doesn't carry its requirement IDs forward.
`,
  },
];
