/**
 * Engineering Design Support System seed: the hypothesis subsystem + the
 * design-support typed-graph nodes, plus the auto-opened documentation and
 * project UI config.
 *
 * Wire mapping (same routes as kg.ts):
 *   POST :project/entities       { id, type, properties }
 *   POST :project/relationships  { subject, predicate, object, properties? }
 *
 * As in kg.ts, the KnowledgeGraphService restricts the wire `type` to
 * Person|Company|Product|Document. We encode the real design-support type in
 * `properties.dsType` and keep the wire type as `Document` (these are
 * knowledge/working-graph nodes, not products/companies). The design-support
 * skill reads `dsType` to know what each node is.
 *
 * Each seeded hypothesis is created as a node here; the seed script then
 * `workflow_create`s a workflow per hypothesis from the installed
 * design-support machine config and advances it to the TARGET STATE below via
 * workflow_send_event, so a fresh seed exercises every lifecycle state —
 * including one Refuted-with-cascade and one mission-derived.
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

const NOW = '2026-05-14T09:00:00Z';

// --- helpers -------------------------------------------------------------

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
// The skill parses mission.md on bootstrap; we also seed the structured form
// so integration tests have a deterministic mission graph to assert against.

export const DS_MISSION_NODES: DsEntityDraft[] = [
  node('mv-1', 'MissionVersion', 'Mission v1', { number: '1', timestamp: NOW, rationale: 'initial mission set by project owner' }),
  node('mi-pilot', 'MissionIntent', 'Pilot a small RO desalination unit (<=5 m3/day, 50-200 people) on a remote tropical island', { relevance: '1.0', focus: '1.0' }),
  node('mi-buildable', 'MissionIntent', 'Design a buildable system from commercially available components', { relevance: '0.95', focus: '0.7' }),
  node('mc-who-eu', 'MissionConstraint', 'Demonstrate compliance with WHO GDWQ and EU DWD 2020/2184', { relevance: '0.95', focus: '0.6' }),
  node('mc-tco', 'MissionConstraint', 'Produce a defensible 10-year total-cost-of-ownership estimate', { relevance: '0.9', focus: '0.5' }),
  node('mng-industrial', 'MissionNonGoal', 'Not industrial scale (>=100 m3/day); not cruise/naval; no brine valorisation', { relevance: '0.3', focus: '0.1' }),
  node('mac-boron', 'MissionAcceptanceCriterion', 'Product water boron <= EU binding 1.5 mg/L', { relevance: '0.95', focus: '0.6' }),
  node('mac-coliform', 'MissionAcceptanceCriterion', 'Product water E. coli / coliform = 0 /100 mL', { relevance: '0.9', focus: '0.5' }),
];

export const DS_MISSION_EDGES: DsRelationshipDraft[] = [
  { subject: 'mi-pilot', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mi-buildable', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mc-who-eu', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mc-tco', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mng-industrial', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-boron', predicate: 'versionOf', object: 'mv-1' },
  { subject: 'mac-coliform', predicate: 'versionOf', object: 'mv-1' },
];

// --- working-graph nodes: decisions + assumptions + evidence ------------

export const DS_WORKING_NODES: DsEntityDraft[] = [
  node('decision-sw30-train', 'Decision', 'Use a 2-element FILMTEC SW30-2540 train at 38% recovery', {
    body: 'Two SW30-2540 elements in series, 38% recovery, 55-60 bar. Load-bearing for the boron compliance argument.',
    relevance: '0.9', focus: '0.7',
  }),
  node('decision-pv-genset-hybrid', 'Decision', 'PV + battery with diesel genset backup', {
    body: '4.5 kWp PV, 9 kWh LFP, 5 kVA genset backup for low-irradiance days.',
    relevance: '0.8', focus: '0.5',
  }),
  node('decision-multimedia-pretreat', 'Decision', 'Multimedia + cartridge pre-treatment, antiscalant dosing', {
    body: 'Coarse strainer -> multimedia -> 5um cartridge -> antiscalant. Targets SDI < 3.',
    relevance: '0.85', focus: '0.6',
  }),
  node('assumption-feed-tds', 'Assumption', 'Seawater feed TDS ~ 35,000 mg/L year-round', {
    body: 'Assumed open-ocean intake salinity; not yet measured at a candidate site.',
    relevance: '0.7', focus: '0.3',
  }),
  node('evidence-sw30-datasheet', 'Evidence', 'FILMTEC SW30-2540 datasheet: 99.4% NaCl rejection', {
    body: 'DuPont public datasheet; single-element nominal rejection at 32,000 ppm NaCl test.',
    relevance: '0.8', focus: '0.4',
  }),
  node('openq-boron-second-pass', 'OpenQuestion', 'Is a partial second pass needed to clear boron at high feed pH?', {
    body: 'Single-pass SW30 boron rejection is the weak spot; depends on feed pH and temperature.',
    relevance: '0.85', focus: '0.6',
  }),
];

export const DS_WORKING_EDGES: DsRelationshipDraft[] = [
  { subject: 'decision-sw30-train', predicate: 'servesMission', object: 'mac-boron' },
  { subject: 'decision-sw30-train', predicate: 'servesMission', object: 'mi-buildable' },
  { subject: 'decision-pv-genset-hybrid', predicate: 'servesMission', object: 'mi-pilot' },
  { subject: 'decision-multimedia-pretreat', predicate: 'servesMission', object: 'mi-buildable' },
  { subject: 'assumption-feed-tds', predicate: 'servesMission', object: 'mi-pilot' },
  { subject: 'evidence-sw30-datasheet', predicate: 'servesMission', object: 'mac-boron' },
  { subject: 'evidence-sw30-datasheet', predicate: 'supports', object: 'decision-sw30-train' },
  { subject: 'openq-boron-second-pass', predicate: 'servesMission', object: 'mac-boron' },
  { subject: 'decision-sw30-train', predicate: 'derivedFrom', object: 'assumption-feed-tds' },
];

// --- hypotheses (each gets a workflow; targetState drives the seed) ------

export interface HypothesisDraft {
  /** KG node id (hypothesis-<slug>). */
  id: string;
  /** Workflow id the seed will create (slug of "Hypothesis: <short>"). */
  workflowId: string;
  statement: string;
  confirmationCriteria: string;
  refutationCriteria: string;
  predictions: string;
  missionDerived: boolean;
  /** servesMission target(s). */
  servesMission: string[];
  /** The lifecycle state the seed advances the workflow to. */
  targetState:
    | 'proposed'
    | 'sharpened'
    | 'under_test'
    | 'provisional_support'
    | 'supported'
    | 'refuted'
    | 'stalled';
  /** Ordered workflow events the seed sends to reach targetState. */
  eventPath: string[];
  relevance: string;
  focus: string;
}

