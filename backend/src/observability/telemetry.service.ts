import { Injectable, Logger } from '@nestjs/common';
import { Span, SpanKind, SpanStatusCode, context, trace, Context } from '@opentelemetry/api';
import { tracer, isOtelEnabled } from './instrumentation';
import {
  ConversationSpanContext,
  ToolSpanContext,
  ToolCompletionContext,
  UsageContext,
  SpanUpdateContext,
} from './telemetry.types';

/**
 * Service for managing OpenTelemetry spans for LLM conversations and tool calls.
 * Follows OpenInference semantic conventions for LLM-specific attributes.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  // Track active conversation spans by processId
  private activeSpans = new Map<string, Span>();
  // Track active tool spans by callId
  private activeToolSpans = new Map<string, { span: Span; startTime: number }>();
  // Track tools used per conversation for final summary
  private toolsUsedMap = new Map<string, string[]>();

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return isOtelEnabled;
  }

  /**
   * Start a conversation span (parent span for entire SDK conversation)
   */
  startConversationSpan(processId: string, ctx: ConversationSpanContext): void {
    if (!isOtelEnabled || !tracer) return;

    const span = tracer.startSpan('claude-agent.conversation', {
      kind: SpanKind.CLIENT,
      attributes: {
        'openinference.span.kind': 'AGENT',
        'llm.system': 'claude',
        'llm.provider': 'anthropic',
        'llm.request.type': 'agent',
        'input.value': ctx.prompt.substring(0, 10000),
        'input.mime_type': 'text/plain',
        'agent.name': 'etienne',
        'session.id': ctx.sessionId || 'new',
        'user.id': ctx.userId || 'user',
        'project.name': ctx.projectName,
        'environment': process.env.NODE_ENV || 'development',
        'llm.streaming': true,
      },
    });

    if (ctx.model) {
      span.setAttribute('llm.model_name', ctx.model);
    }
    if (ctx.agentMode) {
      span.setAttribute('agent.mode', ctx.agentMode);
    }

    this.activeSpans.set(processId, span);
    this.toolsUsedMap.set(processId, []);
    this.logger.debug(`Started conversation span for process: ${processId}`);
  }

  /**
   * Update conversation span with session info (after session init)
   */
  updateConversationSpan(processId: string, updates: SpanUpdateContext): void {
    if (!isOtelEnabled) return;

    const span = this.activeSpans.get(processId);
    if (!span) return;

    if (updates.sessionId) {
      span.setAttribute('session.id', updates.sessionId);
    }
    if (updates.model) {
      span.setAttribute('llm.model_name', updates.model);
    }
    if (updates.systemPrompt) {
      span.setAttribute('llm.system_prompt', updates.systemPrompt.substring(0, 5000));
    }

    this.logger.debug(`Updated conversation span: ${processId}`);
  }

  /**
   * Start a tool span (child span for tool execution)
   */
  startToolSpan(processId: string, ctx: ToolSpanContext): void {
    if (!isOtelEnabled || !tracer) return;

    const parentSpan = this.activeSpans.get(processId);
    const parentContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = tracer.startSpan(
      `tool.${ctx.toolName}`,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'openinference.span.kind': 'TOOL',
          'tool.name': ctx.toolName,
          'tool.parameters': JSON.stringify(ctx.toolInput).substring(0, 10000),
          'tool.call_id': ctx.callId,
        },
      },
      parentContext
    );

    this.activeToolSpans.set(ctx.callId, {
      span,
      startTime: Date.now(),
    });

    // Track tool usage
    const toolsUsed = this.toolsUsedMap.get(processId);
    if (toolsUsed && !toolsUsed.includes(ctx.toolName)) {
      toolsUsed.push(ctx.toolName);
    }

    this.logger.debug(`Started tool span: ${ctx.toolName} (${ctx.callId})`);
  }

  /**
   * End a tool span with results
   */
  endToolSpan(callId: string, completion: ToolCompletionContext): void {
    if (!isOtelEnabled) return;

    const toolData = this.activeToolSpans.get(callId);
    if (!toolData) return;

    const { span, startTime } = toolData;
    const durationMs = completion.durationMs || Date.now() - startTime;

    // Set output attributes
    span.setAttribute(
      'tool.output',
      JSON.stringify(completion.toolOutput).substring(0, 10000)
    );
    span.setAttribute('tool.status', completion.status);
    span.setAttribute('tool.duration_ms', durationMs);

    if (completion.status === 'error' && completion.errorMessage) {
      span.setAttribute('tool.error_message', completion.errorMessage);
      span.setStatus({ code: SpanStatusCode.ERROR, message: completion.errorMessage });
    } else if (completion.status === 'success') {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
    this.activeToolSpans.delete(callId);
    this.logger.debug(`Ended tool span: ${callId} (${completion.status}, ${durationMs}ms)`);
  }

  /**
   * Record token usage on conversation span
   */
  recordUsage(processId: string, usage: UsageContext): void {
    if (!isOtelEnabled) return;

    const span = this.activeSpans.get(processId);
    if (!span) return;

    if (usage.inputTokens !== undefined) {
      span.setAttribute('llm.token_count.prompt', usage.inputTokens);
    }
    if (usage.outputTokens !== undefined) {
      span.setAttribute('llm.token_count.completion', usage.outputTokens);
    }
    if (usage.totalTokens !== undefined) {
      span.setAttribute('llm.token_count.total', usage.totalTokens);
    }
    if (usage.cacheReadTokens !== undefined) {
      span.setAttribute('llm.token_count.cache_read', usage.cacheReadTokens);
    }
    if (usage.cacheCreationTokens !== undefined) {
      span.setAttribute('llm.token_count.cache_creation', usage.cacheCreationTokens);
    }

    this.logger.debug(`Recorded usage for process: ${processId}`);
  }

  /**
   * End conversation span successfully
   */
  endConversationSpan(processId: string, output?: string): void {
    if (!isOtelEnabled) return;

    const span = this.activeSpans.get(processId);
    if (!span) return;

    if (output) {
      span.setAttribute('output.value', output.substring(0, 10000));
      span.setAttribute('output.mime_type', 'text/plain');
    }

    const toolsUsed = this.toolsUsedMap.get(processId) || [];
    if (toolsUsed.length > 0) {
      span.setAttribute('agent.tools_used', JSON.stringify(toolsUsed));
      span.setAttribute('agent.tool_call_count', toolsUsed.length);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    this.activeSpans.delete(processId);
    this.toolsUsedMap.delete(processId);
    this.logger.debug(`Ended conversation span successfully: ${processId}`);
  }

  /**
   * Get the OpenTelemetry context for a tool span (for propagation to external services)
   * This allows downstream services (like A2A agents) to receive trace context
   */
  getToolSpanContext(callId: string): Context {
    if (!isOtelEnabled) return context.active();

    const toolData = this.activeToolSpans.get(callId);
    if (!toolData) {
      // Fall back to conversation span or root context
      return context.active();
    }

    return trace.setSpan(context.active(), toolData.span);
  }

  /**
   * Get the OpenTelemetry context for a conversation span
   */
  getConversationContext(processId: string): Context {
    if (!isOtelEnabled) return context.active();

    const span = this.activeSpans.get(processId);
    if (!span) return context.active();

    return trace.setSpan(context.active(), span);
  }

  /**
   * Execute a function within the context of a tool span
   * This ensures trace context is properly propagated to external calls
   */
  async runInToolContext<T>(callId: string, fn: () => Promise<T>): Promise<T> {
    if (!isOtelEnabled) return fn();

    const spanContext = this.getToolSpanContext(callId);
    return context.with(spanContext, fn);
  }

  /**
   * Get the current active conversation span (for external services that can't use context.active())
   * Returns the most recently started conversation span if available
   */
  getCurrentConversationSpan(): Span | null {
    if (!isOtelEnabled) return null;

    // Return the first (most recent) active span
    const entries = Array.from(this.activeSpans.entries());
    if (entries.length === 0) return null;

    return entries[entries.length - 1][1];
  }

  /**
   * Get the current active tool span (for external services that can't use context.active())
   * Returns the most recently started tool span if available
   */
  getCurrentToolSpan(): Span | null {
    if (!isOtelEnabled) return null;

    const entries = Array.from(this.activeToolSpans.entries());
    if (entries.length === 0) return null;

    return entries[entries.length - 1][1].span;
  }

  /**
   * Get span IDs for a process (for frontend to use when submitting feedback)
   */
  getSpanIds(processId: string): { spanId: string; traceId: string } | null {
    if (!isOtelEnabled) return null;

    const span = this.activeSpans.get(processId);
    if (!span) return null;

    const ctx = span.spanContext();
    return { spanId: ctx.spanId, traceId: ctx.traceId };
  }

  /**
   * End conversation span with error
   */
  endConversationSpanWithError(processId: string, error: Error | string): void {
    if (!isOtelEnabled) return;

    const span = this.activeSpans.get(processId);
    if (!span) return;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorType = error instanceof Error ? error.constructor.name : 'Error';

    span.setAttribute('error.type', errorType);
    span.setAttribute('error.message', errorMessage);

    if (error instanceof Error && error.stack) {
      span.setAttribute('exception.stacktrace', error.stack.substring(0, 5000));
    }

    const toolsUsed = this.toolsUsedMap.get(processId) || [];
    if (toolsUsed.length > 0) {
      span.setAttribute('agent.tools_used', JSON.stringify(toolsUsed));
      span.setAttribute('agent.tool_call_count', toolsUsed.length);
    }

    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    span.recordException(error instanceof Error ? error : new Error(errorMessage));
    span.end();

    this.activeSpans.delete(processId);
    this.toolsUsedMap.delete(processId);
    this.logger.debug(`Ended conversation span with error: ${processId}`);
  }
}
