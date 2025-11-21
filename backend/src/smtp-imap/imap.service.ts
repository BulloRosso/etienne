import { Injectable, Logger } from '@nestjs/common';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * IMAP Service
 *
 * Handles receiving emails via IMAP protocol.
 * Configuration is provided via IMAP_CONNECTION environment variable.
 *
 * Connection string format: host|port|secure|user|password
 * Example: imap.gmail.com|993|true|user@gmail.com|password
 */

interface EmailMessage {
  subject: string;
  message: string;
  sender: string;
  attachment_count: number;
  date: Date;
}

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);

  /**
   * Parse IMAP connection string
   */
  private parseConnectionString(): any {
    const connectionString = process.env.IMAP_CONNECTION;
    if (!connectionString) {
      throw new Error('IMAP_CONNECTION environment variable is not set');
    }

    const parts = connectionString.split('|');
    if (parts.length !== 5) {
      throw new Error('IMAP_CONNECTION must be in format: host|port|secure|user|password');
    }

    const [host, portStr, secureStr, user, password] = parts;
    const port = parseInt(portStr, 10);
    const tls = secureStr === 'true';

    return {
      user,
      password,
      host,
      port,
      tls,
      tlsOptions: { rejectUnauthorized: false },
    };
  }

  /**
   * Check inbox for new emails
   *
   * @param projectName - The project name
   * @param subjectFilter - Optional subject filter (case-insensitive prefix match)
   * @param newerThanDate - Optional date filter (only process emails newer than this date)
   * @returns Object with new_mails_count and mails array
   */
  async checkInbox(
    projectName: string,
    subjectFilter?: string,
    newerThanDate?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const config = this.parseConnectionString();
      const imap = new Imap(config);

      const workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
      const projectDir = path.join(workspaceRoot, projectName);
      const emailsDir = path.join(projectDir, 'emails', 'received');

      const processedMails: EmailMessage[] = [];

      imap.once('ready', () => {
        this.logger.log('IMAP connection ready');

        imap.openBox('INBOX', false, (err: any, box: any) => {
          if (err) {
            this.logger.error(`Failed to open inbox: ${err.message}`);
            imap.end();
            reject(new Error(`Failed to open inbox: ${err.message}`));
            return;
          }

          // Build search criteria
          const searchCriteria: any[] = ['UNSEEN'];

          if (newerThanDate) {
            try {
              const date = new Date(newerThanDate);
              searchCriteria.push(['SINCE', date]);
            } catch (error) {
              this.logger.warn(`Invalid date format: ${newerThanDate}`);
            }
          }

          imap.search(searchCriteria, (err: any, results: any) => {
            if (err) {
              this.logger.error(`Search failed: ${err.message}`);
              imap.end();
              reject(new Error(`Search failed: ${err.message}`));
              return;
            }

            if (!results || results.length === 0) {
              this.logger.log('No new emails found');
              imap.end();
              resolve({
                new_mails_count: 0,
                mails: [],
              });
              return;
            }

            this.logger.log(`Found ${results.length} new emails`);

            const fetch = imap.fetch(results, {
              bodies: '',
              markSeen: true,
            });

            fetch.on('message', (msg: any, seqno: any) => {
              this.logger.log(`Processing message #${seqno}`);

              msg.on('body', (stream: any, info: any) => {
                simpleParser(stream, async (err: any, parsed: any) => {
                  if (err) {
                    this.logger.error(`Failed to parse email: ${err.message}`);
                    return;
                  }

                  const subject = parsed.subject || 'No Subject';
                  const sender = parsed.from?.text || 'unknown';
                  const body = parsed.text || '';
                  const date = parsed.date || new Date();

                  // Apply subject filter if provided
                  if (subjectFilter) {
                    if (!subject.toLowerCase().startsWith(subjectFilter.toLowerCase())) {
                      this.logger.log(`Skipping email (subject filter): ${subject}`);
                      return;
                    }
                  }

                  // Create email directory
                  const isoDate = date.toISOString().split('T')[0];
                  const sanitizedSubject = subject
                    .substring(0, 50)
                    .replace(/[^a-zA-Z0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
                  const sanitizedSender = sender
                    .replace(/[^a-zA-Z0-9@.]/g, '-')
                    .substring(0, 30);

                  const emailDirName = `${isoDate}-${sanitizedSender}-${sanitizedSubject}`;
                  const emailDir = path.join(emailsDir, emailDirName);

                  try {
                    await fs.mkdir(emailDir, { recursive: true });

                    // Save message body
                    const messagePath = path.join(emailDir, 'message.txt');
                    await fs.writeFile(messagePath, body, 'utf-8');

                    // Save attachments
                    let attachmentCount = 0;
                    if (parsed.attachments && parsed.attachments.length > 0) {
                      for (const attachment of parsed.attachments) {
                        const attachmentPath = path.join(emailDir, attachment.filename || `attachment-${attachmentCount}`);
                        await fs.writeFile(attachmentPath, attachment.content);
                        attachmentCount++;
                      }
                    }

                    this.logger.log(`Saved email to: ${emailDirName}`);

                    processedMails.push({
                      subject,
                      message: body.substring(0, 200) + (body.length > 200 ? '...' : ''),
                      sender,
                      attachment_count: attachmentCount,
                      date,
                    });
                  } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    this.logger.error(`Failed to save email: ${errorMsg}`);
                  }
                });
              });
            });

            fetch.once('error', (err: any) => {
              this.logger.error(`Fetch error: ${err.message}`);
              imap.end();
              reject(new Error(`Fetch error: ${err.message}`));
            });

            fetch.once('end', () => {
              this.logger.log('Finished fetching messages');
              imap.end();
            });
          });
        });
      });

      imap.once('error', (err: any) => {
        this.logger.error(`IMAP error: ${err.message}`);
        reject(new Error(`IMAP error: ${err.message}`));
      });

      imap.once('end', () => {
        this.logger.log('IMAP connection ended');
        resolve({
          new_mails_count: processedMails.length,
          mails: processedMails,
        });
      });

      imap.connect();
    });
  }
}
