/**
 * Coverage-dashboard artefact for the requirements-hv project.
 *
 * Written to `out/coverage/current.coverage.json`. The frontend will render
 * this through a CoverageViewer registered against `.coverage.json` in
 * viewerRegistry.jsx (same mechanism as the long-horizon seed's
 * QuarterlyViewer). Until that viewer ships, the file still serves as
 * the load-bearing artefact registered in `.etienne/user-interface.json`
 * `previewDocuments` — it auto-opens in the preview pane and is rendered
 * by the generic JSON viewer.
 *
 * The fixture derives every row from KG_ENTITIES (single source of truth)
 * so the dashboard never drifts from the knowledge graph.
 */

import {
  validateRequirement,
  proposeClarification,
  splitCompound,
  type EarsType,
  type ValidationFlag,
} from '../../../backend/src/ears/ears-validator';
import { KG_ENTITIES } from './kg';

type CoverageState =
  | 'open'
  | 'drafted'
  | 'reviewed'
  | 'committed'
  | 'deviation'
  | 'clarify';

type ReviewStatus = 'pending' | 'in-review' | 'approved' | 'rejected';

type PriorityClass = 'mandatory' | 'scored' | 'optional' | 'informational';

interface SourceCitation {
  docPath?: string; // project-relative, fuels [[doc:…]] chips
  locator?: string; // e.g. "§4.2" or "Annex C §3.3" — matches sourceLocation
}

// Phase 2: an entry in the bid-wide evaluation matrix. Top-level criteria
// (price, quality) have no parentId; sub-criteria reference their parent
// so the cockpit can render a tree. `points` are the raw share — usually
// out of 100 but the schema doesn't enforce normalisation so partial
// tender data (which often only specifies leaf weights) still flows.
interface EvaluationCriterion {
  id: string;
  label: string;
  parentId?: string;
  points: number;
  rowIds?: string[]; // populated server-side from row.awardCriterionId
}

interface CoverageRow {
  requirementId: string;
  ears: string;
  state: CoverageState;
  sourceVolume: string;
  sourceLocation: string;
  responsibleEngineer?: string;
  draftedFrom?: string;
  typeTestEvidence?: string;
  chips: string[]; // 'override' | 'reuse-mismatch' | 'load-bearing'
  notes?: string;
  // Cockpit additions (compliance-matrix previewer):
  reviewStatus?: ReviewStatus;
  plannedResponseSlug?: string; // e.g. 'planned-response/req-247'
  sourceCitation?: SourceCitation;
  // Phase 1: EARS structural fields + validator output. All optional —
  // rows that pre-date the validator still render fine.
  earsType?: EarsType;
  trigger?: string;
  actor?: string;
  action?: string;
  constraint?: string;
  ambiguityFlag?: boolean;
  ambiguityNotes?: string;
  validationFlags?: ValidationFlag[];
  clarificationQuestion?: string;
  // When a parent row was split into atoms, each atom points back at the
  // parent's id so the cockpit can render "split from REQ-101" provenance.
  splitFrom?: string;
  // Phase 2: award-criteria weighting. `weightPoints` is the row's raw
  // share at award time (e.g. 35 means 35 points of the total); the
  // cockpit ranks by this. `priorityClass` mirrors the EARS priority
  // axis from the extraction prompt (mandatory/scored/optional/info).
  // `awardCriterionId` links into the envelope's `evaluationMatrix`.
  weightPoints?: number;
  priorityClass?: PriorityClass;
  awardCriterionId?: string;
  // Phase 3: knockout (exclusion) flag. A non-compliant knockout row
  // disqualifies the bid regardless of state on other rows. Seeded by
  // extraction (recognising "Mindestanforderung" / "K.O.-Kriterium" /
  // "mandatory exclusion") or hand-set via the cockpit kebab.
  isKnockout?: boolean;
  // Phase 4: cross-document dedup. The clustering pass (dedup.service.ts)
  // groups near-identical rows so an engineer answers once. `clusterId`
  // is shared across the cluster; `clusterRole` distinguishes the
  // canonical row (one per cluster — preferred state-rank) from the
  // duplicates. `clusterSize` is populated only on the canonical so the
  // cockpit can render a "×N" chip without summing in the UI.
  clusterId?: string;
  clusterRole?: 'canonical' | 'duplicate';
  clusterSize?: number;
}

interface CoverageCluster {
  id: string;
  canonicalRowId: string;
  memberRowIds: string[]; // includes canonical
  similarityRange: [number, number]; // [min, max] pairwise cosine
}

const REQUIREMENTS = KG_ENTITIES.filter(
  (e) => e.properties.domainType === 'Requirement',
);

