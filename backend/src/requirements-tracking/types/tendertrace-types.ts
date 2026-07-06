/**
 * TenderTrace domain types — the logical model of spec §3.4
 * (requirements-docs/requirements-tracking/requirements-tracking.md).
 *
 * These shapes are shared with the MCP UI app (mcp-app-requirements-tracking/src/types.ts
 * mirrors them). Physical storage is the knowledge graph (rdf-store) + workspace
 * filesystem, see graph/tt-repository.ts.
 */

export type EarsPattern =
  | 'ubiquitous'
  | 'event_driven'
  | 'state_driven'
  | 'unwanted_behavior'
  | 'optional_feature'
  | 'complex';

export type Modality = 'mandatory' | 'target' | 'optional';

export type RequirementCategory =
  | 'functional'
  | 'performance'
  | 'security'
  | 'interface'
  | 'data'
  | 'usability'
  | 'process'
  | 'commercial'
  | 'legal'
  | 'documentation';

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
  kind: 'threshold' | 'target' | 'count' | 'deadline';
}

export interface SourceRef {
  document: string;
  documentId?: string;
  section: string;
  sectionId?: string;
  page: number;
  quote: string;
}

export type AmbiguityType =
  | 'vague_term'
  | 'missing_threshold'
  | 'missing_trigger'
  | 'undefined_actor'
  | 'conflicting_reference'
  | 'undefined_reference';

export interface Ambiguity {
  type: AmbiguityType;
  note: string;
  clarification_question_draft: string;
}

export type RequirementStatus = 'draft' | 'baselined' | 'retired';

export type ImplementationStatus =
  | 'unplanned'
  | 'planned'
  | 'in_progress'
  | 'implemented'
  | 'accepted';

export interface RequirementVersion {
  id: string; // e.g. REQ-047/v/3
  requirementId: string; // REQ-047
  versionNo: number;
  earsPattern: EarsPattern;
  earsFields: EarsFields;
  earsText: string;
  category: RequirementCategory;
  modality: Modality;
  quantities: Quantity[];
  sourceRef: SourceRef;
  ambiguities: Ambiguity[];
  createdFromProposalId: string;
  createdAt: string; // ISO
  supersedesVersionId?: string;
  language?: string; // 'de' | 'en'
}

export interface Requirement {
  id: string; // REQ-047
  status: RequirementStatus;
  currentVersionId: string;
  currentVersion?: RequirementVersion;
  implementationStatus?: ImplementationStatus;
  acceptedBy?: string;
  acceptedAt?: string;
}

export type ProposalKind =
  | 'extraction'
  | 'drift'
  | 'compliance'
  | 'response'
  | 'claim'
  | 'link'
  | 'shadow_scope'
  | 'catalog_import'
  | 'mapping'
  | 'progress_update'
  | 'acceptance_signal';

export type ProposalDecision =
  | 'in_scope'
  | 'change_order'
  | 'rejected'
  | 'clarify'
  | 'approved'
  | 'linked'
  | 'internal'
  | 'escalated_to_drift'
  | 'published'
  | 'merged_as_version'
  | 'noted'
  | 'confirmed_acceptance';

export type ProposalStatus = 'proposed' | 'approved' | 'rejected' | 'superseded';

export type DriftClassification =
  | 'NO_IMPACT'
  | 'CONFIRMATION'
  | 'MODIFICATION'
  | 'NEW_REQUIREMENT'
  | 'RELAXATION_OR_REMOVAL'
  | 'CONFLICT'
  | 'CLARIFICATION_NEEDED'
  | 'PROGRESS_UPDATE'
  | 'ACCEPTANCE_SIGNAL';

export interface Evidence {
  quote: string;
  location?: string;
  speaker_or_author?: string | null;
  date?: string | null;
  /** additional evidence records attached by cross-artifact dedup (§12.3) */
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
  id: string; // P-0113
  kind: ProposalKind;
  status: ProposalStatus;
  /** kind-specific structured payload (extraction requirement, drift analysis, verdict, link, mapping, …) */
  payload: any;
  evidence: Evidence | null;
  affectedRequirementIds: string[];
  agentRunId?: string;
  promptVersion?: string;
  confidence?: number;
  createdAt: string;
  decision?: ProposalDecision;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** for drift proposals */
  classification?: DriftClassification;
  decisionStatus?: 'requested' | 'decided' | null;
  scopeAssessment?: 'likely_in_scope' | 'likely_change' | 'unclear';
  scopeRationale?: string;
  /** id of the artifact/document/capture this proposal derives from */
  sourceArtifactId?: string;
  /** clarifications attached by Quick Capture (attestations, never evidence) */
  clarificationIds?: string[];
}

export interface Baseline {
  id: string; // baseline/v1.0
  label: string; // v1.0
  frozenAt: string;
  frozenBy: string;
  requirementVersionIds: string[];
}

export type RelationKind =
  | 'depends_on'
  | 'refines'
  | 'derived_from_same_clause'
  | 'conflicts_with'
  | 'merged_into';

export interface RequirementRelation {
  id: string; // R-0002
  kind: RelationKind;
  fromRequirementId: string;
  toRequirementId: string;
  origin: 'extraction' | 'dedup' | 'conflict_check' | 'drift' | 'manual';
  createdFromProposalId?: string;
  status: 'proposed' | 'approved' | 'resolved';
  resolutionNote?: string;
  createdAt: string;
}

export type ServiceKind = 'service' | 'reference' | 'certification' | 'text_block';

export interface ServiceScope {
  included: string[];
  excluded: string[];
  prerequisites: string[];
  deliverables: string[];
}

