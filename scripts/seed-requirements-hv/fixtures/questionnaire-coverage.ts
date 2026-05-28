/**
 * Coverage matrix + RFP registry entry + compliance sentinel for the
 * questionnaire RFP. Mirrors the existing `coverage-dashboard.ts`
 * fixture but scopes everything to the second RFP:
 *
 *  - rfpId: "questionnaire"
 *  - rows derived from `QUESTIONNAIRE_SHEETS` (one per question)
 *  - sourceRef per row addressing the cell the fill-back writes into
 *  - reuse some planned-response wiki pages from the main tender so the
 *    cross-RFP wiki reuse story is observable in the seed
 *
 * Output paths:
 *   - out/coverage/questionnaire.coverage.json   (rows)
 *   - out/compliance/questionnaire.compliance.json (sentinel → coverage)
 *   - out/rfps/questionnaire.json                (registry entry)
 *   - out/rfps/main.json                         (back-fill for the tender)
 */

import {
  QUESTIONNAIRE_COLUMNS,
  QUESTIONNAIRE_INBOX_REL,
  QUESTIONNAIRE_SHEETS,
  QUESTIONNAIRE_TITLE,
  type QuestionnaireQuestion,
} from './inbox-xlsx';

const QUESTIONNAIRE_RFP_ID = 'questionnaire';
const MAIN_RFP_ID = 'main';

// Map question state. We seed everything as `open` by default, then mark a
// handful as `drafted` / `reviewed` / `committed` so the cockpit's filter
// chips and state counts are non-trivial out of the box.
type CoverageState =
  | 'open'
  | 'drafted'
  | 'reviewed'
  | 'committed'
  | 'deviation'
  | 'clarify';
type ReviewStatus = 'pending' | 'in-review' | 'approved' | 'rejected';

function defaultStateFor(idx: number, q: QuestionnaireQuestion): CoverageState {
  // Reused planned responses are pre-drafted from the tender side — mark
  // them `drafted` so the user sees a coverage signal. Two of them get
  // promoted to `committed` so the fill-back has something to write.
  if (q.reusePlannedResponseSlug) {
    if (idx % 3 === 0) return 'committed';
    return 'drafted';
  }
  if (q.mandatory && idx % 7 === 0) return 'clarify';
  return 'open';
}

function reviewFor(state: CoverageState): ReviewStatus {
  switch (state) {
    case 'committed':
    case 'deviation':
      return 'approved';
    case 'reviewed':
    case 'clarify':
      return 'in-review';
    default:
      return 'pending';
  }
}

interface QuestionnaireCoverageRow {
  requirementId: string;
  rfpId: string;
  ears: string;
  state: CoverageState;
  reviewStatus: ReviewStatus;
  sourceVolume: string;
  sourceLocation: string;
  plannedResponseSlug: string;
  chips: string[];
  notes?: string;
  // XLSX cell address so fill-back can write the answer back into the
  // template workbook without re-parsing it.
  sourceRef: { sheet: string; row: number; column: string };
  sourceCitation: { docPath: string; locator: string };
}

const ROWS: QuestionnaireCoverageRow[] = [];
for (const sheet of QUESTIONNAIRE_SHEETS) {
  sheet.questions.forEach((q, qIdx) => {
    const xlsxRow = qIdx + 2; // +1 for header, +1 for 1-based
    const state = defaultStateFor(qIdx, q);
    const plannedResponseSlug =
      q.reusePlannedResponseSlug ??
      `planned-response/questionnaire-${q.id.toLowerCase()}`;
    const chips: string[] = [];
    if (q.mandatory) chips.push('mandatory');
    if (q.reusePlannedResponseSlug) chips.push('reused');
    ROWS.push({
      requirementId: q.id,
      rfpId: QUESTIONNAIRE_RFP_ID,
      ears: q.question,
      state,
      reviewStatus: reviewFor(state),
      sourceVolume: sheet.name,
      sourceLocation: `${sheet.name}!${QUESTIONNAIRE_COLUMNS.question.letter}${xlsxRow}`,
      plannedResponseSlug,
      chips,
      sourceRef: {
        sheet: sheet.name,
        row: xlsxRow,
        column: QUESTIONNAIRE_COLUMNS.question.letter,
      },
      sourceCitation: {
        docPath: QUESTIONNAIRE_INBOX_REL,
        locator: `${sheet.name} · ${q.id}`,
      },
      ...(q.reference ? { notes: `Reference: ${q.reference}` } : {}),
    });
  });
}

const counts = (state: CoverageState) =>
  ROWS.filter((r) => r.state === state).length;

export const QUESTIONNAIRE_COVERAGE = {
  schema: 'coverage-dashboard.v1',
  generatedAt: '2026-05-28T09:00:00Z',
  project: {
    name: 'NU-525-Lot-3 — PQQ',
    customer: 'Nordseeübertragungs-Netz GmbH (NSÜN)',
    scope: 'Pre-qualification questionnaire (5 sheets)',
    deliverableLanguage: 'de',
    reuseBaseLanguage: 'en',
  },
  gates: {
    pqq_internal_review: {
      dueDate: '2026-06-10',
      requires: 'every mandatory row reviewed / committed',
    },
    pqq_submission_due: '2026-06-21',
  },
  totals: {
    requirementsInScope: ROWS.length,
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
    mandatory: ROWS.filter((r) => r.chips.includes('mandatory')).length,
    reused: ROWS.filter((r) => r.chips.includes('reused')).length,
  },
  rows: ROWS,
};

