/**
 * Invocations protocol types for the Foundry hosted agent endpoint.
 *
 * The invocations protocol uses an opaque body — the agent owns the
 * turn end-to-end and can stream SSE, AG-UI, etc. The client manages
 * the session id.
 */

/** Incoming request body for POST /invocations. */
export interface InvocationsRequest {
  /** User prompt / instruction. */
  prompt: string;
  /** Optional context from the calling agent or user. */
  context?: Record<string, unknown>;
  /** Optional session identifier (client-managed). */
  session_id?: string;
  /** Maximum agent turns before returning. */
  max_turns?: number;
}

/** SSE event emitted during an invocation stream. */
export interface InvocationEvent {
  type: 'text_delta' | 'tool_use' | 'usage' | 'completed' | 'error';
  data: unknown;
}
