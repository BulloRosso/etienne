import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { MessageEvent } from '../types';
import { PiUsage, piUsageToCacheUsage } from './pi-mono-event-adapter';
import { SdkPermissionService } from '../sdk/sdk-permission.service';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { StreamRelay, StreamRelayRegistry } from '../sdk/stream-relay.registry';
import { buildPiMcpBridge, PiMcpBridge, PiAgentTool } from './mcp-bridge.extension';
import { toPiToolDefinition, PiToolDefinition } from './pi-tool-adapter';
import { createPiExtension } from './pi-mono.extension';
import { PiModelConfig, resolveModel } from './pi-model-resolver';
import { SessionsService } from '../../sessions/sessions.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { SubagentsService } from '../../subagents/subagents.service';
import { buildSubagentTool } from './subagent-tool.extension';

type PiAgentSession = {
  prompt(input: string): Promise<void>;
  subscribe(handler: (ev: any) => void): (() => void) | { unsubscribe: () => void } | void;
  abort?(): void | Promise<void>;
  sessionId?: string;
};

/** pi-mono uses 'pi-mono' as its event-bus source so the rule engine / loop-guard
 *  can distinguish it from the Anthropic harness (self-event suppression keying). */
const PI_MONO_SOURCE = 'pi-mono';

