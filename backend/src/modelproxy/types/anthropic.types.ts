// Anthropic API types
export interface ContentBlockText {
  type: 'text';
  text: string;
}

export interface ContentBlockImage {
  type: 'image';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
}

export interface ContentBlockToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ContentBlockToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | any[];
  is_error?: boolean;
}

export type ContentBlock = ContentBlockText | ContentBlockImage | ContentBlockToolUse | ContentBlockToolResult;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, any>;
}

export interface AnthropicToolChoice {
  type: 'auto' | 'any' | 'tool';
  name?: string;
}

export interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: 'text'; text: string }>;
  stop_sequences?: string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'error' | null;
  stop_sequence?: string | null;
  usage: AnthropicUsage;
}
