import { MessageEvent, Usage } from '../types';
import { normalizeKimiToolName } from './kimi-tool-name.util';

/**
 * Kimi Agent SDK stream events — the Turn iterator yields the SDK's
 * `StreamEvent` union: `{ type, payload }` wire events/requests plus a
 * `{ type: 'error', ... }` ParseError shape. We model the subset we map here;
 * everything else falls through and is ignored.
 */
export interface KimiStreamEvent {
  type: string;
  payload?: any;
  /** ParseError shape only */
  code?: string;
  message?: string;
}

/**
 * Kimi's `TokenUsage` → the shared `Usage` shape the frontend/budget tracking
 * consume. Kimi splits input into `input_other` (uncached) plus cache
 * read/creation buckets — same taxonomy as Anthropic.
 */
export function kimiUsageToUsage(t: {
  input_other: number;
  output: number;
  input_cache_read: number;
  input_cache_creation: number;
}, model?: string): Usage {
  return {
    input_tokens: t.input_other,
    output_tokens: t.output,
    cache_read_input_tokens: t.input_cache_read,
    cache_creation_input_tokens: t.input_cache_creation,
    ...(model ? { model } : {}),
  };
}

/** Extract plain text from a Kimi ToolResult `output` (string | ContentPart[]). */
export function kimiToolOutputToString(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((part: any) => (part?.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Mutable per-turn context threaded through the adapter:
 * - `pendingToolCalls` maps callId → normalized tool name so ToolResult events
 *   can be labeled (Kimi's ToolResult only carries `tool_call_id`).
 * - `seenSubagents` tracks `parent_tool_call_id`s that already emitted
 *   `subagent_start`.
 */
export interface KimiAdapterContext {
  processId: string;
  sessionId?: string;
  pendingToolCalls: Map<string, string>;
  seenSubagents: Set<string>;
}

/**
 * Translate one Kimi stream event into zero or more MessageEvents the
 * frontend understands.
 *
 * Not handled here (orchestrator's responsibility):
 * - `TurnEnd` — drives the completion sequence (guardrail flush, usage, stop).
 * - `ApprovalRequest` / `QuestionRequest` — replied on the Turn object.
 * - `StatusUpdate` usage accumulation → `context_state` derivation.
 */
export function kimiEventToMessageEvents(
  ev: KimiStreamEvent,
  ctx: KimiAdapterContext,
): MessageEvent[] {
  const payload = ev.payload ?? {};

  switch (ev.type) {
    // ── Streaming text / thinking ───────────────────────────────────────
    case 'ContentPart': {
      if (payload.type === 'text' && payload.text) {
        return [{ type: 'stdout', data: { chunk: payload.text } }];
      }
      if (payload.type === 'think' && payload.think) {
        return [{ type: 'thinking', data: { content: payload.think } }];
      }
      // image_url / audio_url / video_url parts are not rendered in v1
      return [];
    }

    // ── Tool lifecycle ──────────────────────────────────────────────────
    case 'ToolCall': {
      const callId = payload.id ?? `tool_${Date.now()}`;
      const toolName = normalizeKimiToolName(payload.function?.name);
      ctx.pendingToolCalls.set(callId, toolName);

      let args: any;
      if (typeof payload.function?.arguments === 'string' && payload.function.arguments) {
        try { args = JSON.parse(payload.function.arguments); } catch { args = payload.function.arguments; }
      }

      return [{
        type: 'tool_call',
        data: { callId, toolName, args, status: 'running' },
      }];
    }

    case 'ToolResult': {
      const callId = payload.tool_call_id;
      const toolName = ctx.pendingToolCalls.get(callId) ?? 'unknown';
      ctx.pendingToolCalls.delete(callId);

      const rv = payload.return_value ?? {};
      const result = kimiToolOutputToString(rv.output) || rv.message || '';

      const events: MessageEvent[] = [{
        type: 'tool_result',
        data: { callId, toolName, result, isError: rv.is_error === true },
      }];

      // Diff display blocks are the reliable file-change signal — each one
      // names the touched path and lets us distinguish added vs changed.
      for (const block of rv.display ?? []) {
        if (block?.type === 'diff' && block.path) {
          events.push({
            type: block.old_text === '' ? 'file_added' : 'file_changed',
            data: { path: block.path },
          });
        }
      }

      return events;
    }

    // ── Usage / status ──────────────────────────────────────────────────
    case 'StatusUpdate': {
      if (!payload.token_usage) return [];
      return [{ type: 'usage', data: kimiUsageToUsage(payload.token_usage) }];
    }

    // ── Compaction ──────────────────────────────────────────────────────
    case 'CompactionBegin': {
      return [{
        type: 'compaction',
        data: { trigger: 'auto', timestamp: new Date().toISOString() },
      }];
    }

    // ── Subagents ───────────────────────────────────────────────────────
    // Kimi wraps every event from a subagent run in SubagentEvent keyed by
    // the parent Task tool call. First sighting → subagent_start; the inner
    // TurnEnd → subagent_end. Inner content is not streamed in v1.
    case 'SubagentEvent': {
      const parentId = payload.parent_tool_call_id;
      if (!parentId) return [];

      const events: MessageEvent[] = [];
      if (!ctx.seenSubagents.has(parentId)) {
        ctx.seenSubagents.add(parentId);
        events.push({
          type: 'subagent_start',
          data: { tool_use_id: parentId, source: 'task_message' },
        });
      }
      if (payload.event?.type === 'TurnEnd') {
        events.push({
          type: 'subagent_end',
          data: { tool_use_id: parentId, status: 'completed', source: 'task_message' },
        });
      }
      return events;
    }

    // ── Ignored wire noise ──────────────────────────────────────────────
    // TurnBegin: relay already emitted `session`. StepBegin/StepInterrupted:
    // provider-request boundaries. ToolCallPart: streamed argument fragments.
    // CompactionEnd: compaction already surfaced on Begin. SteerInput /
    // ApprovalResponse / Hook*: bookkeeping the frontend doesn't render.
    default:
      return [];
  }
}