export interface ServiceVersion {
  id: string; // SVC-012/v/3
  serviceId: string;
  versionNo: number;
  bodyMarkdownPath: string; // relative path under requirements-tracking/
  images: Array<{ imageId: string; relativePath: string; alt: string }>;
  tags: string[];
  scope: ServiceScope;
  source: 'manual' | 'docx_import';
  sourceDocumentId?: string;
  status: 'draft' | 'published';
  publishedAt?: string;
  publishedBy?: string;
}

export interface CatalogService {
  id: string; // SVC-012
  kind: ServiceKind;
  key: string;
  title: string;
  status: 'active' | 'archived';
  currentVersionId?: string;
}

export type MappingCoverage = 'full' | 'partial' | 'related';

export interface ServiceRequirementMapping {
  id: string; // M-0007
  serviceVersionId: string;
  requirementId: string;
  coverage: MappingCoverage;
  origin: 'manual' | 'ai';
  rationale?: string;
  serviceEvidence?: string[];
  gapOrExclusion?: string;
  createdFromProposalId?: string;
  status: 'proposed' | 'approved' | 'rejected';
  staleSince?: string;
  createdAt: string;
}

export type ComplianceVerdict = 'FULL' | 'PARTIAL' | 'NON_COMPLIANT' | 'NEEDS_INPUT';

export interface ComplianceRecord {
  requirementId: string;
  verdict: ComplianceVerdict;
  justification: string;
  evidenceRefs: Array<{ serviceId: string; versionNo: number }>;
  deviation: string | null;
  riskNote: string | null;
  internalQuestion: { question: string; owner_role: string } | null;
  assignedTo?: string;
  approvedFromProposalId?: string;
}

export type IssueStatusCategory = 'todo' | 'in_progress' | 'done';

export interface TrackerIssue {
  key: string; // PORTAL-231
  issueType: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: IssueStatusCategory;
  epicKey?: string;
  labels: string[];
  assignee?: string;
  comments: Array<{ author: string; date: string; body: string }>;
  updatedAt: string;
}

export type LinkRelationship =
  | 'implements'
  | 'partially_implements'
  | 'tests'
  | 'documents'
  | 'related';

export interface RequirementIssueLink {
  id: string; // L-0003
  requirementId: string;
  issueKey: string;
  relationship: LinkRelationship;
  createdFromProposalId?: string;
  status: 'proposed' | 'approved' | 'rejected';
  staleSince?: string;
  matchesCurrent?: boolean;
  rationale?: string;
  createdAt: string;
}

export interface StaleNotice {
  id: string;
  requirementId: string;
  issueKeys: string[];
  draftComment: string;
  createdAt: string;
  postedAt?: string;
  dismissedAt?: string;
}

export interface TenderDocument {
  id: string; // D-01
  title: string;
  kind: 'tender' | 'artifact'; // tender source vs implementation-phase inbound
  artifactType?: 'email' | 'minutes' | 'change_request' | 'spec' | 'paste';
  originalPath?: string; // relative under requirements-tracking/
  parsedPath?: string; // parsed/<docId>/
  parseStatus: 'pending' | 'parsing' | 'parsed' | 'needs_ocr' | 'failed';
  uploadedAt: string;
  sha256?: string;
  artifactDate?: string;
  artifactParties?: string;
}

export interface DocumentSection {
  id: string; // D-01/sec/3.2.1
  documentId: string;
  headingPath: string;
  pageFrom: number;
  pageTo: number;
  charFrom: number;
  charTo: number;
  text: string;
}

export interface Capture {
  id: string; // C-0001
  status: 'processing' | 'awaiting_answers' | 'proposals_ready' | 'closed' | 'failed';
  artifactId: string;
  createdBy: string;
  createdAt: string;
  questions: CaptureQuestion[];
  proposalIds: string[];
  summary?: any;
}

export interface CaptureQuestion {
  id: string;
  question: string;
  options: string[];
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  skipped?: boolean;
}

export interface Claim {
  id: string; // CL-1
  title: string;
  status: 'draft' | 'generated' | 'sent';
  proposalIds: string[];
  narratives?: Record<string, string>; // proposalId -> narrative paragraph
  pricing?: Record<string, string>;
  exportPath?: string;
  createdAt: string;
}

export interface DeviationReport {
  id: string; // DR-1
  params: {
    sinceBaseline?: string;
    dateFrom?: string;
    dateTo?: string;
    filters?: Record<string, any>;
  };
  generatedAt: string;
  generatedBy: string;
  snapshotPath: string; // reports/<id>.snapshot.json
  narrative?: {
    executive_summary: string;
    change_lines: Array<{ requirement_id: string; line: string }>;
    attention_items: Array<{ kind: string; ref: string; line: string }>;
  };
  exportPath?: string;
}

export interface AgentRun {
  id: string; // AR-0042
  pipeline: string;
  promptVersion: string;
  promptHash?: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  proposalIds?: string[];
}

export interface Clarification {
  id: string; // CLQ-0001
  captureId: string;
  proposalId?: string;
  question: string;
  options: string[];
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  skipped: boolean;
}

export interface StatusChange {
  requirementId: string;
  from: ImplementationStatus | null;
  to: ImplementationStatus;
  at: string;
}

export interface FeedEvent {
  seq: number;
  ts: string;
  type: string;
  payload: any;
}

export type TenderPhase = 'intake' | 'bid' | 'implementation' | 'closed';

export interface TenderMeta {
  key: string; // T-2026-014
  title: string;
  phase: TenderPhase;
  baselineLabel?: string;
  language?: string;
}

/** Seed-only timestamp/actor override, honored for the admin auth context only. */
export interface SeedOverride {
  at?: string;
  by?: string;
}
