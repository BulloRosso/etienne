/**
 * Design-support typed graph for the long-horizon-commitments project.
 *
 * Wire mapping (same routes as kg.ts):
 *   POST :project/entities       { id, type, properties }
 *   POST :project/relationships  { subject, predicate, object, properties? }
 *
 * KnowledgeGraphService restricts wire `type` to Person|Company|Product|Document.
 * Real design-support type sits in `properties.dsType`. We keep wire type as
 * `Document` for all design-support nodes.
 *
 * Each seeded hypothesis is created as a node here; the seed script then
 * `workflow_create`s a workflow per hypothesis and advances it to the
 * TARGET STATE below via workflow_send_event so onEntry side-effects fire
 * — including one Refuted-with-cascade (hypothesis-eua-price-stable) and
 * one mission-derived (hypothesis-meridian-off-strategy).
 */

export interface DsEntityDraft {
  id: string;
  type: 'Document';
  properties: Record<string, string>;
}

export interface DsRelationshipDraft {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, string>;
}

const NOW = '2026-05-24T09:00:00Z';

const node = (
  id: string,
  dsType: string,
  label: string,
  extra: Record<string, string> = {},
): DsEntityDraft => ({
  id,
  type: 'Document',
  properties: { dsType, label, createdAt: NOW, updatedAt: NOW, ...extra },
});

// --- mission graph (parsed form of wiki/_meta/mission.md, v1) ------------

export const DS_MISSION_NODES: DsEntityDraft[] = [
  node('mv-1', 'MissionVersion', 'Mission v1', {
    number: '1', timestamp: NOW,
    rationale: 'initial mission set by project owner (24 May 2026)',
  }),
  node('mi-fleet-2035', 'MissionIntent',
    'Run a 5-vessel midsize crude tanker fleet that stays compliant and charter-ready through 2035',
    { relevance: '1.0', focus: '1.0' }),
  node('mi-keep-bets-honest', 'MissionIntent',
    'Keep every multi-year bet honest: age assumptions, flag the expired ones, count down to gates, bring deferred decisions back',
    { relevance: '1.0', focus: '0.9' }),
  node('mc-revalidate-before-gate', 'MissionConstraint',
    'Every assumption underpinning a >€1M commitment must be revalidated before its scheduled dry-dock gate',
    { relevance: '1.0', focus: '0.8' }),
  node('mc-on-prem', 'MissionConstraint',
    'Commercially sensitive fleet data stays on-prem; agent runs where the data lives',
    { relevance: '0.85', focus: '0.4' }),
  node('mng-newbuild', 'MissionNonGoal',
    'Not orderbook / newbuild decisions; not day-to-day chartering operations',
    { relevance: '0.3', focus: '0.1' }),
  node('mac-one-off-strategy', 'MissionAcceptanceCriterion',
    '<=1 vessel off-strategy at any time',
    { relevance: '0.95', focus: '0.7' }),
  node('mac-no-unactioned-packets', 'MissionAcceptanceCriterion',
    'Zero un-actioned quarterly packets past their gate',
    { relevance: '1.0', focus: '0.8' }),
  node('mac-preserve-projection', 'MissionAcceptanceCriterion',
    'Every re-baseline preserves the prior projection on the record',
    { relevance: '1.0', focus: '0.7' }),
  node('mac-red-team-paired', 'MissionAcceptanceCriterion',
    'Every irreversible decision has a paired red-team workflow artefact',
    { relevance: '0.9', focus: '0.6' }),
];

export const DS_MISSION_EDGES: DsRelationshipDraft[] = [
  { subject: 'mi-fleet-2035', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mi-keep-bets-honest', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mc-revalidate-before-gate', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mc-on-prem', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mng-newbuild', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-one-off-strategy', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-no-unactioned-packets', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-preserve-projection', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-red-team-paired', predicate: 'versionOf', object: 'mv-1' },
];

// --- working-graph nodes: decisions + assumptions + evidence + open Q ----