// State → review-status mapping. Compliance status lives in `state`; review is
// the orthogonal "has someone vouched for this?" axis the cockpit filters on.
function reviewFor(state: CoverageState): ReviewStatus {
  switch (state) {
    case 'committed':
    case 'deviation':
      return 'approved';
    case 'reviewed':
    case 'clarify':
      return 'in-review';
    case 'open':
    case 'drafted':
    default:
      return 'pending';
  }
}

// Map source-volume id → seeded RAG document path (so [[doc:…]] chips resolve).
// Keep aligned with `RAG_DOCS` filenames in fixtures/rag-docs.ts.
const SOURCE_VOLUME_DOC_PATHS: Record<string, string> = {
  'source-volume-1-functional-spec': 'documents/source-volume-1-functional-spec-excerpt.md',
  'source-volume-2-annex-a-electrical-performance': 'documents/source-volume-2-annex-a-electrical-performance-excerpt.md',
  'source-volume-3-annex-b-protection-control': 'documents/source-volume-3-annex-b-protection-control-excerpt.md',
  'source-volume-4-annex-c-harmonics': 'documents/source-volume-4-annex-c-harmonics-excerpt.md',
  'source-volume-5-annex-def-auxiliaries': 'documents/source-volume-5-annex-def-auxiliaries-excerpt.md',
  'source-volume-6-grid-code': 'documents/source-volume-6-grid-code-excerpt.md',
};

function buildRow(r: typeof REQUIREMENTS[number]): CoverageRow {
  const chips: string[] = [];
  if (r.properties.overrideFlag === 'true') chips.push('override');
  if (r.properties.reuseMismatch === 'true') chips.push('reuse-mismatch');
  if (r.properties.loadBearing === 'true') chips.push('load-bearing');

  const state = r.properties.state as CoverageState;
  const row: CoverageRow = {
    requirementId: r.id,
    ears: r.properties.ears,
    state,
    sourceVolume: r.properties.sourceVolume,
    sourceLocation: r.properties.sourceLocation,
    chips,
    reviewStatus: reviewFor(state),
  };
  if (r.properties.responsibleEngineer) row.responsibleEngineer = r.properties.responsibleEngineer;
  if (r.properties.draftedFrom) row.draftedFrom = r.properties.draftedFrom;
  if (r.properties.typeTestEvidence) row.typeTestEvidence = r.properties.typeTestEvidence;

  // Planned-response wiki page exists for any row where the agent has
  // produced (or could produce) a draft. Open rows get a slug too so the
  // "Create planned response" button has a target to write to.
  row.plannedResponseSlug = `planned-response/${r.id.toLowerCase()}`;

  // Source citation: pin the doc + locator so chips can deep-link into the
  // source volume in the chat preview pane.
  const docPath = SOURCE_VOLUME_DOC_PATHS[r.properties.sourceVolume];
  if (docPath || r.properties.sourceLocation) {
    row.sourceCitation = {
      docPath,
      locator: r.properties.sourceLocation,
    };
  }

  const noteParts: string[] = [];
  if (r.properties.overrideNote) noteParts.push(r.properties.overrideNote);
  if (r.properties.mismatchNote) noteParts.push(r.properties.mismatchNote);
  if (r.properties.deviationRationale) noteParts.push(`Deviation: ${r.properties.deviationRationale}`);
  if (r.properties.clarifyReason) noteParts.push(`Clarify: ${r.properties.clarifyReason}`);
  if (r.properties.storyNote) noteParts.push(r.properties.storyNote);
  if (noteParts.length > 0) row.notes = noteParts.join(' / ');

  // Phase 1: thread EARS structural fields from KG properties (when
  // present) and run the rule-based validator. Rows without these
  // properties still get the text-only flags (vague-modal,
  // missing-measurable, compound-suspected).
  //
  // Critically: use `in` checks rather than truthiness so an explicitly
  // empty string (e.g. trigger: '' on a deliberately-broken seed row)
  // reaches the validator, which then fires `missing-trigger`. Truthy
  // checks would conflate "field never set" with "field set to empty".
  if (r.properties.earsType) row.earsType = r.properties.earsType as EarsType;
  if ('trigger' in r.properties) row.trigger = r.properties.trigger;
  if ('actor' in r.properties) row.actor = r.properties.actor;
  if ('action' in r.properties) row.action = r.properties.action;
  if ('constraint' in r.properties) row.constraint = r.properties.constraint;
  if (r.properties.ambiguityFlag === 'true') row.ambiguityFlag = true;
  if (r.properties.ambiguityNotes) row.ambiguityNotes = r.properties.ambiguityNotes;
  if (r.properties.isKnockout === 'true') row.isKnockout = true;

  const flags = validateRequirement(row);
  if (flags.length > 0) row.validationFlags = flags;
  const clarification = proposeClarification(row);
  if (clarification) row.clarificationQuestion = clarification;

  return row;
}

