import { Logger } from '@nestjs/common';
import { SdkPermissionService } from '../sdk/sdk-permission.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { MessageEvent } from '../types';
import { piEventToMessageEvents, PiUsage } from './pi-mono-event-adapter';
import { PiToolDefinition } from './pi-tool-adapter';

/**
 * In-process pi-coding-agent (0.80.2) extension factory.
 *
 * 0.80.2 removed `beforeToolCall`/`afterToolCall` from `createAgentSession`, so all
 * host integration now flows through the extension event API:
 *   - `tool_call`   → permission gating (replaces beforeToolCall)
 *   - `tool_result` → context filtering + file events (replaces afterToolCall)
 *   - agent/turn/message events → SSE stream + hook-emitter lifecycle
 *   - session compaction events → SSE compaction visibility
 *
 * One factory wires permissions, result filtering, custom tools, the SSE event
 * stream, and the Etienne event-bus emission for a single session.
 */

/** Lifecycle emitter hooks the orchestrator supplies (Etienne event bus). */
export interface PiBusEmitters {
  /** UserPromptSubmit-equivalent — called once when the agent loop starts. */
  onAgentStart?: () => void;
  /** PreToolUse — before each tool executes (after permission allow). */
  onPreToolUse?: (data: { tool_name: string; tool_input?: any; call_id?: string }) => void;
  /** PostToolUse — after each tool finishes. */
  onPostToolUse?: (data: { tool_name: string; tool_output?: any; call_id?: string; error?: string }) => void;
  /** File create/modify derived from write/edit tool results. */
  onFileChanged?: (path: string, kind: 'added' | 'changed') => void;
  /** PreCompact — before context compaction. */
  onPreCompact?: () => void;
  /** Stop — when the agent loop ends. */
  onStop?: (usage: PiUsage | undefined) => void;
}

export interface PiExtensionOptions {
  logger: Logger;
  permissionService: SdkPermissionService;
  contextInterceptor?: ContextInterceptorService;
  projectName: string;
  projectRoot: string;
  sessionId?: string;
  requireAllPermissions: boolean;
  /** Custom tools (MCP bridge + subagent Task) to register with pi. */
  customTools: PiToolDefinition[];
  /** Forward an SSE MessageEvent to the orchestrator's observer (through StreamRelay). */
  emit: (ev: MessageEvent) => void;
  /** Latest usage seen, captured by the orchestrator for persistence/cost. */
  onUsage?: (usage: PiUsage) => void;
  /** Etienne event-bus lifecycle hooks. */
  bus?: PiBusEmitters;
}

/** Tool names whose results imply a filesystem mutation. */
const WRITE_TOOLS = new Set(['write', 'edit']);

/**
 * Build the ExtensionFactory `(pi) => void` for one session. The returned function
 * is placed in `DefaultResourceLoader({ extensionFactories: [factory] })`.
 */