export const DS_WORKING_NODES: DsEntityDraft[] = [
  // Headline decisions (already seeded in kg.ts, redeclared here as Decision
  // dsType so the design-support skill picks them up as part of its working
  // graph).
  node('ds-decision-no-scrubber-2018', 'Decision', 'No scrubber fitted (2018)', {
    body: 'Premised on the fuel spread narrowing post-IMO 2020. Two underlying assumptions now expired.',
    relevance: '0.95', focus: '0.7',
  }),
  node('ds-decision-comply-via-allowances-2025', 'Decision', 'Comply via allowances (2025)', {
    body: 'Meet EU ETS exposure via EUA purchase rather than retrofit. EUA price stability assumption expired Q4 2025.',
    relevance: '0.9', focus: '0.7',
  }),
  node('ds-decision-long-charter-2021', 'Decision', 'Long-term charter re-let (2021)', {
    body: 'Five-year charter at terms premised on the 2018 no-scrubber call. Charter-rate-holds assumption ageing.',
    relevance: '0.8', focus: '0.5',
  }),
  // Open questions surfaced by the agent.
  node('openq-cape-pioneer-fuel-system', 'OpenQuestion',
    'Should Cape Pioneer\'s fuel-system preparation be brought forward to the 2028 dry-dock?',
    {
      body: 'No prior commitment to age. Choice between in-window 2028 vs deferring to 2033.',
      relevance: '0.75', focus: '0.4',
    }),
  node('openq-meridian-rebaseline', 'OpenQuestion',
    'Should the Meridian lifetime-earnings projection be re-baselined now or after the retrofit decision?',
    {
      body: 'Convening review pending. Agent refuses to re-baseline unilaterally.',
      relevance: '0.95', focus: '0.7',
    }),
  // Evidence anchors (single nodes pointing at the RAG sources).
  node('evidence-fuel-spread-2024', 'Evidence',
    'Fuel-spread analyst note 2024 — realised spread vs 2018 forecast',
    {
      body: 'analyst-fuel-spread-2024.md — spread widened, did not narrow.',
      relevance: '0.85', focus: '0.5',
    }),
  node('evidence-eua-price-2026', 'Evidence',
    'EUA price 2026 — Q1 average €103/t vs €75/t 2025 plan',
    {
      body: 'analyst-eua-price-2026.md — falsifies EUA-price-stable assumption.',
      relevance: '0.9', focus: '0.6',
    }),
  node('evidence-broker-valuation-2026', 'Evidence',
    'Meridian broker valuation 2026 — residual value glide below plan',
    {
      body: 'valuation-meridian-2026.md — supports ageing on residual-value assumption.',
      relevance: '0.8', focus: '0.5',
    }),
];

export const DS_WORKING_EDGES: DsRelationshipDraft[] = [
  // Decisions serve the mission.
  { subject: 'ds-decision-no-scrubber-2018', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'ds-decision-comply-via-allowances-2025', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'ds-decision-long-charter-2021', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'openq-cape-pioneer-fuel-system', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'openq-meridian-rebaseline', predicate: 'servesMission', object: 'mac-preserve-projection' },
  // Evidence anchors the decisions / open questions.
  { subject: 'evidence-fuel-spread-2024', predicate: 'servesMission', object: 'mi-keep-bets-honest' },
  { subject: 'evidence-eua-price-2026', predicate: 'servesMission', object: 'mi-keep-bets-honest' },
  { subject: 'evidence-broker-valuation-2026', predicate: 'servesMission', object: 'mi-keep-bets-honest' },
];

// --- hypotheses ----------------------------------------------------------

export interface HypothesisRationaleDraft {
  reasoning: string;
  evidenceDocuments: string[];
}

export interface HypothesisDraft {
  /** KG node id (hypothesis-<slug>). */
  id: string;
  /** Workflow id the seed will create. */
  workflowId: string;
  statement: string;
  confirmationCriteria: string;
  refutationCriteria: string;
  predictions: string;
  missionDerived: boolean;
  servesMission: string[];
  targetState:
    | 'proposed'
    | 'sharpened'
    | 'under_test'
    | 'provisional_support'
    | 'supported'
    | 'refuted'
    | 'stalled';
  eventPath: string[];
  relevance: string;
  focus: string;
  /** Wiki page slugs that captured the starting assumption(s) this hypothesis tests. */
  assumptionWikiSlugs: string[];
  /** Rationale recorded at workflow creation, if any. */
  initialRationale?: HypothesisRationaleDraft;
  /** Per-transition rationale, keyed by event name. */
  transitionRationale?: Partial<Record<string, HypothesisRationaleDraft>>;
}

