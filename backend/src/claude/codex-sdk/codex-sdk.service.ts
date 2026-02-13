import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CodexConfig } from './codex.config';
import { safeRoot } from '../utils/path.utils';

/** JSON-RPC notification from the Codex app-server */
export interface AppServerNotification {
  method: string;
  params: any;
}

/** JSON-RPC response from the Codex app-server */
interface AppServerResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/**
 * Simple async queue: push items from event callbacks, pull from async generator.
 * Used to bridge EventEmitter notifications → async iterator for the orchestrator.
 */
class AsyncQueue<T> {
  private queue: T[] = [];
  private waitResolve: ((value: IteratorResult<T>) => void) | null = null;
  private done = false;

  push(item: T): void {
    if (this.done) return;
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  finish(): void {
    this.done = true;
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve({ value: undefined as any, done: true });
    }
  }

  error(err: Error): void {
    this.done = true;
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      // Signal error via a special notification
      resolve({ value: { method: 'error', params: { message: err.message } } as any, done: false });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waitResolve = resolve;
        });
      },
    };
  }
}

@Injectable()
export class CodexSdkService implements OnModuleDestroy {
  private readonly logger = new Logger(CodexSdkService.name);
  private readonly config = new CodexConfig();

  // App-server child process
  private process: ChildProcess | null = null;
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  // JSON-RPC request tracking
  private requestId = 0;
  private readonly pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  // Notification stream
  private readonly notificationEmitter = new EventEmitter();
  private lineBuffer = '';

  // Stderr accumulator for diagnostics
  private stderrBuffer = '';

  /**
   * Ensure the app-server process is spawned, initialized, and authenticated.
   * Safe to call multiple times — only initializes once.
   */
  async ensureReady(apiKey?: string): Promise<void> {
    if (this.initialized && this.process && !this.process.killed) return;

    // If another call is already initializing, wait for it
    if (this.initializingPromise) {
      await this.initializingPromise;
      return;
    }

    this.initializingPromise = this.spawnAndInitialize(apiKey);
    try {
      await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  /**
   * Spawn the codex app-server process, perform handshake, and authenticate.
   */
  private async spawnAndInitialize(apiKey?: string): Promise<void> {
    const key = apiKey || this.config.openAiApiKey;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured. Set it in .env or project .etienne/ai-model.json');
    }

    const binaryPath = this.config.codexBinaryPath;
    this.logger.log(`Spawning codex app-server: ${binaryPath}`);

    this.process = spawn(binaryPath, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OPENAI_API_KEY: key },
      shell: true, // Required on Windows to resolve .cmd wrappers in node_modules/.bin
    });

    // Reset state
    this.lineBuffer = '';
    this.stderrBuffer = '';
    this.pendingRequests.clear();
    this.requestId = 0;

    // Handle stdout: JSONL lines
    this.process.stdout!.on('data', (chunk: Buffer) => this.handleStdoutData(chunk));

