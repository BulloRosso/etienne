import type { Classification, Provenance, ReviewKind } from '../../memory/types';
import type { DreamVerdict } from '../../memory/verdict-mapping';

export interface DreamingSettings {
  enabled: boolean;
  cronExpression: string;
  timeZone?: string;
  maxItems: number;
  maxLlmCalls?: number;
  maxBudget?: number;
  skillName: string;
}

export const DEFAULT_DREAMING_SETTINGS: DreamingSettings = {
  enabled: false,
  cronExpression: '0 22 * * *',
  timeZone: 'UTC',
  maxItems: 10,
  skillName: 'dreaming',
};

export interface DreamItemFeedback {
  itemId: string;
  /**
   * Verdict union accepted by /api/dreaming/.../feedback. Legacy clients send
   * 'good' | 'bad' | 'deepen'; Adaptive-Memory clients additionally send
   * 'badly_reasoned' | 'unusable' | 'pending'. Server-side bridging lives in
   * src/memory/verdict-mapping.ts.
   */
  verdict: DreamVerdict;
}

export interface DreamFeedbackPayload {
  feedback: DreamItemFeedback[];
}

export interface DreamItem {
  id: string;
  domain: string;
  title: string;
  body: string;
  evidence: string[];
  compositeScore: number;
  status?: 'active' | 'contested' | 'investigating' | 'deprecated';
  dismissedByUser: boolean;
  /**
   * Adaptive-Memory extensions. Optional on legacy items; when undefined on read,
   * callers default `classification` to 'private' and synthesise a minimal
   * Provenance at the boundary. `kind` defaults to 'skill_diff' for legacy strategy
   * items when they are surfaced through the Adaptive-Memory ReviewItem API.
   */
  kind?: ReviewKind;
  cycleId?: string;
  classification?: Classification;
  provenance?: Provenance;
}

export interface DreamFile {
  runId: string;
  generatedAt: string;
  items: DreamItem[];
}