export function createPiExtension(opts: PiExtensionOptions): (pi: any) => void | Promise<void> {
  const {
    logger, permissionService, contextInterceptor,
    projectName, sessionId, requireAllPermissions,
    customTools, emit, onUsage, bus,
  } = opts;

  const canUseTool = permissionService.createCanUseToolCallback(
    projectName,
    sessionId,
    requireAllPermissions,
  );

  return function piExtension(pi: any): void {
    // Register custom tools (MCP bridge tools + subagent Task tool).
    for (const tool of customTools) {
      try {
        pi.registerTool(tool);
      } catch (err: any) {
        logger.warn(`pi-mono: registerTool failed for ${tool.name}: ${err?.message}`);
      }
    }

    // --- agent lifecycle → SSE + bus ---
    pi.on('agent_start', () => {
      for (const m of piEventToMessageEvents({ type: 'agent_start' }, { processId: '' })) emit(m);
      bus?.onAgentStart?.();
    });

    let lastUsage: PiUsage | undefined;

    pi.on('turn_end', (ev: any) => {
      const usage = extractUsage(ev?.message);
      if (usage) {
        lastUsage = usage;
        onUsage?.(usage);
        for (const m of piEventToMessageEvents({ type: 'usage', usage }, { processId: '' })) emit(m);
      }
    });

    pi.on('agent_end', () => {
      bus?.onStop?.(lastUsage);
    });

    // --- streaming text / thinking deltas ---
    pi.on('message_update', (ev: any) => {
      const ame = ev?.assistantMessageEvent;
      if (!ame) return;
      if (ame.type === 'text_delta' && typeof ame.delta === 'string') {
        for (const m of piEventToMessageEvents({ type: 'text_delta', delta: ame.delta }, { processId: '' })) emit(m);
      } else if (ame.type === 'thinking_delta' && typeof ame.delta === 'string') {
        for (const m of piEventToMessageEvents({ type: 'thinking_delta', delta: ame.delta }, { processId: '' })) emit(m);
      }
    });

    // --- tool execution → SSE tool_call / tool_result ---
    pi.on('tool_execution_start', (ev: any) => {
      for (const m of piEventToMessageEvents(
        { type: 'tool_execution_start', toolCallId: ev?.toolCallId, toolName: ev?.toolName, args: ev?.args },
        { processId: '' },
      )) emit(m);
    });

    pi.on('tool_execution_end', (ev: any) => {
      for (const m of piEventToMessageEvents(
        { type: 'tool_execution_end', toolCallId: ev?.toolCallId, toolName: ev?.toolName, result: ev?.result, isError: ev?.isError },
        { processId: '' },
      )) emit(m);
    });

    // --- permission gating (replaces beforeToolCall) ---
    pi.on('tool_call', async (ev: any) => {
      const toolName: string = ev?.toolName ?? '';
      const args = ev?.input ?? {};
      const callId: string = ev?.toolCallId ?? '';

      // Context interceptor gate — runs before the user permission dialog so
      // context violations short-circuit without prompting at all.
      if (contextInterceptor && sessionId) {
        try {
          const check = await contextInterceptor.validateToolUse(projectName, sessionId, toolName, args);
          if (!check.allowed) {
            return { block: true, reason: check.reason ?? 'Blocked by active context' };
          }
        } catch (err: any) {
          logger.warn(`pi-mono context validation failed for ${toolName}: ${err?.message}`);
        }
      }

      try {
        emit({
          type: 'permission_request',
          data: { permissionId: callId, message: `Permission requested for ${toolName}` },
        });

        const result = await canUseTool(toolName, args, { signal: new AbortController().signal });

        if (result.behavior === 'allow') {
          // Apply any arg patches in place (pi reads mutated event.input).
          if (result.updatedInput && typeof result.updatedInput === 'object' && ev?.input) {
            Object.assign(ev.input, result.updatedInput);
          }
          bus?.onPreToolUse?.({ tool_name: toolName, tool_input: ev?.input, call_id: callId });
          return undefined; // allow
        }
        return { block: true, reason: result.message || 'Denied by user' };
      } catch (err: any) {
        logger.error(`pi-mono permission gate failed for ${toolName}: ${err?.message}`);
        return { block: true, reason: `Permission gate error: ${err?.message}` };
      }
    });

    // --- result filtering + file events (replaces afterToolCall) ---
    pi.on('tool_result', async (ev: any) => {
      const toolName: string = ev?.toolName ?? '';
      const callId: string = ev?.toolCallId ?? '';
      const isError: boolean = !!ev?.isError;

      bus?.onPostToolUse?.({
        tool_name: toolName,
        tool_output: ev?.content,
        call_id: callId,
        error: isError ? 'tool error' : undefined,
      });

      // Derive file_added / file_changed from write/edit tool inputs.
      if (!isError && WRITE_TOOLS.has(toolName)) {
        const filePath = (ev?.input?.path ?? ev?.input?.file_path) as string | undefined;
        if (filePath) {
          bus?.onFileChanged?.(filePath, toolName === 'write' ? 'added' : 'changed');
        }
      }

      // Context-scope result filtering — strip disallowed content before the model
      // sees it. Returns a partial override; only `content` is replaced.
      if (contextInterceptor && sessionId) {
        try {
          const filtered = await contextInterceptor.filterToolResults(projectName, sessionId, toolName, ev?.content);
          if (filtered !== undefined && filtered !== ev?.content) {
            return { content: normalizeContent(filtered) };
          }
        } catch (err: any) {
          logger.warn(`pi-mono context filter failed for ${toolName}: ${err?.message}`);
        }
      }
      return undefined;
    });

    // --- compaction visibility ---
    pi.on('session_before_compact', () => {
      bus?.onPreCompact?.();
    });

    pi.on('session_compact', (ev: any) => {
      const usage = contextUsageTokens(ev);
      for (const m of piEventToMessageEvents(
        { type: 'compaction', tokensBefore: usage.before, tokensAfter: usage.after },
        { processId: '' },
      )) emit(m);
    });
  };
}

/** Extract pi Usage from an AssistantMessage, if present. */
function extractUsage(message: any): PiUsage | undefined {
  const u = message?.usage;
  if (!u) return undefined;
  return {
    input: u.input,
    output: u.output,
    cacheRead: u.cacheRead,
    cacheWrite: u.cacheWrite,
    cacheWrite1h: u.cacheWrite1h,
    totalTokens: u.totalTokens,
    cost: u.cost ? { total: u.cost.total } : undefined,
  };
}

/** Best-effort before/after token estimates from a session_compact event. */
function contextUsageTokens(ev: any): { before?: number; after?: number } {
  const entry = ev?.compactionEntry;
  return {
    before: entry?.tokensBefore ?? entry?.preCompactionTokens,
    after: entry?.tokensAfter ?? entry?.postCompactionTokens,
  };
}

/** Coerce a filtered tool result into pi's content-block array. */
function normalizeContent(value: any): Array<{ type: 'text'; text: string }> {
  if (Array.isArray(value)) return value as any;
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return [{ type: 'text', text }];
}
