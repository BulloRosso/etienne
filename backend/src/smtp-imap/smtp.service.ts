import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * SMTP Service
 *
 * Handles sending emails via SMTP protocol using emailjs library.
 * Configuration is provided via SMTP_CONNECTION environment variable.
 * Recipient whitelist is enforced via SMTP_WHITELIST environment variable.
 *
 * Connection string format: host|port|secure|user|password
 * Example: smtp.gmail.com|587|false|user@gmail.com|password
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private client: any = null;
  private config: any = null;
  private whitelist: string[] = [];
  private emailjsModule: any = null;

  /**
   * Load emailjs module dynamically (ESM)
   * Uses Function constructor to prevent ts-node from transforming the import
   */
  private async loadEmailjs(): Promise<any> {
    if (!this.emailjsModule) {
      // Use Function constructor to prevent ts-node from trying to transform the import
      const importEmailjs = new Function('return import("emailjs")');
      this.emailjsModule = await importEmailjs();
    }
    return this.emailjsModule;
  }

  /**
   * Parse SMTP connection string and create client
   */
  private async getClient(): Promise<any> {
    if (this.client && this.config) {
      return this.client;
    }

    const { SMTPClient } = await this.loadEmailjs();

    const connectionString = process.env.SMTP_CONNECTION;
    if (!connectionString) {
      throw new Error('SMTP_CONNECTION environment variable is not set');
    }

    const parts = connectionString.split('|');
    if (parts.length !== 5) {
      throw new Error('SMTP_CONNECTION must be in format: host|port|secure|user|password');
    }

    const [host, portStr, secureStr, user, password] = parts;
    const port = parseInt(portStr, 10);
    const tls = secureStr === 'true';

    this.config = { host, port, user, password, tls };

    // Port 587 uses STARTTLS, not direct SSL
    this.client = new SMTPClient({
      user,
      password,
      host,
      port,
      ssl: false, // Port 587 doesn't use direct SSL
      tls: true, // Enable STARTTLS for port 587
      timeout: 10000,
    });

    // Load whitelist
    const whitelistEnv = process.env.SMTP_WHITELIST;
    if (whitelistEnv) {
      this.whitelist = whitelistEnv.split(',').map(email => email.trim().toLowerCase());
      this.logger.log(`SMTP whitelist loaded: ${this.whitelist.length} recipients allowed`);
    } else {
      this.logger.warn('SMTP_WHITELIST not set - all recipients allowed (security risk!)');
    }

    this.logger.log(`SMTP client configured: ${host}:${port} (TLS: ${tls})`);
    return this.client;
  }

  /**
   * Validate recipient against whitelist
   */
  private validateRecipient(recipient: string): void {
    if (this.whitelist.length === 0) {
      // No whitelist configured - allow all (but log warning)
      this.logger.warn(`No whitelist configured - allowing email to: ${recipient}`);
      return;
    }

    const recipientLower = recipient.toLowerCase().trim();
    if (!this.whitelist.includes(recipientLower)) {
      throw new Error(
        `Recipient ${recipient} is not in the whitelist. ` +
        `Allowed recipients: ${this.whitelist.join(', ')}`
      );
    }

    this.logger.debug(`Recipient ${recipient} validated against whitelist`);
  }

  /**
   * Send an email
   *
   * @param projectName - The project name
   * @param recipient - Email recipient (must be in whitelist)
   * @param subject - Email subject
   * @param body - Email body (plain text)
   * @param attachments - Array of file paths relative to project directory
   * @returns Result object with success status
   */
  async sendEmail(
    projectName: string,
    recipient: string,
    subject: string,
    body: string,
    attachments: string[] = []
  ): Promise<any> {
    try {
      const [client, { Message }] = await Promise.all([
        this.getClient(),
        this.loadEmailjs()
      ]);

      // Validate recipient against whitelist
      this.validateRecipient(recipient);

      // Get workspace root
      const workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
      const projectDir = path.join(workspaceRoot, projectName);

      // Process attachments
      const mailAttachments = [];
      for (const attachment of attachments) {
        const filePath = path.join(projectDir, attachment);

        try {
          await fs.access(filePath);
          const data = await fs.readFile(filePath);
          mailAttachments.push({
            name: path.basename(attachment),
            data: data, // Pass Buffer directly, emailjs will handle encoding
            inline: false,
          });
        } catch (error) {
          this.logger.warn(`Attachment file not found: ${filePath}`);
          throw new Error(`Attachment file not found: ${attachment}`);
        }
      }

      // Get sender from connection string
      const sender = this.config.user;

      // Create message
      const message = new Message({
        from: sender,
        to: recipient,
        subject,
        text: body,
        attachment: mailAttachments.length > 0 ? mailAttachments : undefined,
      });

      this.logger.log(`Sending email to ${recipient}...`);

      // Send email
      const response = await client.sendAsync(message);

      this.logger.log(`Email sent successfully to ${recipient}`);

      return {
        success: true,
        messageId: response.header || 'unknown',
        recipient,
        subject,
        attachmentCount: attachments.length,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email: ${errorMsg}`);
      throw error;
    }
  }
}