export const HYPOTHESES: HypothesisDraft[] = [
  {
    id: 'hypothesis-boron-single-pass',
    workflowId: 'hypothesis-boron-single-pass',
    statement: 'A single SW30 pass keeps product-water boron <= 1.5 mg/L for this feedwater',
    confirmationCriteria: 'Bench/pilot permeate boron measured <= 1.5 mg/L across the expected feed temperature and pH range',
    refutationCriteria: 'Permeate boron > 1.5 mg/L at any expected operating point without a second pass',
    predictions: 'Single-pass rejection 85-92%; marginal at warm feed + low pH',
    missionDerived: true,
    servesMission: ['mac-boron'],
    targetState: 'refuted',
    eventPath: ['SHARPEN', 'START_TEST', 'PROVISIONAL_REFUTE', 'CONFIRM_REFUTE'],
    relevance: '0.95',
    focus: '0.8',
  },
  {
    id: 'hypothesis-second-pass-clears-boron',
    workflowId: 'hypothesis-second-pass-clears-boron',
    statement: 'A partial second pass at elevated pH clears boron to <= 1.5 mg/L',
    confirmationCriteria: 'Modelled + bench permeate boron <= 1.5 mg/L with a 20-30% second pass at pH 9.5',
    refutationCriteria: 'Boron still > 1.5 mg/L with a feasible second-pass fraction',
    predictions: 'Second pass at pH 9.5 lifts boron rejection above 95%',
    missionDerived: false,
    // entailed by the single-pass hypothesis: when single-pass is refuted,
    // this one is REOPENed by the cascade.
    servesMission: ['mac-boron'],
    targetState: 'provisional_support',
    eventPath: ['SHARPEN', 'START_TEST', 'PROVISIONAL_SUPPORT'],
    relevance: '0.9',
    focus: '0.7',
  },
  {
    id: 'hypothesis-pretreat-5y-membrane',
    workflowId: 'hypothesis-pretreat-5y-membrane',
    statement: 'Multimedia + cartridge pre-treatment alone sustains 5-year membrane life on this feed',
    confirmationCriteria: 'Projected normalized salt passage drift < 10%/yr at the design SDI for 5 years',
    refutationCriteria: 'Fouling forces membrane replacement before 3 years at the design SDI',
    predictions: 'SDI < 3 maintained; CIP every 6 months sufficient',
    missionDerived: false,
    servesMission: ['mc-tco', 'mi-buildable'],
    targetState: 'under_test',
    eventPath: ['SHARPEN', 'START_TEST'],
    relevance: '0.85',
    focus: '0.6',
  },
  {
    id: 'hypothesis-solar-only-feasible',
    workflowId: 'hypothesis-solar-only-feasible',
    statement: 'The pilot load can be met solar-only (no genset) at the Pacific site',
    confirmationCriteria: 'Energy balance shows >= 99% demand coverage from PV+battery across a typical meteorological year',
    refutationCriteria: 'Coverage < 95% in any month without a genset',
    predictions: 'Marginal in the wet season; needs oversized PV',
    missionDerived: false,
    servesMission: ['mi-pilot'],
    targetState: 'stalled',
    eventPath: ['SHARPEN', 'START_TEST', 'STALL'],
    relevance: '0.7',
    focus: '0.3',
  },
  {
    id: 'hypothesis-erd-payback',
    workflowId: 'hypothesis-erd-payback',
    statement: 'An energy-recovery device pays back within the 10-year TCO horizon at this scale',
    confirmationCriteria: 'TCO model shows ERD capex recovered via energy savings within 10 years',
    refutationCriteria: 'ERD never pays back within 10 years at <=5 m3/day',
    predictions: 'Payback ~4-6 years driven by PV avoided-capacity',
    missionDerived: false,
    servesMission: ['mc-tco'],
    targetState: 'supported',
    eventPath: ['SHARPEN', 'START_TEST', 'PROVISIONAL_SUPPORT', 'CONFIRM_SUPPORT'],
    relevance: '0.8',
    focus: '0.5',
  },
  {
    id: 'hypothesis-rainwater-blend',
    workflowId: 'hypothesis-rainwater-blend',
    statement: 'Blending harvested rainwater reduces RO duty enough to skip the second pass at the Caribbean site',
    confirmationCriteria: 'Blend ratio keeps boron <= 1.5 mg/L while RO covers the shortfall',
    refutationCriteria: 'Rainwater yield too variable to rely on for compliance',
    predictions: 'Works in wet season only; not load-bearing year-round',
    missionDerived: false,
    servesMission: ['mac-boron', 'mi-pilot'],
    targetState: 'proposed',
    eventPath: [],
    relevance: '0.6',
    focus: '0.4',
  },
];

