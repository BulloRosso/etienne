import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs-extra';
import { OpenCodeSdkService } from './opencode-sdk.service';
import { OpenCodeSessionManagerService } from './opencode-session-manager.service';
import { OpenCodePermissionService } from './opencode-permission.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { MessageEvent, Usage } from '../types';
import { openCodeEventToMessageEvents } from './opencode-event-adapter';
import { translateMcpConfig } from './opencode-mcp-config.adapter';
import { provisionSkillsForOpenCode } from './opencode-skill-provisioner';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { SubagentsService } from '../../subagents/subagents.service';
import { McpServerConfigService } from '../mcpserverconfig/mcp.server.config';
import { OpenCodeConfig, ResolvedModel } from './opencode.config';
import { safeRoot } from '../utils/path.utils';
import { sanitize_user_message } from '../../input-guardrails/index';
import { TelemetryService } from '../../observability/telemetry.service';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * Orchestrator service for OpenCode SDK conversations.
 *
 * Parallel to ClaudeSdkOrchestratorService / CodexSdkOrchestratorService —
 * reuses all guardrails, memory, telemetry, and persistence services but
 * communicates with OpenCode via the official @opencode-ai/sdk.
 *
 * Key differences from other orchestrators:
 * - SDK-based with managed server lifecycle (not subprocess like Codex)
 * - Native subagent support (configured via opencode.json, not simulated)
 * - Native MCP support (config translation, no bridge needed)
 * - SSE event stream is global — must filter by sessionId
 */
@Injectable()
export class OpenCodeOrchestratorService {
  private readonly logger = new Logger(OpenCodeOrchestratorService.name);
  private readonly config = new OpenCodeConfig();
  private jwtSecret: string = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  // Track active sessions for abort
  private readonly activeSessions = new Map<string, { sessionId: string; aborted: boolean; resolved: ResolvedModel; projectRoot: string }>();

  private generateServiceToken(): string {
    return jwt.sign(
      { sub: 'opencode-orchestrator', username: 'system', role: 'admin', displayName: 'OpenCode Orchestrator', type: 'access' },
      this.jwtSecret,
      { expiresIn: '1h' },
    );
  }

