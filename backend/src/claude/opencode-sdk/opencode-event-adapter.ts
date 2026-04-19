import { MessageEvent } from '../types';

/**
 * OpenCode SSE event types (from @opencode-ai/sdk/v2).
 *
 * The SDK emits `GlobalEvent` objects, each containing a `payload: Event`.
 * We model the subset we need here to avoid importing the ESM-only SDK at
 * compile time.
 */

export interface OpenCodeGlobalEvent {
  /** Directory the event originates from (used for multi-project filtering) */
  properties?: { directory?: string; sessionID?: string };
  payload: OpenCodeEvent;
}

export type OpenCodeEvent =
  // Text / reasoning streaming
  | { type: 'message.part.delta'; part: { type: 'text'; delta: string } }
  | { type: 'message.part.delta'; part: { type: 'reasoning'; delta: string } }
  // Tool execution lifecycle
  | { type: 'message.part.updated'; part: OpenCodeToolPart }
  // Message lifecycle
  | { type: 'message.updated'; message: OpenCodeAssistantMessage }
  | { type: 'message.created'; message: { role: string; id?: string } }
  // Session lifecycle
  | { type: 'session.created'; session: { id: string } }
  | { type: 'session.updated'; session: { id: string; status?: string } }
  | { type: 'session.error'; error: { message: string; code?: string } }
  // Permission / question events (elicitations)
  | { type: 'permission.asked'; permission: OpenCodePermissionRequest }
  | { type: 'question.asked'; question: OpenCodeQuestionRequest }
  // File events
  | { type: 'file.edited'; file: { path: string } }
  // Catch-all for unknown event types
  | { type: string; [key: string]: any };

export interface OpenCodeToolPart {
  type: 'tool';
  id?: string;
  toolName?: string;
  args?: any;
  state?: {
    status: 'running' | 'completed' | 'error';
    output?: string;
    error?: string;
  };
}

export interface OpenCodeAssistantMessage {
  role: 'assistant';
  id?: string;
  time?: { completed?: number };
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cost?: number;
}

export interface OpenCodePermissionRequest {
  id: string;
  title?: string;
  description?: string;
  toolName?: string;
  args?: any;
}

export interface OpenCodeQuestionRequest {
  id: string;
  header?: string;
  text?: string;
  options?: Array<{ label: string; value?: string }>;
  allowCustom?: boolean;
  multiSelect?: boolean;
}

/**
 * Translate an OpenCode SSE event into zero or more MessageEvents that
 * the frontend understands.
 */
export function openCodeEventToMessageEvents(
  globalEvent: OpenCodeGlobalEvent,
  ctx: { processId: string; sessionId?: string },
): MessageEvent[] {
  const ev = globalEvent.payload;

  switch (ev.type) {
    // ── Text / reasoning streaming ──────────────────────────────────────
    case 'message.part.delta': {
      const part = (ev as any).part;
      if (part?.type === 'text') {
        return [{ type: 'stdout', data: { chunk: part.delta } }];
      }
      if (part?.type === 'reasoning') {
        return [{ type: 'thinking', data: { content: part.delta } }];
      }
      return [];
    }

    // ── Tool lifecycle ──────────────────────────────────────────────────
    case 'message.part.updated': {
      const part = (ev as any).part;
      if (part?.type !== 'tool') return [];

      const state = part.state;
      if (!state) return [];

      if (state.status === 'running') {
        return [{
          type: 'tool_call',
          data: {
            callId: part.id ?? `tool_${Date.now()}`,
            toolName: part.toolName ?? 'unknown',
            args: part.args,
            status: 'running',
          },
        }];
      }

      if (state.status === 'completed' || state.status === 'error') {
        return [{
          type: 'tool_result',
          data: {
            callId: part.id ?? `tool_${Date.now()}`,
            result: state.error ?? state.output ?? '',
          },
        }];
      }

      // Subagent step events
      if (part.type === 'step-start') {
        return [{
          type: 'subagent_start',
          data: {
            name: part.toolName ?? part.id ?? 'subagent',
            status: 'active',
          },
        }];
      }
      if (part.type === 'step-finish') {
        return [{
          type: 'subagent_end',
          data: {
            name: part.toolName ?? part.id ?? 'subagent',
            status: 'complete',
          },
        }];
      }

      return [];
    }

    // ── Message completed (usage + completion signal) ───────────────────
    case 'message.updated': {
      const msg = (ev as any).message as OpenCodeAssistantMessage | undefined;
      if (!msg || msg.role !== 'assistant') return [];

      const events: MessageEvent[] = [];

      if (msg.tokens) {
        events.push({
          type: 'usage',
          data: {
            input_tokens: msg.tokens.input,
            output_tokens: msg.tokens.output,
            total_cost_usd: msg.cost,
          },
        });
      }

      return events;
    }

    // ── Session lifecycle ────────────────────────────────────────────────
    case 'session.created': {
      const session = (ev as any).session;
      return [{
        type: 'session',
        data: { process_id: ctx.processId, session_id: session?.id },
      }];
    }

    case 'session.error': {
      const err = (ev as any).error;
      return [{
        type: 'error',
        data: { message: err?.message ?? 'Unknown OpenCode error' },
      }];
    }

    // ── File events ─────────────────────────────────────────────────────
    case 'file.edited': {
      const file = (ev as any).file;
      return [{
        type: 'file_changed',
        data: { path: file?.path },
      }];
    }

    // ── Permission / elicitation events ─────────────────────────────────
    // These are handled by the permission service, not forwarded directly.
    // The orchestrator intercepts them before they reach this adapter.
    case 'permission.asked':
    case 'question.asked':
      return [];

    default:
      return [];
  }
}