// Hypothesis-graph edges (entailment, decision dependency, evidence, tests).
// These are what the cascade traverses on refutation.
export const DS_HYPOTHESIS_EDGES: DsRelationshipDraft[] = [
  { subject: 'hypothesis-boron-single-pass', predicate: 'servesMission', object: 'mac-boron' },
  { subject: 'hypothesis-second-pass-clears-boron', predicate: 'servesMission', object: 'mac-boron' },
  { subject: 'hypothesis-pretreat-5y-membrane', predicate: 'servesMission', object: 'mc-tco' },
  { subject: 'hypothesis-solar-only-feasible', predicate: 'servesMission', object: 'mi-pilot' },
  { subject: 'hypothesis-erd-payback', predicate: 'servesMission', object: 'mc-tco' },
  { subject: 'hypothesis-rainwater-blend', predicate: 'servesMission', object: 'mac-boron' },

  // The single-pass hypothesis ENTAILS the second-pass one: if single-pass
  // fails, the second-pass route must be re-evaluated (cascade REOPEN).
  { subject: 'hypothesis-boron-single-pass', predicate: 'entails', object: 'hypothesis-second-pass-clears-boron' },

  // The SW30-train decision DEPENDS ON the single-pass boron hypothesis —
  // this is the load-bearing dependency the cascade must flag.
  { subject: 'decision-sw30-train', predicate: 'dependsOn', object: 'hypothesis-boron-single-pass' },
  { subject: 'decision-pv-genset-hybrid', predicate: 'dependsOn', object: 'hypothesis-solar-only-feasible' },

  // Evidence already attached to hypotheses.
  { subject: 'evidence-sw30-datasheet', predicate: 'evidenceFor', object: 'hypothesis-boron-single-pass', properties: { strength: '0.5', direction: 'refute' } },
];

