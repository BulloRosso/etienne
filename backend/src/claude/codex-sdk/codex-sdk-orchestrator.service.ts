import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { CodexSdkService } from './codex-sdk.service';
import { CodexSessionManagerService } from './codex-session-manager.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { getContextLimit } from '../sdk/model-context-limits';
import { MessageEvent, Usage } from '../types';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { sanitize_user_message } from '../../input-guardrails/index';
import { CodexConfig } from './codex.config';
import { safeRoot } from '../utils/path.utils';
import { buildCitationInstruction } from '../shared/citation-prompt';
import { TelemetryService } from '../../observability/telemetry.service';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * Orchestrator service for Codex app-server conversations.
 * Parallel to ClaudeSdkOrchestratorService — reuses all guardrails, memory,
 * telemetry, and persistence services but communicates with the Codex app-server
 * via JSON-RPC stdio protocol.
 */
@Injectable()
export class CodexSdkOrchestratorService {
  private readonly logger = new Logger(CodexSdkOrchestratorService.name);
  private readonly config = new CodexConfig();
  private jwtSecret: string = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  private generateServiceToken(): string {
    return jwt.sign(
      { sub: 'codex-sdk-orchestrator', username: 'system', role: 'admin', displayName: 'Codex Orchestrator', type: 'access' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );
  }

  // Abort controllers per processId — typed SDK uses AbortSignal for turn interruption,
  // replacing the previous JSON-RPC turn/interrupt + activeTurns map.
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    private readonly codexSdkService: CodexSdkService,
    private readonly sessionManager: CodexSessionManagerService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly telemetryService: TelemetryService,
    private readonly secretsManager: SecretsManagerService,
  ) {}

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
  }

  /**
   * Clear the Codex thread for a project (called on "new session")
   */
  async clearSession(projectDir: string): Promise<void> {
    await this.sessionManager.clearSession(projectDir);
  }

  /**
   * Stream a prompt using the Codex app-server with full integration.
   * agentMode is accepted for interface compatibility but ignored — Codex
   * does not support plan/work mode distinction.
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    maxTurns?: number
  ): Observable<MessageEvent> {
    const processId = `codex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Observable<MessageEvent>((observer) => {
      observer.next({
        type: 'session',
        data: { process_id: processId }
      });

      this.runStreamPrompt(
        observer,
        projectDir,
        prompt,
        memoryEnabled,
        skipChatPersistence,
        processId
      ).catch((error) => {
        this.logger.error(`Codex stream prompt failed: ${error.message}`, error.stack);
        observer.error(error);
      });

      return () => {
        // Cleanup on unsubscribe
      };
    });
  }

  /**
   * Internal async handler for streaming prompt
   */
  private async runStreamPrompt(
    observer: any,
    projectDir: string,
    prompt: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    processId?: string
  ): Promise<void> {
    const userId = 'user';
    let threadId: string | undefined;
    let assistantText = '';
    let usage: Usage = {};
    const startTime = Date.now();
    let currentModel: string | undefined;
    const structuredMessages: any[] = [];

    try {
      // Check if resuming an existing thread
      threadId = await this.sessionManager.loadThreadId(projectDir);
      const isFirstRequest = !threadId;

      if (threadId) {
        const existingSession = this.sessionManager.getSession(threadId);
        if (existingSession?.model) {
          currentModel = existingSession.model;
        }
      }

      // === Budget Limit Check ===
      try {
        const budgetCheck = await this.budgetMonitoringService.checkBudgetLimit(projectDir);
        if (budgetCheck.exceeded) {
          this.logger.warn(`Budget limit exceeded for ${projectDir}: ${budgetCheck.currentCosts} / ${budgetCheck.limit} ${budgetCheck.currency}`);
          observer.next({
            type: 'error',
            data: {
              error: `Budget limit exceeded. Current costs: ${budgetCheck.currentCosts.toFixed(2)} ${budgetCheck.currency}, limit: ${budgetCheck.limit.toFixed(2)} ${budgetCheck.currency}. Please increase the budget limit or disable budget monitoring to continue.`
            }
          });
          observer.complete();
          return;
        }
      } catch (err) {
        this.logger.error('Failed to check budget limit:', err);
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

      // === Memory Injection ===
      let enhancedPrompt = sanitizedPrompt;
      if (memoryEnabled && isFirstRequest) {
        try {
          const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

          const settingsResponse = await axios.get(
            `${memoryBaseUrl}/settings?project=${encodeURIComponent(projectDir)}`
          );
          const memorySettings = settingsResponse.data;

          if (memorySettings.memoryEnabled !== false) {
            const searchLimit = memorySettings.searchLimit ?? 5;
            const serviceToken = this.generateServiceToken();
            const authHeaders = { headers: { Authorization: `Bearer ${serviceToken}` } };
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              { query: sanitizedPrompt, user_id: userId, limit: searchLimit > 0 ? searchLimit : 100 },
              authHeaders
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
      if (threadId) {
        try {
          const contextInjection = await this.contextInterceptor.buildContextPromptInjection(
            projectDir, threadId
          );
          if (contextInjection) {
            finalPrompt = `${contextInjection}\n\n${enhancedPrompt}`;
            this.logger.log(`Injected context scope into prompt for thread ${threadId}`);
          }
        } catch (error: any) {
          this.logger.error('Failed to inject context:', error.message);
        }
      }

      // === Datetime Injection ===
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'long'
      });
      const codexCitation = buildCitationInstruction(safeRoot(this.config.hostRoot, projectDir));
      const codexCitationBlock = codexCitation ? `\n\n${codexCitation}` : '';
      finalPrompt = `[Current date and time: ${dateTimeString}]${codexCitationBlock}\n\n${finalPrompt}`;

      // === Emit UserPromptSubmit ===
      this.hookEmitter.emitUserPromptSubmit(projectDir, {
        prompt: finalPrompt,
        session_id: threadId,
        timestamp: new Date().toISOString()
      });

      // === Start Telemetry ===
      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.startConversationSpan(processId, {
          projectName: projectDir,
          sessionId: threadId,
          userId,
          prompt: finalPrompt,
          model: currentModel,
          agentMode: 'work',
        });
      }

      // === Emit guardrails event ===
      if (guardrailsTriggered) {
        observer.next({
          type: 'guardrails_triggered',
          data: { plugins: triggeredPlugins, detections, count: Object.values(detections).reduce((sum, arr) => sum + arr.length, 0) }
        });
      }

      // === Check output guardrails buffering ===
      const outputGuardrailsConfig = await this.outputGuardrailsService.getConfig(projectDir);
      const shouldBufferOutput = outputGuardrailsConfig.enabled;

      // === Stream Codex via typed SDK ===
      this.logger.log(`Starting Codex stream for project: ${projectDir}, thread: ${threadId || 'new'}`);

      // Per-process AbortController for turn interruption.
      const abortController = new AbortController();
      if (processId) {
        this.abortControllers.set(processId, abortController);
      }

      // The typed SDK has no delta event — it emits item.updated with the full
      // agent_message text growing each time. Track what we've already sent so
      // we can compute the delta and forward it as 'stdout' chunks.
      let agentMessageSoFar = '';

      for await (const event of this.codexSdkService.streamConversation(
        projectDir,
        finalPrompt,
        { threadId, abortController }
      )) {
        try {
          switch (event.type) {
            // Thread started — persist sessionId, emit 'session' event
            case 'thread.started': {
              const newThreadId = event.thread_id;
              if (newThreadId) {
                threadId = newThreadId;
                currentModel = currentModel ?? this.config.defaultModel;
                await this.sessionManager.createSession(projectDir, newThreadId, currentModel);
                this.hookEmitter.emitSessionStart(projectDir, {
                  session_id: newThreadId,
                  model: currentModel,
                  timestamp: new Date().toISOString()
                });
                if (this.telemetryService.isEnabled() && processId) {
                  this.telemetryService.updateConversationSpan(processId, {
                    sessionId: newThreadId,
                    model: currentModel,
                  });
                }
                observer.next({
                  type: 'session',
                  data: { session_id: newThreadId, model: currentModel }
                });
              }
              break;
            }

            // Turn started — no payload of interest beyond marking the start
            case 'turn.started': {
              break;
            }

            // Item started — emit tool 'running' for command/file/mcp/web items.
            case 'item.started': {
              this.emitItemRunning(observer, event.item);
              break;
            }

            // Item updated — typed SDK uses this to grow agent_message text and
            // mutate todo_list. Compute delta for agent_message → stdout.
            case 'item.updated': {
              const item = event.item as any;
              if (item.type === 'agent_message') {
                const full = this.stripCitations(item.text || '');
                if (full.length > agentMessageSoFar.length) {
                  const delta = full.slice(agentMessageSoFar.length);
                  agentMessageSoFar = full;
                  assistantText = full;
                  if (delta) {
                    structuredMessages.push({
                      type: 'text_chunk',
                      content: delta,
                      timestamp: Date.now()
                    });
                    if (!shouldBufferOutput) {
                      observer.next({ type: 'stdout', data: { chunk: delta } });
                    }
                  }
                }
              } else if (item.type === 'todo_list') {
                // Forward the full list each update — frontend can dedupe by id.
                observer.next({
                  type: 'tool',
                  data: {
                    toolName: 'TodoList',
                    status: 'running',
                    callId: item.id,
                    input: { items: item.items }
                  }
                });
              }
              break;
            }

            // Item completed — terminal state for each thread item
            case 'item.completed': {
              this.emitItemComplete(observer, structuredMessages, event.item, projectDir, threadId);
              const item = event.item as any;
              if (item.type === 'agent_message' && item.text) {
                // Final text — wins over any partial accumulation
                assistantText = this.stripCitations(item.text);
              }
              break;
            }

            // Turn completed — emit usage, context_state, completed; run output guardrails
            case 'turn.completed': {
              if (event.usage) {
                usage = {
                  input_tokens: event.usage.input_tokens,
                  output_tokens: event.usage.output_tokens,
                  model: currentModel
                };
                observer.next({ type: 'usage', data: usage });

                if (threadId && usage.input_tokens && usage.output_tokens) {
                  this.sessionManager.updateTokenUsage(threadId, usage.input_tokens, usage.output_tokens);
                }
                if (this.telemetryService.isEnabled() && processId) {
                  this.telemetryService.recordUsage(processId, {
                    inputTokens: usage.input_tokens ?? 0,
                    outputTokens: usage.output_tokens ?? 0,
                    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
                  });
                }

                const sessionForContext = threadId ? this.sessionManager.getSession(threadId) : undefined;
                const usedTokens = sessionForContext?.totalTokens
                  ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));
                const maxTokens = getContextLimit(currentModel);
                observer.next({
                  type: 'context_state',
                  data: {
                    percentFull: Math.min(100, (usedTokens / maxTokens) * 100),
                    usedTokens,
                    maxTokens,
                    model: currentModel ?? 'unknown',
                  }
                });
              }

              // Output guardrails on the buffered final text
              if (shouldBufferOutput && assistantText) {
                try {
                  const guardrailResult = await this.outputGuardrailsService.checkGuardrail(assistantText, projectDir);
                  if (guardrailResult.guardrailTriggered) {
                    observer.next({
                      type: 'output_guardrails_triggered',
                      data: {
                        violations: guardrailResult.violations,
                        count: guardrailResult.violations.length,
                        runtimeMilliseconds: guardrailResult.runtimeMilliseconds
                      }
                    });
                  }
                  assistantText = guardrailResult.modifiedContent;
                  observer.next({ type: 'stdout', data: { chunk: assistantText } });
                } catch (error: any) {
                  this.logger.error('Failed to apply output guardrails:', error.message);
                }
              }

              this.hookEmitter.emitStop(projectDir, {
                reason: 'completed',
                session_id: threadId,
                timestamp: new Date().toISOString(),
                usage
              });

              if (this.telemetryService.isEnabled() && processId) {
                const spanIds = this.telemetryService.getSpanIds(processId);
                if (spanIds) {
                  observer.next({
                    type: 'telemetry',
                    data: { span_id: spanIds.spanId, trace_id: spanIds.traceId }
                  });
                }
                this.telemetryService.endConversationSpan(processId, assistantText);
              }

              observer.next({
                type: 'completed',
                data: { exitCode: 0, usage }
              });
              break;
            }

            // Turn failed — surface the error and emit completed with non-zero exit
            case 'turn.failed': {
              const errorMsg = event.error?.message || 'Turn failed';
              this.logger.error(`Codex turn failed: ${errorMsg}`);
              observer.next({
                type: 'error',
                data: { message: errorMsg, recoverable: false }
              });
              observer.next({
                type: 'stdout',
                data: { chunk: `\n\n**Error:** ${errorMsg}\n` }
              });
              observer.next({
                type: 'completed',
                data: { exitCode: 1, usage }
              });
              break;
            }

            // Fatal stream error
            case 'error': {
              const errorMsg = (event as any).message || 'Codex stream error';
              this.logger.error(`Codex stream error event: ${errorMsg}`);
              observer.next({
                type: 'error',
                data: { message: errorMsg, recoverable: false }
              });
              break;
            }

            default: {
              this.logger.debug(`Unhandled Codex event: ${(event as any).type}`);
              break;
            }
          }
        } catch (eventError: any) {
          this.logger.error(`Error processing Codex event: ${eventError.message}`, eventError.stack);
          observer.next({
            type: 'error',
            data: { message: `Event processing error: ${eventError.message}`, recoverable: true }
          });
        }
      }

      // === Chat Persistence ===
      if (!skipChatPersistence && threadId) {
        try {
          const root = safeRoot(this.config.hostRoot, projectDir);
          const timestamp = new Date().toISOString();

          await this.sessionsService.appendMessages(root, threadId, [
            { timestamp, isAgent: false, message: sanitizedPrompt, costs: undefined },
            {
              timestamp,
              isAgent: true,
              message: assistantText,
              costs: usage,
              reasoningSteps: structuredMessages.length > 0 ? structuredMessages : undefined
            }
          ]);
        } catch (err) {
          this.logger.error('Failed to persist chat history:', err);
        }
      }

      // === Budget Tracking ===
      if (!skipChatPersistence && usage.input_tokens && usage.output_tokens) {
        try {
          await this.budgetMonitoringService.trackCosts(
            projectDir, usage.input_tokens, usage.output_tokens, threadId
          );
        } catch (err) {
          this.logger.error('Failed to track budget costs:', err);
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
              { role: 'assistant', content: assistantText }
            ],
            user_id: userId,
            metadata: {
              session_id: threadId,
              source: 'chat',
              timestamp: new Date().toISOString()
            }
          },
          { headers: { Authorization: `Bearer ${serviceToken}` } }
        ).catch((error: any) => {
          this.logger.error('Failed to store memories:', error.message);
        });
      }

      // Update thread activity
      if (threadId) {
        await this.sessionManager.touchSession(threadId);
      }

      // Clean up abort controller tracking
      if (processId) {
        this.abortControllers.delete(processId);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Codex stream completed in ${duration}ms for project: ${projectDir}`);
      observer.complete();

    } catch (error: any) {
      this.logger.error(`Codex stream error: ${error.message}`, error.stack);

      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.endConversationSpanWithError(processId, error);
      }

      observer.next({ type: 'error', data: { message: error.message } });
      observer.complete();
    } finally {
      // Clean up abort controller tracking
      if (processId) {
        this.abortControllers.delete(processId);
      }
    }
  }

  /**
   * Abort a running Codex turn by signalling its AbortController.
   */
  public async abortProcess(processId: string) {
    const controller = this.abortControllers.get(processId);
    if (controller) {
      this.logger.log(`Aborting Codex process: ${processId}`);
      controller.abort();
      this.abortControllers.delete(processId);
      return { success: true, message: 'Codex turn interrupted' };
    }
    this.logger.warn(`No active Codex turn found for process: ${processId}`);
    return { success: false, message: 'Codex turn not found' };
  }

  /**
   * Strip leaked OpenAI citation tokens from Codex output.
   *
   * Codex models that perform web search embed internal citation markers
   * like "citeturn0search0", "citeturn1open0" etc. in the text. These are
   * meant for ChatGPT's frontend to render as footnotes but leak as raw
   * strings through the app-server protocol.
   *
   * Also strips Unicode private-use character wrappers (\ue200-\ue202)
   * that sometimes wrap these tokens.
   */
  private stripCitations(text: string): string {
    if (!text) return text;
    // Remove Unicode private-use citation delimiters
    let cleaned = text.replace(/[\ue200\ue201\ue202]/g, '');
    // Remove citeturnXsearchY / citeturnXopenY / citeturnXnewsY / citeturnXfileY tokens
    cleaned = cleaned.replace(/citeturn\d+(?:search|open|news|file)\d+/g, '');
    return cleaned;
  }

  /**
   * Extract a clean, human-readable description from a Codex command string.
   * Codex on Windows wraps commands in PowerShell; strip that wrapper to show
   * only the meaningful inner command.
   */
  private extractCommandDescription(command: string): string {
    if (!command) return '';

    // Match PowerShell wrapper: "...powershell.exe" -Command "..." or '...'
    const psMatch = command.match(
      /powershell(?:\.exe)?["']?\s+(?:-(?:Command|c)\s+)?["'](.+?)["']\s*$/i
    );
    if (psMatch) return psMatch[1];

    // Match cmd wrapper: "...cmd.exe" /c "..."
    const cmdMatch = command.match(
      /cmd(?:\.exe)?["']?\s+\/[cC]\s+["'](.+?)["']\s*$/i
    );
    if (cmdMatch) return cmdMatch[1];

    // Fallback: strip leading path to shell binary if present
    const shellMatch = command.match(
      /(?:bash|sh|zsh)(?:\.exe)?["']?\s+(?:-c\s+)?["'](.+?)["']\s*$/i
    );
    if (shellMatch) return shellMatch[1];

    return command;
  }

  /**
   * Map a typed ThreadItem to a 'tool' SSE event with status 'running'.
   * Mirrors the previous behavior of the item/started case in the JSON-RPC switch.
   */
  private emitItemRunning(observer: any, item: any): void {
    if (!item) return;
    switch (item.type) {
      case 'command_execution':
        observer.next({
          type: 'tool',
          data: {
            toolName: 'Bash',
            status: 'running',
            callId: item.id,
            input: { command: item.command || '', description: this.extractCommandDescription(item.command || '') }
          }
        });
        break;
      case 'file_change': {
        const firstPath = item.changes?.[0]?.path || '';
        observer.next({
          type: 'tool',
          data: { toolName: 'Edit', status: 'running', callId: item.id, input: { file_path: firstPath } }
        });
        break;
      }
      case 'mcp_tool_call': {
        const toolName = `mcp__${item.server}__${item.tool}`;
        observer.next({
          type: 'tool',
          data: { toolName, status: 'running', callId: item.id, input: item.arguments }
        });
        break;
      }
      case 'web_search':
        observer.next({
          type: 'tool',
          data: { toolName: 'WebSearch', status: 'running', callId: item.id, input: { query: item.query } }
        });
        break;
      case 'reasoning': {
        // Initial reasoning text — surface as a thinking block
        const text = item.text;
        if (text) {
          observer.next({ type: 'thinking', data: { content: text } });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Map a completed typed ThreadItem to the corresponding SSE event(s) +
   * hookEmitter.emitPostToolUse + structuredMessages push.
   */
  private emitItemComplete(
    observer: any,
    structuredMessages: any[],
    item: any,
    projectDir: string,
    threadId: string | undefined,
  ): void {
    if (!item) return;
    const callId = item.id;
    switch (item.type) {
      case 'command_execution':
        this.hookEmitter.emitPostToolUse(projectDir, {
          tool_name: 'Bash',
          tool_output: item.aggregated_output,
          call_id: callId,
          session_id: threadId,
          timestamp: new Date().toISOString()
        });
        observer.next({
          type: 'tool',
          data: {
            toolName: 'Bash',
            status: 'complete',
            callId,
            input: { command: item.command, description: this.extractCommandDescription(item.command) },
            result: item.aggregated_output || `Exit code: ${item.exit_code ?? 'unknown'}`
          }
        });
        structuredMessages.push({
          id: callId,
          type: 'tool_call',
          toolName: 'Bash',
          args: { command: item.command, description: this.extractCommandDescription(item.command) },
          status: 'complete',
          result: item.aggregated_output,
          timestamp: Date.now()
        });
        break;
      case 'file_change': {
        const changes = item.changes || [];
        for (const change of changes) {
          if (change.kind === 'add') {
            this.hookEmitter.emitFileAdded(projectDir, {
              path: change.path,
              session_id: threadId,
              timestamp: new Date().toISOString()
            });
            observer.next({ type: 'file_added', data: { path: change.path } });
          } else {
            this.hookEmitter.emitFileChanged(projectDir, {
              path: change.path,
              session_id: threadId,
              timestamp: new Date().toISOString()
            });
            observer.next({ type: 'file_changed', data: { path: change.path } });
          }
        }
        this.hookEmitter.emitPostToolUse(projectDir, {
          tool_name: 'Edit',
          tool_output: changes.map((c: any) => `${c.kind}: ${c.path}`).join(', '),
          call_id: callId,
          session_id: threadId,
          timestamp: new Date().toISOString()
        });
        const filePaths = changes.map((c: any) => c.path);
        const primaryPath = filePaths[0] || '';
        const description = filePaths.length === 1
          ? primaryPath
          : `${primaryPath} (+${filePaths.length - 1} more)`;
        observer.next({
          type: 'tool',
          data: {
            toolName: 'Edit',
            status: 'complete',
            callId,
            input: { file_path: primaryPath, description },
            result: changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n')
          }
        });
        structuredMessages.push({
          id: callId,
          type: 'tool_call',
          toolName: 'Edit',
          args: { file_path: primaryPath, description },
          status: 'complete',
          result: changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n'),
          timestamp: Date.now()
        });
        break;
      }
      case 'mcp_tool_call': {
        const toolName = `mcp__${item.server}__${item.tool}`;
        const result = item.error?.message || JSON.stringify(item.result || '');
        this.hookEmitter.emitPostToolUse(projectDir, {
          tool_name: toolName,
          tool_output: result,
          call_id: callId,
          session_id: threadId,
          timestamp: new Date().toISOString()
        });
        observer.next({
          type: 'tool',
          data: { toolName, status: 'complete', callId, input: item.arguments, result }
        });
        structuredMessages.push({
          id: callId,
          type: 'tool_call',
          toolName,
          args: item.arguments,
          status: 'complete',
          result,
          timestamp: Date.now()
        });
        break;
      }
      case 'web_search':
        observer.next({
          type: 'tool',
          data: {
            toolName: 'WebSearch',
            status: 'complete',
            callId,
            input: { query: item.query },
            result: 'Search completed'
          }
        });
        structuredMessages.push({
          id: callId,
          type: 'tool_call',
          toolName: 'WebSearch',
          args: { query: item.query },
          status: 'complete',
          timestamp: Date.now()
        });
        break;
      case 'reasoning': {
        const text = item.text;
        if (text) {
          observer.next({ type: 'thinking', data: { content: text } });
          structuredMessages.push({ type: 'thinking', content: text, timestamp: Date.now() });
        }
        break;
      }
      case 'todo_list':
        observer.next({
          type: 'tool',
          data: { toolName: 'TodoList', status: 'complete', callId, input: { items: item.items }, result: '' }
        });
        break;
      case 'error':
        observer.next({
          type: 'error',
          data: { message: item.message || 'Item error', recoverable: true }
        });
        break;
      default:
        break;
    }
  }
}
