import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CodexConfig } from './codex.config';
import { safeRoot } from '../utils/path.utils';

export interface CodexSessionMetadata {
  threadId: string;
  projectDir: string;
  createdAt: Date;
  lastActiveAt: Date;
  model?: string;
  turnCount: number;
  totalTokens: number;
}

@Injectable()
export class CodexSessionManagerService {
  private readonly logger = new Logger(CodexSessionManagerService.name);
  private readonly config = new CodexConfig();

  // In-memory cache of active threads
  private activeThreads = new Map<string, CodexSessionMetadata>();

  /**
   * Register a new Codex thread (called when thread.started event is received)
   */
  async createSession(
    projectDir: string,
    threadId: string,
    model?: string
  ): Promise<CodexSessionMetadata> {
    const metadata: CodexSessionMetadata = {
      threadId,
      projectDir,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      model,
      turnCount: 1,
      totalTokens: 0
    };

    this.activeThreads.set(threadId, metadata);
    await this.persistThreadId(projectDir, threadId);

    this.logger.log(`Codex thread created: ${threadId} for project: ${projectDir}`);
    return metadata;
  }

  /**
   * Get thread metadata
   */
  getSession(threadId: string): CodexSessionMetadata | undefined {
    return this.activeThreads.get(threadId);
  }

  /**
   * Update thread activity timestamp
   */
  async touchSession(threadId: string): Promise<void> {
    const session = this.activeThreads.get(threadId);
    if (session) {
      session.lastActiveAt = new Date();
      session.turnCount++;
    }
  }

  /**
   * Update thread token usage
   */
  updateTokenUsage(threadId: string, inputTokens: number, outputTokens: number): void {
    const session = this.activeThreads.get(threadId);
    if (session) {
      session.totalTokens += inputTokens + outputTokens;
    }
  }

  /**
   * Load existing thread ID from filesystem (for resumption)
   * Uses a separate file (codex-thread.id) to avoid conflicts with Anthropic's session.id
   */
  async loadThreadId(projectDir: string): Promise<string | undefined> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const threadPath = join(root, 'data', 'codex-thread.id');

    try {
      const threadId = (await fs.readFile(threadPath, 'utf8')).trim();
      if (threadId) {
        this.logger.debug(`Loaded existing Codex thread: ${threadId} for project: ${projectDir}`);
        return threadId;
      }
    } catch {
      // No thread file exists
    }
    return undefined;
  }

  /**
   * Persist thread ID to filesystem
   */
  private async persistThreadId(projectDir: string, threadId: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dataDir = join(root, 'data');
    const threadPath = join(dataDir, 'codex-thread.id');

    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(threadPath, threadId, 'utf8');
      this.logger.debug(`Persisted Codex thread ID to: ${threadPath}`);
    } catch (error: any) {
      this.logger.error(`Failed to persist Codex thread ID: ${error.message}`);
    }
  }

  /**
   * Clear thread for a project
   */
  async clearSession(projectDir: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const threadPath = join(root, 'data', 'codex-thread.id');

    try {
      const threadId = await fs.readFile(threadPath, 'utf8');
      this.activeThreads.delete(threadId.trim());
      await fs.unlink(threadPath);
      this.logger.log(`Codex thread cleared for project: ${projectDir}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to clear Codex thread: ${error.message}`);
      }
    }
  }

  /**
   * Get all active threads
   */
  getActiveSessions(): CodexSessionMetadata[] {
    return Array.from(this.activeThreads.values());
  }
}
