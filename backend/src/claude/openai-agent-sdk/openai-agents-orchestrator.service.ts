import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import { join } from 'path';
import { OpenAIAgentsSdkService } from './openai-agents-sdk.service';
import { OpenAIAgentsSessionManagerService } from './openai-agents-session-manager.service';
import { OpenAIAgentsPermissionService } from './openai-agents-permission.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { MessageEvent, Usage } from '../types';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { sanitize_user_message } from '../../input-guardrails/index';
import { OpenAIAgentsConfig } from './openai-agents.config';
import { safeRoot } from '../utils/path.utils';
import { TelemetryService } from '../../observability/telemetry.service';
import { CodingAgentConfigurationService } from '../../coding-agent-configuration/coding-agent-configuration.service';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * Orchestrator service for OpenAI Agents SDK conversations.
 * Parallel to CodexSdkOrchestratorService — reuses all guardrails, memory,
 * telemetry, and persistence services but communicates with the OpenAI Agents
 * SDK directly via its TypeScript API.
 */
@Injectable()
export class OpenAIAgentsOrchestratorService {
  private readonly logger = new Logger(OpenAIAgentsOrchestratorService.name);
  private readonly config = new OpenAIAgentsConfig();
  private jwtSecret: string =
    process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  private generateServiceToken(): string {
    return jwt.sign(
      {
        sub: 'openai-agents-orchestrator',
        username: 'system',
        role: 'admin',
        displayName: 'OpenAI Agents Orchestrator',
        type: 'access',
      },
      this.jwtSecret,
      { expiresIn: '1h' },
    );
  }

