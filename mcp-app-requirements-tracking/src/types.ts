/**
 * TenderTrace app-side types — mirror of
 * backend/src/requirements-tracking/types/tendertrace-types.ts (trimmed to
 * what the UI consumes). Keep the two files in sync when the contract changes.
 */

export type EarsPattern =
  | "ubiquitous"
  | "event_driven"
  | "state_driven"
  | "unwanted_behavior"
  | "optional_feature"
  | "complex";

export type Modality = "mandatory" | "target" | "optional";

export interface EarsFields {
  system: string | null;
  trigger: string | null;
  state: string | null;
  condition: string | null;
  feature: string | null;
  response: string | null;
}

export interface Quantity {
  value: number;
  unit: string;
  kind: string;
}

export interface SourceRef {
  document: string;
  documentId?: string;
  section: string;
  sectionId?: string;
  page: number;
  quote: string;
}

export interface Ambiguity {
  type: string;
  note: string;
  clarification_question_draft: string;
}

export type ImplementationStatus =
  | "unplanned"
  | "planned"
  | "in_progress"
  | "implemented"
  | "accepted";

export interface RequirementVersion {
  id: string;
  requirementId: string;
  versionNo: number;
  earsPattern: EarsPattern;
  earsFields: EarsFields;
  earsText: string;
  category: string;
  modality: Modality;
  quantities: Quantity[];
  sourceRef: SourceRef;
  ambiguities: Ambiguity[];
  createdFromProposalId: string;
  createdAt: string;
  supersedesVersionId?: string;
  language?: string;
}

export interface Requirement {
  id: string;
  status: "draft" | "baselined" | "retired";
  currentVersionId: string;
  currentVersion?: RequirementVersion;
  implementationStatus?: ImplementationStatus;
  acceptedBy?: string;
  acceptedAt?: string;
  versionCount?: number;
}

export type ProposalKind =
  | "extraction"
  | "drift"
  | "compliance"
  | "response"
  | "claim"
  | "link"
  | "shadow_scope"
  | "catalog_import"
  | "mapping"
  | "progress_update"
  | "acceptance_signal";

export interface Evidence {
  quote: string;
  location?: string;
  speaker_or_author?: string | null;
  date?: string | null;
  additional?: Evidence[];
  artifactId?: string;
}

export interface ProposalDiff {
  before_ears_text: string;
  after_ears_text: string;
  changed_fields: Array<{ field: string; before: string; after: string }>;
  modality_change: { before: Modality; after: Modality } | null;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  status: "proposed" | "approved" | "rejected" | "superseded";
  payload: any;
  evidence: Evidence | null;
  affectedRequirementIds: string[];
  agentRunId?: string;
  promptVersion?: string;
  confidence?: number;
  createdAt: string;
  decision?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  classification?: string;
  decisionStatus?: "requested" | "decided" | null;
  scopeAssessment?: "likely_in_scope" | "likely_change" | "unclear";
  scopeRationale?: string;
  sourceArtifactId?: string;
}

export interface RequirementRelation {
  id: string;
  kind:
    | "depends_on"
    | "refines"
    | "derived_from_same_clause"
    | "conflicts_with"
    | "merged_into";
  fromRequirementId: string;
  toRequirementId: string;
  origin: string;
  status: "proposed" | "approved" | "resolved";
  resolutionNote?: string;
  createdAt: string;
}

export interface TenderDocument {
  id: string;
  title: string;
  kind: "tender" | "artifact";
  artifactType?: string;
  originalPath?: string;
  parsedPath?: string;
  parseStatus: "pending" | "parsing" | "parsed" | "needs_ocr" | "failed";
  uploadedAt: string;
  artifactDate?: string;
  artifactParties?: string;
}

export interface DocumentSection {
  id: string;
  documentId: string;
  headingPath: string;
  pageFrom: number;
  pageTo: number;
  charFrom: number;
  charTo: number;
  text: string;
}

export interface FeedEvent {
  seq: number;
  ts: string;
  type: string;
  payload: any;
}

export interface TenderMeta {
  key: string;
  title: string;
  phase: "intake" | "bid" | "implementation" | "closed";
  baselineLabel?: string;
  language?: string;
}