// Build all rows, then run splitCompound on each so a "shall X and Y"
// parent yields two atomic children with `splitFrom` provenance.
const ROWS: CoverageRow[] = REQUIREMENTS.flatMap((r) => {
  const parent = buildRow(r);
  // Only attempt a split when the parent's flags actually contain
  // compound-suspected — keeps splitCompound's regex out of the hot
  // path for the 95% of clean rows.
  if (!parent.validationFlags?.includes('compound-suspected')) {
    return [parent];
  }
  const atoms = splitCompound(parent);
  if (atoms.length <= 1) return [parent];
  // Re-validate each atom: splitting often removes the compound flag
  // and may surface other issues now that the EARS text is shorter.
  return atoms.map((atom, idx) => {
    const atomRow: CoverageRow = {
      ...parent,
      requirementId: atom.id,
      ears: atom.ears_normalized,
      splitFrom: parent.requirementId,
      // Each atom gets its own planned-response slug so an engineer can
      // commit on X independently of Y.
      plannedResponseSlug: `planned-response/${atom.id.toLowerCase()}`,
      // Suffix the chips so the cockpit can tell atoms from parents at
      // a glance — chips array is freeform string today.
      chips: [...parent.chips, idx === 0 ? 'split-a' : 'split-b'],
    };
    const reFlags = validateRequirement(atomRow);
    atomRow.validationFlags = reFlags.length > 0 ? reFlags : undefined;
    return atomRow;
  });
});

const counts = (state: CoverageState) => ROWS.filter((r) => r.state === state).length;

// ─── Phase 2: award-criteria weighting (NSÜN MEAT split) ──────────────────
//
// NSÜN's procurement notice scores the tender under §16 VgV as MEAT:
//   PRICE  30 %   — fixed-price submission only, no sub-weights.
//   QUALITY 70 %
//     ├─ Q1 Technical merit             40
//     ├─ Q2 Programme & delivery        15
//     ├─ Q3 HSE & sustainability        10
//     └─ Q4 References & qualifications  5
//
// The Quality sub-criteria total 70 so the whole envelope sums to 100. We
// map each requirement to a sub-criterion via its source volume (the
// procurement matrix is volume-aligned: Vol.1+2+3 → Q1, Vol.5 → Q2/Q3,
// Vol.4+6 → Q1, etc.), then distribute the criterion's points evenly
// across the rows that share it. Rows whose sourceVolume isn't mapped
// stay weight-less — we'd rather show "—" than pretend.
const EVALUATION_MATRIX: EvaluationCriterion[] = [
  { id: 'P', label: 'Price', points: 30 },
  { id: 'Q', label: 'Quality', points: 70 },
  { id: 'Q1', label: 'Technical merit', parentId: 'Q', points: 40 },
  { id: 'Q2', label: 'Programme & delivery', parentId: 'Q', points: 15 },
  { id: 'Q3', label: 'HSE & sustainability', parentId: 'Q', points: 10 },
  { id: 'Q4', label: 'References & qualifications', parentId: 'Q', points: 5 },
];

// sourceVolume id → leaf criterion id. Anything unmapped stays unweighted.
const VOLUME_TO_CRITERION: Record<string, string> = {
  'source-volume-1-functional-spec': 'Q1',
  'source-volume-2-annex-a-electrical-performance': 'Q1',
  'source-volume-3-annex-b-protection-control': 'Q1',
  'source-volume-4-annex-c-harmonics': 'Q1',
  'source-volume-5-annex-def-auxiliaries': 'Q2',
  'source-volume-6-grid-code': 'Q1',
};

const LEAF_CRITERIA = EVALUATION_MATRIX.filter((c) => c.parentId);

// Pass 1: tag each row with its criterion id (when known).
for (const row of ROWS) {
  const cid = VOLUME_TO_CRITERION[row.sourceVolume];
  if (cid) row.awardCriterionId = cid;
}

