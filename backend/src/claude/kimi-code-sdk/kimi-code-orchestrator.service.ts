import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs-extra';
import { KimiCodeSdkService } from './kimi-code-sdk.service';
import { KimiCodeSessionManagerService } from './kimi-code-session-manager.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { StreamRelayRegistry } from '../sdk/stream-relay.registry';
import { MessageEvent, Usage } from '../types';
import { kimiEventToMessageEvents, KimiAdapterContext } from './kimi-code-event-adapter';
import { provisionKimiMcpConfig } from './kimi-mcp-config.provisioner';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { McpServerConfigService } from '../mcpserverconfig/mcp.server.config';
import { safeRoot } from '../utils/path.utils';
import { buildCitationInstruction } from '../shared/citation-prompt';
import { sanitize_user_message } from '../../input-guardrails/index';
import { TelemetryService } from '../../observability/telemetry.service';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';
import { CodingAgentConfigurationService } from '../../coding-agent-configuration/coding-agent-configuration.service';
import { getContextLimit } from '../sdk/model-context-limits';

/**
 * Orchestrator service for Kimi Code (Moonshot Kimi Agent SDK) conversations.
 *
 * Parallel to OpenCodeOrchestratorService / PiMonoOrchestratorService — reuses
 * all guardrails, memory, telemetry, and persistence services but talks to
 * Kimi via @moonshot-ai/kimi-agent-sdk (which spawns the Kimi CLI).
 *
 * Key differences from other orchestrators:
 * - The Turn iterator is session-scoped — no sessionId filtering needed
 * - Always yoloMode (no permission bridging by design); stray ApprovalRequests
 *   are auto-approved and QuestionRequests auto-answered so turns can't stall
 * - Hooks are emitted in-process from the event loop (pi-mono pattern) — Kimi
 *   has no plugin bridge like OpenCode's
 * - Native plan mode via session.setPlanMode
 * - MCP: project servers provisioned into <project>/.kimi/mcp.json (shareDir)
 */
/** Kimi tags its event-bus events with this source so the rule engine /
 *  loop-guard can distinguish Kimi activity from the Anthropic harness. */
const KIMI_SOURCE = 'kimi-code';

@Injectable()
export class KimiCodeOrchestratorService {
  private readonly logger = new Logger(KimiCodeOrchestratorService.name);
  private jwtSecret: string = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  // Track active turns for abort
  private readonly activeTurns = new Map<string, { turn: any; projectDir: string; aborted: boolean }>();

  private generateServiceToken(): string {
    return jwt.sign(
      { sub: 'kimi-code-orchestrator', username: 'system', role: 'admin', displayName: 'Kimi Code Orchestrator', type: 'access' },
      this.jwtSecret,
      { expiresIn: '1h' },
    );
  }

