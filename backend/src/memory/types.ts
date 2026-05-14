/**
 * Adaptive Memory (Triple-P) data model.
 *
 * Single source of truth for the PRD §3 interfaces. Pure types only — no runtime
 * code, no NestJS, no DI. Imported by the firewall (`classification.ts`), the
 * adaptive-memory subagents, and any module that bridges legacy data to the new shape.
 *
 * See requirements-docs/prd-revised-dreaming.md §3 for the canonical definitions.
 */

// --- Core meta -----------------------------------------------------------------

export type Classification = 'public' | 'private' | 'secret';

export interface Provenance {
  /** Session IDs that contributed to this entry. */
  sourceSessions: string[];
  /** Upstream entry IDs (page slug, KG entity id, fragment id, ...). */
  sourceEntries: string[];
  createdBy: 'agent' | 'ponderer' | 'user';
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
  /** Ponderer-only: identifies the inference pattern that produced this entry. */
  inferenceTag?: string;
}

export interface EntryMeta {
  id: string;
  classification: Classification;
  provenance: Provenance;
}

// --- Project-local stores ------------------------------------------------------

export interface WikiPage extends EntryMeta {
  title: string;
  slug: string;
  /** Markdown body. */
  body: string;
  /** Slugs of related pages (see-also). */
  links: string[];
}

export interface KGEntity extends EntryMeta {
  type: string;
  label: string;
  attributes: Record<string, unknown>;
}

export interface KGEdge extends EntryMeta {
  /** Subject entity id. */
  subject: string;
  predicate: string;
  /** Object entity id. */
  object: string;
}

export interface RAGFragment extends EntryMeta {
  text: string;
  /** Vector handle owned by the RAG service. */
  embeddingId: string;
  tags: string[];
}

export interface Preference extends EntryMeta {
  scope: 'user' | 'collaborator';
  /** Collaborator name when `scope === 'collaborator'`. */
  subject?: string;
  statement: string;
  /** 0..1 confidence in the preference. */
  confidence: number;
}

// --- Cross-project store -------------------------------------------------------

export interface PersonalityEntry extends EntryMeta {
  /** The operating rule (agent behaviour, not user preference). */
  principle: string;
  /** When the principle applies. */
  context: string;
  /** Session IDs that justified induction of this principle. */
  evidence: string[];
}

// --- Skills --------------------------------------------------------------------

export type StoreName =
  | 'wiki'
  | 'kg'
  | 'rag'
  | 'preferences'
  | 'sor'
  | 'personality';

export interface SkillFrontmatter {
  description: string;
  sourcePriorities: Array<{ store: StoreName; priority: number }>;
  /** Upper bound for context entries pulled while this skill is active. */
  classificationContext: Classification;
  invocationTriggers: string[];
  /** Used by the Ponderer quality-scoring stage when this skill is active. */
  baselineTurns?: number;
}

export interface Skill {
  id: string;
  name: string;
  /** Markdown body (workflow steps). */
  body: string;
  frontmatter: SkillFrontmatter;
  /** Hash of the git-pulled original (preserved across local edits). */
  originalHash: string;
  /** Hash of the locally-stored version. */
  currentHash: string;
}

// --- Context flow --------------------------------------------------------------

export interface TaskFraming {
  intent: string;
  keywords: string[];
  activeSkillIds: string[];
}

export interface CandidateContext {
  wikiPages: WikiPage[];
  kgSubgraph: { entities: KGEntity[]; edges: KGEdge[] };
  ragFragments: RAGFragment[];
  preferences: Preference[];
  sorRecords: Array<{ source: string; payload: unknown }>;
  activeSkills: Skill[];
}

export interface ContextPackage {
  /** Assembled from active Skills. */
  systemPrompt: string;
  /** Compressed serialization of the surviving CandidateContext. */
  knowledge: string;
  userPrompt: string;
  meta: {
    totalTokens: number;
    sourceSummary: Record<StoreName, number>;
    droppedForClassification: number;
  };
}

// --- Sessions ------------------------------------------------------------------

export interface SessionTurn {
  role: 'user' | 'agent' | 'tool';
  content: string;
  /** Writes performed by writeback tools during this turn. */
  storeWrites: Array<{ store: StoreName; entryId: string }>;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  /** ISO 8601 timestamp. */
  startedAt: string;
  /** ISO 8601 timestamp. */
  endedAt: string;
  turns: SessionTurn[];
  activeSkills: string[];
  /** Git ref or content hash at session open. */
  workspaceSnapshotBefore: string;
  /** Git ref or content hash at session close. */
  workspaceSnapshotAfter: string;
  /** Filled by Ponderer quality scoring; 0..1, higher is better. */
  qualityScore?: number;
}

// --- Review queue --------------------------------------------------------------

export type ReviewKind =
  | 'personality_proposal'
  | 'skill_diff'
  | 'stale_data_flag'
  | 'contradiction_resolution'
  | 'large_deletion';

export type ReviewVerdict = 'pending' | 'good' | 'badly_reasoned' | 'unusable';

export interface ReviewItem {
  id: string;
  projectId: string;
  kind: ReviewKind;
  summary: string;
  /** Shape depends on `kind`. */
  details: unknown;
  provenance: Provenance;
  status: ReviewVerdict;
  /** Ponderer cycle that produced this item. */
  cycleId: string;
}

// --- Personality admission candidate (PRD §6.4) --------------------------------

/**
 * Intermediate shape used by the Ponderer's personality-induction stage before
 * a candidate becomes a PersonalityEntry. Carries enough metadata for the
 * classification firewall to decide admission.
 */
export interface PersonalityCandidate {
  principle: string;
  context: string;
  evidence: string[];
  inferenceTag: string;
  /** True when the principle contains no project-specific particulars. */
  isAbstract: boolean;
  /** Classification of every evidence entry, used by `personalityAdmissionCheck`. */
  evidenceClassifications: Classification[];
}
