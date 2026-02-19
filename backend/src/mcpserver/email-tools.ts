import { ToolService, McpTool } from './types';
import { SmtpService } from '../smtp-imap/smtp.service';
import { ImapService } from '../smtp-imap/imap.service';

/**
 * Email Tool Service
 *
 * Provides MCP tools for sending and receiving emails.
 * Uses SMTP for sending and IMAP for receiving.
 */

/**
 * Tool definitions for email functionality
 */
const tools: McpTool[] = [
  {
    name: 'email_send',
    description: 'Send an email for the project using SMTP. Supports attachments from the project directory.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        recipient: {
          type: 'string',
          description: 'Email recipient address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text). Always provide this as a fallback for email clients that do not render HTML.',
        },
        html: {
          type: 'string',
          description: 'Optional HTML body. When provided, sent as the rich-text version alongside the plain text body.',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional array of file paths relative to project directory to attach',
          default: [],
        },
      },
      required: ['project_name', 'recipient', 'subject', 'body'],
    },
  },
  {
    name: 'email_check_inbox',
    description: 'Check the email account for new emails and extract their contents to workspace/<project_name>/emails/received. Each email is saved in a directory named <iso-date>-<sender>-<subject> containing message.txt and any attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        subject: {
          type: 'string',
          description: 'Optional case-insensitive subject prefix filter. Only emails matching this prefix will be processed.',
        },
        newer_than_date: {
          type: 'string',
          description: 'Optional ISO date string (e.g., "2025-01-01"). Only process emails newer than this date.',
        },
      },
      required: ['project_name'],
    },
  },
];

/**
 * Create email tools service with dependencies
 */
export function createEmailToolsService(
  smtpService: SmtpService,
  imapService: ImapService
): ToolService {
  /**
   * Execute a tool by name with given arguments
   */
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'email_send':
        return smtpService.sendEmail(
          args.project_name,
          args.recipient,
          args.subject,
          args.body,
          args.attachments || [],
          args.html
        );

      case 'email_check_inbox':
        return imapService.checkInbox(
          args.project_name,
          args.subject,
          args.newer_than_date
        );

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