export interface TenderCounts {
  documents: number;
  requirements: number;
  openProposalsByKind: Record<string, number>;
  unresolvedConflicts: number;
  staleLinks: number;
  staleMappings: number;
  pendingShadow: number;
  openCaptures: number;
}

/** Payload of render_requirements_tracking */
export interface RenderPayload {
  schema: "tendertrace.v1";
  workspaceProject: string;
  page: string;
  entityId?: string;
  tender: TenderMeta | null;
  counts: TenderCounts;
}

export interface DecideResult {
  success: boolean;
  conflict?: boolean;
  winning?: { decision: string; decidedBy?: string; decidedAt?: string };
  blocked?: boolean;
  blockers?: any[];
  effect?: any;
  error?: string;
}

// ── Tender analysis (mirror of backend/src/requirements-tracking/analysis/analysis-types.ts) ──

export interface ConsistencyAlert {
  figureId: string;
  sheet: string;
  cell: string;
  label: string;
  tenderValue: number;
  tenderUnit: string;
  tenderRaw: string;
  excelValue: number;
  excelUnit: string;
  excelRaw: string;
  deviationAbs: number;
  deviationPct: number;
  note: string;
  severity: "warning" | "error";
  resolution?: "tender" | "excel" | "clarify";
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export type AnalysisStatus = "running" | "awaiting_review" | "finished" | "partial" | "failed";

export interface AnalysisFileState {
  name: string;
  projectPath: string;
  kind: "tender" | "catalog" | "template" | "glossary";
  ext: string;
  sha256: string;
  docId?: string;
  status: "pending" | "registered" | "parsed" | "needs_ocr" | "extracting" | "extracted" | "skipped" | "failed";
  reason?: string;
  error?: string;
  sections?: number;
  chunks?: number;
  proposals?: number;
  figures?: number;
  alerts?: number;
  pageSource?: "markers" | "estimated";
}

export interface AnalysisRunState {
  schema: "tendertrace.analysis.v1";
  runId: string;
  tenderKey: string;
  status: AnalysisStatus;
  phase: "A" | "B";
  percent: number;
  step: string;
  stepLabel: string;
  currentFile?: string;
  message?: string;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  finishedAt?: string;
  options: { force: boolean; minMappingConfidence: number; language: string; autoPublishCatalog: boolean; extractWorkbooks: boolean };
  inputs: { tenderDir: string; catalogFiles: string[]; templateFile?: string; glossaryFile?: string };
  files: AnalysisFileState[];
  extraction: { proposalIds: string[]; failedChunks: number; mergeCandidates: number; documents: number };
  figures: { count: number; path?: string };
  glossary: { terms: number; path?: string; cached?: boolean };
  consistency: { checked: number; matched: number; alerts: Array<ConsistencyAlert & { proposalId: string }> };
  catalog: { importId?: string; serviceIds: string[]; published: number; capabilities: number; skipped: boolean; reason?: string };
  review: { open: number; approved: number; rejected: number; total: number };
  mapping?: {
    proposalIds: string[];
    dropped: { lowConfidence: number; related: number; noCandidates: number };
    retrievalFallback: boolean;
    requirementIds: string[];
  };
  compliance?: { proposalIds: string[]; verdicts: Record<string, number> };
  report?: { markdownPath: string; docxPath?: string; snapshotPath: string; generatedAt: string; reliable: boolean; narrativeOk: boolean };
  agentRunIds: string[];
  errors: Array<{ step: string; file?: string; error: string; at: string }>;
}

export type StageStatus = "pending" | "running" | "waiting" | "done" | "blocked" | "failed";

export interface AnalysisStage {
  id: "ingest" | "review" | "contradictions" | "mapping" | "report";
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

export interface AnalysisAlertRow extends ConsistencyAlert {
  proposalId: string;
  alertIndex: number;
  proposalStatus: string;
  earsText: string;
}

export interface AnalysisStatusPayload {
  state: AnalysisRunState | null;
  readiness: AnalysisReadiness;
  stages: AnalysisStage[];
  alerts: AnalysisAlertRow[];
  currentStage: number;
}
