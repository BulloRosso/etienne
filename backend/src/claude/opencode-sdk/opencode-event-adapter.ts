import { MessageEvent } from '../types';

/**
 * OpenCode SDK SSE event types — consumed directly from
 * `client.event.subscribe(...)`'s stream. Each yielded item is the SDK's
 * `Event` discriminated union: `{ type, properties }`.
 *
 * We model the subset we map here. Everything not listed falls through to the
 * `default` branch and is ignored.
 */
export interface OpenCodeEvent {
  type: string;
  properties?: any;
}

/**
 * Compatibility shim. The orchestrator wraps the SDK's `Permission` payload in
 * a small object before handing it to the permission service. Kept here so the
 * permission service's typed param continues to compile.
 */
export interface OpenCodePermissionRequest {
  id: string;
  toolName?: string;
  args?: any;
  title?: string;
}

/**
 * The current SDK has no question/elicitation event. The interface is kept as a
 * placeholder so the permission service compiles; the orchestrator never
 * dispatches to it.
 */
export interface OpenCodeQuestionRequest {
  id: string;
  header?: string;
  text?: string;
  options?: Array<{ label: string; value?: string }>;
  multiSelect?: boolean;
}

/**
 * Translate one OpenCode SSE event into zero or more MessageEvents the
 * frontend understands.
 *
 * Permission events are handled by the orchestrator itself (it routes them to
 * the permission service); they map to `[]` here.
 */
export function openCodeEventToMessageEvents(
  ev: OpenCodeEvent,
  ctx: { processId: string; sessionId?: string },
): MessageEvent[] {
  const props = ev.properties ?? {};

  switch (ev.type) {
    // ── Streaming text / reasoning / tool state ─────────────────────────
    case 'message.part.updated': {
      const part = props.part;
      const delta: string | undefined = props.delta;
      if (!part) return [];

      if (part.type === 'text') {
        // Prefer the explicit delta; fall back to the cumulative text.
        const chunk = delta ?? part.text ?? '';
        if (!chunk) return [];
        return [{ type: 'stdout', data: { chunk } }];
      }

      if (part.type === 'reasoning') {
        const chunk = delta ?? part.text ?? '';
        if (!chunk) return [];
        return [{ type: 'thinking', data: { content: chunk } }];
      }

      if (part.type === 'tool') {
        const state = part.state;
        if (!state) return [];

        const callId = part.callID ?? part.id ?? `tool_${Date.now()}`;
        const toolName = part.tool ?? 'unknown';

        if (state.status === 'running' || state.status === 'pending') {
          return [{
            type: 'tool_call',
            data: {
              callId,
              toolName,
              args: state.input,
              status: 'running',
            },
          }];
        }

        if (state.status === 'completed') {
          return [{
            type: 'tool_result',
            data: { callId, toolName, result: state.output ?? '' },
          }];
        }

        if (state.status === 'error') {
          return [{
            type: 'tool_result',
            data: { callId, toolName, result: state.error ?? '' },
          }];
        }
        return [];
      }

      if (part.type === 'step-start') {
        return [{
          type: 'subagent_start',
          data: { name: part.id ?? 'subagent', status: 'active' },
        }];
      }
      if (part.type === 'step-finish') {
        return [{
          type: 'subagent_end',
          data: { name: part.id ?? 'subagent', status: 'complete' },
        }];
      }

      return [];
    }

    // ── Assistant message completed (usage + cost) ──────────────────────
    case 'message.updated': {
      const info = props.info;
      if (!info || info.role !== 'assistant') return [];

      const events: MessageEvent[] = [];
      if (info.tokens) {
        const model = info.providerID && info.modelID
          ? `${info.providerID}/${info.modelID}`
          : undefined;
        events.push({
          type: 'usage',
          data: {
            input_tokens: info.tokens.input,
            output_tokens: info.tokens.output,
            cache_read_input_tokens: info.tokens.cache?.read,
            cache_creation_input_tokens: info.tokens.cache?.write,
            total_cost_usd: info.cost,
            ...(model ? { model } : {}),
          },
        });
      }
      return events;
    }

    // ── Session lifecycle ───────────────────────────────────────────────
    case 'session.created': {
      const info = props.info;
      return [{
        type: 'session',
        data: { process_id: ctx.processId, session_id: info?.id },
      }];
    }

    case 'session.error': {
      const err = props.error;
      const message = err?.data?.message ?? err?.message ?? 'Unknown OpenCode error';
      return [{ type: 'error', data: { message } }];
    }

    // ── File events ─────────────────────────────────────────────────────
    case 'file.edited': {
      // `properties.file` is a string path in this SDK version.
      const file: string | undefined =
        typeof props.file === 'string' ? props.file : props.file?.path;
      if (!file) return [];
      return [{ type: 'file_changed', data: { path: file } }];
    }

    // Permission events: handled by the orchestrator before the adapter.
    case 'permission.updated':
    case 'permission.replied':
      return [];

    default:
      return [];
  }
}