export const HYPOTHESES: HypothesisDraft[] = [
  // The load-bearing refuted-with-cascade. EUA-price-stable underpins the
  // 2025 comply-via-allowances decision; refuting it reopens the retrofit
  // question at the 2027 gate.
  {
    id: 'hypothesis-eua-price-stable',
    workflowId: 'hypothesis-eua-price-stable',
    statement: 'EUA prices stay within the 2025 plan band (€60-90/t) through the 2027 dry-dock window',
    confirmationCriteria: 'Realised + forward EUA prices stay within €60-90/t through Q4 2027',
    refutationCriteria: 'Realised EUA price sustained above €100/t for two consecutive quarters',
    predictions: 'EUA market stays orderly; no political event drives a step change',
    missionDerived: true,
    servesMission: ['mi-fleet-2035'],
    targetState: 'refuted',
    eventPath: ['SHARPEN', 'START_TEST', 'PROVISIONAL_REFUTE', 'CONFIRM_REFUTE'],
    relevance: '0.95',
    focus: '0.85',
    assumptionWikiSlugs: ['eu-ets-and-fueleu', 'commitment-lifeline-meridian'],
    initialRationale: {
      reasoning: 'EUA-price-stable underpins the 2025 comply-via-allowances decision on the Meridian. Plan band set at €60-90/t against 2025 forwards.',
      evidenceDocuments: ['documents/analyst-eua-price-2026.md'],
    },
    transitionRationale: {
      PROVISIONAL_REFUTE: {
        reasoning: 'Q1 2026 average EUA price €103/t; two consecutive quarters above the €100/t refutation threshold.',
        evidenceDocuments: ['documents/analyst-eua-price-2026.md'],
      },
      CONFIRM_REFUTE: {
        reasoning: 'Refutation ratified at the Q2 2026 review. Cascade to hypothesis-retrofit-payback-2027 opens.',
        evidenceDocuments: [
          'documents/analyst-eua-price-2026.md',
          'out/quarterly-packets/2026-Q2.quarterly.json',
        ],
      },
    },
  },
  // The live retrofit-payback question — the central red-team item.
  {
    id: 'hypothesis-retrofit-payback-2027',
    workflowId: 'hypothesis-retrofit-payback-2027',
    statement: 'A scrubber retrofit on the Meridian at the 2027 dry-dock pays back within remaining hull life',
    confirmationCriteria: '3+ of 5 earnings scenarios clear retrofit capex within 8 years at current spread + EUA forwards',
    refutationCriteria: '<3 of 5 scenarios clear; or residual-value uplift assumed but broker spread > 25% of capex',
    predictions: 'Borderline — 3-of-5 scenarios clear at central forwards; sensitive to broker resale uplift',
    missionDerived: true,
    servesMission: ['mi-fleet-2035', 'mac-red-team-paired'],
    targetState: 'under_test',
    eventPath: ['SHARPEN', 'START_TEST'],
    relevance: '0.95',
    focus: '0.8',
    assumptionWikiSlugs: ['scrubber-retrofit', 'meridian', 'dry-dock-windows'],
    initialRationale: {
      reasoning: 'Retrofit-payback was deferred in 2018 on a narrowing-spread premise that has since reversed; the 2027 dry-dock is the cheap window to re-decide.',
      evidenceDocuments: ['documents/analyst-fuel-spread-2024.md'],
    },
  },
  // Fuel-pathway-uncertain. Drives the fuel-system-prep deferred item.
  {
    id: 'hypothesis-fuel-pathway-uncertain',
    workflowId: 'hypothesis-fuel-pathway-uncertain',
    statement: 'The IMO 2027 framework implementation lands within the 2025 plan envelope',
    confirmationCriteria: 'Implementation regulations published 2026-27 fall within the plan-modelled GHG fuel standard + pricing range',
    refutationCriteria: 'Implementation falls outside the plan envelope by >20% on intensity or >30% on pricing',
    predictions: 'Implementation still settling; expected to land near the central plan but with wide error bars',
    missionDerived: false,
    servesMission: ['mi-fleet-2035'],
    targetState: 'under_test',
    eventPath: ['SHARPEN', 'START_TEST'],
    relevance: '0.85',
    focus: '0.6',
    assumptionWikiSlugs: ['eu-ets-and-fueleu'],
  },
  // Strategy-alignment-supported across the modern hulls.
  {
    id: 'hypothesis-charter-ready-2035',
    workflowId: 'hypothesis-charter-ready-2035',
    statement: 'Aurora, Nordic Star, and Orion stay charter-ready through 2035 under current compliance pathway',
    confirmationCriteria: 'Each of the three holds strategy alignment >= 70 through to the next-but-one dry-dock',
    refutationCriteria: 'Any of the three drops below 60 sustained for two quarters',
    predictions: 'Aurora 84, Nordic Star 72, Orion 91 — all comfortably above threshold',
    missionDerived: false,
    servesMission: ['mi-fleet-2035', 'mac-one-off-strategy'],
    targetState: 'supported',
    eventPath: ['SHARPEN', 'START_TEST', 'PROVISIONAL_SUPPORT', 'CONFIRM_SUPPORT'],
    relevance: '0.8',
    focus: '0.5',
    assumptionWikiSlugs: ['fleet-overview', 'aurora', 'nordic-star', 'orion'],
  },
  // Meridian-off-strategy — mission-derived from the drift score breaking
  // the acceptance criterion.
  {
    id: 'hypothesis-meridian-off-strategy',
    workflowId: 'hypothesis-meridian-off-strategy',
    statement: 'The Meridian can be returned to strategy-alignment >= 70 by the 2027 dry-dock decision',
    confirmationCriteria: 'Adjudicated retrofit + ETS pass-through renegotiation moves Meridian alignment to >= 70 within 18 months of the dry-dock',
    refutationCriteria: 'Even with the best retrofit + renegotiation case, modelled alignment stays below 70',
    predictions: 'Borderline; depends on retrofit decision and ETS pass-through outcome',
    missionDerived: true,
    servesMission: ['mac-one-off-strategy'],
    targetState: 'under_test',
    eventPath: ['SHARPEN', 'START_TEST'],
    relevance: '0.95',
    focus: '0.8',
    assumptionWikiSlugs: ['meridian', 'drift-against-fleet-strategy', 'projection-vs-reality'],
    initialRationale: {
      reasoning: 'Mission-derived from a drift score that breaks the mac-one-off-strategy acceptance criterion; broker valuation has glided below plan.',
      evidenceDocuments: ['documents/valuation-meridian-2026.md'],
    },
  },
  // Cape Pioneer early-mover hypothesis — proposed state, not yet sharpened.
  {
    id: 'hypothesis-cape-pioneer-early-fuel-prep',
    workflowId: 'hypothesis-cape-pioneer-early-fuel-prep',
    statement: 'Bringing Cape Pioneer\'s fuel-system prep forward to the 2028 dry-dock is cheaper over total life than deferring to 2033',
    confirmationCriteria: 'Lifecycle TCO with in-window 2028 prep < TCO with 2033 prep at central FuelEU + IMO 2027 forwards',
    refutationCriteria: 'In-window 2028 prep more expensive than 2033 prep across central + downside scenarios',
    predictions: 'In-window 2028 likely wins by 15-25% on TCO; needs quantification',
    missionDerived: false,
    servesMission: ['mi-fleet-2035'],
    targetState: 'proposed',
    eventPath: [],
    relevance: '0.7',
    focus: '0.4',
    assumptionWikiSlugs: ['cape-pioneer', 'dry-dock-windows'],
  },
];

