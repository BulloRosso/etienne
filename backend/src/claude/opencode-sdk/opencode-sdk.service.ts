import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OpenCodeConfig, ResolvedModel } from './opencode.config';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * NPM package used to wire a generic OpenAI-compatible provider into OpenCode.
 * DeepSeek (and similar) ride on this package — only `baseURL` + `apiKey` change.
 */
const OPENAI_COMPATIBLE_NPM = '@ai-sdk/openai-compatible';

/**
 * Map a provider name to the OpenCode/`ai` SDK plugin that should serve it.
 * For first-party providers (anthropic, openai, etc.) OpenCode resolves the
 * package automatically — we only need to inject a custom plugin for DeepSeek
 * or anything routed through the openai-compatible adapter.
 */
function npmForProvider(provider: string): string | undefined {
  const p = provider.toLowerCase();
  if (p === 'deepseek') return OPENAI_COMPATIBLE_NPM;
  if (p === 'openai-compatible') return OPENAI_COMPATIBLE_NPM;
  return undefined;
}

/**
 * Build the OpenCode SDK `Config` from a resolved per-project model config.
 *
 * `Config.provider[<id>] = { npm, options: { apiKey, baseURL }, models: { [model]: {} } }`
 * is the documented way to declare a provider for the OpenCode SDK so that
 * `provider/model` references resolve and credentials are forwarded.
 */
function buildSdkConfig(resolved: ResolvedModel): Record<string, any> {
  const providerEntry: Record<string, any> = {
    models: { [resolved.model]: {} },
    options: {
      ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {}),
      ...(resolved.baseUrl ? { baseURL: resolved.baseUrl } : {}),
    },
  };

  const npm = npmForProvider(resolved.provider);
  if (npm) providerEntry.npm = npm;

  return {
    model: `${resolved.provider}/${resolved.model}`,
    provider: { [resolved.provider]: providerEntry },
  };
}

/**
 * Single OpenCode SDK server + client pair, keyed by config signature.
 */
type SdkInstance = {
  server: any;
  client: any;
  resolved: ResolvedModel;
};

/**
 * Wraps the OpenCode TypeScript SDK (`@opencode-ai/sdk`).
 *
 * Per-project `<project>/.etienne/ai-model.json` is loaded by the orchestrator
 * and passed in via `getInstanceFor(resolved)`. We keep one server per distinct
 * config signature — different projects on the same provider/model share one
 * server, while a project that switches to DeepSeek gets its own.
 *
 * The SDK is ESM-only so we use dynamic import (same pattern as pi-mono).
 */
