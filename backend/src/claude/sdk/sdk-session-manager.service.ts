import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';

export interface SdkSessionMetadata {
  sessionId: string;
  projectDir: string;
  createdAt: Date;
  lastActiveAt: Date;
  model?: string;
  turnCount: number;
  totalTokens: number;
}

@Injectable()
export class SdkSessionManagerService {
  private readonly logger = new Logger(SdkSessionManagerService.name);
  private readonly config = new ClaudeConfig();

  // In-memory cache of active sessions
  private activeSessions = new Map<string, SdkSessionMetadata>();

  /**
   * Register a new session (called when SDK returns session ID)
   */
  async createSession(
    projectDir: string,
    sessionId: string,
    model?: string
  ): Promise<SdkSessionMetadata> {
    const metadata: SdkSessionMetadata = {
      sessionId,
      projectDir,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      model,
      turnCount: 1,
      totalTokens: 0
    };

    // Store in memory
    this.activeSessions.set(sessionId, metadata);

    // Persist to filesystem (for compatibility with existing system)
    await this.persistSessionId(projectDir, sessionId);

    this.logger.log(`Session created: ${sessionId} for project: ${projectDir}`);
    return metadata;
  }

  /**
   * Get session metadata
   */
  getSession(sessionId: string): SdkSessionMetadata | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update session activity timestamp
   */
  async touchSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date();
      session.turnCount++;
      this.logger.debug(`Session touched: ${sessionId}, turn: ${session.turnCount}`);
    }
  }

  /**
   * Update session token usage
   */
  updateTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.totalTokens += inputTokens + outputTokens;
      this.logger.debug(`Session ${sessionId} tokens: ${session.totalTokens}`);
    }
  }

  /**
   * Load existing session ID from filesystem (for resumption)
   */
  async loadSessionId(projectDir: string): Promise<string | undefined> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'session.id');

    try {
      const sessionId = (await fs.readFile(sessionPath, 'utf8')).trim();
      if (sessionId) {
        this.logger.debug(`Loaded existing session: ${sessionId} for project: ${projectDir}`);
        return sessionId;
      }
    } catch {
      // No session file exists
    }
    return undefined;
  }

  /**
   * Persist session ID to filesystem (for compatibility)
   */
  private async persistSessionId(projectDir: string, sessionId: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dataDir = join(root, 'data');
    const sessionPath = join(dataDir, 'session.id');

    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(sessionPath, sessionId, 'utf8');
      this.logger.debug(`Persisted session ID to: ${sessionPath}`);
    } catch (error: any) {
      this.logger.error(`Failed to persist session ID: ${error.message}`);
    }
  }

  /**
   * Clear session for a project (useful for reset)
   */
  async clearSession(projectDir: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'session.id');

    try {
      const sessionId = await fs.readFile(sessionPath, 'utf8');
      this.activeSessions.delete(sessionId.trim());
      await fs.unlink(sessionPath);
      this.logger.log(`Session cleared for project: ${projectDir}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to clear session: ${error.message}`);
      }
    }
  }

  /**
   * Clean up idle sessions (called periodically)
   */
  cleanupIdleSessions(idleTimeoutMs: number = 1800000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, metadata] of this.activeSessions.entries()) {
      const idleTime = now - metadata.lastActiveAt.getTime();
      if (idleTime > idleTimeoutMs) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
        this.logger.log(`Cleaned up idle session: ${sessionId} (idle for ${Math.round(idleTime / 60000)}m)`);
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} idle sessions`);
    }

    return cleanedCount;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SdkSessionMetadata[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.activeSessions.size;
  }
}
