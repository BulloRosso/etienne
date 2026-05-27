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

import { KG_ENTITIES } from './kg';

type CoverageState =
  | 'open'
  | 'drafted'
  | 'reviewed'
  | 'committed'
  | 'deviation'
  | 'clarify';

type ReviewStatus = 'pending' | 'in-review' | 'approved' | 'rejected';

interface SourceCitation {
  docPath?: string; // project-relative, fuels [[doc:…]] chips
  locator?: string; // e.g. "§4.2" or "Annex C §3.3" — matches sourceLocation
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

const ROWS: CoverageRow[] = REQUIREMENTS.map((r) => {
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

  return row;
});

const counts = (state: CoverageState) => ROWS.filter((r) => r.state === state).length;

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
  rows: ROWS,
};

export const COVERAGE_DASHBOARD_REL = 'out/coverage/current.coverage.json';