// --- hypothesis graph edges --------------------------------------------

export const DS_HYPOTHESIS_EDGES: DsRelationshipDraft[] = [
  // Mission service.
  { subject: 'hypothesis-eua-price-stable', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'hypothesis-retrofit-payback-2027', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'hypothesis-fuel-pathway-uncertain', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'hypothesis-charter-ready-2035', predicate: 'servesMission', object: 'mi-fleet-2035' },
  { subject: 'hypothesis-meridian-off-strategy', predicate: 'servesMission', object: 'mac-one-off-strategy' },
  { subject: 'hypothesis-cape-pioneer-early-fuel-prep', predicate: 'servesMission', object: 'mi-fleet-2035' },

  // The EUA-price-stable refutation ENTAILS reopening the retrofit decision
  // — cascade target. This is the load-bearing entailment.
  { subject: 'hypothesis-eua-price-stable', predicate: 'entails', object: 'hypothesis-retrofit-payback-2027' },

  // Decisions DEPEND ON hypotheses (the cascade flags load-bearing deps).
  { subject: 'ds-decision-comply-via-allowances-2025', predicate: 'dependsOn', object: 'hypothesis-eua-price-stable' },
  { subject: 'ds-decision-no-scrubber-2018', predicate: 'dependsOn', object: 'hypothesis-retrofit-payback-2027' },

  // Mission acceptance criterion contradicted by current Meridian state —
  // hooks the critic-mission-contradiction rule.
  { subject: 'hypothesis-meridian-off-strategy', predicate: 'contradicts', object: 'mac-one-off-strategy' },

  // Evidence supports / refutes hypotheses.
  { subject: 'evidence-eua-price-2026', predicate: 'evidenceFor', object: 'hypothesis-eua-price-stable',
    properties: { strength: '0.9', direction: 'refute' } },
  { subject: 'evidence-fuel-spread-2024', predicate: 'evidenceFor', object: 'hypothesis-retrofit-payback-2027',
    properties: { strength: '0.6', direction: 'support' } },
  { subject: 'evidence-broker-valuation-2026', predicate: 'evidenceFor', object: 'hypothesis-retrofit-payback-2027',
    properties: { strength: '0.5', direction: 'refute' } },

  // Hypotheses are described by the wiki pages that captured their starting
  // assumptions. The `wiki:<slug>` id convention is shared with scrapbook
  // nodes (see seed-long-horizon-commitments.ts wikiSlug usage).
  ...HYPOTHESES.flatMap(h =>
    h.assumptionWikiSlugs.map(slug => ({
      subject: h.id,
      predicate: 'describedBy',
      object: `wiki:${slug}`,
    })),
  ),
];

