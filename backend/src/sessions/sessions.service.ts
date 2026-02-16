import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';

export interface ChatMessage {
  timestamp: string;
  isAgent: boolean;
  message: string;
  costs?: any;
  reasoningSteps?: any[];
  contextName?: string;
  // Source tracking for remote sessions, scheduled tasks, etc.
  source?: 'web' | 'remote' | 'scheduled' | 'automated';
  sourceMetadata?: {
    provider?: string;    // 'telegram', 'teams', etc. (for remote sessions)
    username?: string;    // Display name from provider
    firstName?: string;
    taskId?: string;      // For scheduled tasks
  };
}

export interface SessionMetadata {
  timestamp: string;
  sessionId: string;
  summary?: string;
  activeContextId?: string | null;
}

export interface SessionsData {
  sessions: SessionMetadata[];
}

@Injectable()
export class SessionsService {
  /** Per-project write locks to prevent concurrent read-modify-write corruption */
  private writeLocks = new Map<string, Promise<void>>();

  /**
   * Serialize write operations per project to prevent race conditions.
   * Multiple concurrent callers will queue up and execute sequentially.
   */
  private async withLock<T>(projectRoot: string, fn: () => Promise<T>): Promise<T> {
    const key = projectRoot;
    const previous = this.writeLocks.get(key) ?? Promise.resolve();

    let resolve!: () => void;
    const next = new Promise<void>(r => { resolve = r; });
    this.writeLocks.set(key, next);

    try {
      await previous;
      return await fn();
    } finally {
      resolve();
    }
  }

  private getEtienneDir(projectRoot: string): string {
    return join(projectRoot, '.etienne');
  }

  private getSessionsFilePath(projectRoot: string): string {
    return join(this.getEtienneDir(projectRoot), 'chat.sessions.json');
  }

  private getSessionHistoryPath(projectRoot: string, sessionId: string): string {
    return join(this.getEtienneDir(projectRoot), `chat.history-${sessionId}.jsonl`);
  }