// Tests pre-attached to the hypotheses that have reached >= sharpened.
export const DS_TEST_NODES: DsEntityDraft[] = [
  node('test-boron-bench', 'Test', 'Bench boron rejection at feed pH 7-8, 25-30C', { kind: 'prototype', cost: 'medium', bearing: 'high', testStatus: 'complete' }),
  node('test-boron-model', 'Test', 'Solution-diffusion boron model sweep', { kind: 'calculation', cost: 'low', bearing: 'medium', testStatus: 'complete' }),
  node('test-secondpass-model', 'Test', 'Two-pass mass balance at pH 9.5', { kind: 'calculation', cost: 'low', bearing: 'high', testStatus: 'complete' }),
  node('test-pretreat-lit', 'Test', 'Literature review: SDI vs membrane life', { kind: 'literature', cost: 'low', bearing: 'medium', testStatus: 'in-progress' }),
  node('test-erd-tco', 'Test', 'TCO model with/without ERD', { kind: 'calculation', cost: 'low', bearing: 'high', testStatus: 'complete' }),
];

export const DS_TEST_EDGES: DsRelationshipDraft[] = [
  { subject: 'hypothesis-boron-single-pass', predicate: 'testedBy', object: 'test-boron-bench' },
  { subject: 'hypothesis-boron-single-pass', predicate: 'testedBy', object: 'test-boron-model' },
  { subject: 'hypothesis-second-pass-clears-boron', predicate: 'testedBy', object: 'test-secondpass-model' },
  { subject: 'hypothesis-pretreat-5y-membrane', predicate: 'testedBy', object: 'test-pretreat-lit' },
  { subject: 'hypothesis-erd-payback', predicate: 'testedBy', object: 'test-erd-tco' },
];

// --- documentation.md + UI config (auto-open) ---------------------------
// The body is the user-facing guide. The seed writes this to the project root
// and registers it in .etienne/user-interface.json previewDocuments, exactly
// mirroring seed-factory-line-sim step11b.

export const USER_INTERFACE_JSON = {
  appBar: { title: 'Desalination Pilot — Design Support', fontColor: 'white', backgroundColor: '#1976d2' },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      { title: 'Add a decision', prompt: 'I want to record a design decision. Use the design-support skill (add mode).', sortOrder: 1 },
      { title: 'Propose a hypothesis', prompt: 'I want to propose a hypothesis. Use the design-support skill (hypothesis mode).', sortOrder: 2 },
      { title: 'What did we rule out?', prompt: 'Show me what we ruled out and what it affected — the cascade reports from refuted hypotheses.', sortOrder: 3 },
      { title: 'Generate status report', prompt: 'Generate an internal status report using the design-support skill.', sortOrder: 4 },
      { title: 'Show whitespots', prompt: 'Show me the current gaps and whitespots. Use the design-support skill (triage mode).', sortOrder: 5 },
    ],
    showWelcomeMessage: true,
  },
  previewDocuments: ['documentation.md', 'intro.videos'],
  autoFilePreviewExtensions: [] as string[],
};

// documentation.md body lives in the workspace copy; the seed reads it from
// the installed skill's authored copy so there is a single source of truth.
// (seed-desalination.ts resolves DOCUMENTATION_SOURCE at runtime.)
export const DOCUMENTATION_SOURCE_REL =
  '.claude/skills/design-support/references/documentation.md';