// --- tests attached to sharpened+ hypotheses ----------------------------

export const DS_TEST_NODES: DsEntityDraft[] = [
  node('test-eua-price-monitor', 'Test',
    'Quarterly EUA realised + forward curve check',
    { kind: 'monitor', cost: 'low', bearing: 'high', testStatus: 'complete' }),
  node('test-retrofit-payback-model', 'Test',
    '5-scenario lifetime earnings model — retrofit vs defer vs scrap',
    { kind: 'calculation', cost: 'medium', bearing: 'high', testStatus: 'in-progress' }),
  node('test-fuel-pathway-tracker', 'Test',
    'IMO MEPC implementation document tracker',
    { kind: 'literature', cost: 'low', bearing: 'medium', testStatus: 'in-progress' }),
  node('test-fleet-alignment-score', 'Test',
    'Nightly fleet alignment scoring across 4 axes',
    { kind: 'monitor', cost: 'low', bearing: 'high', testStatus: 'complete' }),
];

export const DS_TEST_EDGES: DsRelationshipDraft[] = [
  { subject: 'hypothesis-eua-price-stable', predicate: 'testedBy', object: 'test-eua-price-monitor' },
  { subject: 'hypothesis-retrofit-payback-2027', predicate: 'testedBy', object: 'test-retrofit-payback-model' },
  { subject: 'hypothesis-fuel-pathway-uncertain', predicate: 'testedBy', object: 'test-fuel-pathway-tracker' },
  { subject: 'hypothesis-charter-ready-2035', predicate: 'testedBy', object: 'test-fleet-alignment-score' },
  { subject: 'hypothesis-meridian-off-strategy', predicate: 'testedBy', object: 'test-fleet-alignment-score' },
];

// --- documentation.md + UI config (auto-open) ---------------------------

