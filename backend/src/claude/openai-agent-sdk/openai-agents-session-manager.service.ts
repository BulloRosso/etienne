import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { OpenAIAgentsConfig } from './openai-agents.config';
import { safeRoot } from '../utils/path.utils';

export interface OpenAIAgentsSessionMetadata {
  sessionId: string;
  projectDir: string;
  createdAt: Date;
  lastActiveAt: Date;
  model?: string;
  turnCount: number;
  totalTokens: number;
}

@Injectable()
export class OpenAIAgentsSessionManagerService {
  private readonly logger = new Logger(OpenAIAgentsSessionManagerService.name);
  private readonly config = new OpenAIAgentsConfig();

  // In-memory cache of active sessions
  private activeSessions = new Map<string, OpenAIAgentsSessionMetadata>();

  /**
   * Register a new session (called when the SDK run initializes)
   */
  async createSession(
    projectDir: string,
    sessionId: string,
    model?: string,
  ): Promise<OpenAIAgentsSessionMetadata> {
    const metadata: OpenAIAgentsSessionMetadata = {
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

    this.logger.log(
      `OpenAI Agents session created: ${sessionId} for project: ${projectDir}`,
    );
    return metadata;
  }

  /**
   * Get session metadata
   */
  getSession(sessionId: string): OpenAIAgentsSessionMetadata | undefined {
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
    }
  }

  /**
   * Update session token usage
   */
  updateTokenUsage(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.totalTokens += inputTokens + outputTokens;
    }
  }

  /**
   * Load existing session ID from filesystem (for resumption)
   */
  async loadSessionId(projectDir: string): Promise<string | undefined> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'openai-agents-session.id');

    try {
      const sessionId = (await fs.readFile(sessionPath, 'utf8')).trim();
      if (sessionId) {
        this.logger.debug(
          `Loaded existing OpenAI Agents session: ${sessionId} for project: ${projectDir}`,
        );
        return sessionId;
      }
    } catch {
      // No session file exists
    }
    return undefined;
  }

  /**
   * Persist session ID to filesystem
   */
  private async persistSessionId(
    projectDir: string,
    sessionId: string,
  ): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dataDir = join(root, 'data');
    const sessionPath = join(dataDir, 'openai-agents-session.id');

    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(sessionPath, sessionId, 'utf8');
      this.logger.debug(
        `Persisted OpenAI Agents session ID to: ${sessionPath}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to persist OpenAI Agents session ID: ${error.message}`,
      );
    }
  }

  /**
   * Clear session for a project
   */
  async clearSession(projectDir: string): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'openai-agents-session.id');

    try {
      const sessionId = await fs.readFile(sessionPath, 'utf8');
      this.activeSessions.delete(sessionId.trim());
      await fs.unlink(sessionPath);
      this.logger.log(
        `OpenAI Agents session cleared for project: ${projectDir}`,
      );
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(
          `Failed to clear OpenAI Agents session: ${error.message}`,
        );
      }
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): OpenAIAgentsSessionMetadata[] {
    return Array.from(this.activeSessions.values());
  }
}
