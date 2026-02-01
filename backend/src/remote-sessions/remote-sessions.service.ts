import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { RemoteSessionsStorageService } from './remote-sessions-storage.service';
import { SessionEventsService } from './session-events.service';
import { PairingService } from './pairing.service';
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

  constructor(
    private readonly storage: RemoteSessionsStorageService,
    private readonly sessionEvents: SessionEventsService,
    private readonly pairingService: PairingService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
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
   */
  async forwardMessage(chatId: number, message: string): Promise<MessageForwardResult> {
    const session = await this.storage.findByChatId(chatId);
    if (!session) {
      return { success: false, error: 'Session not found. Please pair first.' };
    }

    if (!session.project.name) {
      return { success: false, error: 'No project selected. Use: project \'project-name\'' };
    }

    this.logger.log(`Forwarding message from chatId ${chatId} to project "${session.project.name}"`);

    try {
      // Call the unattended endpoint
      const url = `${this.backendUrl}/api/claude/unattended/${encodeURIComponent(session.project.name)}`;

      const response = await axios.post(
        url,
        {
          prompt: message,
          maxTurns: 20,
          source: `Telegram: ${session.remoteSession.username || session.remoteSession.chatId}`,
        },
        { timeout: 300000 } // 5 minute timeout
      );

      const result: MessageForwardResult = {
        success: response.data?.success ?? true,
        response: response.data?.response || 'Task completed',
        tokenUsage: response.data?.tokenUsage,
      };

      // Emit response to Telegram provider via SSE
      this.sessionEvents.emitClaudeResponse(
        'telegram',
        chatId,
        result.response!,
        result.success,
        result.tokenUsage,
      );

      // Update session timestamp
      await this.storage.updateSession(session.id, {});

      return result;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.error(`Failed to forward message: ${errorMessage}`);

      // Emit error to provider
      this.sessionEvents.emitError('telegram', chatId, errorMessage);

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
}
