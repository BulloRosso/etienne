import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { CodexSdkService, AppServerMessage } from './codex-sdk.service';
import { CodexSessionManagerService } from './codex-session-manager.service';
import { CodexPermissionService } from './codex-permission.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { MessageEvent, Usage } from '../types';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { sanitize_user_message } from '../../input-guardrails/index';
import { CodexConfig } from './codex.config';
import { safeRoot } from '../utils/path.utils';
import { TelemetryService } from '../../observability/telemetry.service';

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
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  private generateServiceToken(): string {
    return jwt.sign(
      { sub: 'codex-sdk-orchestrator', username: 'system', role: 'admin', displayName: 'Codex Orchestrator', type: 'access' },
      this.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  // Active turn tracking for interruption (replaces AbortController)
  private readonly activeTurns = new Map<string, { threadId: string; turnId: string }>();

  constructor(
    private readonly codexSdkService: CodexSdkService,
    private readonly sessionManager: CodexSessionManagerService,
    private readonly codexPermissionService: CodexPermissionService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly telemetryService: TelemetryService
  ) {}

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
    let turnId: string | undefined;
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
      finalPrompt = `[Current date and time: ${dateTimeString}]\n\n${finalPrompt}`;

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

      // === Stream Codex app-server conversation ===
      this.logger.log(`Starting Codex stream for project: ${projectDir}, thread: ${threadId || 'new'}`);

      for await (const message of this.codexSdkService.streamConversation(
        projectDir,
        finalPrompt,
        { threadId, processId }
      )) {
        try {
          // === Handle server-initiated requests (approval/elicitation) ===
          if (message._type === 'request') {
            this.logger.log(`Codex server request: ${message.method} (id=${message.id})`);

            // Fire-and-forget: the permission service handles the full lifecycle
            // (emit SSE event → wait for frontend response → send JSON-RPC response back)
            this.codexPermissionService.handleServerRequest(projectDir, {
              id: message.id,
              method: message.method,
              params: message.params,
            }).catch((err) => {
              this.logger.error(`Error handling server request ${message.method}: ${err.message}`);
            });

            // Emit a "running" tool event so the frontend shows visual feedback
            if (message.method === 'item/commandExecution/requestApproval') {
              const parsedCmd = message.params?.parsedCmd || {};
              const cmdStr = [parsedCmd.command, ...(parsedCmd.args || [])].join(' ');
              observer.next({
                type: 'tool',
                data: {
                  toolName: 'Bash',
                  status: 'running',
                  callId: message.params?.itemId || `approval_${message.id}`,
                  input: { command: cmdStr, description: 'Awaiting approval...' },
                },
              });
            } else if (message.method === 'item/fileChange/requestApproval') {
              const changes = message.params?.changes || [];
              const primaryPath = changes[0]?.path || '';
              observer.next({
                type: 'tool',
                data: {
                  toolName: 'Edit',
                  status: 'running',
                  callId: message.params?.itemId || `approval_${message.id}`,
                  input: { file_path: primaryPath, description: 'Awaiting approval...' },
                },
              });
            }

            continue; // Don't fall through to notification handling
          }

          // === Handle notifications ===
          const notification = message;
          this.logger.debug(`Codex notification: ${notification.method}`);

          switch (notification.method) {

            // === Thread started ===
            case 'thread/started': {
              const thread = notification.params?.thread;
              const newThreadId = thread?.id;
              if (newThreadId) {
                threadId = newThreadId;
                currentModel = this.config.defaultModel;
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

            // === Turn started — store turnId for abort ===
            case 'turn/started': {
              const turn = notification.params?.turn;
              if (turn?.id) {
                turnId = turn.id;
                if (processId && threadId && turnId) {
                  this.activeTurns.set(processId, { threadId, turnId });
                }
              }
              break;
            }

            // === Agent message delta — true delta text streaming ===
            case 'item/agentMessage/delta': {
              const rawDelta = notification.params?.delta;
              if (rawDelta) {
                const delta = this.stripCitations(rawDelta);
                assistantText += delta;

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
              break;
            }

            // === Item started — emit "running" indicator ===
            case 'item/started': {
              const item = notification.params?.item;
              if (!item) break;

              if (item.type === 'commandExecution') {
                observer.next({
                  type: 'tool',
                  data: {
                    toolName: 'Bash', status: 'running', callId: item.id,
                    input: { command: item.command || '', description: this.extractCommandDescription(item.command || '') }
                  }
                });
              } else if (item.type === 'fileChange') {
                const firstPath = item.changes?.[0]?.path || '';
                observer.next({
                  type: 'tool',
                  data: {
                    toolName: 'Edit', status: 'running', callId: item.id,
                    input: { file_path: firstPath }
                  }
                });
              } else if (item.type === 'mcpToolCall') {
                const toolName = `mcp__${item.server}__${item.tool}`;
                observer.next({
                  type: 'tool',
                  data: { toolName, status: 'running', callId: item.id, input: item.arguments }
                });
              } else if (item.type === 'webSearch') {
                observer.next({
                  type: 'tool',
                  data: { toolName: 'WebSearch', status: 'running', callId: item.id, input: { query: item.query } }
                });
              }
              break;
            }

            // === Item completed ===
            case 'item/completed': {
              const item = notification.params?.item;
              this.logger.debug(`item/completed: type=${item?.type}`);
              if (!item) break;

              // commandExecution completed
              if (item.type === 'commandExecution') {
                const callId = item.id;
                this.hookEmitter.emitPostToolUse(projectDir, {
                  tool_name: 'Bash',
                  tool_output: item.aggregatedOutput,
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
                    result: item.aggregatedOutput || `Exit code: ${item.exitCode ?? 'unknown'}`
                  }
                });
                structuredMessages.push({
                  id: callId,
                  type: 'tool_call',
                  toolName: 'Bash',
                  args: { command: item.command, description: this.extractCommandDescription(item.command) },
                  status: 'complete',
                  result: item.aggregatedOutput,
                  timestamp: Date.now()
                });
              }

              // fileChange completed
              if (item.type === 'fileChange' && item.changes) {
                const callId = item.id;
                for (const change of item.changes) {
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
                  tool_output: item.changes.map((c: any) => `${c.kind}: ${c.path}`).join(', '),
                  call_id: callId,
                  session_id: threadId,
                  timestamp: new Date().toISOString()
                });
                const filePaths = item.changes.map((c: any) => c.path);
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
                    result: item.changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n')
                  }
                });
                structuredMessages.push({
                  id: callId,
                  type: 'tool_call',
                  toolName: 'Edit',
                  args: { file_path: primaryPath, description },
                  status: 'complete',
                  result: item.changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n'),
                  timestamp: Date.now()
                });
              }

              // mcpToolCall completed
              if (item.type === 'mcpToolCall') {
                const callId = item.id;
                const toolName = `mcp__${item.server}__${item.tool}`;
                this.hookEmitter.emitPostToolUse(projectDir, {
                  tool_name: toolName,
                  tool_output: item.error?.message || JSON.stringify(item.result || ''),
                  call_id: callId,
                  session_id: threadId,
                  timestamp: new Date().toISOString()
                });
                observer.next({
                  type: 'tool',
                  data: {
                    toolName,
                    status: 'complete',
                    callId,
                    input: item.arguments,
                    result: item.error?.message || JSON.stringify(item.result || '')
                  }
                });
                structuredMessages.push({
                  id: callId,
                  type: 'tool_call',
                  toolName,
                  args: item.arguments,
                  status: 'complete',
                  result: item.error?.message || JSON.stringify(item.result || ''),
                  timestamp: Date.now()
                });
              }

              // webSearch completed
              if (item.type === 'webSearch') {
                const callId = item.id;
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
              }

              // reasoning item — emit as thinking event
              if (item.type === 'reasoning') {
                const summaryText = Array.isArray(item.summary) ? item.summary.join('\n') : '';
                const contentText = Array.isArray(item.content) ? item.content.join('\n') : '';
                const reasoningText = summaryText || contentText;
                if (reasoningText) {
                  observer.next({ type: 'thinking', data: { content: reasoningText } });
                  structuredMessages.push({
                    type: 'thinking',
                    content: reasoningText,
                    timestamp: Date.now()
                  });
                }
              }

              // agentMessage completed — capture final text for persistence
              if (item.type === 'agentMessage') {
                if (item.text) {
                  assistantText = this.stripCitations(item.text);
                }
              }

              break;
            }

            // === Command execution output delta (live streaming) ===
            case 'item/commandExecution/outputDelta': {
              // Optional: could stream live command output to frontend
              // For now, just log it
              break;
            }

            // === Token usage updated ===
            case 'thread/tokenUsage/updated': {
              const tokenUsage = notification.params?.tokenUsage;
              if (tokenUsage?.last) {
                usage = {
                  input_tokens: tokenUsage.last.inputTokens,
                  output_tokens: tokenUsage.last.outputTokens,
                  model: currentModel
                };
              }
              break;
            }

            // === Turn completed ===
            case 'turn/completed': {
              const turn = notification.params?.turn;
              this.logger.debug(`turn/completed: status=${turn?.status}, assistantTextLen=${assistantText.length}, structuredMsgs=${structuredMessages.length}, shouldBuffer=${shouldBufferOutput}`);

              // Check for failure
              if (turn?.status === 'failed') {
                const errorMsg = turn.error?.message || 'Turn failed';
                this.logger.error(`Codex turn failed: ${errorMsg}`);
                observer.next({
                  type: 'error',
                  data: { message: errorMsg, recoverable: false }
                });
                observer.next({
                  type: 'stdout',
                  data: { chunk: `\n\n**Error:** ${errorMsg}\n` }
                });
              }

              // Emit usage
              if (usage.input_tokens || usage.output_tokens) {
                observer.next({ type: 'usage', data: usage });

                if (threadId && usage.input_tokens && usage.output_tokens) {
                  this.sessionManager.updateTokenUsage(threadId, usage.input_tokens, usage.output_tokens);
                }

                if (this.telemetryService.isEnabled() && processId) {
                  this.telemetryService.recordUsage(processId, {
                    inputTokens: usage.input_tokens,
                    outputTokens: usage.output_tokens,
                    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
                  });
                }
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

              // Emit Stop event
              this.hookEmitter.emitStop(projectDir, {
                reason: 'completed',
                session_id: threadId,
                timestamp: new Date().toISOString(),
                usage
              });

              // Emit telemetry
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

              // Emit completed
              observer.next({
                type: 'completed',
                data: { exitCode: turn?.status === 'failed' ? 1 : 0, usage }
              });

              break;
            }

            // === Reasoning deltas (live streaming) ===
            case 'item/reasoning/summaryTextDelta':
            case 'item/reasoning/textDelta': {
              // Could stream live reasoning to frontend
              break;
            }

            // === Error notification ===
            case 'error': {
              const errorParams = notification.params;
              observer.next({
                type: 'error',
                data: { message: errorParams?.message || 'Unknown error', recoverable: false }
              });
              break;
            }

            // === Other notifications (logged but not forwarded) ===
            case 'thread/name/updated':
            case 'thread/compacted':
            case 'sessionConfigured':
            case 'authStatusChange':
            case 'turn/diff/updated':
            case 'turn/plan/updated':
            case 'item/plan/delta':
            case 'item/fileChange/outputDelta':
            case 'item/mcpToolCall/progress':
            case 'item/commandExecution/terminalInteraction':
            case 'deprecationNotice':
            case 'configWarning':
            case 'windows/worldWritableWarning':
            case 'account/updated':
            case 'account/rateLimits/updated':
            case 'account/login/completed':
            // Legacy codex/event/* notifications (v1 format sent alongside v2)
            case 'codex/event/item_started':
            case 'codex/event/item_completed':
            case 'codex/event/task_started':
            case 'codex/event/task_complete':
            case 'codex/event/user_message':
            case 'codex/event/mcp_startup_complete':
            case 'codex/event/error':
            case 'codex/event/agent_message_delta':
            case 'codex/event/agent_message_content_delta':
            case 'codex/event/agent_message':
            case 'codex/event/token_count':
            case 'codex/event/exec_command_begin':
            case 'codex/event/exec_command_output_delta':
            case 'codex/event/exec_command_end':
              // Known notifications that don't need frontend forwarding
              break;

            // Approval/elicitation methods — normally handled as server requests
            // (with id field) above. If they arrive here as pure notifications
            // (no id), it means the approval policy is 'never' or the app-server
            // sent them without an id.
            case 'item/commandExecution/requestApproval':
            case 'item/fileChange/requestApproval':
            case 'tool/requestUserInput':
            case 'agent/requestUserInput':
            case 'agent/askUserQuestion':
              this.logger.debug(`Received ${notification.method} as notification (no id) — ignoring`);
              break;

            default:
              this.logger.debug(`Unhandled Codex notification: ${notification.method}`);
              break;
          }

        } catch (messageError: any) {
          this.logger.error(`Error processing Codex notification: ${messageError.message}`, messageError.stack);
          observer.next({
            type: 'error',
            data: { message: `Event processing error: ${messageError.message}`, recoverable: true }
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

      // Clean up active turn tracking
      if (processId) {
        this.activeTurns.delete(processId);
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
      // Clean up active turn tracking
      if (processId) {
        this.activeTurns.delete(processId);
      }
    }
  }

  /**
   * Abort a running Codex turn
   */
  public async abortProcess(processId: string) {
    const turnInfo = this.activeTurns.get(processId);
    if (turnInfo) {
      this.logger.log(`Aborting Codex process: ${processId} (thread=${turnInfo.threadId}, turn=${turnInfo.turnId})`);
      await this.codexSdkService.interruptTurn(turnInfo.threadId, turnInfo.turnId);
      this.activeTurns.delete(processId);
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
}