  /**
   * Load all session metadata
   */
  async loadSessions(projectRoot: string): Promise<SessionsData> {
    try {
      const content = await fs.readFile(this.getSessionsFilePath(projectRoot), 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      console.log(`[SessionsService] No sessions file found, returning empty: ${error.message}`);
      return { sessions: [] };
    }
  }

  /**
   * Save session metadata
   */
  async saveSessions(projectRoot: string, data: SessionsData): Promise<void> {
    const dir = this.getEtienneDir(projectRoot);
    await fs.mkdir(dir, { recursive: true });
    const filePath = this.getSessionsFilePath(projectRoot);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  /**
   * Update or create session metadata (updates timestamp)
   */
  async updateSessionMetadata(projectRoot: string, sessionId: string): Promise<void> {
    return this.withLock(projectRoot, async () => {
      const data = await this.loadSessions(projectRoot);
      const existingIndex = data.sessions.findIndex(s => s.sessionId === sessionId);

      if (existingIndex >= 0) {
        // Update existing session timestamp
        data.sessions[existingIndex].timestamp = new Date().toISOString();
      } else {
        // Create new session entry
        data.sessions.push({
          timestamp: new Date().toISOString(),
          sessionId,
          summary: undefined, // Will be generated on demand
        });
      }

      await this.saveSessions(projectRoot, data);
    });
  }

  /**
   * Load messages for a specific session
   */
  async loadSessionHistory(projectRoot: string, sessionId: string): Promise<ChatMessage[]> {
    try {
      const historyPath = this.getSessionHistoryPath(projectRoot, sessionId);
      const content = await fs.readFile(historyPath, 'utf8');

      // Parse JSONL format (each line is a JSON object)
      const lines = content.trim().split('\n').filter(line => line.trim());
      return lines.map(line => JSON.parse(line));
    } catch (error: any) {
      console.log(`[SessionsService] No history found for session ${sessionId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Append messages to a session history file (JSONL format)
   */
  async appendMessages(projectRoot: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
    const dir = this.getEtienneDir(projectRoot);
    await fs.mkdir(dir, { recursive: true });

    const historyPath = this.getSessionHistoryPath(projectRoot, sessionId);

    // Convert messages to JSONL format (one JSON object per line)
    const jsonlContent = messages.map(msg => JSON.stringify(msg)).join('\n') + '\n';

    // Append to file
    await fs.appendFile(historyPath, jsonlContent, 'utf8');

    // Update session metadata with current timestamp
    await this.updateSessionMetadata(projectRoot, sessionId);
  }

  /**
   * Generate summary for a session using GPT
   */
  async generateSummary(projectRoot: string, sessionId: string): Promise<string> {
    try {
      const messages = await this.loadSessionHistory(projectRoot, sessionId);

      if (messages.length === 0) {
        return 'Empty session with no messages.';
      }

      // Format messages for summarization
      const sessionContent = messages.map(msg => {
        const role = msg.isAgent ? 'agent' : 'user';
        return `${role}: ${msg.message}`;
      }).join('\n\n');

      // Call OpenAI GPT-4o-mini for summarization
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        console.error('[SessionsService] OPENAI_API_KEY not set, cannot generate summary');
        return 'Summary generation unavailable (API key not configured).';
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `Summarize this chat session in maximum 3 bullet points. Each bullet point must have no more than 10 words. The user is the user, the other part is called the agent. Session messages:\n\n${sessionContent}`
            }
          ],
          temperature: 0.3,
          max_tokens: 100
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const summary = response.data.choices[0]?.message?.content?.trim() || 'Unable to generate summary.';
      return summary;
    } catch (error: any) {
      console.error(`[SessionsService] Error generating summary: ${error.message}`);
      return 'Error generating summary.';
    }
  }

  /**
   * Get all sessions with summaries (generates missing summaries)
   */
  async getSessionsWithSummaries(projectRoot: string): Promise<SessionsData> {
    return this.withLock(projectRoot, async () => {
      const data = await this.loadSessions(projectRoot);

      // Generate missing summaries
      for (const session of data.sessions) {
        if (!session.summary) {
          console.log(`[SessionsService] Generating summary for session ${session.sessionId}`);
          session.summary = await this.generateSummary(projectRoot, session.sessionId);
        }
      }

      // Save updated sessions with new summaries
      await this.saveSessions(projectRoot, data);

      return data;
    });
  }

  /**
   * Get the most recent session ID
   */
  async getMostRecentSessionId(projectRoot: string): Promise<string | null> {
    try {
      const data = await this.loadSessions(projectRoot);
      if (data.sessions.length === 0) return null;

      // Sort by timestamp descending and return the most recent
      const sorted = data.sessions.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return sorted[0].sessionId;
    } catch (error: any) {
      console.log(`[SessionsService] Could not get most recent session: ${error.message}`);
      return null;
    }
  }

  /**
   * Load history for the current/latest session (for backward compatibility)
   */
  async loadHistory(projectRoot: string, sessionId?: string): Promise<{ messages: ChatMessage[] }> {
    // If sessionId provided, load that specific session
    if (sessionId) {
      const messages = await this.loadSessionHistory(projectRoot, sessionId);
      return { messages };
    }

    // Otherwise, try to load from the old chat.history.json format (backward compatibility)
    const oldHistoryPath = join(projectRoot, '.etienne', 'chat.history.json');
    try {
      const content = await fs.readFile(oldHistoryPath, 'utf8');
      const parsed = JSON.parse(content);
      return parsed;
    } catch (error: any) {
      console.log(`[SessionsService] No legacy history found: ${error.message}`);
      return { messages: [] };
    }
  }

  /**
   * Get the active context ID for a session
   */
  async getActiveContext(projectRoot: string, sessionId: string): Promise<string | null> {
    const data = await this.loadSessions(projectRoot);
    const session = data.sessions.find(s => s.sessionId === sessionId);
    return session?.activeContextId ?? null;
  }

  /**
   * Set the active context for a session
   */
  async setActiveContext(projectRoot: string, sessionId: string, contextId: string | null): Promise<void> {
    return this.withLock(projectRoot, async () => {
      const data = await this.loadSessions(projectRoot);
      const existingIndex = data.sessions.findIndex(s => s.sessionId === sessionId);

      if (existingIndex >= 0) {
        // Update existing session
        data.sessions[existingIndex].activeContextId = contextId;
        data.sessions[existingIndex].timestamp = new Date().toISOString();
      } else {
        // Create new session entry with context
        data.sessions.push({
          timestamp: new Date().toISOString(),
          sessionId,
          summary: undefined,
          activeContextId: contextId,
        });
      }

      await this.saveSessions(projectRoot, data);
      console.log(`[SessionsService] Set active context to ${contextId} for session ${sessionId}`);
    });
  }
}
