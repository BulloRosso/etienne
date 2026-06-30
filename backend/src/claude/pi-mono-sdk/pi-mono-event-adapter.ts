import { MessageEvent, Usage } from '../types';
import { CacheTokenUsage } from '../../budget-monitoring/budget-monitoring.service';

/**
 * pi-agent-core / pi-coding-agent 0.80.2 usage shape (from
 * `@earendil-works/pi-ai` `Usage`). Token counts and the Anthropic 5m/1h
 * cache-write split live here.
 */
export type PiUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Subset of cacheWrite written with 1h retention (Anthropic only). */
  cacheWrite1h?: number;
  totalTokens?: number;
  cost?: { total?: number };
};

/**
 * Subset of the 0.80.2 extension event union we translate to SSE `MessageEvent`s.
 * The orchestrator's pi extension forwards these from `pi.on(...)` handlers.
 * Shapes verified against the installed `@earendil-works/pi-coding-agent@0.80.2`
 * `.d.ts` (extensions/types.d.ts, pi-ai/types.d.ts).
 */
export type PiEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_end'; usage?: PiUsage }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args?: any }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result?: any; isError?: boolean }
  | { type: 'compaction'; tokensBefore?: number; tokensAfter?: number }
  | { type: 'usage'; usage?: PiUsage }
  | { type: 'error'; error: string }
  | { type: string; [key: string]: any };

/**
 * Map a pi 0.80.2 `Usage` onto the SSE `Usage` shape, deriving the ephemeral
 * 5m cache-write bucket from `cacheWrite − cacheWrite1h` (pi only reports the
 * 1h subset explicitly). Matches the cache economy the `anthropic` harness
 * extracts in sdk-message-transformer.ts.
 */
export function piUsageToUsage(u: PiUsage | undefined): Usage & { total_cost_usd?: number } {
  if (!u) return {};
  const cacheWrite = u.cacheWrite ?? 0;
  const cacheWrite1h = u.cacheWrite1h ?? 0;
  const cacheWrite5m = Math.max(0, cacheWrite - cacheWrite1h);
  return {
    input_tokens: u.input,
    output_tokens: u.output,
    total_tokens: (u.input ?? 0) + (u.output ?? 0),
    cache_read_input_tokens: u.cacheRead,
    cache_creation_input_tokens: u.cacheWrite,
    cache_creation_ephemeral_5m_input_tokens: cacheWrite ? cacheWrite5m : undefined,
    cache_creation_ephemeral_1h_input_tokens: u.cacheWrite1h,
    total_cost_usd: u.cost?.total,
  };
}

/**
 * Cache-token breakdown for BudgetMonitoringService.trackCosts. Reuses the
 * existing CacheTokenUsage contract — do not redefine.
 */
export function piUsageToCacheUsage(u: PiUsage | undefined): CacheTokenUsage {
  if (!u) return {};
  const cacheWrite = u.cacheWrite ?? 0;
  const cacheWrite1h = u.cacheWrite1h ?? 0;
  return {
    cacheReadTokens: u.cacheRead,
    cacheCreationTokens: u.cacheWrite,
    cacheCreation5mTokens: cacheWrite ? Math.max(0, cacheWrite - cacheWrite1h) : undefined,
    cacheCreation1hTokens: u.cacheWrite1h,
  };
}

export function piEventToMessageEvents(ev: PiEvent, ctx: { processId: string }): MessageEvent[] {
  switch (ev.type) {
    case 'agent_start':
      return [{ type: 'session', data: { process_id: ctx.processId } }];

    case 'text_delta':
      return [{ type: 'stdout', data: { chunk: (ev as any).delta } }];

    case 'thinking_delta':
      return [{ type: 'thinking', data: { content: (ev as any).delta } }];

    case 'tool_execution_start':
      return [{
        type: 'tool_call',
        data: {
          callId: (ev as any).toolCallId,
          toolName: (ev as any).toolName,
          args: (ev as any).args,
          status: 'running',
        },
      }];

    case 'tool_execution_end': {
      const result = (ev as any).result;
      const isError = (ev as any).isError;
      const text = typeof result === 'string' ? result : JSON.stringify(result ?? '');
      return [{
        type: 'tool_result',
        data: {
          callId: (ev as any).toolCallId,
          toolName: (ev as any).toolName,
          result: text,
          isError: !!isError,
        },
      }];
    }

    case 'compaction':
      return [{
        type: 'compaction',
        data: {
          trigger: 'auto',
          tokensBefore: (ev as any).tokensBefore,
          tokensAfter: (ev as any).tokensAfter,
        },
      }];

    case 'turn_end':
    case 'usage': {
      const usage = (ev as any).usage as PiUsage | undefined;
      if (!usage) return [];
      return [{ type: 'usage', data: piUsageToUsage(usage) }];
    }

    case 'error':
      return [{ type: 'error', data: { message: (ev as any).error } }];

    default:
      return [];
  }
}