export const USER_INTERFACE_JSON = {
  appBar: {
    title: 'Long-Horizon Commitments — Fleet',
    fontColor: 'white',
    backgroundColor: '#b3541e',
  },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      {
        title: 'Open the quarterly packet',
        prompt: 'Open the current quarterly review packet. List expired assumptions, approaching gates (<= 18 months), breached projections, and vessels off-strategy. Do not propose actions — convene the conversation.',
        sortOrder: 1,
      },
      {
        title: 'Why is the Meridian off-strategy?',
        prompt: 'Walk the Meridian commitment lifeline. Show every historical decision, the assumptions beneath each, their current ageing state, and the source evidence for any expired one.',
        sortOrder: 2,
      },
      {
        title: 'Gate countdown',
        prompt: 'Show me every scheduled dry-dock / special-survey gate within 36 months. For each, list the deferred items parked at it, the months remaining, and the cost-out-of-cycle multiplier.',
        sortOrder: 3,
      },
      {
        title: 'Red-team the Meridian retrofit',
        prompt: 'Run the red-team workflow on the Meridian 2027 scrubber retrofit decision. Lay out the case-for and case-against side-by-side, with evidence and rebuttal for each pillar. Do not adjudicate.',
        sortOrder: 4,
      },
      {
        title: 'Score the fleet',
        prompt: 'Run nightly fleet alignment. Score each vessel against the stated strategy (compliant + charter-ready through 2035). Flag drift and show the chain of provenance.',
        sortOrder: 5,
      },
    ],
    showWelcomeMessage: true,
  },
  previewDocuments: ['documentation.md'],
  autoFilePreviewExtensions: [] as string[],
};

// documentation.md body — written to the project root in step 13 and
// auto-opened via .etienne/user-interface.json previewDocuments.
// (The design-support skill ships a desalination-flavoured documentation.md
// in its references/, so we author our own here rather than copy from the
// skill bundle.)
export const DOCUMENTATION_MD = `# Long-Horizon Commitments — Fleet

This project is a worked example for the article *Agents that help humans
decide — Part 4: Projection vs. reality on a tanker fleet*. It models a
five-vessel midsize crude tanker fleet through a single agent whose only
job is to keep multi-year bets honest.

## What you are looking at

Five vessels — **Meridian**, **Aurora**, **Nordic Star**, **Cape Pioneer**,
**Orion** — each carrying a stack of commitments (charter, retrofit /
not-retrofit, financing, compliance pathway) whose foundations age over
years. The Meridian is the load-bearing case: three of the four assumptions
under its 2018 / 2021 / 2023 / 2025 decision cohort have expired, and the
next dry-dock window opens in ~14 months.

## What the agent does

1. **Ages every assumption** behind every commitment (fresh → ageing →
   expired). State is recorded on the KG node and mirrored in the
   hypothesis workflow.
2. **Flags what has expired** at the next quarterly packet, with the source
   document cited.
3. **Counts down to immovable gates** — dry-dock, special survey — and
   forces a re-decision of every deferred item *before* the window opens.
4. **Tracks projection vs. reality** — when actuals leave the original
   uncertainty cone (as on the Meridian in 2023), the agent **requests a
   review**, never re-baselines on its own.
5. **Scores drift against the fleet strategy** vessel-by-vessel and shows
   the chain of provenance.
6. **Assembles a packet per review cadence** with **no silent default** —
   if it is not actioned by its gate, the affected commitments freeze.
7. **Stands up a red-team** on irreversible calls — one agent argues for,
   another argues against, the human adjudicates on the record.

## Hard rules

- The agent **never re-baselines a projection** on its own. Only a human
  re-baselines, on the record, and the old projection stays beside the new.
- The agent **never marks an expired assumption fresh**. Ageing is
  monotonic without an explicit human re-decision.
- The agent **never lets a packet roll forward un-actioned** past its
  gate. Past that gate, the affected commitments freeze rather than
  continue silently.
- The agent **never decides irreversible calls**. It surfaces the case
  for and against; a human adjudicates.

## Try it

Five quick actions on the welcome page get you started:

- **Open the quarterly packet** — see the current Q2 2026 packet.
- **Why is the Meridian off-strategy?** — walk the lifeline.
- **Gate countdown** — see the dry-dock windows and what's parked at each.
- **Red-team the Meridian retrofit** — see the case-for and case-against
  side-by-side for the live retrofit-vs-defer-vs-scrap decision.
- **Score the fleet** — run the nightly alignment scoring on demand.

The wiki at [wiki/_meta/mission.md](wiki/_meta/mission.md) is the mission
of record; the wiki topics under [wiki/topics/](wiki/topics/) contain the
narrative; the knowledge graph holds the typed entities (vessels,
decisions, assumptions, gates, projections); the RAG corpus under
[documents/](documents/) contains the synthetic source documents the
agent cites.

## What it does not do

This is a single-tenant on-prem demo. The data is synthetic. The agent
does not connect to a real charter market, EUA market, broker feed, or
classification society. Wiring those in is the natural next step for a
real deployment — but the *shape* of the agent's behaviour does not
change.
`;
