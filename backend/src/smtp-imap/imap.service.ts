import { Injectable, Logger } from '@nestjs/common';
import { simpleParser } from 'mailparser';
import * as path from 'path';
import * as fs from 'fs/promises';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';

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

interface FolderNode {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
  children: FolderNode[];
}

interface MessageHeader {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  flags: string[];
  hasAttachments: boolean;
}

interface AttachmentMeta {
  filename: string;
  size: number;
  contentType: string;
  index: number;
}

interface FullMessage {
  html: string | null;
  text: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  attachments: AttachmentMeta[];
}

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);
  private imapModule: any = null;

  constructor(private readonly secretsManager: SecretsManagerService) {}

  /**
   * Load imap module dynamically
   * Uses dynamic require to load CommonJS module
   */
  private async loadImap(): Promise<any> {
    if (!this.imapModule) {
      // Use dynamic require for CommonJS module
      this.imapModule = require('imap');
    }
    return this.imapModule;
  }

  /**
   * Parse IMAP connection string
   */
  private async parseConnectionString(): Promise<any> {
    const connectionString = await this.secretsManager.getSecret('IMAP_CONNECTION');
    if (!connectionString) {
      throw new Error('IMAP_CONNECTION is not set in secrets vault or environment');
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
    return new Promise(async (resolve, reject) => {
      try {
        const config = await this.parseConnectionString();
        const Imap = await this.loadImap();
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
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to initialize IMAP: ${errorMsg}`);
        reject(error);
      }
    });
  }

  /**
   * Helper: create an IMAP connection, run a function, then close.
   */
  private async connectAndRun<T>(fn: (imap: any) => Promise<T>): Promise<T> {
    const config = await this.parseConnectionString();
    const Imap = await this.loadImap();
    const imap = new Imap(config);

    return new Promise<T>((resolve, reject) => {
      imap.once('ready', async () => {
        try {
          const result = await fn(imap);
          imap.end();
          resolve(result);
        } catch (err) {
          imap.end();
          reject(err);
        }
      });

      imap.once('error', (err: any) => {
        this.logger.error(`IMAP error: ${err.message}`);
        reject(new Error(`IMAP error: ${err.message}`));
      });

      imap.connect();
    });
  }

  /**
   * List all IMAP mailbox folders.
   */
  async listFolders(): Promise<FolderNode[]> {
    return this.connectAndRun<FolderNode[]>((imap) => {
      return new Promise((resolve, reject) => {
        imap.getBoxes((err: any, boxes: any) => {
          if (err) {
            reject(new Error(`Failed to list folders: ${err.message}`));
            return;
          }
          const result = this.transformBoxes(boxes, '');
          resolve(result);
        });
      });
    });
  }

  /**
   * Recursively transform IMAP getBoxes() result into FolderNode[].
   */
  private transformBoxes(boxes: any, parentPath: string): FolderNode[] {
    const result: FolderNode[] = [];
    for (const [name, box] of Object.entries<any>(boxes)) {
      const delimiter = box.delimiter || '/';
      const fullPath = parentPath ? `${parentPath}${delimiter}${name}` : name;
      const node: FolderNode = {
        name,
        path: fullPath,
        delimiter,
        flags: box.attribs || [],
        children: box.children ? this.transformBoxes(box.children, fullPath) : [],
      };
      result.push(node);
    }
    return result;
  }

  /**
   * List messages in a folder with pagination (newest first).
   */
  async listMessages(
    folderPath: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<{ messages: MessageHeader[]; total: number }> {
    return this.connectAndRun<{ messages: MessageHeader[]; total: number }>((imap) => {
      return new Promise((resolve, reject) => {
        imap.openBox(folderPath, true, (err: any, box: any) => {
          if (err) {
            reject(new Error(`Failed to open folder ${folderPath}: ${err.message}`));
            return;
          }

          const total = box.messages.total;
          if (total === 0) {
            resolve({ messages: [], total: 0 });
            return;
          }

          // Calculate sequence range (newest first)
          const end = total - (page - 1) * pageSize;
          const start = Math.max(1, end - pageSize + 1);

          if (end < 1) {
            resolve({ messages: [], total });
            return;
          }

          const fetch = imap.seq.fetch(`${start}:${end}`, {
            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
            struct: true,
          });

          const messages: MessageHeader[] = [];

          fetch.on('message', (msg: any, seqno: any) => {
            let uid = 0;
            let flags: string[] = [];
            let headerData = '';
            let struct: any = null;

            msg.on('body', (stream: any) => {
              stream.on('data', (chunk: any) => {
                headerData += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs: any) => {
              uid = attrs.uid;
              flags = attrs.flags || [];
              struct = attrs.struct;
            });

            msg.once('end', () => {
              const headers = this.parseHeaders(headerData);
              const hasAttachments = this.structHasAttachments(struct);
              messages.push({
                uid,
                subject: headers.subject || '(No Subject)',
                from: headers.from || '',
                to: headers.to || '',
                date: headers.date || '',
                flags,
                hasAttachments,
              });
            });
          });

          fetch.once('error', (err: any) => {
            reject(new Error(`Fetch error: ${err.message}`));
          });

          fetch.once('end', () => {
            // Sort newest first (higher UID = newer)
            messages.sort((a, b) => b.uid - a.uid);
            resolve({ messages, total });
          });
        });
      });
    });
  }

  /**
   * Parse raw IMAP header string into key-value pairs.
   */
  private parseHeaders(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = raw.split(/\r?\n/);
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      if (/^\s/.test(line) && currentKey) {
        // Continuation of previous header
        currentValue += ' ' + line.trim();
      } else {
        if (currentKey) {
          result[currentKey.toLowerCase()] = currentValue;
        }
        const match = line.match(/^([^:]+):\s*(.*)/);
        if (match) {
          currentKey = match[1];
          currentValue = match[2];
        } else {
          currentKey = '';
          currentValue = '';
        }
      }
    }
    if (currentKey) {
      result[currentKey.toLowerCase()] = currentValue;
    }
    return result;
  }

  /**
   * Check if an IMAP struct contains attachments.
   */
  private structHasAttachments(struct: any): boolean {
    if (!struct) return false;
    for (const part of struct) {
      if (Array.isArray(part)) {
        if (this.structHasAttachments(part)) return true;
      } else if (part && typeof part === 'object') {
        if (part.disposition && part.disposition.type &&
            part.disposition.type.toLowerCase() === 'attachment') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get full message content by UID.
   */
  async getMessage(folderPath: string, uid: number): Promise<FullMessage> {
    return this.connectAndRun<FullMessage>((imap) => {
      return new Promise((resolve, reject) => {
        imap.openBox(folderPath, true, (err: any) => {
          if (err) {
            reject(new Error(`Failed to open folder ${folderPath}: ${err.message}`));
            return;
          }

          const fetch = imap.fetch([uid], { bodies: '', struct: true });
          let resolved = false;

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, (parseErr: any, parsed: any) => {
                if (parseErr) {
                  if (!resolved) {
                    resolved = true;
                    reject(new Error(`Failed to parse message: ${parseErr.message}`));
                  }
                  return;
                }

                const attachments: AttachmentMeta[] = (parsed.attachments || []).map(
                  (att: any, index: number) => ({
                    filename: att.filename || `attachment-${index}`,
                    size: att.size || 0,
                    contentType: att.contentType || 'application/octet-stream',
                    index,
                  }),
                );

                if (!resolved) {
                  resolved = true;
                  resolve({
                    html: parsed.html || null,
                    text: parsed.text || null,
                    from: parsed.from?.text || '',
                    to: parsed.to?.text || '',
                    cc: parsed.cc?.text || '',
                    subject: parsed.subject || '(No Subject)',
                    date: parsed.date?.toISOString() || '',
                    attachments,
                  });
                }
              });
            });
          });

          fetch.once('error', (err: any) => {
            if (!resolved) {
              resolved = true;
              reject(new Error(`Fetch error: ${err.message}`));
            }
          });
        });
      });
    });
  }

  /**
   * Get a specific attachment by UID and index.
   */
  async getAttachment(
    folderPath: string,
    uid: number,
    attachmentIndex: number,
  ): Promise<{ content: Buffer; filename: string; contentType: string }> {
    return this.connectAndRun<{ content: Buffer; filename: string; contentType: string }>((imap) => {
      return new Promise((resolve, reject) => {
        imap.openBox(folderPath, true, (err: any) => {
          if (err) {
            reject(new Error(`Failed to open folder ${folderPath}: ${err.message}`));
            return;
          }

          const fetch = imap.fetch([uid], { bodies: '' });
          let resolved = false;

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, (parseErr: any, parsed: any) => {
                if (parseErr) {
                  if (!resolved) {
                    resolved = true;
                    reject(new Error(`Failed to parse message: ${parseErr.message}`));
                  }
                  return;
                }

                const attachments = parsed.attachments || [];
                if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
                  if (!resolved) {
                    resolved = true;
                    reject(new Error(`Attachment index ${attachmentIndex} out of range (${attachments.length} attachments)`));
                  }
                  return;
                }

                const att = attachments[attachmentIndex];
                if (!resolved) {
                  resolved = true;
                  resolve({
                    content: att.content,
                    filename: att.filename || `attachment-${attachmentIndex}`,
                    contentType: att.contentType || 'application/octet-stream',
                  });
                }
              });
            });
          });

          fetch.once('error', (err: any) => {
            if (!resolved) {
              resolved = true;
              reject(new Error(`Fetch error: ${err.message}`));
            }
          });
        });
      });
    });
  }

  /**
   * Save an attachment to the project workspace.
   */
  async saveAttachment(
    folderPath: string,
    uid: number,
    attachmentIndex: number,
    projectName: string,
    targetPath: string,
  ): Promise<{ success: boolean; savedPath: string }> {
    const attachment = await this.getAttachment(folderPath, uid, attachmentIndex);

    const workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
    const projectDir = path.resolve(workspaceRoot, projectName);
    const targetDir = path.resolve(projectDir, targetPath || '');

    // Path traversal guard
    if (!targetDir.startsWith(projectDir)) {
      throw new Error('Invalid target path: must be within the project directory');
    }

    await fs.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, attachment.filename);
    await fs.writeFile(filePath, attachment.content);

    const relativePath = path.relative(projectDir, filePath).replace(/\\/g, '/');
    this.logger.log(`Saved attachment to: ${relativePath}`);

    return { success: true, savedPath: relativePath };
  }

  /**
   * Check if IMAP is configured (connection string available).
   */
  async isConfigured(): Promise<boolean> {
    try {
      const connectionString = await this.secretsManager.getSecret('IMAP_CONNECTION');
      return !!connectionString;
    } catch {
      return false;
    }
  }

  /**
   * List directories in a project workspace for folder autocomplete.
   */
  async listProjectDirectories(projectName: string): Promise<string[]> {
    const workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
    const projectDir = path.join(workspaceRoot, projectName);
    const directories: string[] = [];

    const walk = async (dir: string, relativePath: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name === '.claude' || entry.name === '.etienne' || entry.name === 'data' || entry.name === 'node_modules' || entry.name === '.git') continue;
          const rel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          directories.push(rel);
          await walk(path.join(dir, entry.name), rel);
        }
      } catch {
        // Skip unreadable directories
      }
    };

    await walk(projectDir, '');
    return directories;
  }
}
