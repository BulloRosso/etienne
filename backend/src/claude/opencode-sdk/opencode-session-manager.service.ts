import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { OpenCodeConfig } from './opencode.config';
import { safeRoot } from '../utils/path.utils';

export interface OpenCodeSessionMetadata {
  sessionId: string;
  projectDir: string;
  createdAt: Date;
  lastActiveAt: Date;
  model?: string;
  turnCount: number;
  totalTokens: number;
}

/**
 * Session lifecycle manager for OpenCode.
 *
 * Mirrors the pattern of CodexSessionManagerService:
 * - In-memory cache of active sessions
 * - Filesystem persistence at `<project>/data/opencode-session.id`
 * - Separate from Anthropic's `session.id` and Codex's `codex-thread.id`
 */
@Injectable()
export class OpenCodeSessionManagerService {
  private readonly logger = new Logger(OpenCodeSessionManagerService.name);
  private readonly config = new OpenCodeConfig();

  private activeSessions = new Map<string, OpenCodeSessionMetadata>();

  /**
   * Register a new OpenCode session.
   */
  async createSession(
    projectDir: string,
    sessionId: string,
    model?: string,
  ): Promise<OpenCodeSessionMetadata> {
    const metadata: OpenCodeSessionMetadata = {
      sessionId,
      projectDir,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      model,
      turnCount: 1,
      totalTokens: 0,
    };

    this.activeSessions.set(sessionId, metadata);
    await this.persistSessionId(projectDir, sessionId);

    this.logger.log(`OpenCode session created: ${sessionId} for project: ${projectDir}`);
    return metadata;
  }

  /**
   * Get session metadata from cache.
   */
  getSession(sessionId: string): OpenCodeSessionMetadata | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update session activity timestamp.
   */
  async touchSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date();
      session.turnCount++;
    }
  }

  /**
   * Update token usage for a session.
   */
  updateTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.totalTokens += inputTokens + outputTokens;
    }
  }

  /**
   * Load existing session ID from filesystem (for resumption).
   * Uses `opencode-session.id` to avoid conflicts with other agents.
   */
  async loadSessionId(projectDir: string): Promise<string | undefined> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'opencode-session.id');

    try {
      const sessionId = (await fs.readFile(sessionPath, 'utf8')).trim();
      if (sessionId) {
        this.logger.debug(`Loaded existing OpenCode session: ${sessionId} for project: ${projectDir}`);
        return sessionId;
      }
    } catch {
      // No session file exists
    }
    return undefined;
  }

  /**
   * Persist session ID to filesystem.
   */
  private async persistSessionId(projectDir: string, sessionId: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dataDir = join(root, 'data');
    const sessionPath = join(dataDir, 'opencode-session.id');

    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(sessionPath, sessionId, 'utf8');
      this.logger.debug(`Persisted OpenCode session ID to: ${sessionPath}`);
    } catch (error: any) {
      this.logger.error(`Failed to persist OpenCode session ID: ${error.message}`);
    }
  }

  /**
   * Clear session for a project.
   */
  async clearSession(projectDir: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'opencode-session.id');

    try {
      const sessionId = await fs.readFile(sessionPath, 'utf8');
      this.activeSessions.delete(sessionId.trim());
      await fs.unlink(sessionPath);
      this.logger.log(`OpenCode session cleared for project: ${projectDir}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to clear OpenCode session: ${error.message}`);
      }
    }
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): OpenCodeSessionMetadata[] {
    return Array.from(this.activeSessions.values());
  }
}
