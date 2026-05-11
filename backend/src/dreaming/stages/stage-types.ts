/**
 * Shared payload shapes for jobs traversing the dreaming pipeline.
 * Each stage's handler receives `payload` of the corresponding type.
 */

export interface HarvestPayload {
  project: string;
}

export interface SegmentPayload {
  project: string;
  domain: string;
  /** Absolute paths to chat history JSONL files within this domain. */
  sessionFiles: string[];
}

export interface Trajectory {
  trajectoryId: string;
  domain: string;
  sessionFile: string;
  /** Slice of ChatMessage objects (from sessions.service.ts). */
  turns: any[];
  outcome: 'success' | 'failure' | 'unknown';
  outcomeSignals: { toolErrors: number; retries: number };
}

export interface ReflectPayload {
  project: string;
  trajectory: Trajectory;
}

export interface CandidateStrategy {
  candidateId: string;
  domain: string;
  title: string;
  when: string;
  do: string;
  because: string;
  evidence: string[];
  confidence: number;
  /** Trajectory IDs supporting this candidate. */
  supportTrajectories: string[];
}

export interface DistillPayload {
  project: string;
  domain: string;
  /** All REFLECT outputs collected for this domain in this run. */
  candidates: CandidateStrategy[];
}

export interface GroundPayload {
  project: string;
  domain: string;
  candidate: CandidateStrategy;
  supportCount: number;
}

export interface GroundedCandidate extends CandidateStrategy {
  webSources: Array<{ url: string; verdict: 'supports' | 'contradicts' | 'neutral'; note?: string }>;
  webScore: number | null;
  supportCount: number;
}

export interface ConsolidatePayload {
  project: string;
  domain: string;
  candidate: GroundedCandidate;
}

export interface ConsolidatedCandidate extends GroundedCandidate {
  /** When non-null, this candidate is a merge of an existing strategy. */
  mergedSkillName?: string;
  /** When non-null, holds the body Markdown that should replace the existing skill. */
  mergedBody?: string;
  contested: boolean;
  diversityScore: number;
  compositeScore: number;
}

export interface PromotePayload {
  project: string;
  domain: string;
  candidate: ConsolidatedCandidate;
}

export interface IndexPayload {
  project: string;
  runId: string;
  domain: string;
  candidate: ConsolidatedCandidate;
}
