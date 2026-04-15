import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MessageEvent } from '../types';
import { piEventToMessageEvents, PiEvent } from './pi-mono-event-adapter';
import { SdkPermissionService } from '../sdk/sdk-permission.service';
import { createPiMonoPermissionHook } from './pi-mono-permission.bridge';
import { buildPiMcpBridge, PiMcpBridge } from './mcp-bridge.extension';
import { SessionsService } from '../../sessions/sessions.service';
import { BudgetMonitoringService } from '../../budget-monitoring/budget-monitoring.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';

type PiAgentSession = {
  prompt(input: string): Promise<void>;
  subscribe(handler: (ev: PiEvent) => void): { unsubscribe: () => void } | void;
  abort?(): void | Promise<void>;
};

type PiModelConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  token?: string;
  isActive?: boolean;
};

@Injectable()
export class PiMonoOrchestratorService {
  private readonly logger = new Logger(PiMonoOrchestratorService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
  private readonly activeSessions = new Map<string, PiAgentSession>();
  private readonly activeBridges = new Map<string, PiMcpBridge>();

  constructor(
    private readonly permissionService: SdkPermissionService,
    private readonly sessionsService: SessionsService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly contextInterceptor: ContextInterceptorService,
  ) {}

  async clearSession(projectDir: string): Promise<void> {
    const existing = this.activeSessions.get(projectDir);
    if (existing?.abort) {
      try { await existing.abort(); } catch { /* ignore */ }
    }
    this.activeSessions.delete(projectDir);
  }

  async abortProcess(processId: string): Promise<{ success: boolean }> {
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

    return new Observable<MessageEvent>((observer) => {
      let disposed = false;
      let unsubscribe: (() => void) | undefined;

      observer.next({ type: 'session', data: { process_id: processId } });

      this.runPrompt(projectDir, prompt, processId, !!skipChatPersistence, observer, (u) => { unsubscribe = u; })
        .catch((err: any) => {
          this.logger.error(`pi-mono stream failed: ${err?.message}`, err?.stack);
          if (!disposed) observer.error(err);
        });

      return () => {
        disposed = true;
        if (unsubscribe) {
          try { unsubscribe(); } catch { /* ignore */ }
        }
      };
    });
  }

  private async runPrompt(
    projectDir: string,
    prompt: string,
    processId: string,
    skipChatPersistence: boolean,
    observer: { next: (v: MessageEvent) => void; complete: () => void; error: (e: any) => void },
    setUnsubscribe: (fn: () => void) => void,
  ): Promise<void> {
    try {
      const budgetCheck = await this.budgetMonitoringService.checkBudgetLimit(projectDir);
      if (budgetCheck.exceeded) {
        this.logger.warn(
          `pi-mono budget limit exceeded for ${projectDir}: ${budgetCheck.currentCosts} / ${budgetCheck.limit} ${budgetCheck.currency}`,
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
    } catch (err: any) {
      this.logger.error(`pi-mono budget check failed: ${err?.message}`);
    }

    let pi: any;
    try {
      // Runtime-only import so tsc doesn't fail when the optional dep isn't installed.
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      pi = await dynamicImport('@mariozechner/pi-coding-agent');
    } catch (err: any) {
      throw new Error(
        `pi-mono package not installed. Run: npm install @mariozechner/pi-coding-agent @mariozechner/pi-agent-core. Underlying: ${err?.message}`,
      );
    }

    const projectRoot = path.join(this.workspaceRoot, projectDir);
    const modelConfig = await this.loadModelConfig(projectRoot);

    // Resolve sessionId up front for context interception + chat persistence.
    // May be null for a brand-new project — in that case context injection/validation
    // silently skip (matches the Anthropic/Codex pattern).
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
    const SessionManager = pi.SessionManager ?? pi.default?.SessionManager;

    if (typeof createAgentSession !== 'function') {
      throw new Error('pi-mono: createAgentSession export not found — check installed package version.');
    }

    const mcpBridge = await buildPiMcpBridge({ logger: this.logger, projectRoot });
    this.activeBridges.set(processId, mcpBridge);

    const beforeToolCall = createPiMonoPermissionHook({
      logger: this.logger,
      permissionService: this.permissionService,
      contextInterceptor: this.contextInterceptor,
      projectName: projectDir,
      sessionId: sessionId ?? undefined,
      requireAllPermissions: false,
      emit: (ev) => observer.next(ev),
    });

    // Post-tool filtering — strips disallowed files from tool results before the
    // model sees them. pi's `afterToolCall` hook may not exist in every version;
    // if pi ignores it the worst case is no post-filtering (pre-call validation
    // still blocks access, so this is best-effort).
    const afterToolCall = async (toolCall: { name: string; result: any }) => {
      if (!sessionId) return toolCall.result;
      try {
        return await this.contextInterceptor.filterToolResults(
          projectDir,
          sessionId,
          toolCall.name,
          toolCall.result,
        );
      } catch (err: any) {
        this.logger.warn(`pi-mono context filter failed for ${toolCall.name}: ${err?.message}`);
        return toolCall.result;
      }
    };

    const { session } = await createAgentSession({
      cwd: projectRoot,
      sessionManager: SessionManager?.inMemory ? SessionManager.inMemory() : undefined,
      model: modelConfig?.model,
      provider: modelConfig?.provider,
      baseUrl: modelConfig?.baseUrl,
      apiKey: modelConfig?.token,
      tools: mcpBridge.tools,
      beforeToolCall,
      afterToolCall,
    });

    this.activeSessions.set(processId, session);

    let assistantText = '';
    let usage: { input_tokens?: number; output_tokens?: number; total_cost_usd?: number } = {};

    const handler = (ev: PiEvent) => {
      try {
        if (ev.type === 'text_delta') assistantText += (ev as any).delta ?? '';
        const mapped = piEventToMessageEvents(ev, { processId });
        for (const m of mapped) {
          if (m.type === 'usage') usage = { ...usage, ...m.data };
          observer.next(m);
        }
        if (ev.type === 'agent_end') {
          observer.next({ type: 'completed', data: { usage } });
          observer.complete();
          this.activeSessions.delete(processId);
          this.closeBridge(processId);
          if (!skipChatPersistence) {
            this.persistChat(projectDir, projectRoot, prompt, assistantText, usage).catch((err: any) =>
              this.logger.error(`pi-mono chat persistence failed: ${err?.message}`),
            );
          }
        }
      } catch (err: any) {
        this.logger.error(`pi-mono event handler error: ${err?.message}`);
      }
    };

    const sub = session.subscribe?.(handler);
    if (sub && typeof sub.unsubscribe === 'function') {
      setUnsubscribe(() => sub.unsubscribe());
    }

    try {
      // Use the context-injected prompt, but persistChat still stores the original.
      await session.prompt(finalPrompt);
    } catch (err: any) {
      observer.error(err);
      this.activeSessions.delete(processId);
      this.closeBridge(processId);
    }
  }

  private async persistChat(
    projectDir: string,
    projectRoot: string,
    prompt: string,
    assistantText: string,
    usage: { input_tokens?: number; output_tokens?: number; total_cost_usd?: number },
  ): Promise<void> {
    const sessionId = await this.sessionsService.getMostRecentSessionId(projectRoot);
    if (!sessionId) {
      this.logger.debug(`pi-mono: no session found for ${projectRoot}, skipping persistence`);
      return;
    }
    const timestamp = new Date().toISOString();
    const costs =
      usage.input_tokens || usage.output_tokens
        ? { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0 }
        : undefined;
    await this.sessionsService.appendMessages(projectRoot, sessionId, [
      { timestamp, isAgent: false, message: prompt, costs: undefined },
      { timestamp, isAgent: true, message: assistantText || '', costs },
    ]);

    if (usage.input_tokens || usage.output_tokens) {
      try {
        await this.budgetMonitoringService.trackCosts(
          projectDir,
          usage.input_tokens ?? 0,
          usage.output_tokens ?? 0,
          sessionId,
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
    bridge.close().catch((err: any) =>
      this.logger.debug(`pi-mono bridge close failed: ${err?.message}`),
    );
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
