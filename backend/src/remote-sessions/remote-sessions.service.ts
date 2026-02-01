import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import { RemoteSessionsStorageService } from './remote-sessions-storage.service';
import { SessionEventsService } from './session-events.service';
import { PairingService } from './pairing.service';
import { SessionsService } from '../sessions/sessions.service';
import { InterceptorsService } from '../interceptors/interceptors.service';
import {
  RemoteSessionMapping,
  TelegramSession,
  MessageForwardResult,
  PairingResult,
} from './interfaces/remote-session.interface';

@Injectable()
export class RemoteSessionsService {
  private readonly logger = new Logger(RemoteSessionsService.name);
  private readonly backendUrl: string;
  private readonly workspaceRoot: string;

  constructor(
    private readonly storage: RemoteSessionsStorageService,
    private readonly sessionEvents: SessionEventsService,
    private readonly pairingService: PairingService,
    private readonly sessionsService: SessionsService,
    private readonly interceptorsService: InterceptorsService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
    this.workspaceRoot = process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'workspace');
  }

  /**
   * Request pairing for a Telegram user
   */
  async requestPairing(
    provider: 'telegram',
    remoteSession: TelegramSession,
  ): Promise<PairingResult> {
    return this.pairingService.requestPairing(provider, remoteSession);
  }

  /**
   * Handle pairing response from frontend
   */
  async handlePairingResponse(
    id: string,
    action: 'approve' | 'deny',
    message?: string,
  ): Promise<boolean> {
    const result = await this.pairingService.handleResponse(id, action, message);

    // Get pairing info to emit events to provider
    if (result) {
      const pairing = await this.storage.findPairingById(id);
      if (pairing) {
        if (action === 'approve') {
          const session = await this.storage.findByChatId(pairing.remoteSession.chatId);
          if (session) {
            this.sessionEvents.emitPairingApproved('telegram', pairing.remoteSession.chatId, session.id);
          }
        } else {
          this.sessionEvents.emitPairingDenied('telegram', pairing.remoteSession.chatId, message);
        }
      }
    }

    return result;
  }

  /**
   * Get session by chat ID
   */
  async getSessionByChatId(chatId: number): Promise<RemoteSessionMapping | null> {
    return this.storage.findByChatId(chatId);
  }

  /**
   * Select a project for a session
   */
  async selectProject(
    chatId: number,
    projectName: string,
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      return { success: false, error: 'Session not found. Please pair first.' };
    }

    // Verify project exists
    try {
      const response = await axios.get(`${this.backendUrl}/api/claude/listProjects`);
      const projects: string[] = response.data?.projects || [];

      if (!projects.includes(projectName)) {
        return {
          success: false,
          error: `Project "${projectName}" not found. Available projects: ${projects.join(', ')}`,
        };
      }
    } catch (error: any) {
      this.logger.error(`Failed to verify project: ${error.message}`);
      return { success: false, error: 'Failed to verify project' };
    }

    // Get most recent session ID for the project
    let sessionId = '';
    try {
      const response = await axios.get(`${this.backendUrl}/api/sessions/${encodeURIComponent(projectName)}`);
      const sessions = response.data?.sessions || [];
      if (sessions.length > 0) {
        // Get most recent session
        sessionId = sessions[0].sessionId;
      }
    } catch (error: any) {
      this.logger.warn(`No existing sessions for project ${projectName}: ${error.message}`);
      // This is OK - session will be created on first message
    }

    // Update session mapping
    await this.storage.updateSession(session.id, {
      project: {
        name: projectName,
        sessionId,
      },
    });

    this.logger.log(`Selected project "${projectName}" for chatId ${chatId}`);

    return {
      success: true,
      sessionId: sessionId || 'new',
    };
  }

  /**
   * Forward a message to Claude and return the response
   * Emits SSE events for frontend real-time updates.
   * Note: Chat history persistence is handled by the unattended endpoint.
   */
  async forwardMessage(chatId: number, message: string): Promise<MessageForwardResult> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      return { success: false, error: 'Session not found. Please pair first.' };
    }

    if (!session.project.name) {
      return { success: false, error: 'No project selected. Use: project \'project-name\'' };
    }

    const projectName = session.project.name;
    const projectRoot = path.join(this.workspaceRoot, projectName);
    const displayName = session.remoteSession.username || session.remoteSession.firstName || `User ${chatId}`;
    const timestamp = new Date().toISOString();

    this.logger.log(`Forwarding message from chatId ${chatId} to project "${projectName}"`);

    // Get or create session ID for SSE events
    let sessionId = session.project.sessionId;
    if (!sessionId) {
      // Try to get most recent session ID, or generate a new one
      sessionId = await this.sessionsService.getMostRecentSessionId(projectRoot);
      if (!sessionId) {
        sessionId = `session-${Date.now()}`;
      }
      // Update session mapping with sessionId
      await this.storage.updateSession(session.id, {
        project: { name: projectName, sessionId },
      });
    }

    // 1. EMIT SSE for user message (frontend real-time update)
    // Chat persistence is handled by the unattended endpoint
    this.interceptorsService.emitChatMessage(projectName, {
      sessionId,
      timestamp,
      isAgent: false,
      message,
      source: 'remote',
      sourceMetadata: {
        provider: session.provider,
        username: displayName,
      },
    });

    try {
      // 2. Forward to Claude (call the unattended endpoint)
      // The unattended endpoint handles chat history persistence
      const url = `${this.backendUrl}/api/claude/unattended/${encodeURIComponent(projectName)}`;

      const response = await axios.post(
        url,
        {
          prompt: message,
          maxTurns: 20,
          source: `Remote: ${displayName}`,
          sourceMetadata: {
            provider: session.provider,
            username: displayName,
            firstName: session.remoteSession.firstName,
          },
        },
        { timeout: 300000 } // 5 minute timeout
      );

      const result: MessageForwardResult = {
        success: response.data?.success ?? true,
        response: response.data?.response || 'Task completed',
        tokenUsage: response.data?.tokenUsage,
      };

      const responseTimestamp = new Date().toISOString();

      // 3. EMIT SSE for assistant response (frontend real-time update)
      // Chat persistence is handled by the unattended endpoint
      this.interceptorsService.emitChatMessage(projectName, {
        sessionId,
        timestamp: responseTimestamp,
        isAgent: true,
        message: result.response!,
        source: 'remote',
        costs: result.tokenUsage,
      });

      // Note: We don't emit etienne_response to the provider here because
      // the response is returned synchronously via HTTP. The Telegram bot
      // sends the response directly from the HTTP response in message.handler.ts.
      // The etienne_response SSE event is only for truly async scenarios.

      // Update session timestamp
      await this.storage.updateSession(session.id, {});

      return result;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.error(`Failed to forward message: ${errorMessage}`);

      // Emit error to provider
      this.sessionEvents.emitError(session.provider, chatId, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List all available projects
   */
  async listProjects(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.backendUrl}/api/claude/listProjects`);
      return response.data?.projects || [];
    } catch (error: any) {
      this.logger.error(`Failed to list projects: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all active sessions
   */
  async getAllSessions(): Promise<RemoteSessionMapping[]> {
    return this.storage.getAllSessions();
  }

  /**
   * Get pending pairings
   */
  async getPendingPairings() {
    return this.pairingService.getPendingPairings();
  }

  /**
   * Check if a chat is paired
   */
  async isPaired(chatId: number): Promise<boolean> {
    const session = await this.storage.findByChatId(chatId);
    return session !== null;
  }

  /**
   * Disconnect a session
   */
  async disconnectSession(chatId: number): Promise<boolean> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      return false;
    }

    await this.storage.removeSession(session.id);
    this.logger.log(`Disconnected session for chatId ${chatId}`);
    return true;
  }

  /**
   * Get a file from the project workspace
   * Returns null if session not found, project not selected, or file not found
   */
  async getProjectFile(
    chatId: number,
    filename: string,
  ): Promise<{ content: Buffer; mimeType: string; filename: string } | null> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      this.logger.warn(`File request from unknown chatId: ${chatId}`);
      return null;
    }

    if (!session.project?.name) {
      this.logger.warn(`File request without project selected: chatId ${chatId}`);
      return null;
    }

    const projectName = session.project.name;

    // Security: prevent path traversal by normalizing and checking the filename
    const normalizedFilename = filename.replace(/\\/g, '/').replace(/^\.\//, '');
    if (normalizedFilename.includes('..') || normalizedFilename.startsWith('/')) {
      this.logger.warn(`Path traversal attempt blocked: ${filename}`);
      return null;
    }

    try {
      // Use the workspace file endpoint to get the file
      const url = `${this.backendUrl}/api/workspace/${encodeURIComponent(projectName)}/files/${encodeURIComponent(normalizedFilename)}`;

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000, // 1 minute timeout
      });

      const contentType = response.headers['content-type'] || 'application/octet-stream';

      this.logger.log(`File retrieved: ${normalizedFilename} from project ${projectName}`);

      return {
        content: Buffer.from(response.data),
        mimeType: contentType,
        filename: normalizedFilename.split('/').pop() || normalizedFilename,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`File not found: ${normalizedFilename} in project ${projectName}`);
      } else {
        this.logger.error(`Failed to get file: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * List files in the project workspace (or a subdirectory)
   */
  async listProjectFiles(
    chatId: number,
    path?: string,
  ): Promise<{ files: string[]; error?: string } | null> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      return { files: [], error: 'Session not found' };
    }

    if (!session.project?.name) {
      return { files: [], error: 'No project selected' };
    }

    try {
      const url = `${this.backendUrl}/api/claude/listFiles`;
      const response = await axios.get(url, {
        params: {
          project: session.project.name,
          path: path || '',
        },
        timeout: 30000,
      });

      return { files: response.data?.files || [] };
    } catch (error: any) {
      this.logger.error(`Failed to list files: ${error.message}`);
      return { files: [], error: 'Failed to list files' };
    }
  }
}
