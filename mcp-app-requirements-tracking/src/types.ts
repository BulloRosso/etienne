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
