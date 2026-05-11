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
  verdict: 'good' | 'bad' | 'deepen';
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
}

export interface DreamFile {
  runId: string;
  generatedAt: string;
  items: DreamItem[];
}
