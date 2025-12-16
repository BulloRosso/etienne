/**
 * TypeScript interfaces for telemetry span attributes
 */

export interface ConversationSpanContext {
  projectName: string;
  sessionId?: string;
  userId?: string;
  prompt: string;
  model?: string;
  agentMode?: string;
}

export interface ToolSpanContext {
  toolName: string;
  toolInput: any;
  callId: string;
}

export interface ToolCompletionContext {
  toolOutput: any;
  status: 'success' | 'error' | 'timeout';
  durationMs?: number;
  errorMessage?: string;
}

export interface UsageContext {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface SpanUpdateContext {
  sessionId?: string;
  model?: string;
  systemPrompt?: string;
}
