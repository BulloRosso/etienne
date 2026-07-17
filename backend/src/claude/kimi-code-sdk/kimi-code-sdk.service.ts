import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { join } from 'path';
import { KimiCodeConfig, ResolvedKimiModel } from './kimi-code.config';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * Thin lifecycle wrapper around the Kimi Agent SDK (@moonshot-ai/kimi-agent-sdk).
 *
 * The SDK is in-process but spawns the Kimi CLI (a Python tool installed
 * separately) as its execution engine — one CLI process per live session.
 * We keep one long-lived session per project, reused across turns while
 * `state === 'idle'`, and recreate it when the resolved model config changes
 * or the CLI process died (`state === 'closed'`).
 *
 * Auth: the CLI documents `KIMI_API_KEY`; etienne's env var is MOONSHOT_API_KEY.
 * We forward the resolved key as both, so either name the CLI honors works.
 */
@Injectable()
export class KimiCodeSdkService implements OnModuleDestroy {
  private readonly logger = new Logger(KimiCodeSdkService.name);
  private readonly config: KimiCodeConfig;

  private sdk: any;
  private readonly liveSessions = new Map<string, { session: any; sessionId: string; signature: string }>();

  constructor(private readonly secretsManager: SecretsManagerService) {
    this.config = new KimiCodeConfig(secretsManager);
  }

  async onModuleInit() {
    await this.config.initSecrets();
  }

  getConfig(): KimiCodeConfig {
    return this.config;
  }

  private async loadSdk(): Promise<any> {
    if (!this.sdk) {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      this.sdk = await dynamicImport('@moonshot-ai/kimi-agent-sdk');
    }
    return this.sdk;
  }

  /** Env forwarded into the spawned Kimi CLI process. */
  private buildSessionEnv(resolved: ResolvedKimiModel): Record<string, string> {
    return {
      ...(resolved.apiKey ? { KIMI_API_KEY: resolved.apiKey, MOONSHOT_API_KEY: resolved.apiKey } : {}),
      ...(resolved.baseUrl ? { KIMI_BASE_URL: resolved.baseUrl } : {}),
      ...(resolved.model ? { KIMI_MODEL_NAME: resolved.model } : {}),
    };
  }

  /**
   * Get the cached live session for a project, or create/resume one.
   *
   * - `existingSessionId` (from `data/kimi-session.id`) resumes the on-disk
   *   session state; the SDK auto-generates an id when omitted.
   * - `shareDir` is pinned to `<projectRoot>/.kimi` so config.toml / mcp.json /
   *   session storage are per-project and never touch the user's global ~/.kimi.
   * - `skillsDir` points at the project's `.claude/skills` — Kimi consumes the
   *   same skill layout, so no copy provisioning is needed.
   * - `yoloMode: true` always (permission bridging intentionally not wired).
   */
  async getOrCreateSession(
    projectDir: string,
    projectRoot: string,
    resolved: ResolvedKimiModel,
    existingSessionId?: string,
  ): Promise<{ session: any; sessionId: string; resumed: boolean }> {
    const cached = this.liveSessions.get(projectDir);
    if (cached && cached.signature === resolved.signature && cached.session?.state !== 'closed') {
      return { session: cached.session, sessionId: cached.sessionId, resumed: true };
    }

    if (cached) {
      // Config changed or CLI died — dispose of the stale session first.
      await this.closeSession(projectDir);
    }

    const sdk = await this.loadSdk();
    const session = sdk.createSession({
      workDir: projectRoot,
      sessionId: existingSessionId,
      model: resolved.model,
      thinking: resolved.thinking,
      yoloMode: true,
      executable: this.config.kimiBinaryPath,
      env: this.buildSessionEnv(resolved),
      skillsDir: join(projectRoot, '.claude', 'skills'),
      shareDir: join(projectRoot, '.kimi'),
    });

    const sessionId: string = session.sessionId;
    this.liveSessions.set(projectDir, { session, sessionId, signature: resolved.signature });
    this.logger.log(
      `Kimi session ${existingSessionId ? 'resumed' : 'created'}: ${sessionId} for project root: ${projectRoot}` +
      (resolved.model ? ` model=${resolved.model}` : ' model=(CLI default)'),
    );
    return { session, sessionId, resumed: Boolean(existingSessionId) };
  }

  /** Toggle Kimi's native plan mode on the project's live session. */
  async setPlanMode(projectDir: string, enabled: boolean): Promise<void> {
    const cached = this.liveSessions.get(projectDir);
    if (!cached) return;
    try {
      if (cached.session.planMode !== enabled) {
        await cached.session.setPlanMode(enabled);
      }
    } catch (err: any) {
      this.logger.warn(`Kimi setPlanMode(${enabled}) failed: ${err?.message} — continuing in current mode`);
    }
  }

  /** Close and forget the live session for a project (config change / clearSession). */
  async closeSession(projectDir: string): Promise<void> {
    const cached = this.liveSessions.get(projectDir);
    if (!cached) return;
    this.liveSessions.delete(projectDir);
    try {
      await cached.session.close();
    } catch (err: any) {
      this.logger.warn(`Kimi session close failed: ${err?.message}`);
    }
  }

  /** Best-effort removal of Kimi's on-disk session state. */
  async deleteStoredSession(projectRoot: string, sessionId: string): Promise<void> {
    try {
      const sdk = await this.loadSdk();
      await sdk.deleteSession(projectRoot, sessionId);
    } catch (err: any) {
      this.logger.warn(`Kimi deleteSession failed: ${err?.message}`);
    }
  }

  /** Error-code helper for actionable error messages (CLI_NOT_FOUND etc.). */
  getErrorCode(err: unknown): string | undefined {
    try {
      return this.sdk?.isAgentSdkError?.(err) ? this.sdk.getErrorCode(err) : undefined;
    } catch {
      return undefined;
    }
  }

  async onModuleDestroy() {
    for (const projectDir of Array.from(this.liveSessions.keys())) {
      await this.closeSession(projectDir);
    }
  }
}
