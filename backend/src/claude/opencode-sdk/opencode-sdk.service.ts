import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OpenCodeConfig } from './opencode.config';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

/**
 * Core service wrapping the OpenCode TypeScript SDK (`@opencode-ai/sdk`).
 *
 * Manages the lifecycle of the OpenCode background server and provides
 * typed methods for session management, prompt execution, SSE event
 * streaming, and permission/question replies.
 *
 * The SDK is ESM-only so we use dynamic import (same pattern as pi-mono).
 */
@Injectable()
export class OpenCodeSdkService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenCodeSdkService.name);
  private readonly config: OpenCodeConfig;

  private sdk: any = null;
  private server: any = null;
  private client: any = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly secretsManager: SecretsManagerService) {
    this.config = new OpenCodeConfig(secretsManager);
  }

  /**
   * Ensure the SDK is loaded and the OpenCode server is running.
   * Lazy-initialised on first call; subsequent calls await the same promise.
   */
  async ensureReady(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init();
    await this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      await this.config.initSecrets();

      // Dynamic import for ESM-only SDK
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      this.sdk = await dynamicImport('@opencode-ai/sdk');

      const createServer = this.sdk.createOpencodeServer ?? this.sdk.default?.createOpencodeServer;
      const createClient = this.sdk.createOpencodeClient ?? this.sdk.default?.createOpencodeClient;
      const createOpencode = this.sdk.createOpencode ?? this.sdk.default?.createOpencode;

      if (createOpencode) {
        // Preferred: single call that starts server + returns client
        const instance = await createOpencode({
          port: this.config.serverPort || undefined,
        });
        this.server = instance.server ?? instance;
        this.client = instance.client ?? instance;
      } else if (createServer && createClient) {
        // Fallback: start server then create client
        this.server = await createServer({
          port: this.config.serverPort || undefined,
        });
        const serverUrl = this.server.url ?? `http://localhost:${this.server.port ?? this.config.serverPort}`;
        this.client = createClient(serverUrl);
      } else {
        throw new Error(
          'OpenCode SDK: createOpencode or createOpencodeServer/createOpencodeClient not found. ' +
          'Check installed package version.',
        );
      }

      this.ready = true;
      this.logger.log('OpenCode SDK initialised successfully');
    } catch (err: any) {
      this.initPromise = null;
      throw new Error(
        `OpenCode SDK init failed. Install: npm install @opencode-ai/sdk. ` +
        `Underlying: ${err?.message}`,
      );
    }
  }

  /**
   * Create a new session scoped to a project directory.
   */
  async createSession(projectRoot: string): Promise<string> {
    await this.ensureReady();
    const session = await this.client.session.create({ directory: projectRoot });
    return session.id ?? session.sessionId ?? session;
  }

  /**
   * List existing sessions and find one for this directory, or create a new one.
   */
  async getOrCreateSession(projectRoot: string, existingId?: string): Promise<string> {
    await this.ensureReady();

    // Try to resume an existing session
    if (existingId) {
      try {
        const session = await this.client.session.get(existingId);
        if (session) return existingId;
      } catch {
        this.logger.debug(`OpenCode session ${existingId} not found, creating new`);
      }
    }

    return this.createSession(projectRoot);
  }

  /**
   * Send a prompt to a session. Returns immediately; real-time events
   * come via the SSE event stream.
   */
  async sendPrompt(
    sessionId: string,
    prompt: string,
  ): Promise<any> {
    await this.ensureReady();
    return this.client.session.prompt({
      sessionId,
      parts: [{ type: 'text', text: prompt }],
    });
  }

  /**
   * Subscribe to the global SSE event stream.
   * Returns an async iterable of events that must be filtered by sessionId.
   */
  async subscribeEvents(projectRoot: string): Promise<AsyncIterable<any>> {
    await this.ensureReady();
    return this.client.event.subscribe({ directory: projectRoot });
  }

  /**
   * Reply to a permission request (tool approval).
   */
  async replyPermission(
    requestId: string,
    reply: 'once' | 'always' | 'reject',
  ): Promise<void> {
    await this.ensureReady();
    await this.client.permission.reply(requestId, reply);
  }

  /**
   * Reply to a question (elicitation).
   */
  async replyQuestion(requestId: string, answers: string[]): Promise<void> {
    await this.ensureReady();
    await this.client.question.reply(requestId, answers);
  }

  /**
   * Reject a question (dismiss elicitation).
   */
  async rejectQuestion(requestId: string): Promise<void> {
    await this.ensureReady();
    await this.client.question.reject(requestId);
  }

  /**
   * Abort a running session.
   */
  async abortSession(sessionId: string): Promise<void> {
    await this.ensureReady();
    try {
      await this.client.session.abort(sessionId);
    } catch (err: any) {
      this.logger.debug(`OpenCode abort failed (may have already completed): ${err?.message}`);
    }
  }

  /**
   * Delete a session from the server.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureReady();
    try {
      await this.client.session.delete(sessionId);
    } catch (err: any) {
      this.logger.debug(`OpenCode session delete failed: ${err?.message}`);
    }
  }

  /**
   * File search capabilities exposed by the SDK.
   */
  async findFiles(query: string, options?: { type?: string; limit?: number }): Promise<any[]> {
    await this.ensureReady();
    if (this.client.find?.files) {
      return this.client.find.files(query, options);
    }
    return [];
  }

  async findText(pattern: string, options?: { files?: string; limit?: number }): Promise<any[]> {
    await this.ensureReady();
    if (this.client.find?.text) {
      return this.client.find.text(pattern, options);
    }
    return [];
  }

  /**
   * Get the raw SDK client for advanced operations.
   */
  getClient(): any {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.server?.close) {
      try {
        await this.server.close();
        this.logger.log('OpenCode server closed');
      } catch (err: any) {
        this.logger.debug(`OpenCode server close failed: ${err?.message}`);
      }
    }
    this.ready = false;
    this.initPromise = null;
    this.client = null;
    this.server = null;
    this.sdk = null;
  }
}
