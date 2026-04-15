import { MessageEvent } from '../types';

export type PiEvent =
  | { type: 'agent_start'; sessionId?: string }
  | { type: 'turn_start' }
  | { type: 'message_start'; messageId?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'message_end'; text?: string }
  | { type: 'tool_execution_start'; callId: string; toolName: string; args?: any }
  | { type: 'tool_execution_update'; callId: string; partialArgs?: any }
  | { type: 'tool_execution_end'; callId: string; result?: any; error?: string }
  | { type: 'turn_end'; usage?: { inputTokens?: number; outputTokens?: number; cost?: { total?: number } } }
  | { type: 'agent_end'; usage?: { inputTokens?: number; outputTokens?: number; cost?: { total?: number } } }
  | { type: 'error'; error: string }
  | { type: string; [key: string]: any };

export function piEventToMessageEvents(ev: PiEvent, ctx: { processId: string }): MessageEvent[] {
  switch (ev.type) {
    case 'agent_start':
      return [{ type: 'session', data: { process_id: ctx.processId, session_id: (ev as any).sessionId } }];

    case 'text_delta':
      return [{ type: 'stdout', data: { chunk: (ev as any).delta } }];

    case 'thinking_delta':
      return [{ type: 'thinking', data: { content: (ev as any).delta } }];

    case 'tool_execution_start':
      return [{
        type: 'tool_call',
        data: {
          callId: (ev as any).callId,
          toolName: (ev as any).toolName,
          args: (ev as any).args,
          status: 'running',
        },
      }];

    case 'tool_execution_end': {
      const result = (ev as any).result;
      const error = (ev as any).error;
      return [{
        type: 'tool_result',
        data: {
          callId: (ev as any).callId,
          result: error ?? (typeof result === 'string' ? result : JSON.stringify(result ?? '')),
        },
      }];
    }

    case 'turn_end':
    case 'agent_end': {
      const usage = (ev as any).usage;
      if (!usage) return [];
      return [{
        type: 'usage',
        data: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          total_cost_usd: usage?.cost?.total,
        },
      }];
    }

    case 'error':
      return [{ type: 'error', data: { message: (ev as any).error } }];

    default:
      return [];
  }
}