export const QUESTIONNAIRE_COVERAGE_REL =
  'out/coverage/questionnaire.coverage.json';
export const QUESTIONNAIRE_COMPLIANCE_REL =
  'out/compliance/questionnaire.compliance.json';
export const QUESTIONNAIRE_RFP_REL = `out/rfps/${QUESTIONNAIRE_RFP_ID}.json`;
export const MAIN_RFP_REL = `out/rfps/${MAIN_RFP_ID}.json`;

export const QUESTIONNAIRE_COMPLIANCE_SENTINEL = {
  schema: 'compliance-matrix.v1',
  coverageRef: QUESTIONNAIRE_COVERAGE_REL,
  teamRef: 'wiki/topics/team.md',
  project: {
    name: 'NU-525-Lot-3 — PQQ',
    customer: 'Nordseeübertragungs-Netz GmbH (NSÜN)',
  },
};

export const QUESTIONNAIRE_RFP_ENTRY = {
  schema: 'rfp.v1' as const,
  id: QUESTIONNAIRE_RFP_ID,
  title: QUESTIONNAIRE_TITLE,
  kind: 'xlsx-questionnaire' as const,
  sources: [{ path: QUESTIONNAIRE_INBOX_REL, role: 'primary' as const }],
  coverageRef: QUESTIONNAIRE_COVERAGE_REL,
  sentinelRef: QUESTIONNAIRE_COMPLIANCE_REL,
  exportTarget: {
    kind: 'xlsx-fill' as const,
    templatePath: QUESTIONNAIRE_INBOX_REL,
    answerColumnHeader: QUESTIONNAIRE_COLUMNS.response.header,
  },
  dueDate: '2026-06-21',
};

// Back-fill the main tender RFP so the cockpit's picker shows both. Points
// at the existing legacy coverage/sentinel paths — no migration required.
export const MAIN_RFP_ENTRY = {
  schema: 'rfp.v1' as const,
  id: MAIN_RFP_ID,
  title: 'NU-525-Lot-3 technical tender',
  kind: 'docx-bundle' as const,
  sources: [
    { path: 'inbox/NU-525-Lot-3-Volume-1-Functional-Spec.docx', role: 'primary' as const },
    { path: 'inbox/NU-525-Lot-3-Volume-2-Annex-A-Electrical-Performance.docx', role: 'supplementary' as const },
    { path: 'inbox/NU-525-Lot-3-Volume-3-Annex-B-Protection-Control.docx', role: 'supplementary' as const },
    { path: 'inbox/NU-525-Lot-3-Volume-4-Annex-C-Harmonics.docx', role: 'supplementary' as const },
    { path: 'inbox/NU-525-Lot-3-Volume-5-Annex-DEF-Auxiliaries.docx', role: 'supplementary' as const },
    { path: 'inbox/NU-525-Lot-3-Volume-6-Grid-Code.docx', role: 'supplementary' as const },
    { path: 'inbox/NU-525-Lot-3-Late-Clarifications-2026-04-18.docx', role: 'supplementary' as const },
  ],
  coverageRef: 'out/coverage/current.coverage.json',
  sentinelRef: 'out/compliance/current.compliance.json',
  exportTarget: { kind: 'docx-fillback' as const },
  dueDate: '2026-09-15',
};

// Planned-response wiki stubs the seed should write so non-reused
// questionnaire rows have a real page on disk. Returns one entry per row
// without `reusePlannedResponseSlug` so the questionnaire fill-back can
// pick up at least a few committed answers.
export interface QuestionnaireWikiStub {
  slug: string;       // e.g. 'questionnaire-pqq-tech-01'
  title: string;      // e.g. 'PQQ-TECH-01'
  filename: string;   // e.g. 'questionnaire-pqq-tech-01.md'
  body: string;       // markdown body (no frontmatter — seed adds it)
}

export const QUESTIONNAIRE_WIKI_STUBS: QuestionnaireWikiStub[] = [];
for (const sheet of QUESTIONNAIRE_SHEETS) {
  for (const q of sheet.questions) {
    if (q.reusePlannedResponseSlug) continue;
    const slugTail = q.id.toLowerCase();
    const slug = `planned-response/questionnaire-${slugTail}`;
    const filename = `questionnaire-${slugTail}.md`;
    const body = q.seededAnswerBody
      ? `> Question (${q.id}): ${q.question}\n\n${q.seededAnswerBody}\n`
      : `> Question (${q.id}): ${q.question}\n\n_TODO: draft the response — this stub is empty._\n`;
    QUESTIONNAIRE_WIKI_STUBS.push({
      slug,
      title: q.id,
      filename,
      body,
    });
  }
}

// Two reused rows are pre-committed so the fill-back has something to
// write into the workbook end-to-end. Names exported for the seed's
// post-write step that flips their state and ensures the wiki page exists.
export const PRE_COMMITTED_QUESTIONNAIRE_IDS: string[] = ROWS
  .filter((r) => r.state === 'committed')
  .map((r) => r.requirementId);
