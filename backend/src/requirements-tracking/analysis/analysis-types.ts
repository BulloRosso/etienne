import { ConsistencyAlert } from '../types/tendertrace-types';

/**
 * Shared shapes of the tender-analysis run (state.json, rt_get_analysis_status
 * payload). Mirrored in mcp-app-requirements-tracking/src/types.ts — keep in sync.
 */

export type AnalysisStep =
  | 'discover'
  | 'parse'
  | 'figures'
  | 'glossary'
  | 'extract'
  | 'consistency'
  | 'catalog'
  | 'capabilities'
  | 'awaiting_review'
  | 'mapping'
  | 'compliance'
  | 'report'
  | 'done';

export type AnalysisStatus = 'running' | 'awaiting_review' | 'finished' | 'partial' | 'failed';

export interface AnalysisOptions {
  /** re-parse, re-extract and re-import even when nothing changed (duplicates cards!) */
  force?: boolean;
  /** clear-match threshold for phase B mapping proposals (default 0.75) */
  minMappingConfidence?: number;
  language?: string;
  /** publish catalog-import proposals without the wizard (default true — it is our own catalog) */
  autoPublishCatalog?: boolean;
  /** also run EARS extraction over workbook rows (default false — workbooks feed the figure index) */
  extractWorkbooks?: boolean;
}

export interface AnalysisFileState {
  name: string;
  projectPath: string;
  kind: 'tender' | 'catalog' | 'template' | 'glossary';
  ext: string;
  sha256: string;
  docId?: string;
  status:
    | 'pending'
    | 'registered'
    | 'parsed'
    | 'needs_ocr'
    | 'extracting'
    | 'extracted'
    | 'skipped'
    | 'failed';
  reason?: string;
  error?: string;
  sections?: number;
  chunks?: number;
  proposals?: number;
  figures?: number;
  alerts?: number;
  pageSource?: 'markers' | 'estimated';
}

export interface AnalysisRunState {
  schema: 'tendertrace.analysis.v1';
  runId: string;
  tenderKey: string;
  status: AnalysisStatus;
  phase: 'A' | 'B';
  percent: number;
  step: AnalysisStep;
  stepLabel: string;
  currentFile?: string;
  message?: string;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  finishedAt?: string;
  options: Required<AnalysisOptions>;
  inputs: {
    tenderDir: string;
    catalogFiles: string[];
    templateFile?: string;
    glossaryFile?: string;
  };
  files: AnalysisFileState[];
  extraction: { proposalIds: string[]; failedChunks: number; mergeCandidates: number; documents: number };
  figures: { count: number; path?: string };
  glossary: { terms: number; path?: string; cached?: boolean };
  consistency: { checked: number; matched: number; alerts: Array<ConsistencyAlert & { proposalId: string }> };
  catalog: {
    importId?: string;
    serviceIds: string[];
    published: number;
    capabilities: number;
    skipped: boolean;
    reason?: string;
  };
  review: { open: number; approved: number; rejected: number; total: number };
  mapping?: {
    proposalIds: string[];
    dropped: { lowConfidence: number; related: number; noCandidates: number };
    retrievalFallback: boolean;
    requirementIds: string[];
  };
  compliance?: { proposalIds: string[]; verdicts: Record<string, number> };
  report?: {
    markdownPath: string;
    docxPath?: string;
    snapshotPath: string;
    generatedAt: string;
    reliable: boolean;
    narrativeOk: boolean;
  };
  agentRunIds: string[];
  /**
   * Everything worth showing in the cockpit's Details panel. `severity`
   * separates real failures from housekeeping notices (orphan cleanup,
   * retrieval fallback): only failures make a finished run `partial`.
   */
  errors: Array<{ step: string; file?: string; error: string; at: string; severity?: 'error' | 'notice' }>;
  /** set once analysis.ready_for_phase_b was emitted for this run */
  readyNotifiedAt?: string;
}

export type StageStatus = 'pending' | 'running' | 'waiting' | 'done' | 'blocked' | 'failed';

export interface AnalysisStage {
  id: 'ingest' | 'review' | 'contradictions' | 'mapping' | 'report';
  status: StageStatus;
  headline: string;
  detail: string;
  blockedBy: string[];
}

export interface AnalysisReadiness {
  phaseADone: boolean;
  phaseB: boolean;
  reliable: boolean;
  openReviews: number;
  approvedRequirements: number;
  unresolvedAlerts: number;
  resolvedAlerts: number;
  clarifyForCustomer: number;
  internalQuestions: number;
  pendingMappings: number;
  pendingVerdicts: number;
}

export interface AnalysisStatusPayload {
  state: AnalysisRunState | null;
  readiness: AnalysisReadiness;
  stages: AnalysisStage[];
  alerts: Array<ConsistencyAlert & { proposalId: string; alertIndex: number; proposalStatus: string; earsText: string }>;
  currentStage: number;
}