  constructor(
    private readonly openCodeSdkService: OpenCodeSdkService,
    private readonly sessionManager: OpenCodeSessionManagerService,
    private readonly permissionService: OpenCodePermissionService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly subagentsService: SubagentsService,
    private readonly mcpConfigService: McpServerConfigService,
    private readonly telemetryService: TelemetryService,
    private readonly secretsManager: SecretsManagerService,
  ) {}

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
  }

  /**
   * Clear the OpenCode session for a project.
   */
  async clearSession(projectDir: string): Promise<void> {
    await this.sessionManager.clearSession(projectDir);
  }

  /**
   * Stream a prompt using the OpenCode SDK with full integration.
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    maxTurns?: number,
  ): Observable<MessageEvent> {
    const processId = `opencode_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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
        this.logger.error(`OpenCode stream prompt failed: ${error.message}`, error.stack);
        observer.next({ type: 'error', data: { message: error.message } });
        observer.complete();
      });

      return () => {
        // Mark as aborted on unsubscribe
        const active = this.activeSessions.get(processId);
        if (active) active.aborted = true;
      };
    });
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
      const projectRoot = safeRoot(this.config.hostRoot, projectDir);

      // === Provision skills for OpenCode ===
      try {
        await provisionSkillsForOpenCode({ logger: this.logger, projectRoot });
      } catch (err: any) {
        this.logger.warn(`Skill provisioning failed: ${err?.message}`);
      }

      // === Configure MCP servers ===
      try {
        await this.configureMcpServers(projectDir, projectRoot);
      } catch (err: any) {
        this.logger.warn(`MCP config failed: ${err?.message}`);
      }

      // === Configure subagents ===
      try {
        await this.configureSubagents(projectDir, projectRoot);
      } catch (err: any) {
        this.logger.warn(`Subagent config failed: ${err?.message}`);
      }

      // === Resolve per-project model (.etienne/ai-model.json overrides env defaults) ===
      const resolved = await this.config.resolveModelForProject(projectDir);
      this.logger.log(
        `OpenCode model for ${projectDir}: provider=${resolved.provider} model=${resolved.model}` +
        (resolved.baseUrl ? ` baseURL=${resolved.baseUrl}` : ''),
      );
      // Seed the usage payload with the model so the frontend renders it even
      // when the model itself doesn't echo a model field on its usage event.
      usage.model = `${resolved.provider}/${resolved.model}`;

      // === Initialize SDK and create/resume session ===
      sessionId = await this.openCodeSdkService.getOrCreateSession(projectRoot, resolved, existingSessionId);

      if (!existingSessionId || existingSessionId !== sessionId) {
        await this.sessionManager.createSession(projectDir, sessionId, resolved.model);
      }

      // Track for abort
      if (processId) {
        this.activeSessions.set(processId, { sessionId, aborted: false, resolved, projectRoot });
      }

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

      // === Datetime Injection ===
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'long',
      });
      finalPrompt = `[Current date and time: ${dateTimeString}]\n\n${finalPrompt}`;

      // === Emit UserPromptSubmit hook ===
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
          model: resolved.model,
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

      // === Subscribe to SSE events BEFORE sending prompt ===
      this.logger.log(`Starting OpenCode stream for project: ${projectDir}, session: ${sessionId}`);
      const eventStream = await this.openCodeSdkService.subscribeEvents(projectRoot, resolved);

      // === Send prompt (fire-and-forget — output streams over SSE) ===
      this.openCodeSdkService
        .sendPrompt(sessionId, finalPrompt, resolved, projectRoot)
        .catch((err: any) => this.logger.error(`OpenCode sendPrompt rejected: ${err?.message}`));

      // === Process SSE event stream ===
      // Each yielded item is an `Event` from the SDK directly — discriminated
      // by `type`, with event-specific data under `properties`. There is no
      // `payload` wrapper and `properties.sessionID` only exists on a subset
      // of events (others carry it nested, e.g. `properties.part.sessionID`).
      const sessionIdOf = (e: any): string | undefined =>
        e?.properties?.sessionID
          ?? e?.properties?.part?.sessionID
          ?? e?.properties?.info?.sessionID
          ?? e?.properties?.info?.id;

      for await (const rawEvent of eventStream) {
        // Check if aborted
        if (processId) {
          const active = this.activeSessions.get(processId);
          if (active?.aborted) {
            this.logger.log(`OpenCode stream aborted for process: ${processId}`);
            break;
          }
        }

        const ev = rawEvent as any;
        if (!ev || typeof ev.type !== 'string') continue;

        // Filter by sessionId for multi-project isolation. Events without an
        // identifiable session (e.g. instance/lsp/installation events) pass
        // through.
        const eventSessionId = sessionIdOf(ev);
        if (eventSessionId && eventSessionId !== sessionId) continue;

        // Handle permission events via the permission service.
        // The current SDK emits `permission.updated` with `properties: Permission`.
        if (ev.type === 'permission.updated') {
          const permission = ev.properties;
          if (permission?.id) {
            const compat = {
              id: permission.id,
              toolName: permission.type ?? 'unknown',
              args: permission.metadata,
              title: permission.title,
            };
            this.permissionService.handlePermissionAsked(projectDir, compat, resolved, sessionId, projectRoot).catch((err: any) =>
              this.logger.error(`Permission handling failed: ${err?.message}`),
            );
            observer.next({
              type: 'tool_call',
              data: {
                callId: permission.id,
                toolName: compat.toolName,
                args: compat.args,
                status: 'running',
              },
            });
          }
          continue;
        }

        // Detect session completion via dedicated `session.idle` event.
        if (ev.type === 'session.idle') {
          {
            this.logger.debug(`OpenCode session ${sessionId} is idle — stream complete`);

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

            // Emit usage
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

            // Emit stop hook
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
                  data: { span_id: spanIds.spanId, trace_id: spanIds.traceId },
                });
              }
              this.telemetryService.endConversationSpan(processId, assistantText);
            }

            // Emit completed
            observer.next({ type: 'completed', data: { exitCode: 0, usage } });

            break; // Exit event loop
          }
        }

        // Map OpenCode events to MessageEvents
        try {
          const mapped = openCodeEventToMessageEvents(ev, { processId: processId!, sessionId });
          for (const m of mapped) {
            // Accumulate text for persistence
            if (m.type === 'stdout') {
              assistantText += m.data?.chunk ?? '';
              if (shouldBufferOutput) continue; // Buffer until completion
            }

            // Accumulate usage
            if (m.type === 'usage') {
              usage = { ...usage, ...m.data };
              continue; // Usage emitted at completion
            }

            // Emit file change hooks
            if (m.type === 'file_changed' || m.type === 'file_added') {
              const hookMethod = m.type === 'file_added' ? 'emitFileAdded' : 'emitFileChanged';
              this.hookEmitter[hookMethod](projectDir, {
                path: m.data.path,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
              });
            }

            // Emit tool hooks
            if (m.type === 'tool_result') {
              this.hookEmitter.emitPostToolUse(projectDir, {
                tool_name: m.data.toolName ?? 'unknown',
                tool_output: m.data.result,
                call_id: m.data.callId,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
              });
            }

            observer.next(m);
          }
        } catch (err: any) {
          this.logger.error(`Error processing OpenCode event: ${err?.message}`);
        }
      }

      // === Chat Persistence ===
      if (!skipChatPersistence && sessionId) {
        try {
          const root = safeRoot(this.config.hostRoot, projectDir);
          const timestamp = new Date().toISOString();
          await this.sessionsService.appendMessages(root, sessionId, [
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

      // Clean up
      if (processId) {
        this.activeSessions.delete(processId);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`OpenCode stream completed in ${duration}ms for project: ${projectDir}`);
      observer.complete();

    } catch (error: any) {
      this.logger.error(`OpenCode stream error: ${error.message}`, error.stack);

      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.endConversationSpanWithError(processId, error);
      }

      observer.next({ type: 'error', data: { message: error.message } });
      observer.complete();
    } finally {
      if (processId) {
        this.activeSessions.delete(processId);
      }
    }
  }

  /**
   * Abort a running OpenCode session.
   */
  public async abortProcess(processId: string): Promise<{ success: boolean; message: string }> {
    const active = this.activeSessions.get(processId);
    if (active) {
      this.logger.log(`Aborting OpenCode process: ${processId} (session=${active.sessionId})`);
      active.aborted = true;
      await this.openCodeSdkService.abortSession(active.sessionId, active.resolved, active.projectRoot);
      this.activeSessions.delete(processId);
      return { success: true, message: 'OpenCode session aborted' };
    }
    this.logger.warn(`No active OpenCode session found for process: ${processId}`);
    return { success: false, message: 'OpenCode session not found' };
  }

  /**
   * Translate project MCP servers to OpenCode format and write to opencode.json.
   */
  private async configureMcpServers(projectDir: string, projectRoot: string): Promise<void> {
    try {
      const mcpConfig = await this.mcpConfigService.getMcpConfig(projectDir);
      if (!mcpConfig.mcpServers || Object.keys(mcpConfig.mcpServers).length === 0) return;

      const openCodeMcp = translateMcpConfig(mcpConfig.mcpServers, this.logger);

      // Read existing opencode.json or create new
      const configPath = path.join(projectRoot, 'opencode.json');
      let existingConfig: any = {};
      try {
        const raw = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(raw);
      } catch { /* file doesn't exist */ }

      // Strip the legacy 'agents' (plural) key — schema rejects it.
      if ('agents' in existingConfig) delete existingConfig.agents;

      existingConfig.mcp = { ...existingConfig.mcp, ...openCodeMcp };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');

      this.logger.debug(`Configured ${Object.keys(openCodeMcp).length} MCP servers for OpenCode`);
    } catch (err: any) {
      this.logger.warn(`Failed to configure MCP servers: ${err?.message}`);
    }
  }

  /**
   * Translate .claude/agents/*.md subagent definitions to OpenCode agent format
   * and write to opencode.json.
   *
   * OpenCode's Config schema (validated at session.create time) expects:
   *   agent: { [agentId]: AgentConfig }   // object map, NOT an array, NOT 'agents'
   * The agent id is the map key — there is no `id` field on AgentConfig itself.
   */
  private async configureSubagents(projectDir: string, projectRoot: string): Promise<void> {
    try {
      const subagents = await this.subagentsService.listSubagents(projectDir);

      const agentMap: Record<string, any> = {};
      for (const sa of (subagents ?? [])) {
        try {
          const full = await this.subagentsService.getSubagent(projectDir, sa.name);
          if (!full) continue;

          const agent: any = {
            description: sa.description || `Subagent: ${sa.name}`,
            mode: 'subagent',
            prompt: full.systemPrompt || '',
          };

          if (full.model && full.model !== 'inherit') {
            const modelMap: Record<string, string> = {
              sonnet: 'anthropic/claude-sonnet-4-5-20250514',
              opus: 'anthropic/claude-opus-4-6',
              haiku: 'anthropic/claude-haiku-4-5-20251001',
            };
            agent.model = modelMap[full.model] || full.model;
          }

          // Tool allowlist — AgentConfig.tools is `{ [toolName]: boolean }`, not a permission map.
          if (Array.isArray(full.tools) && full.tools.length > 0) {
            const tools: Record<string, boolean> = {};
            for (const tool of full.tools) {
              if (typeof tool === 'string' && tool.length > 0) tools[tool] = true;
            }
            if (Object.keys(tools).length > 0) agent.tools = tools;
          }

          agentMap[sa.name] = agent;
        } catch (err: any) {
          this.logger.warn(`Failed to load subagent '${sa.name}': ${err?.message}`);
        }
      }

      // Read, then sanitize any legacy/invalid keys before writing.
      const configPath = path.join(projectRoot, 'opencode.json');
      let existingConfig: any = {};
      try {
        const raw = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(raw);
      } catch { /* file doesn't exist */ }

      // Strip the legacy 'agents' (plural) key — older code wrote an array here
      // which the OpenCode schema rejects with ConfigInvalidError.
      if ('agents' in existingConfig) delete existingConfig.agents;

      if (Object.keys(agentMap).length > 0) {
        existingConfig.agent = { ...(existingConfig.agent ?? {}), ...agentMap };
      } else if ('agent' in existingConfig && Object.keys(existingConfig.agent ?? {}).length === 0) {
        delete existingConfig.agent;
      }

      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
      this.logger.debug(`Configured ${Object.keys(agentMap).length} subagents for OpenCode`);
    } catch (err: any) {
      this.logger.warn(`Failed to configure subagents: ${err?.message}`);
    }
  }
}
