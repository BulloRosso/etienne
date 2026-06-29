import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { ClaudeSdkService } from './claude-sdk.service';
import { SdkSessionManagerService } from './sdk-session-manager.service';
import { SdkMessageTransformer } from './sdk-message-transformer';
import { SdkHookEmitterService } from './sdk-hook-emitter.service';
import { SdkPermissionService } from './sdk-permission.service';
import { CanUseTool } from './sdk-permission.types';
import { getContextLimit } from './model-context-limits';
import { MessageEvent, Usage } from '../types';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { sanitize_user_message } from '../../input-guardrails/index';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';
import { buildCitationInstruction } from '../shared/citation-prompt';
import { TelemetryService } from '../../observability/telemetry.service';
import { UserNotificationsService } from '../../user-notifications/user-notifications.service';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';
import { MissionLoaderService, MissionUserContext } from '../mission-loader.service';
import { StreamRelayRegistry } from './stream-relay.registry';

/**
 * Orchestrator service that integrates SDK, sessions, guardrails, and memory
 * This is the main entry point for SDK-based conversations
 */
// Logger restricted to WARN+ for this service. log/debug/verbose are intentionally
// dropped; warn/error/fatal still pass through to the underlying Nest logger.
class WarnLevelLogger extends Logger {
  log(_message: any, _context?: string): void { /* suppressed: below WARN */ }
  debug(_message: any, _context?: string): void { /* suppressed: below WARN */ }
  verbose(_message: any, _context?: string): void { /* suppressed: below WARN */ }
}

@Injectable()
export class ClaudeSdkOrchestratorService {
  private readonly logger = new WarnLevelLogger(ClaudeSdkOrchestratorService.name);
  private readonly config: ClaudeConfig;
  private jwtSecret: string = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  // Per-project serialization: a new run for a project chains behind the
  // previous one so two prompts on the same project never interleave.
  private readonly projectQueues = new Map<string, Promise<void>>();

  private generateServiceToken(): string {
    return jwt.sign(
      { sub: 'claude-sdk-orchestrator', username: 'system', role: 'admin', displayName: 'SDK Orchestrator', type: 'access' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );
  }

  constructor(
    private readonly claudeSdkService: ClaudeSdkService,
    private readonly sessionManager: SdkSessionManagerService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly sdkPermissionService: SdkPermissionService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly telemetryService: TelemetryService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly secretsManager: SecretsManagerService,
    private readonly missionLoader: MissionLoaderService,
    private readonly streamRelayRegistry: StreamRelayRegistry,
  ) {
    this.config = new ClaudeConfig(secretsManager);
  }

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
    await this.config.initSecrets();
  }

