export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  model?: string;
};

export type MessageEvent = {
  type: 'session' | 'stdout' | 'usage' | 'file_added' | 'file_changed' | 'completed' | 'error';
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