@Injectable()
export class PiMonoOrchestratorService {
  private readonly logger = new Logger(PiMonoOrchestratorService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
  private readonly activeSessions = new Map<string, PiAgentSession>();
  private readonly activeBridges = new Map<string, PiMcpBridge>();
  private readonly nestedSessions = new Map<string, { abort?: () => void | Promise<void> }>();
  private readonly relays = new Map<string, StreamRelay>();

  constructor(
    private readonly permissionService: SdkPermissionService,
    private readonly hookEmitter: SdkHookEmitterService,
    private readonly streamRelayRegistry: StreamRelayRegistry,
    private readonly sessionsService: SessionsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly contextInterceptor: ContextInterceptorService,
    private readonly subagentsService: SubagentsService,
  ) {}

  async clearSession(projectDir: string): Promise<void> {
    const existing = this.activeSessions.get(projectDir);
    if (existing?.abort) {
      try { await existing.abort(); } catch { /* ignore */ }
    }
    this.activeSessions.delete(projectDir);
  }

  /** Re-attach a reloaded client to a buffered pi-mono run. */
  attachToStream(processId: string, lastSeq?: number): Observable<MessageEvent> {
    return this.streamRelayRegistry.attach(processId, lastSeq);
  }

  async abortProcess(processId: string): Promise<{ success: boolean }> {
    for (const [key, nested] of this.nestedSessions.entries()) {
      if (key.includes(processId) || processId.includes(key)) {
        try { await nested.abort?.(); } catch { /* ignore */ }
        this.nestedSessions.delete(key);
      }
    }
    for (const [key, session] of this.activeSessions.entries()) {
      if (key.includes(processId) && session.abort) {
        try { await session.abort(); } catch { /* ignore */ }
        this.activeSessions.delete(key);
        return { success: true };
      }
    }
    return { success: false };
  }

  streamPrompt(
    projectDir: string,
    prompt: string,
    _agentMode?: string,
    _memoryEnabled?: boolean,
    skipChatPersistence?: boolean,
    _maxTurns?: number,
  ): Observable<MessageEvent> {
    const processId = `pimono_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const relay = this.streamRelayRegistry.createRelay(processId, {
      onAbandoned: () => { this.abortProcess(processId).catch(() => {}); },
    });
    this.relays.set(processId, relay);

    relay.next({ type: 'session', data: { process_id: processId } });

    this.runPrompt(projectDir, prompt, processId, !!skipChatPersistence, relay)
      .catch((err: any) => {
        this.logger.error(`pi-mono stream failed: ${err?.message}`, err?.stack);
        relay.error(err);
      });

    return relay.asObservable();
  }

  private async runPrompt(
    projectDir: string,
    prompt: string,
    processId: string,
    skipChatPersistence: boolean,
    relay: StreamRelay,
  ): Promise<void> {
    const emit = (ev: MessageEvent) => relay.next(ev);

    // --- budget pre-check (loop-guard: source budget pre-check) ---
    try {
      const budgetCheck = await this.budgetMonitoringService.checkBudgetLimit(projectDir);
      if (budgetCheck.exceeded) {
        this.logger.warn(`pi-mono budget limit exceeded for ${projectDir}: ${budgetCheck.currentCosts} / ${budgetCheck.limit} ${budgetCheck.currency}`);
        emit({
          type: 'error',
          data: {
            error: `Budget limit exceeded. Current costs: ${budgetCheck.currentCosts.toFixed(2)} ${budgetCheck.currency}, limit: ${budgetCheck.limit.toFixed(2)} ${budgetCheck.currency}. Please increase the budget limit or disable budget monitoring to continue.`,
          },
        });
        relay.complete();
        return;
      }
    } catch (err: any) {
      this.logger.error(`pi-mono budget check failed: ${err?.message}`);
    }

    // --- dynamic import (ESM-only packages) ---
    let pi: any;
    let piAi: any;
    try {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      pi = await dynamicImport('@earendil-works/pi-coding-agent');
      piAi = await dynamicImport('@earendil-works/pi-ai/compat');
    } catch (err: any) {
      throw new Error(
        `pi-mono package not installed. Run: npm install @earendil-works/pi-coding-agent @earendil-works/pi-agent-core @earendil-works/pi-ai. Underlying: ${err?.message}`,
      );
    }

    const projectRoot = path.join(this.workspaceRoot, projectDir);
    const modelConfig = await this.loadModelConfig(projectRoot);

    let sessionId: string | null = null;
    try {
      sessionId = await this.sessionsService.getMostRecentSessionId(projectRoot);
    } catch (err: any) {
      this.logger.warn(`pi-mono: sessionId lookup failed: ${err?.message}`);
    }

    // Context interceptor: prepend allowed-files/tools markdown to the user prompt.
    let finalPrompt = prompt;
    if (sessionId) {
      try {
        const injection = await this.contextInterceptor.buildContextPromptInjection(projectDir, sessionId);
        if (injection) finalPrompt = `${injection}\n\n${prompt}`;
      } catch (err: any) {
        this.logger.warn(`pi-mono context injection failed: ${err?.message}`);
      }
    }

    const createAgentSession = pi.createAgentSession ?? pi.default?.createAgentSession;
    const DefaultResourceLoader = pi.DefaultResourceLoader ?? pi.default?.DefaultResourceLoader;
    const SessionManager = pi.SessionManager ?? pi.default?.SessionManager;
    if (typeof createAgentSession !== 'function') {
      throw new Error('pi-mono: createAgentSession export not found — check installed package version.');
    }

    // --- build custom tools (MCP bridge + subagent Task) ---
    const mcpBridge = await buildPiMcpBridge({ logger: this.logger, projectRoot });
    this.activeBridges.set(processId, mcpBridge);
    const rawTools: PiAgentTool[] = [...mcpBridge.tools];

    try {
      const subagentTool = await buildSubagentTool({
        logger: this.logger,
        subagentsService: this.subagentsService,
        projectDir,
        parentProcessId: processId,
        parentTools: rawTools,
        piModule: pi,
        piAi,
        modelConfig,
        projectRoot,
        emit,
        nestedSessions: this.nestedSessions,
        depth: 0,
      });
      if (subagentTool) rawTools.push(subagentTool);
    } catch (err: any) {
      this.logger.warn(`pi-mono subagent tool build failed: ${err?.message}`);
    }

    const customTools: PiToolDefinition[] = rawTools.map(t => toPiToolDefinition(t, this.logger));

    // --- usage capture + chat persistence on stop ---
    let assistantText = '';
    let usage: PiUsage | undefined;

    // --- the in-process pi extension: permissions, filtering, events, bus ---
    const extensionFactory = createPiExtension({
      logger: this.logger,
      permissionService: this.permissionService,
      contextInterceptor: this.contextInterceptor,
      projectName: projectDir,
      projectRoot,
      sessionId: sessionId ?? undefined,
      requireAllPermissions: false,
      customTools,
      emit,
      onUsage: (u) => { usage = u; },
      bus: {
        onAgentStart: () => {
          this.hookEmitter.emitUserPromptSubmit(projectDir, { prompt, session_id: sessionId ?? undefined, source: PI_MONO_SOURCE })
            .catch((e: any) => this.logger.debug(`pi-mono emitUserPromptSubmit failed: ${e?.message}`));
          if (sessionId) this.hookEmitter.emitSessionStart(projectDir, { session_id: sessionId });
        },
        onPreToolUse: (d) => this.hookEmitter.emitPreToolUse(projectDir, { ...d, session_id: sessionId ?? undefined }),
        onPostToolUse: (d) => this.hookEmitter.emitPostToolUse(projectDir, { ...d, session_id: sessionId ?? undefined }),
        onFileChanged: (filePath, kind) => {
          const fn = kind === 'added' ? this.hookEmitter.emitFileAdded : this.hookEmitter.emitFileChanged;
          fn.call(this.hookEmitter, projectDir, { path: filePath, session_id: sessionId ?? undefined, source: PI_MONO_SOURCE })
            .catch((e: any) => this.logger.debug(`pi-mono emitFile* failed: ${e?.message}`));
        },
        onPreCompact: () => this.hookEmitter.emitPreCompact(projectDir, { session_id: sessionId ?? undefined }),
        onStop: (u) => this.hookEmitter.emitStop(projectDir, { reason: 'completed', session_id: sessionId ?? undefined, usage: u }),
      },
    });

    // capture assistant text from the relay's stdout events for persistence
    const textCapture = (ev: MessageEvent) => { if (ev.type === 'stdout') assistantText += (ev.data as any)?.chunk ?? ''; };

    // --- resource loader carrying our extension ---
    // agentDir is required by DefaultResourceLoader. Use PI_CODING_AGENT_DIR for
    // per-project multi-tenant isolation, else pi's default ~/.pi/agent.
    const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
    const resourceLoader = DefaultResourceLoader
      ? new DefaultResourceLoader({ cwd: projectRoot, agentDir, extensionFactories: [extensionFactory] })
      : undefined;
    if (resourceLoader?.reload) {
      try { await resourceLoader.reload(); } catch (err: any) { this.logger.debug(`pi-mono resourceLoader reload failed: ${err?.message}`); }
    }

    // --- model + provider resolution ---
    const resolvedModel = resolveModel(piAi, modelConfig);

    // Custom provider with its own baseUrl+token (e.g. local Ollama) — register it
    // on a transient ModelRegistry-less path via the extension is out of scope here;
    // env-var fallback (ANTHROPIC_API_KEY, ...) covers built-in providers.
    if (modelConfig?.baseUrl) {
      this.logger.warn(`pi-mono: custom baseUrl provider '${modelConfig.provider}' configured; ensure the corresponding API key env var is set (provider registration via extension is a follow-up).`);
    }

    // --- session resume (continueRecent) ---
    const sessionManager = SessionManager?.continueRecent
      ? SessionManager.continueRecent(projectRoot)
      : (SessionManager?.inMemory ? SessionManager.inMemory(projectRoot) : undefined);

    const { session } = await createAgentSession({
      cwd: projectRoot,
      sessionManager,
      model: resolvedModel,
      resourceLoader,
    });
    this.activeSessions.set(processId, session as PiAgentSession);

    // bridge relay → text capture + completion/persistence
    const sub = (session as PiAgentSession).subscribe?.((ev: any) => {
      if (ev?.type === 'agent_end') {
        relay.complete();
        this.activeSessions.delete(processId);
        this.closeBridge(processId);
        this.relays.delete(processId);
        if (!skipChatPersistence) {
          this.persistChat(projectDir, projectRoot, prompt, assistantText, usage)
            .catch((err: any) => this.logger.error(`pi-mono chat persistence failed: ${err?.message}`));
        }
      }
    });

    // also capture stdout text by tapping the relay's emit — wrap emit above already
    // forwards via the extension; mirror that text here for persistence.
    relay.asObservable().subscribe({ next: textCapture, error: () => {}, complete: () => {} });

    try {
      await session.prompt(finalPrompt);
    } catch (err: any) {
      relay.error(err);
      this.activeSessions.delete(processId);
      this.closeBridge(processId);
      this.relays.delete(processId);
      if (sub && typeof (sub as any).unsubscribe === 'function') (sub as any).unsubscribe();
    }
  }

  private async persistChat(
    projectDir: string,
    projectRoot: string,
    prompt: string,
    assistantText: string,
    usage: PiUsage | undefined,
  ): Promise<void> {
    const sessionId = await this.sessionsService.getMostRecentSessionId(projectRoot);
    if (!sessionId) {
      this.logger.debug(`pi-mono: no session found for ${projectRoot}, skipping persistence`);
      return;
    }
    const timestamp = new Date().toISOString();
    const hasTokens = !!(usage?.input || usage?.output);
    const costs = hasTokens ? { input_tokens: usage?.input ?? 0, output_tokens: usage?.output ?? 0 } : undefined;
    await this.sessionsService.appendMessages(projectRoot, sessionId, [
      { timestamp, isAgent: false, message: prompt, costs: undefined },
      { timestamp, isAgent: true, message: assistantText || '', costs },
    ]);

    if (hasTokens) {
      try {
        // Cache-token economy: thread the full breakdown through trackCosts (5th arg).
        await this.budgetMonitoringService.trackCosts(
          projectDir,
          usage?.input ?? 0,
          usage?.output ?? 0,
          sessionId,
          piUsageToCacheUsage(usage),
        );
      } catch (err: any) {
        this.logger.error(`pi-mono budget tracking failed: ${err?.message}`);
      }
    }
  }

  private closeBridge(processId: string): void {
    const bridge = this.activeBridges.get(processId);
    if (!bridge) return;
    this.activeBridges.delete(processId);
    bridge.close().catch((err: any) => this.logger.debug(`pi-mono bridge close failed: ${err?.message}`));
  }

  private async loadModelConfig(projectRoot: string): Promise<PiModelConfig | undefined> {
    const candidate = path.join(projectRoot, '.etienne', 'ai-model.json');
    if (!(await fs.pathExists(candidate))) return undefined;
    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as PiModelConfig;
      if (parsed.isActive === false) return undefined;
      return parsed;
    } catch (err: any) {
      this.logger.warn(`Failed to read ai-model.json at ${candidate}: ${err?.message}`);
      return undefined;
    }
  }
}
