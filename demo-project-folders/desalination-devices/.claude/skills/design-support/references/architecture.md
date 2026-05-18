# design-support — architecture & operating detail

Read once per session. This is the precise contract behind `SKILL.md`.

## 1. KG schema (system of record)

All state lives in the RDF knowledge graph (`kg_*` MCP tools, per-project
Quadstore namespace). Entities have a PascalCase `type` and id
`<typeslug>-<kebab>`; all property values are strings (JSON-encode structured
values).

### Node types & key properties

- **Mission**: `MissionIntent` (`mi-*`), `MissionConstraint` (`mc-*`),
  `MissionNonGoal` (`mng-*`), `MissionAcceptanceCriterion` (`mac-*`),
  `MissionVersion` (`mv-<N>`: `number`, `timestamp`, `rationale`).
- **Working graph**: `Concept, Reference, Sketch, Constraint, OpenQuestion,
  Decision, Risk, Assumption, Evidence, Gap, Whitespot`.
  Common props: `label, body, relevance, focus, relevanceProvenance` (JSON
  `{missionDistance,vectorSim,neighborInherit,asserted}`),
  `focusLastReinforced` (ISO), `status`, `createdAt`, `updatedAt`,
  `attachments` (JSON array of project-relative paths),
  `relevanceDivergenceFlag` ("true"/"false").
- **Hypothesis** adds: `statement, confirmationCriteria, refutationCriteria,
  predictions, workflowId, evidenceWeight` (number 0..1), `confidence`,
  `missionDerived` ("true"/"false"), `workflowHistory` (JSON, set on demote).
- **Test** adds: `kind` (literature|calculation|simulation|prototype|expert|
  market), `cost` (low|medium|high), `bearing` (low|medium|high),
  `testStatus` (planned|in-progress|complete).
- **CascadeReport**: `body` (the scoped revision list), `reviewStatus` (JSON
  map `{itemId: pending|reviewed|revised|dismissed}`), `createdAt`.
- **DerivationTriage**: `missionVersion`, `surfaced` (JSON), `taken` (JSON),
  `dismissed` (JSON), `createdAt`.

### Edge predicates (`kg_create_relationship`)

`supports, contradicts, refines, blocks, addresses, respectedBy, inspiredBy,
derivedFrom, mitigates` — working-graph relations.
`servesMission` — every non-mission node → ≥1 mission node (REQ-22).
`versionOf` — mission node → its `MissionVersion`.
`entails` — Hypothesis → Hypothesis.
`dependsOn` — Decision → Hypothesis.
`testedBy` — Hypothesis → Test.
`evidenceFor` — Evidence → Hypothesis (props: `strength` 0..1, `direction`
support|refute).
`cascadeOf` — CascadeReport → Hypothesis.
`supersededBy` — Hypothesis → Hypothesis.

### Critical KG behavior

`kg_update_entity` **deletes then recreates** the entity, dropping any property
not passed and orphaning nothing but losing the entity's own triples. Therefore:
always pass the **full** property set, and after any update **re-assert every
outgoing relationship** with `kg_create_relationship`. Verify edges still resolve
after an update.

## 2. Relevance (REQ-6, REQ-8)

Each node's `relevance` is a weighted blend; **each component is preserved** in
`relevanceProvenance`, never collapsed:

```
missionDistance  = 1 / (1 + shortest_path_hops(node → nearest Mission* node
                                                 over servesMission/addresses/refines))
vectorSim        = max cosine(kg_search_document(node.body), mission text)   # 0..1
neighborInherit  = mean(relevance of nodes linked by supports|refines, depth 1)
asserted         = engineer-set value, else null

derived  = wMission*missionDistance + wVector*vectorSim + wNeighbor*neighborInherit
relevance = (asserted != null) ? asserted : derived
relevanceDivergenceFlag = (asserted != null && |asserted - derived| > divergenceThreshold)
```

Weights `wMission,wVector,wNeighbor` and `divergenceThreshold` are in
`config.json`. Recompute on: node add, mission edit (all nodes), curator pass.

## 3. Focus (REQ-7) — decay + conservation invariant

```
on interaction with node or its depth-1 neighbor:  focus = 1.0; focusLastReinforced = now
decay (curator):  raw_i = focus_i * exp(-Δt_days / focusTau)
renormalize:      focus_i = raw_i * (focusBudget / Σ raw)        # Σ focus == focusBudget
```

`focusTau` and `focusBudget` are in `config.json`. The conservation invariant
(`Σ focus ≈ focusBudget` within `focusBudgetTolerance`) is asserted by
`integration-ds-focus-budget.test.ts`.

## 4. Hypothesis lifecycle

State machine = `references/hypothesis-machine.json` (XState v5 config consumed
by `workflow_create`). **The engine does not evaluate guards** — every guard
below is enforced inside the state's `onEntry` prompt
(`references/hyp-<state>.prompt`), which reads the Hypothesis KG node and only
fires the advancing `workflow_send_event` when the guard holds; otherwise it
takes its explicit "park and wait" branch.

