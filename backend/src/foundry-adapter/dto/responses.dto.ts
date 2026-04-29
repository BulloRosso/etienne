/**
 * OpenAI Responses API types used by the Foundry "responses" protocol.
 *
 * Reference: POST /responses on the Foundry hosted agent endpoint.
 * Foundry manages conversation history server-side and provides a
 * session-id per conversation.
 */

/** A single input message in the Responses API request body. */
export interface ResponsesInputMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | ResponsesContentPart[];
}

export interface ResponsesContentPart {
  type: 'input_text' | 'output_text';
  text: string;
}

/** Incoming request body for POST /responses. */
export interface ResponsesRequest {
  /** Model name (informational — the agent picks its own model). */
  model?: string;
  /** Conversation input. */
  input: string | ResponsesInputMessage[];
  /** Optional MCP tool definitions. */
  tools?: any[];
  /** If true, the response is streamed as SSE events. */
  stream?: boolean;
  /** Foundry-managed metadata. */
  metadata?: Record<string, unknown>;
}

/** Shape of a non-streaming response (simplified). */
export interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  status: 'completed' | 'failed' | 'in_progress' | 'cancelled';
  output: ResponsesOutputItem[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface ResponsesOutputItem {
  type: 'message';
  id: string;
  role: 'assistant';
  content: ResponsesContentPart[];
  status: 'completed';
}