// Pass 2: distribute each leaf criterion's points only across rows the
// seed has flagged as load-bearing or override. In a real ~1800-row
// tender the score is dominated by ~10–20 clauses (FRT performance,
// reactive-power envelope, harmonic limits, …) — even-splitting the
// criterion's points across every row dilutes signal to noise (40
// quality points / 132 rows = 0.30 each, which is not actionable).
// Restricting to load-bearing + override matches the cockpit's job:
// help the team find the handful of clauses that actually move the
// award score.
//
// Rows that belong to a criterion but aren't flagged keep their
// `awardCriterionId` (so the Award-criteria card can still count them)
// but stay weight-less — the cockpit renders "—" rather than a fake
// numeric.
for (const leaf of LEAF_CRITERIA) {
  const allRows = ROWS.filter((r) => r.awardCriterionId === leaf.id);
  const heavyRows = allRows.filter(
    (r) => r.chips.includes('load-bearing') || r.chips.includes('override'),
  );
  if (heavyRows.length === 0) {
    leaf.rowIds = allRows.map((r) => r.requirementId);
    continue;
  }
  // Override rows count double — the late-clarifications memo explicitly
  // changes how the clause is scored, which is the textbook case for
  // "this row punches above its weight".
  const weights = heavyRows.map((r) =>
    r.chips.includes('override') ? 2 : 1,
  );
  const wTotal = weights.reduce((a, b) => a + b, 0);
  let remaining = leaf.points;
  heavyRows.forEach((r, i) => {
    if (i === heavyRows.length - 1) {
      r.weightPoints = Math.round(remaining * 10) / 10;
    } else {
      const share = (weights[i] / wTotal) * leaf.points;
      const v = Math.round(share * 10) / 10;
      r.weightPoints = v;
      remaining -= v;
    }
  });
  leaf.rowIds = allRows.map((r) => r.requirementId);
}

// Pass 3: derive priorityClass. KG entities can carry an explicit
// `priority` property (rare in this seed) — when present we honour it;
// otherwise we infer from existing chips:
//   - load-bearing → mandatory
//   - override     → scored (the late-clarifications memo overrides
//                    deliberately reweight the row's importance)
//   - everything else → undefined (cockpit shows "—")
for (const row of ROWS) {
  const fromKg = REQUIREMENTS.find((r) => r.id === row.requirementId)?.properties
    .priority;
  if (fromKg) {
    row.priorityClass = fromKg as PriorityClass;
  } else if (row.chips.includes('load-bearing')) {
    row.priorityClass = 'mandatory';
  } else if (row.chips.includes('override')) {
    row.priorityClass = 'scored';
  }
}

const totalPoints = EVALUATION_MATRIX.filter((c) => c.parentId === undefined)
  .reduce((acc, c) => acc + c.points, 0);

export const COVERAGE_DASHBOARD = {
  schema: 'coverage-dashboard.v1',
  generatedAt: '2026-05-24T09:00:00Z',
  project: {
    name: 'NU-525-Lot-3',
    customer: 'Nordseeübertragungs-Netz GmbH (NSÜN)',
    scope: '525 kV / 2 GW HVDC converter station — onshore end',
    deliverableLanguage: 'de',
    reuseBaseLanguage: 'en',
  },
  gates: {
    g1_internal_completeness: { dueDate: '2026-08-15', requires: 'zero in open' },
    g2_engineering_review: { dueDate: '2026-09-01', requires: 'every row reviewed / committed / deviation / clarify' },
    g3_commit_gate: { dueDate: '2026-09-12', requires: 'every row committed / deviation / clarify; export refuses otherwise' },
    submission_due: '2026-09-15',
  },
  totals: {
    requirementsInScope: 1800,
    requirementsRepresentedInDemoSlice: ROWS.length,
  },
  stateCounts: {
    open: counts('open'),
    drafted: counts('drafted'),
    reviewed: counts('reviewed'),
    committed: counts('committed'),
    deviation: counts('deviation'),
    clarify: counts('clarify'),
  },
  chipCounts: {
    override: ROWS.filter((r) => r.chips.includes('override')).length,
    reuseMismatch: ROWS.filter((r) => r.chips.includes('reuse-mismatch')).length,
    loadBearing: ROWS.filter((r) => r.chips.includes('load-bearing')).length,
  },
  evaluationMatrix: EVALUATION_MATRIX,
  totalPoints,
  rows: ROWS,
};

export const COVERAGE_DASHBOARD_REL = 'out/coverage/current.coverage.json';

/**
 * Path of the compliance-matrix sentinel — the file the
 * compliance-matrix cockpit (MCP App) is registered against in
 * frontend/src/components/viewerRegistry.jsx (extension `.compliance.json`).
 * The cockpit reads the coverage dashboard server-side via the sentinel's
 * `coverageRef`; it is *this* file the user-interface.json previewDocuments
 * array needs to reference so the dashboard opens as the React cockpit
 * (with the new "Pick from existing docs" / "Create from knowledge base"
 * menu) instead of the raw JSON viewer.
 */
export const COMPLIANCE_DASHBOARD_REL = 'out/compliance/current.compliance.json';