@Injectable()
export class OpenCodeSdkService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenCodeSdkService.name);
  private readonly config: OpenCodeConfig;

  private sdk: any = null;
  private readonly instances = new Map<string, SdkInstance>();
  private readonly initPromises = new Map<string, Promise<SdkInstance>>();

  constructor(private readonly secretsManager: SecretsManagerService) {
    this.config = new OpenCodeConfig(secretsManager);
  }

  getConfig(): OpenCodeConfig {
    return this.config;
  }

  /**
   * Get (or create) an SDK instance for a resolved project model config.
   * Instances are cached by `resolved.signature` so repeat calls are cheap.
   */
  async getInstanceFor(resolved: ResolvedModel): Promise<SdkInstance> {
    const cached = this.instances.get(resolved.signature);
    if (cached) return cached;

    const inflight = this.initPromises.get(resolved.signature);
    if (inflight) return inflight;

    const p = this._init(resolved);
    this.initPromises.set(resolved.signature, p);
    try {
      const inst = await p;
      this.instances.set(resolved.signature, inst);
      return inst;
    } finally {
      this.initPromises.delete(resolved.signature);
    }
  }

  private async _loadSdk(): Promise<void> {
    if (this.sdk) return;
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    this.sdk = await dynamicImport('@opencode-ai/sdk');
  }

  private async _init(resolved: ResolvedModel): Promise<SdkInstance> {
    try {
      await this.config.initSecrets();
      await this._loadSdk();

      const createServer = this.sdk.createOpencodeServer ?? this.sdk.default?.createOpencodeServer;
      const createClient = this.sdk.createOpencodeClient ?? this.sdk.default?.createOpencodeClient;
      const createOpencode = this.sdk.createOpencode ?? this.sdk.default?.createOpencode;

      const sdkConfig = buildSdkConfig(resolved);

      let server: any;
      let client: any;
      if (createOpencode) {
        const instance = await createOpencode({
          port: this.config.serverPort || undefined,
          config: sdkConfig,
        });
        server = instance.server ?? instance;
        client = instance.client ?? instance;
      } else if (createServer && createClient) {
        server = await createServer({
          port: this.config.serverPort || undefined,
          config: sdkConfig,
        });
        const serverUrl = server.url ?? `http://localhost:${server.port ?? this.config.serverPort}`;
        client = createClient(serverUrl);
      } else {
        throw new Error(
          'OpenCode SDK: createOpencode or createOpencodeServer/createOpencodeClient not found. ' +
          'Check installed package version.',
        );
      }

      this.logger.log(
        `OpenCode SDK initialised — provider=${resolved.provider} model=${resolved.model}` +
        (resolved.baseUrl ? ` baseURL=${resolved.baseUrl}` : ''),
      );
      return { server, client, resolved };
    } catch (err: any) {
      throw new Error(
        `OpenCode SDK init failed (provider=${resolved.provider}, model=${resolved.model}). ` +
        `Install: npm install @opencode-ai/sdk. Underlying: ${err?.message}`,
      );
    }
  }

  /** Build the per-call model override accepted by `client.session.prompt`. */
  static modelArg(resolved: ResolvedModel): { providerID: string; modelID: string } {
    return { providerID: resolved.provider, modelID: resolved.model };
  }

  /**
   * Unwrap a hey-api `{ data, error }` response or throw with details.
   */
  private unwrap<T>(result: any, label: string): T {
    if (result && 'data' in result && result.data !== undefined && !result.error) {
      return result.data as T;
    }
    if (result && result.error) {
      const msg = typeof result.error === 'string'
        ? result.error
        : (result.error?.data?.message ?? JSON.stringify(result.error));
      throw new Error(`OpenCode ${label} failed: ${msg}`);
    }
    return result as T;
  }

  /**
   * Create a new session scoped to a project directory, on the right SDK instance.
   * The hey-api generated client returns `{ data: Session, error, response }`.
   */
  async createSession(projectRoot: string, resolved: ResolvedModel): Promise<string> {
    const inst = await this.getInstanceFor(resolved);
    const result = await inst.client.session.create({ query: { directory: projectRoot } });
    const session = this.unwrap<{ id: string }>(result, 'session.create');
    if (!session?.id) {
      throw new Error(`OpenCode session.create returned no id: ${JSON.stringify(session)}`);
    }
    return session.id;
  }

  /**
   * List existing sessions and find one for this directory, or create a new one.
   */
  async getOrCreateSession(
    projectRoot: string,
    resolved: ResolvedModel,
    existingId?: string,
  ): Promise<string> {
    const inst = await this.getInstanceFor(resolved);
    if (existingId) {
      try {
        const result = await inst.client.session.get({
          path: { id: existingId },
          query: { directory: projectRoot },
        });
        const session = this.unwrap<{ id: string } | undefined>(result, 'session.get');
        if (session?.id) return existingId;
      } catch {
        this.logger.debug(`OpenCode session ${existingId} not found, creating new`);
      }
    }
    return this.createSession(projectRoot, resolved);
  }

  /**
   * Send a prompt to a session, forcing the resolved provider/model.
   *
   * Uses `session.promptAsync` so the call returns immediately — the model's
   * output streams over the SSE event channel. The non-async `session.prompt`
   * blocks until the full assistant message is generated, which would freeze
   * the orchestrator's event loop.
   */
  async sendPrompt(
    sessionId: string,
    prompt: string,
    resolved: ResolvedModel,
    projectRoot?: string,
    system?: string,
    agent?: string,
  ): Promise<any> {
    const inst = await this.getInstanceFor(resolved);
    const opts = {
      path: { id: sessionId },
      query: projectRoot ? { directory: projectRoot } : undefined,
      body: {
        model: OpenCodeSdkService.modelArg(resolved),
        ...(agent ? { agent } : {}),
        ...(system ? { system } : {}),
        parts: [{ type: 'text', text: prompt }],
      },
    };
    if (inst.client.session.promptAsync) {
      return inst.client.session.promptAsync(opts);
    }
    return inst.client.session.prompt(opts);
  }

  /**
   * Subscribe to the SSE event stream for a project.
   * The SDK's `event.subscribe` returns `{ stream: AsyncGenerator }` —
   * we return the generator directly so callers can `for await` it.
   */
  async subscribeEvents(
    projectRoot: string,
    resolved: ResolvedModel,
  ): Promise<AsyncIterable<any>> {
    const inst = await this.getInstanceFor(resolved);
    const result = await inst.client.event.subscribe({ query: { directory: projectRoot } });
    if (!result?.stream) {
      throw new Error(`OpenCode event.subscribe returned no stream: ${JSON.stringify(result)}`);
    }
    return result.stream as AsyncIterable<any>;
  }

  /**
   * Reply to a permission request (tool approval).
   * The endpoint is `POST /session/{id}/permissions/{permissionID}` — needs
   * both the session id and the permission id.
   */
  async replyPermission(
    sessionId: string,
    permissionId: string,
    reply: 'once' | 'always' | 'reject',
    resolved: ResolvedModel,
    projectRoot?: string,
  ): Promise<void> {
    const inst = await this.getInstanceFor(resolved);
    await inst.client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      query: projectRoot ? { directory: projectRoot } : undefined,
      body: { response: reply },
    });
  }

  /**
   * Manually compact a session: OpenCode summarizes the conversation with the
   * given model and continues from the summary (equivalent of /compact).
   * Completion is signalled by a `session.compacted` event on the stream.
   */
  async summarizeSession(
    sessionId: string,
    resolved: ResolvedModel,
    projectRoot?: string,
  ): Promise<void> {
    const inst = await this.getInstanceFor(resolved);
    const result = await inst.client.session.summarize({
      path: { id: sessionId },
      query: projectRoot ? { directory: projectRoot } : undefined,
      body: OpenCodeSdkService.modelArg(resolved),
    });
    this.unwrap(result, 'session.summarize');
  }

  /**
   * The OpenCode v1 API has no question/elicitation endpoint — AskUserQuestion
   * parity is not possible on this SDK generation (the v2 client adds
   * `question.asked` events). These no-op stubs keep the handlers compiling
   * until a future v2 migration wires them up.
   */
  async replyQuestion(_requestId: string, _answers: string[], _resolved: ResolvedModel): Promise<void> {
    this.logger.debug('replyQuestion: not supported by current OpenCode SDK — ignoring');
  }

  async rejectQuestion(_requestId: string, _resolved: ResolvedModel): Promise<void> {
    this.logger.debug('rejectQuestion: not supported by current OpenCode SDK — ignoring');
  }

  async abortSession(sessionId: string, resolved: ResolvedModel, projectRoot?: string): Promise<void> {
    const inst = await this.getInstanceFor(resolved);
    try {
      await inst.client.session.abort({
        path: { id: sessionId },
        query: projectRoot ? { directory: projectRoot } : undefined,
      });
    } catch (err: any) {
      this.logger.debug(`OpenCode abort failed (may have already completed): ${err?.message}`);
    }
  }

  async deleteSession(sessionId: string, resolved: ResolvedModel, projectRoot?: string): Promise<void> {
    const inst = await this.getInstanceFor(resolved);
    try {
      await inst.client.session.delete({
        path: { id: sessionId },
        query: projectRoot ? { directory: projectRoot } : undefined,
      });
    } catch (err: any) {
      this.logger.debug(`OpenCode session delete failed: ${err?.message}`);
    }
  }

  async findFiles(query: string, resolved: ResolvedModel, projectRoot?: string): Promise<any[]> {
    const inst = await this.getInstanceFor(resolved);
    if (!inst.client.find?.files) return [];
    const result = await inst.client.find.files({
      query: { query, ...(projectRoot ? { directory: projectRoot } : {}) },
    });
    return this.unwrap<any[]>(result, 'find.files') ?? [];
  }

  async findText(pattern: string, resolved: ResolvedModel, projectRoot?: string): Promise<any[]> {
    const inst = await this.getInstanceFor(resolved);
    if (!inst.client.find?.text) return [];
    const result = await inst.client.find.text({
      query: { pattern, ...(projectRoot ? { directory: projectRoot } : {}) },
    });
    return this.unwrap<any[]>(result, 'find.text') ?? [];
  }

  /**
   * Get the raw SDK client for the given resolved config.
   */
  async getClient(resolved: ResolvedModel): Promise<any> {
    const inst = await this.getInstanceFor(resolved);
    return inst.client;
  }

  async onModuleDestroy(): Promise<void> {
    for (const [sig, inst] of this.instances) {
      if (inst.server?.close) {
        try {
          await inst.server.close();
          this.logger.log(`OpenCode server closed (${sig})`);
        } catch (err: any) {
          this.logger.debug(`OpenCode server close failed (${sig}): ${err?.message}`);
        }
      }
    }
    this.instances.clear();
    this.initPromises.clear();
    this.sdk = null;
  }
}
