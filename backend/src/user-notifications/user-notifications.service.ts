import { Injectable, Logger } from '@nestjs/common';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { SmtpService } from '../smtp-imap/smtp.service';
import { SessionEventsService } from '../remote-sessions/session-events.service';
import { RemoteSessionsStorageService } from '../remote-sessions/remote-sessions-storage.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

interface NotificationChannel {
  id: string;
  name: string;
  status: 'available' | 'unavailable';
}

interface SendResult {
  channel: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class UserNotificationsService {
  private readonly logger = new Logger(UserNotificationsService.name);

  constructor(
    private readonly processManager: ProcessManagerService,
    private readonly smtpService: SmtpService,
    private readonly sessionEvents: SessionEventsService,
    private readonly remoteSessionsStorage: RemoteSessionsStorageService,
    private readonly mcpServerConfig: McpServerConfigService,
  ) {}

  /**
   * Get all notification channels and their availability status
   */
  async getChannels(projectName: string): Promise<NotificationChannel[]> {
    const [telegramStatus, teamsStatus, emailAvailable] = await Promise.all([
      this.processManager.getServiceStatus('telegram'),
      this.processManager.getServiceStatus('ms-teams'),
      this.isEmailAvailable(projectName),
    ]);

    return [
      { id: 'desktop', name: 'Desktop Notification', status: 'available' },
      { id: 'telegram', name: 'Telegram Message', status: telegramStatus.status === 'running' ? 'available' : 'unavailable' },
      { id: 'ms-teams', name: 'MS Teams Message', status: teamsStatus.status === 'running' ? 'available' : 'unavailable' },
      { id: 'email', name: 'Email', status: emailAvailable ? 'available' : 'unavailable' },
    ];
  }

  /**
   * Check if email notification is available:
   * IMAP connector running AND project has email MCP tool configured
   */
  private async isEmailAvailable(projectName: string): Promise<boolean> {
    try {
      const imapStatus = await this.processManager.getServiceStatus('imap-connector');
      if (imapStatus.status !== 'running') return false;

      const mcpConfig = await this.mcpServerConfig.getMcpConfig(projectName);
      return Object.keys(mcpConfig.mcpServers || {}).some(
        key => key.toLowerCase().includes('email')
      );
    } catch {
      return false;
    }
  }

  /**
   * Send notifications via the requested channels
   */
  async sendNotifications(
    projectName: string,
    channels: string[],
    summary: string,
    email?: string,
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmailNotification(projectName, summary, email);
            results.push({ channel: 'email', success: true });
            break;
          case 'telegram':
            await this.sendTelegramNotification(projectName, summary);
            results.push({ channel: 'telegram', success: true });
            break;
          case 'ms-teams':
            await this.sendTeamsNotification(projectName, summary);
            results.push({ channel: 'ms-teams', success: true });
            break;
          default:
            results.push({ channel, success: false, error: `Unknown channel: ${channel}` });
        }
      } catch (err: any) {
        this.logger.error(`Failed to send ${channel} notification: ${err.message}`);
        results.push({ channel, success: false, error: err.message });
      }
    }

    return results;
  }

  private async sendEmailNotification(projectName: string, summary: string, recipient?: string): Promise<void> {
    if (!recipient) {
      throw new Error('No email recipient configured');
    }

    await this.smtpService.sendEmail(
      projectName,
      recipient,
      `Task Completed — ${projectName}`,
      `Your request in project "${projectName}" has been processed.\n\n${summary}`,
    );

    this.logger.log(`Email notification sent to ${recipient} for project ${projectName}`);
  }

  private async sendTelegramNotification(projectName: string, summary: string): Promise<void> {
    const sessions = await this.remoteSessionsStorage.findByProject(projectName);
    const telegramSessions = sessions.filter(s => s.provider === 'telegram' && s.status === 'active');

    if (telegramSessions.length === 0) {
      throw new Error('No active Telegram session paired to this project');
    }

    for (const session of telegramSessions) {
      this.sessionEvents.emitClaudeResponse(
        'telegram',
        session.remoteSession.chatId as number,
        `✅ Task completed in project "${projectName}":\n\n${summary}`,
        true,
      );
    }

    this.logger.log(`Telegram notification sent for project ${projectName}`);
  }

  private async sendTeamsNotification(projectName: string, summary: string): Promise<void> {
    const sessions = await this.remoteSessionsStorage.findByProject(projectName);
    const teamsSessions = sessions.filter(s => s.provider === 'teams' && s.status === 'active');

    if (teamsSessions.length === 0) {
      throw new Error('No active MS Teams session paired to this project');
    }

    for (const session of teamsSessions) {
      this.sessionEvents.emitClaudeResponse(
        'ms-teams',
        session.remoteSession.chatId as number,
        `✅ Task completed in project "${projectName}":\n\n${summary}`,
        true,
      );
    }

    this.logger.log(`MS Teams notification sent for project ${projectName}`);
  }
}
