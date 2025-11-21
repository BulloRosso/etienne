import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import axios from 'axios';
import { ClaudeSdkService } from './claude-sdk.service';
import { SdkSessionManagerService } from './sdk-session-manager.service';
import { SdkMessageTransformer } from './sdk-message-transformer';
import { SdkHookEmitterService } from './sdk-hook-emitter.service';
import { MessageEvent, Usage } from '../types';
import { GuardrailsService } from '../../input-guardrails/guardrails.service';
import { OutputGuardrailsService } from '../../output-guardrails/output-guardrails.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { sanitize_user_message } from '../../input-guardrails/index';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';

/**
 * Orchestrator service that integrates SDK, sessions, guardrails, and memory
 * This is the main entry point for SDK-based conversations
 */
@Injectable()
export class ClaudeSdkOrchestratorService {
  private readonly logger = new Logger(ClaudeSdkOrchestratorService.name);
  private readonly config = new ClaudeConfig();

  constructor(
    private readonly claudeSdkService: ClaudeSdkService,
    private readonly sessionManager: SdkSessionManagerService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly sessionsService: SessionsService,
    private readonly contextInterceptor: ContextInterceptorService
  ) {}

  /**
   * Stream a prompt using the Agent SDK with full integration
   */
  streamPrompt(
    projectDir: string,
    prompt: string,
    agentMode?: string,
    memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    maxTurns?: number
  ): Observable<MessageEvent> {
    // Generate process ID for abort tracking
    const processId = `sdk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Observable<MessageEvent>((observer) => {
      // Emit process ID immediately so frontend can track it
      observer.next({
        type: 'session',
        data: { process_id: processId }
      });

      this.runStreamPrompt(
        observer,
        projectDir,
        prompt,
        agentMode,
        memoryEnabled,
        skipChatPersistence,
        maxTurns,
        processId
      ).catch((error) => {
        this.logger.error(`Stream prompt failed: ${error.message}`, error.stack);
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
    maxTurns?: number,
    processId?: string
  ): Promise<void> {
    const userId = 'user'; // Default user ID
    let sessionId: string | undefined;
    let assistantText = '';
    let usage: Usage = {};
    const startTime = Date.now();
    let currentModel: string | undefined; // Track model name from session init

    // Track tool calls to correlate PreToolUse with PostToolUse
    const toolCallMap = new Map<string, { name: string; input: any }>();

    try {
      // Check if this is a new session or resuming
      sessionId = await this.sessionManager.loadSessionId(projectDir);
      const isFirstRequest = !sessionId;

      // If resuming, load model from session
      if (sessionId) {
        const existingSession = this.sessionManager.getSession(sessionId);
        if (existingSession?.model) {
          currentModel = existingSession.model;
          this.logger.debug(`📋 Loaded model from existing session: ${currentModel}`);
        }
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
          const searchResponse = await axios.post(
            `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
            {
              query: sanitizedPrompt,
              user_id: userId,
              limit: 5
            }
          );

          const memories = searchResponse.data.results || [];
          if (memories.length > 0) {
            const memoryContext = memories.map((m: any) => m.memory).join('\n- ');
            enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${sanitizedPrompt}`;
            this.logger.log(`📚 Enhanced prompt with ${memories.length} memories`);
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

      // Emit UserPromptSubmit event (before processing)
      this.hookEmitter.emitUserPromptSubmit(projectDir, {
        prompt: finalPrompt,
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });

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

          // Emit PreToolUse hook event to interceptor stream
          this.hookEmitter.emitPreToolUse(projectDir, {
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            call_id: callId,
            session_id: sessionId,
            timestamp: new Date().toISOString()
          });

          // Also emit to main observer stream for frontend UI
          observer.next({
            type: 'tool',
            data: {
              toolName: input.tool_name,
              status: 'running',
              callId: callId,
              input: input.tool_input
            }
          });

          return { continue: true };
        } catch (hookError: any) {
          this.logger.error(`Error in PreToolUse hook: ${hookError.message}`, hookError.stack);
          // Continue anyway - don't block tool execution
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

          // Emit PostToolUse hook event
          this.hookEmitter.emitPostToolUse(projectDir, {
            tool_name: input.tool_name,
            tool_output: input.tool_response,
            call_id: callId,
            session_id: sessionId,
            timestamp: new Date().toISOString()
          });

          // Emit tool completion event for frontend UI
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

          // Emit file events for Write/Edit tools
          if (toolCall) {
            const { name, input: toolInput } = toolCall;

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

      // Correct hook configuration format per official SDK documentation
      const hooks = {
        PreToolUse: [{ hooks: [preToolUseHook] }],  // No matcher = match all tools
        PostToolUse: [{ hooks: [postToolUseHook] }]
      };

      // Stream conversation via SDK
      this.logger.log(`Starting SDK stream for project: ${projectDir}, session: ${sessionId || 'new'}`);
      this.logger.log(`Hooks configured: PreToolUse=${!!hooks.PreToolUse}, PostToolUse=${!!hooks.PostToolUse}`);

      try {
        for await (const sdkMessage of this.claudeSdkService.streamConversation(
          projectDir,
          finalPrompt,
          {
            sessionId,
            agentMode,
            maxTurns,
            hooks,
            processId
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
        }

        // Handle result (completion)
        if (SdkMessageTransformer.isResult(sdkMessage)) {
          this.logger.debug(`📊 Result message:`, JSON.stringify(sdkMessage, null, 2));

          // Extract final result text for persistence only (don't re-emit, already streamed via deltas)
          const resultText = (sdkMessage as any).result;
          if (resultText && typeof resultText === 'string') {
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

          // Emit completion
          const completedEvent = SdkMessageTransformer.transform(sdkMessage);
          if (completedEvent) {
            observer.next(completedEvent);
          }

          break;
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
              costs: usage
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
            usage.output_tokens
          );
          this.logger.log(`💰 Tracked costs: ${usage.input_tokens} input, ${usage.output_tokens} output tokens`);
        } catch (err) {
          this.logger.error('Failed to track budget costs:', err);
        }
      }

      // Store memories if enabled (fire-and-forget)
      if (memoryEnabled && assistantText) {
        const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';
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
          }
        ).catch((error: any) => {
          this.logger.error('Failed to store memories:', error.message);
        });
      }

      // Update session activity
      if (sessionId) {
        await this.sessionManager.touchSession(sessionId);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`✅ SDK stream completed in ${duration}ms for project: ${projectDir}`);
      observer.complete();

    } catch (error: any) {
      this.logger.error(`SDK stream error: ${error.message}`, error.stack);
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
