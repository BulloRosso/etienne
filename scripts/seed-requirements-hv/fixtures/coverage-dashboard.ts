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
}

const REQUIREMENTS = KG_ENTITIES.filter(
  (e) => e.properties.domainType === 'Requirement',
);

const ROWS: CoverageRow[] = REQUIREMENTS.map((r) => {
  const chips: string[] = [];
  if (r.properties.overrideFlag === 'true') chips.push('override');
  if (r.properties.reuseMismatch === 'true') chips.push('reuse-mismatch');
  if (r.properties.loadBearing === 'true') chips.push('load-bearing');

  const row: CoverageRow = {
    requirementId: r.id,
    ears: r.properties.ears,
    state: r.properties.state as CoverageState,
    sourceVolume: r.properties.sourceVolume,
    sourceLocation: r.properties.sourceLocation,
    chips,
  };
  if (r.properties.responsibleEngineer) row.responsibleEngineer = r.properties.responsibleEngineer;
  if (r.properties.draftedFrom) row.draftedFrom = r.properties.draftedFrom;
  if (r.properties.typeTestEvidence) row.typeTestEvidence = r.properties.typeTestEvidence;

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