| State | onEntry side-effect | Guard before advancing | Advancing event(s) |
|---|---|---|---|
| `proposed` | synthesizer asks engineer for confirmation + refutation criteria | both criteria non-empty on the node | `SHARPEN` |
| `sharpened` | generate a `Test` queue (KG Test nodes varying kind/cost/bearing), `testedBy` edges | ≥1 Test `planned` or `in-progress` | `START_TEST` |
| `under_test` | enqueue with researcher (pursue low-cost Tests); critic falsification probes; accumulate `Evidence` w/ `evidenceFor(strength,direction)`; recompute `evidenceWeight` | evidenceWeight crosses `evidenceLowThreshold` (sign → which) ; OR curator time-based | `PROVISIONAL_SUPPORT` / `PROVISIONAL_REFUTE` / `STALL` |
| `provisional_support` | (leaning recorded) | engineer confirm OR evidenceWeight ≥ `evidenceHighThreshold` | `CONFIRM_SUPPORT` |
| `provisional_refute` | critic annotates `dependsOn` Decisions "support weakening" (no invalidation) | engineer confirm OR evidenceWeight ≤ `-evidenceHighThreshold` | `CONFIRM_REFUTE` |
| `stalled` | add to next review-session offer with the specific question "commit to a real test, or demote?" | engineer choice | `RESUME` (→under_test) / `DEMOTE` |
| `supported` (final) | synthesizer de-hedges wiki language for claims that `dependsOn` this | — | — |
| `refuted` (final) | **cascade** (see below) | — | — |
| `demoted` (final) | convert Hypothesis→`Assumption` (kg_update_entity full props; preserve provenance string "hypothesis from <d1> until <d2>, not pursued because <reason>"; store `workflowHistory`) | — | — |
| `superseded` (final) | create replacement Hypothesis in `proposed` inheriting links (copy edges + `supersededBy`); close original | — | — |

`DEMOTE` and `SUPERSEDE` are available from **every** active state
(proposed/sharpened/under_test/provisional_*/stalled), not just stalled.

### Cascade on `refuted` (keystone — `hyp-refuted.prompt`)

1. Create `CascadeReport` node `cascade-<hyp>` with `cascadeOf`→Hypothesis.
2. Enumerate and list in its `body`: every Decision with `dependsOn`→H; every
   Hypothesis with `entails`-from-H (i.e., H entails them); every wiki section
   weighted heavily by H (heuristic: backlinks to H's cluster).
3. For each entailed Hypothesis: `workflow_send_event(<its workflowId>, REOPEN)`
   — typically moves `provisional_support → under_test`. If the direct call
   fails, publish via the event bus path (an event rule maps
   `workflow/status/transitioned` → `workflow_event REOPEN`).
4. Initialize `reviewStatus` JSON with every affected itemId = `pending`.
5. If `missionDerived == "true"`: create `Gap` `gap-mission-revision-<hyp>` and
   write a mission-revision prompt into the report ("claim X refuted; mission
   elements A,B,C affected").

## 5. Mission-derivation meta-workflow

`references/mission-derivation-machine.json`. Singleton id `mission-derivation`.
`closed —MISSION_EDITED→ pending_derivation` (onEntry: scan Mission* nodes
changed since last `MissionVersion`, propose candidate hypotheses into the
report) `→ triage` (onEntry: present each candidate; per candidate the engineer
picks sharpen → new Hypothesis workflow in `proposed` inheriting the mission
links | demote → create `Assumption` directly | dismiss → archive) `→ closed`.
Every pass writes a `DerivationTriage` node bound to the new `MissionVersion`.

## 6. Status report

Build from `references/report-template.md`. Hypotheses section = `workflow_list`
grouped by `currentState`. Cascade reports = all `CascadeReport` nodes since the
prior snapshot, rendered with their `reviewStatus`. Confidence dashboard signals,
each printed with its inputs:

- `decisions:openQuestions` = count(Decision)/count(OpenQuestion).
- `assumption:evidence on load-bearing Decisions` = for Decisions with
  relevance ≥ `loadBearingRelevance`: Σ Assumption-supports vs Σ Evidence-supports.
- `evidence recency` = median age of newest Evidence on high-relevance Decisions.
- `mission change rate` = MissionVersions in trailing `missionRateWindowDays`.
- `load-bearing decisions on open hypotheses` = count(Decision `dependsOn`
  Hypothesis whose workflow state ∉ {supported,refuted,demoted,superseded}).

External filter (declarative): remove every `Whitespot`, every critic adversarial
/ speculative item; reframe each `Gap` line as "area under active investigation";
keep all Decisions, Evidence, and the full confidence dashboard.

## 7. Failure & loop safety

Every `onEntry` prompt: if its guard is not satisfied, take the "do nothing,
wait" branch (no `workflow_send_event`). The engine dedups concurrent entry
actions per state, so a parked state will not re-fire. Cross-instance `REOPEN`
must be idempotent (re-entering `under_test` from `provisional_*` is safe).
