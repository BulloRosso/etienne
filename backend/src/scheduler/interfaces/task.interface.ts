export interface TaskDefinition {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  timeZone?: string;
  type?: 'recurring' | 'one-time';
}

export interface TaskHistoryEntry {
  timestamp: string;
  name: string;
  response: string;
  isError: boolean;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TaskStorage {
  tasks: TaskDefinition[];
}

export interface TaskHistoryStorage {
  taskHistory: TaskHistoryEntry[];
}