  constructor(
    private readonly kimiSdkService: KimiCodeSdkService,
    private readonly sessionManager: KimiCodeSessionManagerService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly streamRelayRegistry: StreamRelayRegistry,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly mcpConfigService: McpServerConfigService,
    private readonly telemetryService: TelemetryService,
    private readonly secretsManager: SecretsManagerService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
  ) {}

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
  }

  /**
   * Clear the Kimi session for a project: close the live CLI session, delete
   * Kimi's on-disk session state (best-effort), and forget the persisted id.
   */
  async clearSession(projectDir: string): Promise<void> {
    const config = this.kimiSdkService.getConfig();
    await this.kimiSdkService.closeSession(projectDir);

    const sessionId = await this.sessionManager.loadSessionId(projectDir);
    if (sessionId) {
      const projectRoot = safeRoot(config.hostRoot, projectDir);
      await this.kimiSdkService.deleteStoredSession(projectRoot, sessionId);
    }
    await this.sessionManager.clearSession(projectDir);
  }

  /**
   * Manual compaction is not exposed by the Kimi Agent SDK — the CLI compacts
   * automatically and surfaces it via CompactionBegin/End (mapped to
   * `compaction` events on the stream).
   */
  async compactSession(_projectDir: string): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Manual compaction is not supported for kimi-code (the Kimi CLI compacts automatically)' };
  }

  /**
   * Stream a prompt using the Kimi Agent SDK with full integration.
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    _maxTurns?: number, // no per-turn step cap in the Kimi SDK; the CLI enforces its own max-steps
  ): Observable<MessageEvent> {
    const processId = `kimi_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Route events through a StreamRelay so a reload / transport hiccup can
    // re-attach and replay instead of aborting the run (parity with the other
    // orchestrators). The relay aborts the run only after the grace window
    // with no client attached.
    const relay = this.streamRelayRegistry.createRelay(processId, {
      onAbandoned: () => { this.abortProcess(processId).catch(() => {}); },
    });

    relay.next({ type: 'session', data: { process_id: processId } });

    this.runStreamPrompt(
      relay,
      projectDir,
      prompt,
      agentMode,
      memoryEnabled,
      skipChatPersistence,
      processId,
    ).catch((error) => {
      this.logger.error(`Kimi stream prompt failed: ${error.message}`, error.stack);
      relay.next({ type: 'error', data: { message: error.message } });
      relay.complete();
    });

    return relay.asObservable();
  }

  /** Re-attach a reloaded client to a buffered Kimi run. */
  attachToStream(processId: string, lastSeq?: number): Observable<MessageEvent> {
    return this.streamRelayRegistry.attach(processId, lastSeq);
  }

  /**
   * Internal async handler for streaming prompt.
   */
  private async runStreamPrompt(
    observer: { next: (v: MessageEvent) => void; complete: () => void; error: (e: any) => void },
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    processId?: string,
  ): Promise<void> {
    const userId = 'user';
    const config = this.kimiSdkService.getConfig();
    let sessionId: string | undefined;
    let assistantText = '';
    let usage: Usage = {};
    const startTime = Date.now();

    try {
      // === Budget Limit Check ===
      try {
        const budgetCheck = await this.budgetMonitoringService.checkBudgetLimit(projectDir);
        if (budgetCheck.exceeded) {
          this.logger.warn(`Budget limit exceeded for ${projectDir}: ${budgetCheck.currentCosts} / ${budgetCheck.limit} ${budgetCheck.currency}`);
          observer.next({
            type: 'error',
            data: {
              error: `Budget limit exceeded. Current costs: ${budgetCheck.currentCosts.toFixed(2)} ${budgetCheck.currency}, limit: ${budgetCheck.limit.toFixed(2)} ${budgetCheck.currency}. Please increase the budget limit or disable budget monitoring to continue.`,
            },
          });
          observer.complete();
          return;
        }
      } catch (err: any) {
        this.logger.error(`Budget check failed: ${err?.message}`);
      }

      // === Input Guardrails ===
      let sanitizedPrompt = prompt;
      let guardrailsTriggered = false;
      let triggeredPlugins: string[] = [];
      let detections: Record<string, string[]> = {};

      try {
        const guardrailsConfig = await this.guardrailsService.getConfig(projectDir);
        if (guardrailsConfig.enabled.length > 0) {
          const sanitizationResult = sanitize_user_message(prompt, guardrailsConfig.enabled);
          sanitizedPrompt = sanitizationResult.sanitizedText;
          if (sanitizationResult.triggeredPlugins.length > 0) {
            guardrailsTriggered = true;
            triggeredPlugins = sanitizationResult.triggeredPlugins;
            detections = sanitizationResult.detections;
            this.logger.log(`Input guardrails triggered for ${projectDir}:`, triggeredPlugins);
          }
        }
      } catch (error: any) {
        this.logger.error('Failed to apply input guardrails:', error.message);
      }

      // === Load or create session ===
      const existingSessionId = await this.sessionManager.loadSessionId(projectDir);
      const isFirstRequest = !existingSessionId;
      const projectRoot = safeRoot(config.hostRoot, projectDir);

      // === Seed <project>/.kimi/config.toml from the template ===
      try {
        await this.seedKimiConfig(projectRoot);
      } catch (err: any) {
        this.logger.warn(`Kimi config seeding failed: ${err?.message}`);
      }

      // === Provision MCP servers into <project>/.kimi/mcp.json ===
      try {
        const mcpConfig = await this.mcpConfigService.getMcpConfig(projectDir);
        if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
          await provisionKimiMcpConfig({ logger: this.logger, projectRoot, mcpServers: mcpConfig.mcpServers });
        }
      } catch (err: any) {
        this.logger.warn(`Kimi MCP config failed: ${err?.message}`);
      }

      // === Resolve per-project model (.etienne/ai-model.json overrides env defaults) ===
      const resolved = await config.resolveModelForProject(projectDir);
      this.logger.log(
        `Kimi model for ${projectDir}: model=${resolved.model ?? '(CLI default)'} thinking=${resolved.thinking}` +
        (resolved.baseUrl ? ` baseURL=${resolved.baseUrl}` : ''),
      );
      // Seed the usage payload with the model so the frontend renders it even
      // before the first StatusUpdate arrives.
      usage.model = resolved.model ?? 'kimi';

      // === Create/resume the live CLI session ===
      const { session, sessionId: activeSessionId } = await this.kimiSdkService.getOrCreateSession(
        projectDir, projectRoot, resolved, existingSessionId,
      );
      sessionId = activeSessionId;

      if (!existingSessionId || existingSessionId !== sessionId) {
        await this.sessionManager.createSession(projectDir, sessionId, resolved.model);
      }

      // === Plan mode (native) — always set explicitly so a previous plan
      // turn can't leak into a work turn ===
      await this.kimiSdkService.setPlanMode(projectDir, agentMode === 'plan');

      // === Memory Injection ===
      let enhancedPrompt = sanitizedPrompt;
      if (memoryEnabled && isFirstRequest) {
        try {
          const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';
          const settingsResponse = await axios.get(
            `${memoryBaseUrl}/settings?project=${encodeURIComponent(projectDir)}`,
          );
          const memorySettings = settingsResponse.data;

          if (memorySettings.memoryEnabled !== false) {
            const searchLimit = memorySettings.searchLimit ?? 5;
            const serviceToken = this.generateServiceToken();
            const authHeaders = { headers: { Authorization: `Bearer ${serviceToken}` } };
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              { query: sanitizedPrompt, user_id: userId, limit: searchLimit > 0 ? searchLimit : 100 },
              authHeaders,
            );
            const memories = searchResponse.data.results || [];
            if (memories.length > 0) {
              const memoryContext = memories.map((m: any) => m.memory).join('\n- ');
              enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${sanitizedPrompt}`;
              this.logger.log(`Enhanced prompt with ${memories.length} memories`);
            }
          }
        } catch (error: any) {
          this.logger.error('Failed to fetch memories:', error.message);
        }
      }

      // === Context Injection ===
      let finalPrompt = enhancedPrompt;
      if (sessionId) {
        try {
          const contextInjection = await this.contextInterceptor.buildContextPromptInjection(projectDir, sessionId);
          if (contextInjection) {
            finalPrompt = `${contextInjection}\n\n${enhancedPrompt}`;
            this.logger.log(`Injected context scope into prompt for session ${sessionId}`);
          }
        } catch (error: any) {
          this.logger.error('Failed to inject context:', error.message);
        }
      }

      // === System context (Kimi has no per-call system param — prepend a
      // clearly delimited block to the prompt instead) ===
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'long',
      });
      const systemParts = [`Current date and time: ${dateTimeString}`];
      const citationInstruction = buildCitationInstruction(projectRoot);
      if (citationInstruction) systemParts.push(citationInstruction);
      finalPrompt = `[System context — not part of the user's message:\n${systemParts.join('\n\n')}]\n\n${finalPrompt}`;

      // === Emit UserPromptSubmit hook (+ SessionStart on first request) ===
      this.hookEmitter.emitUserPromptSubmit(projectDir, {
        prompt: finalPrompt,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        source: KIMI_SOURCE,
      });
      if (isFirstRequest && sessionId) {
        this.hookEmitter.emitSessionStart(projectDir, { session_id: sessionId, model: resolved.model });
      }

      // === Start Telemetry ===
      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.startConversationSpan(processId, {
          projectName: projectDir,
          sessionId,
          userId,
          prompt: finalPrompt,
          model: resolved.model ?? 'kimi',
          agentMode: agentMode ?? 'work',
        });
      }

      // === Emit guardrails event ===
      if (guardrailsTriggered) {
        observer.next({
          type: 'guardrails_triggered',
          data: { plugins: triggeredPlugins, detections, count: Object.values(detections).reduce((sum, arr) => sum + arr.length, 0) },
        });
      }

      // === Check output guardrails buffering ===
      const outputGuardrailsConfig = await this.outputGuardrailsService.getConfig(projectDir);
      const shouldBufferOutput = outputGuardrailsConfig.enabled;

      // === Send prompt and iterate the turn's event stream ===
      this.logger.log(`Starting Kimi stream for project: ${projectDir}, session: ${sessionId}`);
      const turn = session.prompt(finalPrompt);
      if (processId) {
        this.activeTurns.set(processId, { turn, projectDir, aborted: false });
      }

      const adapterCtx: KimiAdapterContext = {
        processId: processId ?? '',
        sessionId,
        pendingToolCalls: new Map(),
        seenSubagents: new Set(),
      };

      for await (const rawEvent of turn) {
        // Check if aborted
        if (processId) {
          const active = this.activeTurns.get(processId);
          if (active?.aborted) {
            this.logger.log(`Kimi stream aborted for process: ${processId}`);
            break;
          }
        }

        const ev = rawEvent as any;
        if (!ev || typeof ev.type !== 'string') continue;

        // Defensive: yoloMode should suppress approvals entirely, but a stray
        // ApprovalRequest would stall the turn forever — auto-approve it.
        if (ev.type === 'ApprovalRequest') {
          const reqId = ev.payload?.id;
          this.logger.warn(`Unexpected Kimi ApprovalRequest under yoloMode (action=${ev.payload?.action}) — auto-approving`);
          if (reqId) {
            turn.approve(reqId, 'approve').catch((err: any) =>
              this.logger.error(`Kimi auto-approve failed: ${err?.message}`));
          }
          observer.next({ type: 'status', data: { status: 'auto_approved', tool: ev.payload?.action } });
          continue;
        }

        // Defensive: auto-answer questions (first option each) so the turn
        // can't hang; proper HITL question wiring is a documented follow-up.
        if (ev.type === 'QuestionRequest') {
          const reqId = ev.payload?.id;
          this.logger.warn(`Kimi QuestionRequest auto-answered with first options (id=${reqId})`);
          if (reqId) {
            const answers: Record<string, string> = {};
            for (const q of ev.payload?.questions ?? []) {
              answers[q.question] = q.options?.[0]?.label ?? '';
            }
            turn.respondQuestion(reqId, reqId, answers).catch((err: any) =>
              this.logger.error(`Kimi auto-answer failed: ${err?.message}`));
          }
          continue;
        }

        // Non-fatal wire parse errors: log and continue.
        if (ev.type === 'error') {
          this.logger.warn(`Kimi wire parse error: ${ev.code ?? ''} ${ev.message ?? ''}`);
          continue;
        }

        // Map Kimi events to MessageEvents
        try {
          const mapped = kimiEventToMessageEvents(ev, adapterCtx);
          for (const m of mapped) {
            // Accumulate text for persistence
            if (m.type === 'stdout') {
              assistantText += m.data?.chunk ?? '';
              if (shouldBufferOutput) continue; // Buffer until completion
            }

            // Accumulate usage (StatusUpdate token_usage is cumulative for
            // the session — last write wins, no summing).
            if (m.type === 'usage') {
              usage = { ...usage, ...m.data };
              // Emit a live context meter update (parity with the Claude path).
              const usedTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
                + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
              if (usedTokens > 0) {
                const maxTokens = getContextLimit(usage.model);
                observer.next({
                  type: 'context_state',
                  data: {
                    percentFull: Math.min(100, (usedTokens / maxTokens) * 100),
                    usedTokens,
                    maxTokens,
                    model: usage.model ?? 'unknown',
                    cacheReadTokens: usage.cache_read_input_tokens,
                    cacheCreationTokens: usage.cache_creation_input_tokens,
                  },
                });
              }
              continue; // Usage emitted at completion
            }

            // PreCompact hook alongside the compaction event
            if (m.type === 'compaction') {
              this.hookEmitter.emitPreCompact(projectDir, { session_id: sessionId });
            }

            // Emit file change hooks
            if (m.type === 'file_changed' || m.type === 'file_added') {
              const hookMethod = m.type === 'file_added' ? 'emitFileAdded' : 'emitFileChanged';
              this.hookEmitter[hookMethod](projectDir, {
                path: m.data.path,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
                source: KIMI_SOURCE,
              });
            }

            // Emit tool hooks in-process (pi-mono pattern — the loop sees
            // every ToolCall/ToolResult, no plugin bridge needed).
            if (m.type === 'tool_call') {
              this.hookEmitter.emitPreToolUse(projectDir, {
                tool_name: m.data.toolName ?? 'unknown',
                tool_input: m.data.args,
                call_id: m.data.callId,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
              });
              const argsStr = (() => {
                try { return JSON.stringify(m.data?.args); } catch { return '<unserializable>'; }
              })();
              this.logger.debug(`Kimi tool_call: name=${m.data?.toolName} callId=${m.data?.callId} args=${argsStr}`);
            }
            if (m.type === 'tool_result') {
              this.hookEmitter.emitPostToolUse(projectDir, {
                tool_name: m.data.toolName ?? 'unknown',
                tool_output: m.data.result,
                call_id: m.data.callId,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
                ...(m.data.isError ? { error: String(m.data.result).slice(0, 500) } : {}),
              });
              const resultStr = typeof m.data?.result === 'string'
                ? m.data.result.slice(0, 500)
                : (() => { try { return JSON.stringify(m.data?.result).slice(0, 500); } catch { return '<unserializable>'; } })();
              this.logger.debug(`Kimi tool_result: name=${m.data?.toolName} callId=${m.data?.callId} result=${resultStr}`);
            }

            observer.next(m);
          }
        } catch (err: any) {
          this.logger.error(`Error processing Kimi event: ${err?.message}`);
        }
      }

      // === Turn completed — await the authoritative result ===
      let runStatus = 'completed';
      try {
        const runResult = await turn.result;
        runStatus = runResult?.status ?? 'completed';
      } catch (err: any) {
        this.logger.warn(`Kimi turn.result rejected: ${err?.message}`);
      }

      // === Output Guardrails ===
      if (shouldBufferOutput && assistantText) {
        try {
          const guardrailResult = await this.outputGuardrailsService.checkGuardrail(assistantText, projectDir);
          if (guardrailResult.guardrailTriggered) {
            observer.next({
              type: 'output_guardrails_triggered',
              data: {
                violations: guardrailResult.violations,
                count: guardrailResult.violations.length,
                runtimeMilliseconds: guardrailResult.runtimeMilliseconds,
              },
            });
          }
          assistantText = guardrailResult.modifiedContent;
          observer.next({ type: 'stdout', data: { chunk: assistantText } });
        } catch (error: any) {
          this.logger.error('Failed to apply output guardrails:', error.message);
        }
      }

      // === Emit usage ===
      if (usage.input_tokens || usage.output_tokens) {
        observer.next({ type: 'usage', data: usage });

        if (sessionId) {
          this.sessionManager.updateTokenUsage(sessionId, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
        }

        if (this.telemetryService.isEnabled() && processId) {
          this.telemetryService.recordUsage(processId, {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
          });
        }
      }

      // === Emit stop hook ===
      this.hookEmitter.emitStop(projectDir, {
        reason: runStatus,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        usage,
      });

      // === Emit telemetry ===
      if (this.telemetryService.isEnabled() && processId) {
        const spanIds = this.telemetryService.getSpanIds(processId);
        if (spanIds) {
          observer.next({
            type: 'telemetry',
            data: { span_id: spanIds.spanId, trace_id: spanIds.traceId },
          });
        }
        this.telemetryService.endConversationSpan(processId, assistantText);
      }

      // === Emit completed ===
      observer.next({ type: 'completed', data: { exitCode: 0, usage } });

      // === Chat Persistence ===
      if (!skipChatPersistence && sessionId) {
        try {
          const timestamp = new Date().toISOString();
          await this.sessionsService.appendMessages(projectRoot, sessionId, [
            { timestamp, isAgent: false, message: sanitizedPrompt, costs: undefined },
            {
              timestamp,
              isAgent: true,
              message: assistantText,
              costs: usage,
            },
          ]);
        } catch (err: any) {
          this.logger.error('Failed to persist chat history:', err?.message);
        }
      }

      // === Budget Tracking ===
      if (!skipChatPersistence && usage.input_tokens && usage.output_tokens) {
        try {
          await this.budgetMonitoringService.trackCosts(
            projectDir, usage.input_tokens, usage.output_tokens, sessionId,
            {
              cacheReadTokens: usage.cache_read_input_tokens,
              cacheCreationTokens: usage.cache_creation_input_tokens,
            },
          );
        } catch (err: any) {
          this.logger.error('Failed to track budget costs:', err?.message);
        }
      }

      // === Memory Storage (fire-and-forget) ===
      if (memoryEnabled && assistantText) {
        const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';
        const serviceToken = this.generateServiceToken();
        axios.post(
          `${memoryBaseUrl}?project=${encodeURIComponent(projectDir)}`,
          {
            messages: [
              { role: 'user', content: sanitizedPrompt },
              { role: 'assistant', content: assistantText },
            ],
            user_id: userId,
            metadata: {
              session_id: sessionId,
              source: 'chat',
              timestamp: new Date().toISOString(),
            },
          },
          { headers: { Authorization: `Bearer ${serviceToken}` } },
        ).catch((error: any) => {
          this.logger.error('Failed to store memories:', error.message);
        });
      }

      // Update session activity
      if (sessionId) {
        await this.sessionManager.touchSession(sessionId);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Kimi stream completed in ${duration}ms for project: ${projectDir} (status=${runStatus})`);
      observer.complete();

    } catch (error: any) {
      this.logger.error(`Kimi stream error: ${error.message}`, error.stack);

      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.endConversationSpanWithError(processId, error);
      }

      const errorCode = this.kimiSdkService.getErrorCode(error);
      let message = error.message;
      if (errorCode === 'CLI_NOT_FOUND' || errorCode === 'SPAWN_FAILED') {
        message = `Kimi CLI not found or failed to start (${errorCode}). Install it (Windows PowerShell: Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression) or set KIMI_BINARY_PATH in the backend .env. Original error: ${error.message}`;
      }
      observer.next({ type: 'error', data: { message, ...(errorCode ? { code: errorCode } : {}) } });
      observer.complete();
    } finally {
      if (processId) {
        this.activeTurns.delete(processId);
      }
      // The live session stays cached in KimiCodeSdkService for the next turn.
    }
  }

  /**
   * Abort a running Kimi turn.
   */
  public async abortProcess(processId: string): Promise<{ success: boolean; message: string }> {
    const active = this.activeTurns.get(processId);
    if (active) {
      this.logger.log(`Aborting Kimi process: ${processId}`);
      active.aborted = true;
      try {
        await active.turn.interrupt();
      } catch (err: any) {
        this.logger.warn(`Kimi turn.interrupt failed: ${err?.message}`);
      }
      this.activeTurns.delete(processId);
      return { success: true, message: 'Kimi turn aborted' };
    }
    this.logger.warn(`No active Kimi turn found for process: ${processId}`);
    return { success: false, message: 'Kimi turn not found' };
  }

  /**
   * Seed <projectRoot>/.kimi/config.toml from the kimi config template so a
   * default model/provider exist even without a global `kimi login`. Runs once
   * per project (existing files are never overwritten); api keys flow via env,
   * never through this file.
   */
  private async seedKimiConfig(projectRoot: string): Promise<void> {
    const shareDir = path.join(projectRoot, '.kimi');
    const configPath = path.join(shareDir, 'config.toml');
    if (await fs.pathExists(configPath)) return;

    try {
      const template = await this.codingAgentConfigService.getConfigForProject('kimi-code');
      await fs.ensureDir(shareDir);
      await fs.writeFile(configPath, template, 'utf-8');
      this.logger.debug(`Seeded Kimi config at ${configPath}`);
    } catch (err: any) {
      this.logger.warn(`Could not load kimi config template: ${err?.message}`);
    }
  }
}