  constructor(
    private readonly sdkService: OpenAIAgentsSdkService,
    private readonly sessionManager: OpenAIAgentsSessionManagerService,
    private readonly permissionService: OpenAIAgentsPermissionService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly telemetryService: TelemetryService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
    private readonly secretsManager: SecretsManagerService,
  ) {}

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
  }

  /**
   * Clear the session for a project (called on "new session")
   */
  async clearSession(projectDir: string): Promise<void> {
    await this.sessionManager.clearSession(projectDir);
    this.sdkService.clearSession(projectDir);
  }

  /**
   * Stream a prompt using the OpenAI Agents SDK with full integration.
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    maxTurns?: number,
  ): Observable<MessageEvent> {
    const processId = `agents_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Observable<MessageEvent>((observer) => {
      observer.next({
        type: 'session',
        data: { process_id: processId },
      });

      this.runStreamPrompt(
        observer,
        projectDir,
        prompt,
        agentMode,
        memoryEnabled,
        skipChatPersistence,
        processId,
      ).catch((error) => {
        this.logger.error(
          `OpenAI Agents stream prompt failed: ${error.message}`,
          error.stack,
        );
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
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    processId?: string,
  ): Promise<void> {
    const userId = 'user';
    let sessionId: string | undefined;
    let assistantText = '';
    let usage: Usage = {};
    const startTime = Date.now();
    let currentModel: string | undefined;
    const structuredMessages: any[] = [];
    let lastActiveAgent: string | undefined;
    // Track tool calls so we can detect file writes on tool_output
    const toolCallMap = new Map<string, { toolName: string; input: any }>();

    try {
      // Check if resuming an existing session
      sessionId = await this.sessionManager.loadSessionId(projectDir);
      const isFirstRequest = !sessionId;

      if (sessionId) {
        const existingSession = this.sessionManager.getSession(sessionId);
        if (existingSession?.model) {
          currentModel = existingSession.model;
        }
      }

      // === Budget Limit Check ===
      try {
        const budgetCheck =
          await this.budgetMonitoringService.checkBudgetLimit(projectDir);
        if (budgetCheck.exceeded) {
          this.logger.warn(
            `Budget limit exceeded for ${projectDir}: ${budgetCheck.currentCosts} / ${budgetCheck.limit} ${budgetCheck.currency}`,
          );
          observer.next({
            type: 'error',
            data: {
              error: `Budget limit exceeded. Current costs: ${budgetCheck.currentCosts.toFixed(2)} ${budgetCheck.currency}, limit: ${budgetCheck.limit.toFixed(2)} ${budgetCheck.currency}. Please increase the budget limit or disable budget monitoring to continue.`,
            },
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
        const guardrailsConfig =
          await this.guardrailsService.getConfig(projectDir);
        if (guardrailsConfig.enabled.length > 0) {
          const sanitizationResult = sanitize_user_message(
            prompt,
            guardrailsConfig.enabled,
          );
          sanitizedPrompt = sanitizationResult.sanitizedText;

          if (sanitizationResult.triggeredPlugins.length > 0) {
            guardrailsTriggered = true;
            triggeredPlugins = sanitizationResult.triggeredPlugins;
            detections = sanitizationResult.detections;
            this.logger.log(
              `Input guardrails triggered for ${projectDir}:`,
              triggeredPlugins,
            );
          }
        }
      } catch (error: any) {
        this.logger.error(
          'Failed to apply input guardrails:',
          error.message,
        );
      }

      // === Memory Injection ===
      let enhancedPrompt = sanitizedPrompt;
      if (memoryEnabled && isFirstRequest) {
        try {
          const memoryBaseUrl =
            process.env.MEMORY_MANAGEMENT_URL ||
            'http://localhost:6060/api/memories';

          const settingsResponse = await axios.get(
            `${memoryBaseUrl}/settings?project=${encodeURIComponent(projectDir)}`,
          );
          const memorySettings = settingsResponse.data;

          if (memorySettings.memoryEnabled !== false) {
            const searchLimit = memorySettings.searchLimit ?? 5;
            const serviceToken = this.generateServiceToken();
            const authHeaders = {
              headers: { Authorization: `Bearer ${serviceToken}` },
            };
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              {
                query: sanitizedPrompt,
                user_id: userId,
                limit: searchLimit > 0 ? searchLimit : 100,
              },
              authHeaders,
            );

            const memories = searchResponse.data.results || [];
            if (memories.length > 0) {
              const memoryContext = memories
                .map((m: any) => m.memory)
                .join('\n- ');
              enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${sanitizedPrompt}`;
              this.logger.log(
                `Enhanced prompt with ${memories.length} memories`,
              );
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
          const contextInjection =
            await this.contextInterceptor.buildContextPromptInjection(
              projectDir,
              sessionId,
            );
          if (contextInjection) {
            finalPrompt = `${contextInjection}\n\n${enhancedPrompt}`;
            this.logger.log(
              `Injected context scope into prompt for session ${sessionId}`,
            );
          }
        } catch (error: any) {
          this.logger.error('Failed to inject context:', error.message);
        }
      }

      // === Datetime Injection ===
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'long',
      });
      finalPrompt = `[Current date and time: ${dateTimeString}]\n[Current session ID: ${sessionId}]\n\nAlways create user orders before beginning to work on complex multi step tasks. A single step or action required from a user like 'Create an Excel table from ...' does not count for a user order. At least two different artifacts/files must be created in a user order.\n\n${finalPrompt}`;

      // === Emit UserPromptSubmit ===
      this.hookEmitter.emitUserPromptSubmit(projectDir, {
        prompt: finalPrompt,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
      });

      // === Start Telemetry ===
      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.startConversationSpan(processId, {
          projectName: projectDir,
          sessionId,
          userId,
          prompt: finalPrompt,
          model: currentModel,
          agentMode: agentMode || 'work',
        });
      }

      // === Emit guardrails event ===
      if (guardrailsTriggered) {
        observer.next({
          type: 'guardrails_triggered',
          data: {
            plugins: triggeredPlugins,
            detections,
            count: Object.values(detections).reduce(
              (sum, arr) => sum + arr.length,
              0,
            ),
          },
        });
      }

      // === Check output guardrails buffering ===
      const outputGuardrailsConfig =
        await this.outputGuardrailsService.getConfig(projectDir);
      const shouldBufferOutput = outputGuardrailsConfig.enabled;

      // === Load project instructions + active skills ===
      const baseInstructions = await this.loadProjectInstructions(projectDir);
      const skillsContent = await this.loadSkills(projectDir);
      const instructions = baseInstructions + skillsContent;

      // === Create approval resolver for HITL flow ===
      const approvalResolver = async (
        interruptions: any[],
      ): Promise<Map<any, { approved: boolean }>> => {
        const results = new Map<any, { approved: boolean }>();
        for (const interruption of interruptions) {
          const result =
            await this.permissionService.handleApprovalRequest(
              projectDir,
              interruption,
            );
          results.set(interruption, result);
        }
        return results;
      };

      // === Stream OpenAI Agents SDK conversation ===
      this.logger.log(
        `Starting OpenAI Agents stream for project: ${projectDir}, session: ${sessionId || 'new'}`,
      );

      for await (const event of this.sdkService.streamConversation(
        projectDir,
        finalPrompt,
        {
          sessionId,
          processId,
          instructions,
          approvalResolver,
        },
      )) {
        try {
          // === Session initialization (internal event from SDK service) ===
          if (event.type === 'session_init') {
            sessionId = event.sessionId;
            currentModel = event.model;
            await this.sessionManager.createSession(
              projectDir,
              event.sessionId,
              event.model,
            );

            this.hookEmitter.emitSessionStart(projectDir, {
              session_id: event.sessionId,
              model: event.model,
              timestamp: new Date().toISOString(),
            });

            if (this.telemetryService.isEnabled() && processId) {
              this.telemetryService.updateConversationSpan(processId, {
                sessionId: event.sessionId,
                model: event.model,
              });
            }

            observer.next({
              type: 'session',
              data: { session_id: event.sessionId, model: event.model },
            });
            continue;
          }

          // === Run completed (internal event from SDK service) ===
          if (event.type === 'run_completed') {
            // Extract usage from the completed run
            const runUsage = event.usage;
            if (runUsage) {
              usage = {
                input_tokens:
                  runUsage.inputTokens ?? runUsage.input_tokens ?? 0,
                output_tokens:
                  runUsage.outputTokens ?? runUsage.output_tokens ?? 0,
                model: currentModel,
              };
              observer.next({ type: 'usage', data: usage });

              if (sessionId && usage.input_tokens && usage.output_tokens) {
                this.sessionManager.updateTokenUsage(
                  sessionId,
                  usage.input_tokens,
                  usage.output_tokens,
                );
              }

              if (this.telemetryService.isEnabled() && processId) {
                this.telemetryService.recordUsage(processId, {
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  totalTokens:
                    (usage.input_tokens || 0) + (usage.output_tokens || 0),
                });
              }
            }

            // Final output for persistence (if not already captured via deltas)
            if (event.finalOutput && !assistantText) {
              assistantText = String(event.finalOutput);
            }

            // === Output Guardrails ===
            if (shouldBufferOutput && assistantText) {
              try {
                const guardrailResult =
                  await this.outputGuardrailsService.checkGuardrail(
                    assistantText,
                    projectDir,
                  );
                if (guardrailResult.guardrailTriggered) {
                  observer.next({
                    type: 'output_guardrails_triggered',
                    data: {
                      violations: guardrailResult.violations,
                      count: guardrailResult.violations.length,
                      runtimeMilliseconds:
                        guardrailResult.runtimeMilliseconds,
                    },
                  });
                }
                assistantText = guardrailResult.modifiedContent;
                observer.next({
                  type: 'stdout',
                  data: { chunk: assistantText },
                });
              } catch (error: any) {
                this.logger.error(
                  'Failed to apply output guardrails:',
                  error.message,
                );
              }
            }

            // Emit Stop event
            this.hookEmitter.emitStop(projectDir, {
              reason: 'completed',
              session_id: sessionId,
              timestamp: new Date().toISOString(),
              usage,
            });

            // Emit telemetry
            if (this.telemetryService.isEnabled() && processId) {
              const spanIds = this.telemetryService.getSpanIds(processId);
              if (spanIds) {
                observer.next({
                  type: 'telemetry',
                  data: {
                    span_id: spanIds.spanId,
                    trace_id: spanIds.traceId,
                  },
                });
              }
              this.telemetryService.endConversationSpan(
                processId,
                assistantText,
              );
            }

            // Emit completed
            observer.next({
              type: 'completed',
              data: { exitCode: 0, usage },
            });

            continue;
          }

          // === Agent updated (sub-agent switching) ===
          if (event.type === 'agent_updated_stream_event') {
            const agentName = event.agent?.name;
            if (lastActiveAgent && lastActiveAgent !== agentName) {
              observer.next({
                type: 'subagent_end',
                data: { name: lastActiveAgent, status: 'complete' },
              });
            }
            if (agentName) {
              observer.next({
                type: 'subagent_start',
                data: { name: agentName, status: 'active' },
              });
              lastActiveAgent = agentName;
            }
            continue;
          }

          // === Raw model stream events (text deltas) ===
          if (event.type === 'raw_model_stream_event') {
            const data = event.data;

            // Text delta streaming -> stdout
            if (data?.type === 'output_text_delta' && data.delta) {
              assistantText += data.delta;
              structuredMessages.push({
                type: 'text_chunk',
                content: data.delta,
                timestamp: Date.now(),
              });

              if (!shouldBufferOutput) {
                observer.next({
                  type: 'stdout',
                  data: { chunk: data.delta },
                });
              }
            }
            continue;
          }

          // === Run item stream events ===
          if (event.type === 'run_item_stream_event') {
            const { name: eventName, item } = event;

            switch (eventName) {
              case 'message_output_created':
                // Prepare for text output — no direct MessageEvent needed
                break;

              case 'tool_called': {
                const raw = item?.rawItem || item;
                const toolName =
                  raw?.name || item?.type || 'unknown';
                const callId = raw?.callId || raw?.id || `tool_${Date.now()}`;
                let toolInput: any = {};
                try {
                  toolInput = raw?.arguments
                    ? JSON.parse(raw.arguments)
                    : {};
                } catch {
                  toolInput = { raw: raw?.arguments };
                }

                this.hookEmitter.emitPreToolUse(projectDir, {
                  tool_name: toolName,
                  tool_input: toolInput,
                  call_id: callId,
                  session_id: sessionId,
                  timestamp: new Date().toISOString(),
                });

                observer.next({
                  type: 'tool',
                  data: {
                    toolName,
                    status: 'running',
                    callId,
                    input: toolInput,
                  },
                });

                // Track tool call for file change detection on output
                toolCallMap.set(callId, { toolName, input: toolInput });
                this.logger.debug(
                  `Tracked tool_called: ${toolName} callId=${callId} input=${JSON.stringify(toolInput)}`,
                );

                structuredMessages.push({
                  id: callId,
                  type: 'tool_call',
                  toolName,
                  args: toolInput,
                  status: 'running',
                  timestamp: Date.now(),
                });
                break;
              }

              case 'tool_output': {
                const raw = item?.rawItem || item;
                const callId =
                  raw?.callId || raw?.id || `tool_${Date.now()}`;
                const toolName = raw?.name || 'unknown';
                // RunToolCallOutputItem has .output directly; rawItem may have structured output
                const rawOutput = item?.output ?? raw?.output;
                const result =
                  typeof rawOutput === 'string'
                    ? rawOutput
                    : JSON.stringify(rawOutput || '');

                this.hookEmitter.emitPostToolUse(projectDir, {
                  tool_name: toolName,
                  tool_output: result,
                  call_id: callId,
                  session_id: sessionId,
                  timestamp: new Date().toISOString(),
                });

                observer.next({
                  type: 'tool',
                  data: {
                    toolName,
                    status: 'complete',
                    callId,
                    result,
                  },
                });

                structuredMessages.push({
                  id: callId,
                  type: 'tool_call',
                  toolName,
                  status: 'complete',
                  result,
                  timestamp: Date.now(),
                });

                // Emit file_added / file_changed events for file-writing tools
                const trackedCall = toolCallMap.get(callId);
                this.logger.debug(
                  `tool_output: callId=${callId} toolName=${toolName} trackedCall=${JSON.stringify(trackedCall)} mapSize=${toolCallMap.size}`,
                );
                if (trackedCall) {
                  const tn = trackedCall.toolName;
                  const ti = trackedCall.input;
                  if (tn === 'write_file' && ti?.path) {
                    this.logger.log(
                      `Emitting file_changed for write_file: ${ti.path}`,
                    );
                    this.hookEmitter.emitFileChanged(projectDir, {
                      path: ti.path,
                      session_id: sessionId,
                      timestamp: new Date().toISOString(),
                    });
                    observer.next({
                      type: 'file_changed',
                      data: { path: ti.path },
                    });
                  }
                  toolCallMap.delete(callId);
                }
                break;
              }

              case 'reasoning_item_created': {
                const raw = item?.rawItem || item;
                // ReasoningItem.content is an array of { type, text }
                let content = '';
                if (Array.isArray(raw?.content)) {
                  content = raw.content
                    .map((c: any) => c.text || '')
                    .filter(Boolean)
                    .join('\n');
                } else {
                  content = raw?.text || raw?.content || '';
                }
                if (content) {
                  observer.next({
                    type: 'thinking',
                    data: { content },
                  });
                  structuredMessages.push({
                    type: 'thinking',
                    content,
                    timestamp: Date.now(),
                  });
                }
                break;
              }

              case 'tool_approval_requested': {
                // HITL approval — the SDK service handles this via the
                // approvalResolver callback. We emit a visual running event.
                const raw = item?.rawItem || item;
                const toolName =
                  raw?.name || 'unknown';
                const callId =
                  raw?.callId || raw?.id || `approval_${Date.now()}`;
                observer.next({
                  type: 'tool',
                  data: {
                    toolName,
                    status: 'running',
                    callId,
                    input: {
                      description: 'Awaiting approval...',
                    },
                  },
                });
                break;
              }

              case 'handoff_requested': {
                const targetAgent =
                  item?.agent?.name || item?.rawItem?.name || 'unknown';
                observer.next({
                  type: 'subagent_start',
                  data: { name: targetAgent, status: 'active' },
                });
                break;
              }

              case 'handoff_occurred': {
                if (lastActiveAgent) {
                  observer.next({
                    type: 'subagent_end',
                    data: {
                      name: lastActiveAgent,
                      status: 'complete',
                    },
                  });
                }
                const newAgent = item?.targetAgent?.name || item?.agent?.name || 'unknown';
                observer.next({
                  type: 'subagent_start',
                  data: { name: newAgent, status: 'active' },
                });
                lastActiveAgent = newAgent;
                break;
              }

              default:
                this.logger.debug(
                  `Unhandled run_item_stream_event: ${eventName}`,
                );
                break;
            }
            continue;
          }

          // Log any other events we don't handle
          this.logger.debug(
            `Unhandled stream event type: ${event.type}`,
          );
        } catch (messageError: any) {
          this.logger.error(
            `Error processing stream event: ${messageError.message}`,
            messageError.stack,
          );
          observer.next({
            type: 'error',
            data: {
              message: `Event processing error: ${messageError.message}`,
              recoverable: true,
            },
          });
        }
      }

      // === Chat Persistence ===
      if (!skipChatPersistence && sessionId) {
        try {
          const root = safeRoot(this.config.hostRoot, projectDir);
          const timestamp = new Date().toISOString();

          await this.sessionsService.appendMessages(root, sessionId, [
            {
              timestamp,
              isAgent: false,
              message: sanitizedPrompt,
              costs: undefined,
            },
            {
              timestamp,
              isAgent: true,
              message: assistantText,
              costs: usage,
              reasoningSteps:
                structuredMessages.length > 0
                  ? structuredMessages
                  : undefined,
            },
          ]);
        } catch (err) {
          this.logger.error('Failed to persist chat history:', err);
        }
      }

      // === Budget Tracking ===
      if (
        !skipChatPersistence &&
        usage.input_tokens &&
        usage.output_tokens
      ) {
        try {
          await this.budgetMonitoringService.trackCosts(
            projectDir,
            usage.input_tokens,
            usage.output_tokens,
            sessionId,
          );
        } catch (err) {
          this.logger.error('Failed to track budget costs:', err);
        }
      }

      // === Memory Storage (fire-and-forget) ===
      if (memoryEnabled && assistantText) {
        const memoryBaseUrl =
          process.env.MEMORY_MANAGEMENT_URL ||
          'http://localhost:6060/api/memories';
        const serviceToken = this.generateServiceToken();
        axios
          .post(
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
            {
              headers: {
                Authorization: `Bearer ${serviceToken}`,
              },
            },
          )
          .catch((error: any) => {
            this.logger.error(
              'Failed to store memories:',
              error.message,
            );
          });
      }

      // Update session activity
      if (sessionId) {
        await this.sessionManager.touchSession(sessionId);
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `OpenAI Agents stream completed in ${duration}ms for project: ${projectDir}`,
      );
      observer.complete();
    } catch (error: any) {
      this.logger.error(
        `OpenAI Agents stream error: ${error.message}`,
        error.stack,
      );

      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.endConversationSpanWithError(
          processId,
          error,
        );
      }

      observer.next({
        type: 'error',
        data: { message: error.message },
      });
      observer.complete();
    }
  }

  /**
   * Abort a running stream
   */
  public async abortProcess(processId: string) {
    const aborted = await this.sdkService.abortStream(processId);
    if (aborted) {
      this.logger.log(
        `Aborted OpenAI Agents process: ${processId}`,
      );
      return {
        success: true,
        message: 'OpenAI Agents stream aborted',
      };
    }
    this.logger.warn(
      `No active OpenAI Agents stream found for process: ${processId}`,
    );
    return {
      success: false,
      message: 'OpenAI Agents stream not found',
    };
  }

  /**
   * Load project instructions from the AGENTS.md or CLAUDE.md file.
   */
  private async loadProjectInstructions(
    projectDir: string,
  ): Promise<string> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const missionFileName =
      this.codingAgentConfigService.getMissionFileName();
    const missionPath = join(root, missionFileName);

    try {
      const content = await fs.readFile(missionPath, 'utf8');
      if (content.trim()) {
        this.logger.log(
          `Loaded project instructions from ${missionFileName} (${content.length} chars)`,
        );
        return content;
      }
    } catch {
      // File doesn't exist or is unreadable
    }

    // Also try the agent config dir location
    const agentConfigDir =
      this.codingAgentConfigService.getAgentConfigDir();
    const altPath = join(root, agentConfigDir, missionFileName);
    try {
      const content = await fs.readFile(altPath, 'utf8');
      if (content.trim()) {
        this.logger.log(
          `Loaded project instructions from ${agentConfigDir}/${missionFileName} (${content.length} chars)`,
        );
        return content;
      }
    } catch {
      // File doesn't exist
    }

    return 'You are a helpful coding assistant. Help the user with their coding tasks.';
  }

  /**
   * Load active skills from the project's .claude/skills/ directory.
   * Each skill is a subdirectory containing a SKILL.md file with instructions.
   * Returns all skill contents concatenated, ready to append to agent instructions.
   */
  private async loadSkills(projectDir: string): Promise<string> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const skillsDir = join(root, '.claude', 'skills');

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((e) => e.isDirectory());

      if (skillDirs.length === 0) return '';

      const skillContents: string[] = [];

      for (const dir of skillDirs) {
        const skillMdPath = join(skillsDir, dir.name, 'SKILL.md');
        try {
          const content = await fs.readFile(skillMdPath, 'utf8');
          if (content.trim()) {
            skillContents.push(content.trim());
          }
        } catch {
          // SKILL.md doesn't exist in this directory — skip
        }
      }

      if (skillContents.length === 0) return '';

      this.logger.log(
        `Loaded ${skillContents.length} skill(s) for project: ${projectDir}`,
      );

      return (
        '\n\n---\n\n# Active Skills\n\n' +
        'The following skills are available to you. Use them when the user\'s request matches a skill\'s purpose.\n\n' +
        skillContents.join('\n\n---\n\n')
      );
    } catch {
      // .claude/skills/ directory doesn't exist
      return '';
    }
  }
}