  /**
   * Stream a prompt using the Agent SDK with full integration
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    maxTurns?: number,
    notificationChannels?: string,
    notificationEmail?: string,
    viewerState?: any[],
    currentUser?: MissionUserContext | null
  ): Observable<MessageEvent> {
    // Generate process ID for abort tracking
    const processId = `sdk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Register the abort controller before ANY async setup. Closes the
    // race where an abort arrives while guardrails/memory are running.
    const abortController = this.claudeSdkService.createAbortController(processId);

    // The relay buffers all events and owns disconnect handling: a client
    // dropping mid-run starts a grace timer instead of killing the run; only
    // if nobody reattaches within the window do we abort.
    const relay = this.streamRelayRegistry.createRelay(processId, {
      onAbandoned: () => {
        this.logger.warn(`No client reattached within grace period — aborting ${processId}`);
        this.claudeSdkService.abortStream(processId);
      },
    });

    // Emit process ID immediately so frontend can track it (and bookmark it).
    relay.next({ type: 'session', data: { process_id: processId } });

    // Per-project serialization: a run for the same project chains behind the
    // previous one. A failed predecessor must not poison the queue.
    const prev = this.projectQueues.get(projectDir);
    if (prev) {
      relay.next({
        type: 'status',
        data: { status: 'queued', message: 'Waiting for the previous task in this project to finish' },
      });
    }

    let run: Promise<void>;
    run = (prev ?? Promise.resolve())
      .catch(() => void 0) // failed predecessor must not poison the queue
      .then(() => {
        if (abortController.signal.aborted) return; // aborted while queued
        return this.runStreamPrompt(
          relay, // observer-compatible
          projectDir,
          prompt,
          agentMode,
          memoryEnabled,
          skipChatPersistence,
          maxTurns,
          processId,
          notificationChannels,
          notificationEmail,
          viewerState,
          currentUser ?? null,
          abortController
        );
      })
      .catch((error) => {
        this.logger.error(`Stream prompt failed: ${error.message}`, error.stack);
        relay.error(error);
      })
      .finally(() => {
        relay.complete(); // idempotent — also closes the aborted-while-queued path
        if (this.projectQueues.get(projectDir) === run) {
          this.projectQueues.delete(projectDir);
        }
      });
    this.projectQueues.set(projectDir, run);

    return relay.asObservable();
  }

  /** Re-attach a client to a live or recently finished run. */
  public attachToStream(processId: string, lastSeq?: number): Observable<MessageEvent> {
    return this.streamRelayRegistry.attach(processId, lastSeq);
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
    maxTurns?: number,
    processId?: string,
    notificationChannels?: string,
    notificationEmail?: string,
    viewerState?: any[],
    currentUser?: MissionUserContext | null,
    abortController?: AbortController
  ): Promise<void> {
    const userId = 'user'; // Default user ID
    let sessionId: string | undefined;
    let assistantText = '';
    let usage: Usage = {};
    const startTime = Date.now();
    let currentModel: string | undefined; // Track model name from session init

    // Track tool calls to correlate PreToolUse with PostToolUse
    const toolCallMap = new Map<string, { name: string; input: any }>();

    // Track structured messages (tool calls) for reasoning steps
    const structuredMessages: any[] = [];

    try {
      // Check if this is a new session or resuming
      sessionId = await this.sessionManager.loadSessionId(projectDir);
      const isFirstRequest = !sessionId;

      // Render the per-user mission template, if any. The Claude Code SDK
      // reads .claude/CLAUDE.md directly from disk, so we keep that file
      // fresh per request when a .tpl exists. Projects without a .tpl are
      // untouched (every existing seed and hand-authored CLAUDE.md keeps
      // working). Failures are logged inside the loader; do not block the
      // chat request on a mission render hiccup.
      try {
        const projectRootForMission = safeRoot(this.config.hostRoot, projectDir);
        await this.missionLoader.renderForUser(projectRootForMission, currentUser ?? null);
      } catch (err: any) {
        this.logger.warn(`mission render failed for ${projectDir}: ${err?.message ?? err}`);
      }

      // Setup artifacts tracking file
      try {
        const projectRoot = safeRoot(this.config.hostRoot, projectDir);
        const etienneDir = join(projectRoot, '.etienne');
        const artifactsPath = join(etienneDir, '.agent-created-files.artifacts.md');
        await fs.mkdir(etienneDir, { recursive: true });
        if (isFirstRequest) {
          await fs.writeFile(artifactsPath, '# Session Artifacts\n', 'utf8');
        } else {
          try { await fs.access(artifactsPath); } catch { await fs.writeFile(artifactsPath, '# Session Artifacts\n', 'utf8'); }
        }
      } catch (e) { this.logger.warn('Failed to init artifacts file', e); }

      // If resuming, load model from session
      if (sessionId) {
        const existingSession = this.sessionManager.getSession(sessionId);
        if (existingSession?.model) {
          currentModel = existingSession.model;
          this.logger.debug(`📋 Loaded model from existing session: ${currentModel}`);
        }
      }

      // Budget limit check — reject before any work if limit is exceeded
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

      // Apply input guardrails
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
            this.logger.log(`🛡️ Input guardrails triggered for ${projectDir}:`, triggeredPlugins);
          }
        }
      } catch (error: any) {
        this.logger.error('Failed to apply input guardrails:', error.message);
      }

      // Memory integration - only on first request
      let enhancedPrompt = sanitizedPrompt;
      if (memoryEnabled && isFirstRequest) {
        try {
          const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

          // Load per-project memory settings
          const settingsResponse = await axios.get(
            `${memoryBaseUrl}/settings?project=${encodeURIComponent(projectDir)}`
          );
          const memorySettings = settingsResponse.data;

          // Skip if memory is disabled in project settings
          if (memorySettings.memoryEnabled === false) {
            this.logger.log('Memory disabled in project settings, skipping');
          } else {
            const searchLimit = memorySettings.searchLimit ?? 5;
            const serviceToken = this.generateServiceToken();
            const authHeaders = { headers: { Authorization: `Bearer ${serviceToken}` } };
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              {
                query: sanitizedPrompt,
                user_id: userId,
                limit: searchLimit > 0 ? searchLimit : 100
              },
              authHeaders
            );

            const memories = searchResponse.data.results || [];
            if (memories.length > 0) {
              const memoryContext = memories.map((m: any) => m.memory).join('\n- ');
              enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${sanitizedPrompt}`;
              this.logger.log(`📚 Enhanced prompt with ${memories.length} memories`);
            }
          }
        } catch (error: any) {
          this.logger.error('Failed to fetch memories:', error.message);
        }
      }

      // Context injection - add context scope to prompt
      let finalPrompt = enhancedPrompt;
      if (sessionId) {
        try {
          const contextInjection = await this.contextInterceptor.buildContextPromptInjection(
            projectDir,
            sessionId
          );
          if (contextInjection) {
            finalPrompt = `${contextInjection}\n\n${enhancedPrompt}`;
            this.logger.log(`🏷️ Injected context scope into prompt for session ${sessionId}`);
          }
        } catch (error: any) {
          this.logger.error('Failed to inject context:', error.message);
        }
      }

      // Viewer state injection — must also run on the FIRST request of a
      // session (no sessionId yet), which is precisely when a user opens a
      // viewer and starts talking about it.
      try {
        if (viewerState && viewerState.length > 0) {
            const stateBlocks = viewerState.map((vs: any) => {
              const lines: string[] = [];
              lines.push(`<viewer-selection file="${vs.path}" viewer="${vs.viewerName || 'unknown'}">`);
              lines.push(`An interactive "${vs.viewerName || 'unknown'}" viewer is currently open for this file.`);
              lines.push(`Do NOT call render tools (e.g. mcp__${vs.viewerName}__render_*) for this file — the viewer is already displaying it. Use action tools (e.g. select, highlight, filter) to manipulate the existing viewer instead.`);
              lines.push(`You can manipulate this viewer using tools prefixed with mcp__${vs.viewerName}__ (e.g. select items, highlight, filter).`);
              if (vs.selectedItems?.length > 0) {
                lines.push(`The user has SELECTED the following ${vs.selectedItems.length} item(s) in the UI:`);
                vs.selectedItems.forEach((i: any, idx: number) => {
                  lines.push(`  ${idx + 1}. "${i.item}" — ${i.amount} ${i.currency}`);
                });
                lines.push(`These are the ONLY items the user is referring to when they say "selected items". Do NOT treat unselected items as selected.`);
                lines.push(`You already know the selection state — answer questions about it directly without calling any tools.`);
              } else if (!vs.userEdited) {
                lines.push(`No items are currently selected in the viewer. You already know this — answer directly without calling any tools.`);
              }
              if (vs.userEdited?.length > 0) {
                lines.push(`The user has made ${vs.userEdited.length} manual edit(s) to this file via the interactive viewer:`);
                vs.userEdited.forEach((edit: any, idx: number) => {
                  if (edit.field === 'deleted') {
                    lines.push(`  ${idx + 1}. Deleted task "${edit.oldValue}" (id: ${edit.taskId})`);
                  } else if (edit.field === 'created') {
                    lines.push(`  ${idx + 1}. Created new task "${edit.newValue}" (id: ${edit.taskId})`);
                  } else if (edit.field === 'reorder') {
                    lines.push(`  ${idx + 1}. Reordered task ${edit.taskId} → ${edit.newValue}`);
                  } else if (edit.field === 'parent') {
                    lines.push(`  ${idx + 1}. Moved task ${edit.taskId} to parent: ${edit.newValue || 'top level'}`);
                  } else {
                    lines.push(`  ${idx + 1}. Changed ${edit.field} of task ${edit.taskId}: "${edit.oldValue}" → "${edit.newValue}"`);
                  }
                });
                lines.push(`Acknowledge these user edits. If modifying this file, preserve the user's changes unless explicitly asked to override them.`);
              }
              if (vs.selectedTasks?.length > 0) {
                lines.push(`The user has SELECTED the following ${vs.selectedTasks.length} task(s) in the Gantt chart:`);
                vs.selectedTasks.forEach((task: any, idx: number) => {
                  lines.push(`  ${idx + 1}. "${task.name}" (id: ${task.id}, ${task.startDate} → ${task.endDate})`);
                });
                lines.push(`When the user refers to "selected tasks" or "these tasks", they mean ONLY the tasks listed above.`);
              }
              if (vs.agentbusCatalog?.length > 0) {
                lines.push(`<agentbus-events-out>`);
                lines.push(`This viewer can emit the following semantic events when the user interacts with it:`);
                vs.agentbusCatalog.forEach((spec: any) => {
                  lines.push(`  - ${spec.id}: ${spec.description}`);
                });
                if (vs.agentbusRecentEvents?.length > 0) {
                  lines.push(`Recent events emitted (most recent last):`);
                  vs.agentbusRecentEvents.forEach((ev: any, idx: number) => {
                    lines.push(`  ${idx + 1}. [${ev.timestamp}] ${ev.eventId}: ${JSON.stringify(ev.payload)}`);
                  });
                }
                lines.push(`</agentbus-events-out>`);
              }
              lines.push(`</viewer-selection>`);
              return lines.join('\n');
            }).join('\n\n');
            finalPrompt = `${stateBlocks}\n\n${finalPrompt}`;
            this.logger.log(`🖱️ Injected viewer state: ${viewerState.length} viewer(s)`);
        }
      } catch (error: any) {
        this.logger.error('Failed to inject viewer state:', error.message);
      }

      // Datetime injection - provide current date/time awareness to the agent
      const now = new Date();
      const dateTimeString = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'long'
      });
      const citationInstruction = buildCitationInstruction(safeRoot(this.config.hostRoot, projectDir));
      const citationBlock = citationInstruction ? `\n\n${citationInstruction}` : '';
      const sessionLine = sessionId ? `\n[Current session ID: ${sessionId}]` : '';
      finalPrompt = `[Current date and time: ${dateTimeString}]${sessionLine}\n\nAlways create user orders before beginning to work on complex multi step tasks. A single step or action required from a user like 'Create an Excel table from ...' does not count for a user order. At least two different artifacts/files must be created in a user order.${citationBlock}\n\n${finalPrompt}`;

      // Emit UserPromptSubmit event (before processing)
      this.hookEmitter.emitUserPromptSubmit(projectDir, {
        prompt: finalPrompt,
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });

      // Start telemetry span for conversation
      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.startConversationSpan(processId, {
          projectName: projectDir,
          sessionId,
          userId,
          prompt: finalPrompt,
          model: currentModel,
          agentMode,
        });
      }

      // Emit guardrails event if triggered
      if (guardrailsTriggered) {
        observer.next({
          type: 'guardrails_triggered',
          data: {
            plugins: triggeredPlugins,
            detections,
            count: Object.values(detections).reduce((sum, arr) => sum + arr.length, 0)
          }
        });
      }

      // Check if output guardrails are enabled (determines if we buffer output)
      const outputGuardrailsConfig = await this.outputGuardrailsService.getConfig(projectDir);
      const shouldBufferOutput = outputGuardrailsConfig.enabled;

      // Configure SDK hooks - per official documentation format
      // Named hook functions with correct 3-parameter signature
      const preToolUseHook = async (input: any, toolUseID: string | undefined, options: { signal: AbortSignal }) => {
        try {
          this.logger.log(`🪝 PreToolUse hook called: ${input.tool_name}`);
          this.logger.debug(`🪝 PreToolUse input: ${JSON.stringify(input).substring(0, 500)}`);

          // Validate tool use against active context
          if (sessionId) {
            try {
              const validation = await this.contextInterceptor.validateToolUse(
                projectDir,
                sessionId,
                input.tool_name,
                input.tool_input
              );

              if (!validation.allowed) {
                this.logger.warn(`🚫 Tool use blocked by context: ${validation.reason}`);

                // Return error instead of throwing to prevent SDK from breaking
                return {
                  continue: false,
                  error: validation.reason
                };
              }
            } catch (contextError: any) {
              this.logger.error(`Context validation error: ${contextError.message}`);
              // Continue on validation error - don't block tool execution
            }
          }

          // Store tool call info using toolUseID
          const callId = toolUseID || `tool_${Date.now()}`;
          toolCallMap.set(callId, {
            name: input.tool_name,
            input: input.tool_input
          });

          // Start telemetry span for tool
          if (this.telemetryService.isEnabled() && processId) {
            this.telemetryService.startToolSpan(processId, {
              toolName: input.tool_name,
              toolInput: input.tool_input,
              callId,
            });
          }

          // Emit PreToolUse hook event to interceptor stream
          this.hookEmitter.emitPreToolUse(projectDir, {
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            call_id: callId,
            session_id: sessionId,
            timestamp: new Date().toISOString()
          });

          // Also emit to main observer stream for frontend UI
          this.logger.log(`📤 Emitting tool running event: ${input.tool_name} (callId: ${callId})`);
          const toolEvent = {
            type: 'tool',
            data: {
              toolName: input.tool_name,
              status: 'running',
              callId: callId,
              input: input.tool_input
            }
          };
          observer.next(toolEvent);

          // Add to structured messages for persistence
          structuredMessages.push({
            id: callId,
            type: 'tool_call',
            toolName: input.tool_name,
            args: input.tool_input,
            status: 'running',
            timestamp: Date.now()
          });

          // IMPORTANT: return NO permissionDecision. A hook 'allow' overrides
          // the permission system and silently neutralizes disallowedTools
          // (e.g. the .env read denials). With no decision, evaluation runs
          // normally: deny rules → allow rules → permissionMode → canUseTool.
          // canUseTool still auto-allows uncovered tools when
          // requireAllPermissions=false, so UX is unchanged.
          return { continue: true };
        } catch (hookError: any) {
          this.logger.error(`Error in PreToolUse hook: ${hookError.message}`, hookError.stack);
          // Fail to the permission system, not open: with no decision the
          // normal allow/deny rules still apply even when our hook breaks.
          return { continue: true };
        }
      };

      const postToolUseHook = async (input: any, toolUseID: string | undefined, options: { signal: AbortSignal }) => {
        try {
          this.logger.log(`🪝 PostToolUse hook called: ${input.tool_name}`);
          this.logger.debug(`🪝 PostToolUse input: ${JSON.stringify(input).substring(0, 500)}`);

          const callId = toolUseID || `tool_${Date.now()}`;
          const toolCall = toolCallMap.get(callId);

          // Filter tool results based on active context
          if (sessionId) {
            try {
              input.tool_response = await this.contextInterceptor.filterToolResults(
                projectDir,
                sessionId,
                input.tool_name,
                input.tool_response
              );
            } catch (contextError: any) {
              this.logger.error(`Context filtering error: ${contextError.message}`);
              // Continue with unfiltered results on error
            }
          }

          // End telemetry span for tool
          if (this.telemetryService.isEnabled()) {
            this.telemetryService.endToolSpan(callId, {
              toolOutput: input.tool_response,
              status: input.error ? 'error' : 'success',
              errorMessage: input.error,
            });
          }

          // Emit PostToolUse hook event
          this.hookEmitter.emitPostToolUse(projectDir, {
            tool_name: input.tool_name,
            tool_output: input.tool_response,
            call_id: callId,
            session_id: sessionId,
            timestamp: new Date().toISOString()
          });

          // Emit tool completion event for frontend UI
          this.logger.log(`📤 Emitting tool complete event: ${input.tool_name} (callId: ${callId})`);
          observer.next({
            type: 'tool',
            data: {
              toolName: input.tool_name,
              status: 'complete',
              callId: callId,
              input: toolCall?.input,
              result: input.tool_response
            }
          });

          // Update structured message with completion status
          const structuredMsg = structuredMessages.find(msg => msg.id === callId);
          if (structuredMsg) {
            structuredMsg.status = 'complete';
            structuredMsg.result = input.tool_response;
          }

          // Emit file events for Write/Edit tools
          if (toolCall) {
            const { name, input: toolInput } = toolCall;

            // Helper to append to artifacts tracking file
            const appendArtifact = (filePath: string) => {
              try {
                const root = safeRoot(this.config.hostRoot, projectDir);
                const artifactsPath = join(root, '.etienne', '.agent-created-files.artifacts.md');
                // Convert absolute paths to relative
                const normalizedRoot = root.replace(/\\/g, '/');
                let relativePath = filePath.replace(/\\/g, '/');
                if (relativePath.startsWith(normalizedRoot + '/')) {
                  relativePath = relativePath.slice(normalizedRoot.length + 1);
                }
                const line = `- ${new Date().toISOString()} | ${relativePath}\n`;
                fs.appendFile(artifactsPath, line, 'utf8').catch(() => void 0);
              } catch { /* ignore */ }
            };

            if (name === 'Write' && toolInput?.file_path) {
              this.hookEmitter.emitFileAdded(projectDir, {
                path: toolInput.file_path,
                session_id: sessionId,
                timestamp: new Date().toISOString()
              });
              observer.next({
                type: 'file_added',
                data: { path: toolInput.file_path }
              });
              appendArtifact(toolInput.file_path);
            } else if ((name === 'Edit' || name === 'MultiEdit') && toolInput?.file_path) {
              this.hookEmitter.emitFileChanged(projectDir, {
                path: toolInput.file_path,
                session_id: sessionId,
                timestamp: new Date().toISOString()
              });
              observer.next({
                type: 'file_changed',
                data: { path: toolInput.file_path }
              });
              appendArtifact(toolInput.file_path);
            } else if (name === 'NotebookEdit' && toolInput?.notebook_path) {
              this.hookEmitter.emitFileChanged(projectDir, {
                path: toolInput.notebook_path,
                session_id: sessionId,
                timestamp: new Date().toISOString()
              });
              observer.next({
                type: 'file_changed',
                data: { path: toolInput.notebook_path }
              });
              appendArtifact(toolInput.notebook_path);
            }

            // Clean up
            toolCallMap.delete(callId);
          }

          return { continue: true };
        } catch (hookError: any) {
          this.logger.error(`Error in PostToolUse hook: ${hookError.message}`, hookError.stack);
          // Continue anyway - don't block continuation
          return { continue: true };
        }
      };

      const preCompactHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          const messageCount = input?.message_count ?? input?.messages?.length;
          this.logger.log(`🪝 PreCompact hook called (messageCount: ${messageCount ?? 'n/a'})`);

          this.hookEmitter.emitPreCompact(projectDir, {
            session_id: sessionId,
            message_count: messageCount,
            timestamp: new Date().toISOString()
          });

          observer.next({
            type: 'compaction',
            data: {
              trigger: 'auto',
              messageCount,
              timestamp: new Date().toISOString()
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in PreCompact hook: ${hookError.message}`, hookError.stack);
        }
        return { continue: true };
      };

      // Observer-only hooks: never influence SDK flow control.
      // CRITICAL: return {} not { continue: true }. For Stop/SubagentStop hooks the
      // SDK interprets `continue: true` as "don't stop yet — keep looping", which
      // hangs the turn. Plain {} (or no decision field) lets the SDK proceed normally.
      const sessionEndHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          const reason = input?.reason ?? 'completed';
          this.logger.log(`🪝 SessionEnd hook called (reason: ${reason})`);
          observer.next({
            type: 'session_end',
            data: {
              reason,
              session_id: input?.session_id ?? sessionId,
              duration_ms: Date.now() - startTime
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in SessionEnd hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      const stopHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          this.logger.log(`🪝 Stop hook called (stop_hook_active: ${!!input?.stop_hook_active}, background_tasks: ${input?.background_tasks?.length ?? 0}, session_crons: ${input?.session_crons?.length ?? 0})`);
          observer.next({
            type: 'stop',
            data: {
              stop_hook_active: !!input?.stop_hook_active,
              last_assistant_message: input?.last_assistant_message,
              background_tasks: input?.background_tasks ?? [],
              session_crons: input?.session_crons ?? []
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in Stop hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      const stopFailureHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          const message = input?.error?.message ?? input?.error_details ?? 'Stop hook failed';
          this.logger.warn(`🪝 StopFailure hook called: ${message}`);
          observer.next({
            type: 'error',
            data: {
              message: `Stop hook failed: ${message}`,
              recoverable: true,
              source: 'stop_failure'
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in StopFailure hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      const subagentStartHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          this.logger.log(`🪝 SubagentStart hook called (agent_id: ${input?.agent_id}, agent_type: ${input?.agent_type})`);
          observer.next({
            type: 'subagent_start',
            data: {
              agent_id: input?.agent_id,
              agent_type: input?.agent_type,
              source: 'hook'
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in SubagentStart hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      const subagentStopHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          this.logger.log(`🪝 SubagentStop hook called (agent_id: ${input?.agent_id}, agent_type: ${input?.agent_type})`);
          observer.next({
            type: 'subagent_end',
            data: {
              agent_id: input?.agent_id,
              agent_type: input?.agent_type,
              agent_transcript_path: input?.agent_transcript_path,
              source: 'hook'
            }
          });
        } catch (hookError: any) {
          this.logger.error(`Error in SubagentStop hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      // No-op SDK-side UserPromptSubmit hook. Pre-SDK prompt emission still happens
      // via hookEmitter.emitUserPromptSubmit() above. This stub is here so future
      // redaction / variable-expansion logic has a place to live (return
      // { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', ... } }).
      const userPromptSubmitHook = async (input: any, _toolUseID: string | undefined, _options: { signal: AbortSignal }) => {
        try {
          this.logger.debug(`🪝 UserPromptSubmit hook called (prompt length: ${input?.prompt?.length ?? 0})`);
        } catch (hookError: any) {
          this.logger.error(`Error in UserPromptSubmit hook: ${hookError.message}`, hookError.stack);
        }
        return {};
      };

      // Correct hook configuration format per official SDK documentation
      const hooks = {
        PreToolUse: [{ hooks: [preToolUseHook] }],  // No matcher = match all tools
        PostToolUse: [{ hooks: [postToolUseHook] }],
        PreCompact: [{ hooks: [preCompactHook] }],
        SessionEnd: [{ hooks: [sessionEndHook] }],
        Stop: [{ hooks: [stopHook] }],
        StopFailure: [{ hooks: [stopFailureHook] }],
        SubagentStart: [{ hooks: [subagentStartHook] }],
        SubagentStop: [{ hooks: [subagentStopHook] }],
        UserPromptSubmit: [{ hooks: [userPromptSubmitHook] }]
      };

      // Create canUseTool callback for handling user interaction tools
      // AskUserQuestion and ExitPlanMode always need user input regardless of mode
      // In 'plan' or 'acceptEdits' modes, all tools go through permission flow
      // In other modes, only AskUserQuestion and ExitPlanMode are handled
      const canUseTool = this.sdkPermissionService.createCanUseToolCallback(
        projectDir,
        sessionId,
        agentMode === 'plan' || agentMode === 'acceptEdits'  // requireAllPermissions flag
      );
      this.logger.log(`canUseTool callback created (mode: ${agentMode || 'default'}, requireAllPermissions: ${agentMode === 'plan' || agentMode === 'acceptEdits'})`);

      // Stream conversation via SDK
      this.logger.log(`Starting SDK stream for project: ${projectDir}, session: ${sessionId || 'new'}`);
      this.logger.log(`Hooks configured: PreToolUse=${!!hooks.PreToolUse}, PostToolUse=${!!hooks.PostToolUse}`);
      this.logger.log(`canUseTool configured: ${!!canUseTool} (mode: ${agentMode || 'default'})`);

      // Setup (budget, guardrails, memory, mission render) can take seconds;
      // honor an abort that arrived in the meantime.
      if (abortController?.signal.aborted) {
        this.logger.warn(`Process ${processId} aborted during setup — skipping SDK call`);
        observer.complete();
        return;
      }

      // ---- transient-API-error auto-retry ----------------------------------
      // Retry the whole SDK pass at most once, and ONLY if this attempt produced
      // nothing yet — retrying after text/tools would repeat side effects. The
      // "produced anything" signal is assistantText (grows with each delta) plus
      // any tool_call in structuredMessages.
      const MAX_SDK_ATTEMPTS = 2;
      const TRANSIENT_API_ERROR =
        /overloaded|rate.?limit|\b(429|500|502|503|529)\b|internal server error|timed? ?out|ECONNRESET|ETIMEDOUT|temporarily unavailable/i;
      const nothingProducedYet = () =>
        assistantText === '' &&
        !structuredMessages.some((m) => m.type === 'tool_call');
      let attempt = 0;
      let retryRequested = false;

      do {
        attempt++;
        retryRequested = false;

      try {
        for await (const sdkMessage of this.claudeSdkService.streamConversation(
          projectDir,
          finalPrompt,
          {
            sessionId,
            agentMode,
            maxTurns,
            hooks,
            processId,
            canUseTool,
            abortController
          }
        )) {
          try {
            this.logger.debug(`📨 SDK Message: type=${sdkMessage.type}, subtype=${sdkMessage.subtype || 'none'}`);

            // Log full message structure for debugging (first 1000 chars)
            this.logger.debug(`📨 Full message structure: ${JSON.stringify(sdkMessage).substring(0, 1000)}`);

        // Handle session initialization
        if (SdkMessageTransformer.isSessionInit(sdkMessage)) {
          const newSessionId = (sdkMessage as any).session_id as string;
          const model = (sdkMessage as any).model;
          sessionId = newSessionId;
          currentModel = model; // Store model for later injection into usage
          await this.sessionManager.createSession(projectDir, newSessionId, model);

          // Emit SessionStart event
          this.hookEmitter.emitSessionStart(projectDir, {
            session_id: newSessionId,
            model: model,
            timestamp: new Date().toISOString()
          });

          // Update telemetry span with session info
          if (this.telemetryService.isEnabled() && processId) {
            this.telemetryService.updateConversationSpan(processId, {
              sessionId: newSessionId,
              model: model,
            });
          }

          this.logger.log(`✨ Session initialized: ${newSessionId} with model: ${model}`);

          const sessionEvent = SdkMessageTransformer.transform(sdkMessage);
          if (sessionEvent) {
            observer.next(sessionEvent);
          }
          continue;
        }

        // Handle streaming partial messages (true streaming)
        if (sdkMessage.type === 'stream_event') {
          const event = (sdkMessage as any).event;

          // Handle content_block_delta events which contain the actual text
          if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
            const text = event.delta.text;
            if (text) {
              this.logger.debug(`📡 Stream event text delta: ${text.length} chars`);
              assistantText += text;

              // Add text chunk to structured messages for persistence
              structuredMessages.push({
                type: 'text_chunk',
                content: text,
                timestamp: Date.now()
              });

              // Stream immediately when not buffering
              if (!shouldBufferOutput) {
                observer.next({
                  type: 'stdout',
                  data: { chunk: text }
                });
              }
            }
          }
          continue;
        }

        // Note: Tool result handling is now done via SDK hooks (PreToolUse/PostToolUse)

        // Forward session state transitions (idle / running / requires_action).
        // 'idle' is the SDK's authoritative turn-over signal — fires after background flush.
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'session_state_changed') {
          const state = (sdkMessage as any).state;
          this.logger.log(`🔄 Session state changed: ${state}`);
          observer.next({
            type: 'session_state',
            data: {
              state,
              session_id: (sdkMessage as any).session_id ?? sessionId
            }
          });
          continue;
        }

        // Sub-agent / Bash-background task lifecycle (Task tool + foreground tasks).
        // Hooks cover SubagentStart/Stop; these messages cover task_id-keyed work that
        // arrives outside hook firing (e.g., backgrounded Bash, structured Task tool turns).
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'task_started') {
          const m = sdkMessage as any;
          this.logger.log(`🧑‍🤝‍🧑 task_started: ${m.task_id} (${m.subagent_type ?? 'task'})`);
          observer.next({
            type: 'subagent_start',
            data: {
              task_id: m.task_id,
              tool_use_id: m.tool_use_id,
              agent_type: m.subagent_type,
              description: m.description,
              source: 'task_message'
            }
          });
          continue;
        }
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'task_progress') {
          const m = sdkMessage as any;
          observer.next({
            type: 'subagent_progress',
            data: {
              task_id: m.task_id,
              tool_use_id: m.tool_use_id,
              description: m.description,
              subagent_type: m.subagent_type,
              last_tool_name: m.last_tool_name,
              summary: m.summary,
              total_tokens: m.usage?.total_tokens,
              tool_uses: m.usage?.tool_uses,
              duration_ms: m.usage?.duration_ms
            }
          });
          continue;
        }
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'task_notification') {
          const m = sdkMessage as any;
          this.logger.log(`🧑‍🤝‍🧑 task_notification: ${m.task_id} → ${m.status}`);
          observer.next({
            type: 'subagent_end',
            data: {
              task_id: m.task_id,
              tool_use_id: m.tool_use_id,
              status: m.status,
              summary: m.summary,
              output_file: m.output_file,
              total_tokens: m.usage?.total_tokens,
              tool_uses: m.usage?.tool_uses,
              duration_ms: m.usage?.duration_ms,
              source: 'task_message'
            }
          });
          continue;
        }

        // Status: 'compacting' / 'requesting' / null + optional compact_result + permissionMode.
        // Drives the UI's spinner state and surfaces mid-session permission-mode changes.
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'status') {
          const m = sdkMessage as any;
          observer.next({
            type: 'status',
            data: {
              status: m.status,
              permissionMode: m.permissionMode,
              compact_result: m.compact_result,
              compact_error: m.compact_error
            }
          });
          continue;
        }

        // Richer compaction payload (pre/post tokens + duration). Replaces the partial
        // data the PreCompact hook gives us — emit as 'compaction' so existing consumers
        // see the extended fields without a new event type.
        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'compact_boundary') {
          const m = sdkMessage as any;
          this.logger.log(`📚 compact_boundary: ${m.pre_tokens} → ${m.post_tokens} tokens (${m.duration_ms}ms, trigger: ${m.trigger})`);
          observer.next({
            type: 'compaction',
            data: {
              trigger: m.trigger,
              tokensBefore: m.pre_tokens,
              tokensAfter: m.post_tokens,
              durationMs: m.duration_ms,
              timestamp: new Date().toISOString()
            }
          });
          continue;
        }

        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'permission_denied') {
          observer.next({
            type: 'permission_denied',
            data: sdkMessage
          });
          continue;
        }

        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'rate_limit') {
          this.logger.warn(`⏱️ rate_limit notification from SDK`);
          observer.next({
            type: 'rate_limit',
            data: sdkMessage
          });
          continue;
        }

        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'notification') {
          observer.next({
            type: 'notification',
            data: sdkMessage
          });
          continue;
        }

        if (sdkMessage.type === 'system' && (sdkMessage as any).subtype === 'memory_recall') {
          observer.next({
            type: 'memory_recall',
            data: sdkMessage
          });
          continue;
        }

        // Top-level prompt_suggestion message. Per SDK docs, arrives AFTER the result
        // message — the for-await loop must not break on result (it doesn't today).
        if (sdkMessage.type === 'prompt_suggestion') {
          this.logger.log(`💡 prompt_suggestion received`);
          observer.next({
            type: 'prompt_suggestion',
            data: sdkMessage
          });
          continue;
        }

        // Collect assistant text (but don't emit it - we already streamed it via deltas)
        if (SdkMessageTransformer.isAssistant(sdkMessage)) {
          // SDKAssistantMessage has message.content, not content directly
          this.logger.debug(`📦 Full assistant message structure: ${JSON.stringify(sdkMessage).substring(0, 500)}`);
          const content = (sdkMessage as any).message?.content;
          this.logger.debug(`📦 Extracted content: ${JSON.stringify(content)}`);

          // Process content blocks - emit tool events separately
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                // Only accumulate text for final persistence, don't re-emit
                // (we already streamed it via content_block_delta events)
                const text = block.text;
                if (!assistantText.includes(text)) {
                  assistantText += text;
                }
              } else if (block.type === 'tool_use') {
                const toolCallId = block.id || `tool_${Date.now()}`;

                this.logger.log(`🔧 Tool execution started: ${block.name} (ID: ${toolCallId})`);
                this.logger.debug(`🔧 Tool input: ${JSON.stringify(block.input).substring(0, 500)}`);

                // Note: Tool event emission is handled by PreToolUse/PostToolUse hooks
                // No need to emit here to avoid duplicates
              }
            }
          }
          // Text was already streamed via content_block_delta; don't fall through
          // to SdkMessageTransformer.transform() at the end of the loop, which would
          // re-emit the assembled assistant text as a second `stdout` chunk and
          // produce the visible duplicate paragraph in the chat bubble.
          continue;
        }

        // Handle result (completion)
        if (SdkMessageTransformer.isResult(sdkMessage)) {
          this.logger.debug(`📊 Result message:`, JSON.stringify(sdkMessage, null, 2));

          // Check if this is an error result (API errors, rate limits, etc.)
          const isError = (sdkMessage as any).is_error === true;
          const resultText = (sdkMessage as any).result;

          if (isError && resultText) {
            // Parse API error message for user-friendly display
            let errorMessage = resultText;
            try {
              // Try to extract the actual error message from API Error JSON
              const apiErrorMatch = resultText.match(/API Error: \d+ ({.*})/);
              if (apiErrorMatch) {
                const errorJson = JSON.parse(apiErrorMatch[1]);
                errorMessage = errorJson.error?.message || resultText;
              }
            } catch {
              // Keep original error message if parsing fails
            }

            const transient = TRANSIENT_API_ERROR.test(errorMessage);

            // Auto-retry once for clearly transient failures — ONLY if this
            // attempt produced nothing (no text, no tool calls), so the retry
            // cannot duplicate side effects.
            if (transient && attempt < MAX_SDK_ATTEMPTS && nothingProducedYet()
                && !abortController?.signal.aborted) {
              retryRequested = true;
              this.logger.warn(`Transient API error (attempt ${attempt}) — retrying: ${errorMessage}`);
              observer.next({
                type: 'status',
                data: { status: 'retrying', attempt, message: `Transient API error — retrying` }
              });
              break; // end this pass; the do-while starts the next attempt
            }

            this.logger.warn(`⚠️ API Error in result: ${errorMessage}`);

            // Emit error event to show warning in UI
            observer.next({
              type: 'api_error',
              data: {
                message: errorMessage,
                fullError: resultText,
                retryable: transient, // frontend shows a Retry button for these
                timestamp: new Date().toISOString()
              }
            });

            // Also emit as stdout so user sees it in the chat
            observer.next({
              type: 'stdout',
              data: { chunk: `\n\n⚠️ **API Error:** ${errorMessage}\n` }
            });
          }

          // Extract final result text for persistence only (don't re-emit, already streamed via deltas)
          if (resultText && typeof resultText === 'string' && !isError) {
            // Only update assistantText if it's empty (e.g., no streaming occurred)
            if (!assistantText) {
              assistantText = resultText;
            }
            this.logger.debug(`📝 Extracted result text: ${resultText.substring(0, 100)}...`);
          }

          const resultUsage = SdkMessageTransformer.extractUsage(sdkMessage);
          if (resultUsage) {
            usage = resultUsage;

            // Inject model from session init if not present in usage
            if (!usage.model && currentModel) {
              usage.model = currentModel;
              this.logger.debug(`💉 Injected model into usage: ${currentModel}`);
            }

            observer.next({
              type: 'usage',
              data: usage
            });

            // Update session token usage
            if (sessionId && usage.input_tokens && usage.output_tokens) {
              this.sessionManager.updateTokenUsage(sessionId, usage.input_tokens, usage.output_tokens);
            }

            // Emit context_state for live meter (read post-update session total)
            const sessionForContext = sessionId ? this.sessionManager.getSession(sessionId) : undefined;
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
                cacheReadTokens: usage.cache_read_input_tokens,
                cacheCreationTokens: usage.cache_creation_input_tokens,
              }
            });

            // Record usage in telemetry
            if (this.telemetryService.isEnabled() && processId) {
              this.telemetryService.recordUsage(processId, {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
                cacheReadTokens: usage.cache_read_input_tokens,
                cacheCreationTokens: usage.cache_creation_input_tokens,
                cacheCreation5mTokens: usage.cache_creation_ephemeral_5m_input_tokens,
                cacheCreation1hTokens: usage.cache_creation_ephemeral_1h_input_tokens,
              });
            }
          }

          // Apply output guardrails if enabled (only for buffered output)
          if (shouldBufferOutput && assistantText) {
            try {
              this.logger.log('🛡️ Applying output guardrails...');
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
                this.logger.log(`🛡️ Output guardrails triggered: ${guardrailResult.violations.join(', ')}`);
              }

              assistantText = guardrailResult.modifiedContent;

              // Emit the final (possibly modified) text ONLY when buffering
              observer.next({
                type: 'stdout',
                data: { chunk: assistantText }
              });
            } catch (error: any) {
              this.logger.error('Failed to apply output guardrails:', error.message);
            }
          }
          // Note: When not buffering, we already streamed all text via deltas, so don't emit again

          // Emit Stop event
          this.hookEmitter.emitStop(projectDir, {
            reason: 'completed',
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            usage
          });

          // Emit telemetry data (spanId) to frontend before ending span
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
            // Record the computed EUR cost on the conversation span for
            // attribution, before the span ends. Persistence (with the
            // accumulated running total) happens after the stream loop.
            if (usage.input_tokens || usage.output_tokens) {
              const requestCosts = this.budgetMonitoringService.calculateCosts(
                usage.input_tokens || 0,
                usage.output_tokens || 0,
                {
                  cacheReadTokens: usage.cache_read_input_tokens,
                  cacheCreationTokens: usage.cache_creation_input_tokens,
                  cacheCreation5mTokens: usage.cache_creation_ephemeral_5m_input_tokens,
                  cacheCreation1hTokens: usage.cache_creation_ephemeral_1h_input_tokens,
                }
              );
              this.telemetryService.recordCost(processId, {
                requestCosts,
                currency: process.env.COSTS_CURRENCY_UNIT || 'EUR',
              });
            }

            // End telemetry span successfully
            this.telemetryService.endConversationSpan(processId, assistantText);
          }

          // Emit completion
          const completedEvent = SdkMessageTransformer.transform(sdkMessage);
          if (completedEvent) {
            observer.next(completedEvent);
          }

          // Do NOT break: prompt_suggestion arrives AFTER the result message.
          // The for-await loop ends naturally when the SDK closes its stream.
          continue;
        }

        // Transform and emit other message types
        const transformed = SdkMessageTransformer.transform(sdkMessage);
        if (transformed && !shouldBufferOutput) {
          observer.next(transformed);
        }
          } catch (messageError: any) {
            // Catch errors in individual message processing
            // Log but don't terminate the stream
            this.logger.error(`Error processing SDK message: ${messageError.message}`, messageError.stack);
            observer.next({
              type: 'error',
              data: {
                message: `Message processing error: ${messageError.message}`,
                recoverable: true
              }
            });
            // Continue processing next message
          }
        }
      } catch (streamError: any) {
        // Catch errors in the entire stream
        const transient = TRANSIENT_API_ERROR.test(streamError?.message ?? '');
        if (transient && attempt < MAX_SDK_ATTEMPTS && nothingProducedYet()
            && !abortController?.signal.aborted) {
          retryRequested = true;
          this.logger.warn(`Transient stream error (attempt ${attempt}) — retrying: ${streamError.message}`);
          observer.next({
            type: 'status',
            data: { status: 'retrying', attempt, message: 'Transient error — retrying' }
          });
        } else {
          this.logger.error(`Stream error in SDK conversation: ${streamError.message}`, streamError.stack);
          observer.next({
            type: 'error',
            data: {
              message: `Stream error: ${streamError.message}`,
              recoverable: false
            }
          });
          // Don't throw - let the stream complete gracefully
        }
      }

        if (retryRequested) {
          await new Promise((r) => setTimeout(r, 2000 * attempt)); // simple backoff
        }
      } while (retryRequested && !abortController?.signal.aborted);

      // Persist chat messages
      if (!skipChatPersistence && sessionId) {
        try {
          const root = safeRoot(this.config.hostRoot, projectDir);
          const timestamp = new Date().toISOString();

          await this.sessionsService.appendMessages(root, sessionId, [
            {
              timestamp,
              isAgent: false,
              message: sanitizedPrompt,
              costs: undefined
            },
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

      // Track budget costs
      if (!skipChatPersistence && usage.input_tokens && usage.output_tokens) {
        try {
          await this.budgetMonitoringService.trackCosts(
            projectDir,
            usage.input_tokens,
            usage.output_tokens,
            sessionId,
            {
              cacheReadTokens: usage.cache_read_input_tokens,
              cacheCreationTokens: usage.cache_creation_input_tokens,
              cacheCreation5mTokens: usage.cache_creation_ephemeral_5m_input_tokens,
              cacheCreation1hTokens: usage.cache_creation_ephemeral_1h_input_tokens,
            }
          );
          this.logger.log(`💰 Tracked costs: ${usage.input_tokens} input, ${usage.output_tokens} output, ${usage.cache_read_input_tokens || 0} cache-read, ${usage.cache_creation_input_tokens || 0} cache-write tokens (session: ${sessionId})`);
        } catch (err) {
          this.logger.error('Failed to track budget costs:', err);
        }
      }

      // Store memories if enabled (fire-and-forget)
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
              session_id: sessionId,
              source: 'chat',
              timestamp: new Date().toISOString()
            }
          },
          { headers: { Authorization: `Bearer ${serviceToken}` } }
        ).catch((error: any) => {
          this.logger.error('Failed to store memories:', error.message);
        });
      }

      // Update session activity
      if (sessionId) {
        await this.sessionManager.touchSession(sessionId);
      }

      // Send notifications for attended sessions (fire-and-forget)
      if (!skipChatPersistence && notificationChannels) {
        const channels = notificationChannels.split(',').filter(Boolean);
        if (channels.length > 0) {
          const summary = assistantText.substring(0, 200) + (assistantText.length > 200 ? '...' : '');
          this.userNotificationsService.sendNotifications(projectDir, channels, summary, notificationEmail)
            .catch(err => this.logger.error('Failed to send notifications:', err.message));
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`✅ SDK stream completed in ${duration}ms for project: ${projectDir}`);
      observer.complete();

    } catch (error: any) {
      this.logger.error(`SDK stream error: ${error.message}`, error.stack);

      // End telemetry span with error
      if (this.telemetryService.isEnabled() && processId) {
        this.telemetryService.endConversationSpanWithError(processId, error);
      }

      observer.next({
        type: 'error',
        data: { message: error.message }
      });
      observer.complete();
    }
  }

  /**
   * Abort a running SDK stream
   */
  public abortProcess(processId: string) {
    const success = this.claudeSdkService.abortStream(processId);
    if (success) {
      this.logger.log(`Successfully aborted SDK process: ${processId}`);
      return { success: true, message: 'SDK stream aborted' };
    } else {
      this.logger.warn(`Failed to abort SDK process: ${processId} (not found)`);
      return { success: false, message: 'SDK stream not found' };
    }
  }
}