    // Capture stderr for diagnostics
    this.process.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.stderrBuffer += text;
      // Only log meaningful lines (skip empty / progress)
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('[')) {
          this.logger.debug(`[codex stderr] ${trimmed}`);
        }
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.logger.warn(`Codex app-server exited: code=${code}, signal=${signal}`);
      this.initialized = false;
      this.process = null;
      // Reject any pending requests
      for (const [id, pending] of this.pendingRequests.entries()) {
        pending.reject(new Error(`Codex app-server exited (code=${code})`));
        this.pendingRequests.delete(id);
      }
      // Signal notification listeners that the stream is over
      this.notificationEmitter.emit('exit', code);
    });

    this.process.on('error', (err) => {
      this.logger.error(`Codex app-server spawn error: ${err.message}`);
      this.initialized = false;
      this.process = null;
    });

    // Step 1: Initialize handshake
    const initResult = await this.sendRequest('initialize', {
      clientInfo: { name: 'claude-multitenant', title: 'Claude Multi-Tenant', version: '1.0.0' },
      capabilities: null,
    });
    this.logger.log(`Codex app-server initialized: ${JSON.stringify(initResult).substring(0, 200)}`);

    // Step 2: Send "initialized" client notification (no id, no response expected)
    this.sendNotification('initialized');

    // Step 3: Authenticate with API key
    const authResult = await this.sendRequest('account/login/start', {
      type: 'apiKey',
      apiKey: key,
    });
    this.logger.log(`Codex authenticated: ${JSON.stringify(authResult).substring(0, 200)}`);

    this.initialized = true;
    this.logger.log('Codex app-server ready');
  }

  /**
   * Parse JSONL lines from stdout and route to pending requests or notification emitter.
   */
  private handleStdoutData(chunk: Buffer): void {
    this.lineBuffer += chunk.toString();
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop()!; // keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);

        if ('id' in msg && !('method' in msg)) {
          // Response to a request we sent
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(`JSON-RPC error [${msg.error.code}]: ${msg.error.message}`));
            } else {
              pending.resolve(msg.result);
            }
          } else {
            this.logger.warn(`Received response for unknown request id: ${msg.id}`);
          }
        } else if ('method' in msg) {
          // Server notification
          this.notificationEmitter.emit('notification', msg as AppServerNotification);
        } else {
          this.logger.debug(`Unknown message from app-server: ${trimmed.substring(0, 200)}`);
        }
      } catch (parseErr: any) {
        this.logger.warn(`Failed to parse app-server line: ${parseErr.message} — line: ${trimmed.substring(0, 200)}`);
      }
    }
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  private sendRequest(method: string, params: any, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin || this.process.killed) {
        reject(new Error('Codex app-server process is not running'));
        return;
      }

      const id = ++this.requestId;
      const message = JSON.stringify({ method, id, params });

      this.pendingRequests.set(id, { resolve, reject });

      // Timeout to avoid hanging forever
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Clean up timer when resolved
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      const originalReject = this.pendingRequests.get(id)!.reject;
      this.pendingRequests.set(id, {
        resolve: (value) => { clearTimeout(timer); originalResolve(value); },
        reject: (err) => { clearTimeout(timer); originalReject(err); },
      });

      this.process.stdin.write(message + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          clearTimeout(timer);
          reject(new Error(`Failed to write to app-server stdin: ${err.message}`));
        }
      });
    });
  }

  /**
   * Send a JSON-RPC notification (no id, no response expected).
   */
  private sendNotification(method: string, params?: any): void {
    if (!this.process || !this.process.stdin || this.process.killed) {
      this.logger.warn(`Cannot send notification ${method}: process not running`);
      return;
    }

    const message = params !== undefined
      ? JSON.stringify({ method, params })
      : JSON.stringify({ method });

    this.process.stdin.write(message + '\n', (err) => {
      if (err) {
        this.logger.error(`Failed to write notification to app-server: ${err.message}`);
      }
    });
  }

  /**
   * Stream a conversation using the Codex app-server.
   * Yields AppServerNotification objects for the orchestrator to transform.
   *
   * Handles thread start/resume + turn/start internally,
   * then yields all notifications until turn/completed.
   */
  async *streamConversation(
    projectDir: string,
    prompt: string,
    options: {
      threadId?: string;
      processId?: string;
    } = {}
  ): AsyncGenerator<AppServerNotification> {
    const { threadId, processId } = options;

    // Load alternative AI model configuration
    const altModelConfig = await this.loadAlternativeModelConfig(projectDir);
    const apiKey = altModelConfig?.token || this.config.openAiApiKey;
    const model = altModelConfig?.model || this.config.defaultModel;

    await this.ensureReady(apiKey);

    const projectRoot = safeRoot(this.config.hostRoot, projectDir);

    this.logger.log(`Starting Codex app-server conversation: project=${projectDir}, cwd=${projectRoot}, thread=${threadId || 'new'}, model=${model}`);

    // Create async queue for notification streaming
    const queue = new AsyncQueue<AppServerNotification>();
    const notificationHandler = (msg: AppServerNotification) => queue.push(msg);
    const exitHandler = () => queue.finish();

    this.notificationEmitter.on('notification', notificationHandler);
    this.notificationEmitter.on('exit', exitHandler);

    try {
      // Start or resume thread
      let resolvedThreadId: string;
      if (threadId) {
        try {
          const resumeResult = await this.sendRequest('thread/resume', {
            threadId,
            model,
            cwd: projectRoot,
            sandbox: this.config.sandboxMode,
            approvalPolicy: 'never',
          });
          resolvedThreadId = resumeResult?.thread?.id || threadId;
          this.logger.log(`Resumed thread: ${resolvedThreadId}`);
        } catch (resumeError: any) {
          this.logger.warn(`Failed to resume thread ${threadId}: ${resumeError.message} — starting new thread`);
          const startResult = await this.sendRequest('thread/start', {
            model,
            cwd: projectRoot,
            sandbox: this.config.sandboxMode,
            approvalPolicy: 'never',
            experimentalRawEvents: false,
          });
          resolvedThreadId = startResult?.thread?.id || '';
          this.logger.log(`Started new thread (after resume failure): ${resolvedThreadId}`);
        }
      } else {
        const startResult = await this.sendRequest('thread/start', {
          model,
          cwd: projectRoot,
          sandbox: this.config.sandboxMode,
          approvalPolicy: 'never',
          experimentalRawEvents: false,
        });
        resolvedThreadId = startResult?.thread?.id || '';
        this.logger.log(`Started new thread: ${resolvedThreadId}`);
      }

      // Start turn
      const turnResult = await this.sendRequest('turn/start', {
        threadId: resolvedThreadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
        cwd: projectRoot,
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'dangerFullAccess' },
        model,
        effort: null,
        summary: 'detailed',
      });
      this.logger.log(`Turn started: ${JSON.stringify(turnResult).substring(0, 200)}`);

      // Yield notifications until turn/completed
      for await (const notification of queue) {
        yield notification;

        // Stop yielding after turn completes
        if (notification.method === 'turn/completed') {
          break;
        }
      }

      this.logger.log(`Codex conversation completed for project: ${projectDir}`);
    } finally {
      this.notificationEmitter.off('notification', notificationHandler);
      this.notificationEmitter.off('exit', exitHandler);
    }
  }

  /**
   * Interrupt a running turn (used for abort).
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    this.logger.log(`Interrupting turn: threadId=${threadId}, turnId=${turnId}`);
    try {
      await this.sendRequest('turn/interrupt', { threadId, turnId }, 5000);
    } catch (err: any) {
      this.logger.warn(`Failed to interrupt turn: ${err.message}`);
    }
  }

  /**
   * Load alternative AI model configuration from .etienne/ai-model.json
   */
  private async loadAlternativeModelConfig(projectDir: string): Promise<any | null> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const aiModelConfigPath = join(root, '.etienne', 'ai-model.json');

    try {
      const content = await fs.readFile(aiModelConfigPath, 'utf8');
      const config = JSON.parse(content);

      if (config.isActive && config.model && config.baseUrl && config.token) {
        this.logger.log(`Loaded alternative AI model config: ${config.model} @ ${config.baseUrl}`);
        return config;
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(`Failed to load alternative model config: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Gracefully shut down the app-server process.
   */
  onModuleDestroy(): void {
    if (this.process && !this.process.killed) {
      this.logger.log('Shutting down codex app-server process');
      this.process.kill('SIGTERM');
      this.process = null;
      this.initialized = false;
    }
  }
}
