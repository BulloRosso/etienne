export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  model?: string;
};

export type MessageEvent = {
  type: 'session' | 'stdout' | 'usage' | 'file_added' | 'file_changed' | 'completed' | 'error' |
        'user_message' | 'tool_call' | 'tool' | 'permission_request' | 'subagent_start' | 'subagent_end' |
        'thinking' | 'tool_result' | 'guardrails_triggered' | 'output_guardrails_triggered' |
        'api_error' | 'telemetry';
  data: any;
};

export type ClaudeEvent = {
  type?: string;
  delta?: string | { text?: string };
  partial_text?: string;
  text?: string;
  message?: { delta?: string; content?: any[] };
  content?: any[] | { text?: string };
  model?: string;
  meta?: { model?: string; session_id?: string };
  session_id?: string;
  sessionId?: string;
  session?: { id?: string };
  usage?: any;
  token_usage?: any;
  metrics?: any;
};

// Structured event types
export type StructuredEvent =
  | UserMessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | SubagentEvent
  | ThinkingEvent;

export type UserMessageEvent = {
  type: 'user_message';
  content: string;
  timestamp: string;
};

export type ToolCallEvent = {
  type: 'tool_call';
  toolName: string;
  args?: any;
  status: 'running' | 'complete';
  result?: string;
  callId: string;
};

export type ToolResultEvent = {
  type: 'tool_result';
  callId: string;
  result: string;
};

export type PermissionRequestEvent = {
  type: 'permission_request';
  permissionId: string;
  message: string;
};

export type SubagentEvent = {
  type: 'subagent_start' | 'subagent_end';
  name: string;
  status: 'active' | 'complete';
  content?: string;
};

export type ThinkingEvent = {
  type: 'thinking';
  content: string;
};
