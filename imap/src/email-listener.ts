import { simpleParser, ParsedMail } from 'mailparser';
import { Readable } from 'stream';
import { ImapConfig, EmailPayload } from './types';
import { publishEmailEvent } from './event-publisher';

// Use dynamic require for CommonJS imap module
const Imap = require('imap');

export class EmailListener {
  private imap: any;
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true,
      },
    });
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.imap.once('ready', () => {
        console.log('IMAP connection established');

        this.imap.openBox('INBOX', false, (err: any, box: any) => {
          if (err) {
            reject(err);
            return;
          }

          console.log(`Monitoring INBOX (${box.messages.total} total messages)`);
          console.log('Waiting for new emails (IDLE handled by keepalive)...');
          resolve();
        });
      });

      this.imap.on('mail', (numNewMsgs: number) => {
        console.log(`${numNewMsgs} new email(s) received`);
        this.fetchNewEmails();
      });

      this.imap.on('update', (seqno: number, info: any) => {
        console.log(`Email #${seqno} updated:`, info);
      });

      this.imap.on('expunge', (seqno: number) => {
        console.log(`Email #${seqno} deleted`);
      });

      this.imap.on('error', (err: Error) => {
        console.error('IMAP error:', err.message);
        reject(err);
      });

      this.imap.on('close', (hadError: boolean) => {
        console.log(`Connection closed ${hadError ? 'with error' : 'normally'}`);
        setTimeout(() => this.reconnect(), 5000);
      });

      this.imap.connect();
    });
  }

  private fetchNewEmails(): void {
    this.imap.search(['UNSEEN'], async (err: any, results: number[]) => {
      if (err) {
        console.error('Search error:', err);
        return;
      }

      if (!results || results.length === 0) {
        console.log('No new emails found');
        return;
      }

      console.log(`Fetching ${results.length} new email(s)...`);

      const fetch = this.imap.fetch(results, {
        bodies: '',
        struct: true,
        markSeen: true,
      });

      let processedCount = 0;

      fetch.on('message', (msg: any, seqno: number) => {
        let buffer = '';

        msg.on('body', (stream: Readable) => {
          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
          });

          stream.once('end', async () => {
            try {
              const parsed = await simpleParser(buffer);
              await this.handleNewEmail(parsed, seqno);
              processedCount++;
            } catch (parseErr) {
              console.error(`Failed to parse email #${seqno}:`, parseErr);
            }
          });
        });

        msg.once('attributes', (attrs: any) => {
          console.log(`  Email #${seqno}: UID ${attrs.uid}`);
        });
      });

      fetch.once('error', (fetchErr: Error) => {
        console.error('Fetch error:', fetchErr);
      });

      fetch.once('end', () => {
        console.log(`Processed ${processedCount}/${results.length} emails`);
      });
    });
  }

  private async handleNewEmail(parsed: ParsedMail, seqno: number): Promise<void> {
    const isImportant =
      parsed.priority === 'high' ||
      (parsed.headers?.get('importance') as string)?.toLowerCase() === 'high';

    const payload: EmailPayload = {
      From: parsed.from?.text || '',
      To: parsed.to
        ? (Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text).join(', ')
            : parsed.to.text)
        : '',
      Important: isImportant,
      Subject: parsed.subject || '',
      BodyText: parsed.text || '',
      Attachments: (parsed.attachments || []).map(
        (a) => a.filename || 'unnamed',
      ),
    };

    try {
      await publishEmailEvent(payload);
      console.log(`  Published event for: ${payload.Subject}`);
    } catch (err) {
      console.error(`  Failed to publish event for email #${seqno}:`, err);
    }
  }

  private reconnect(): void {
    console.log('Reconnecting to IMAP...');
    this.imap.connect();
  }

  stop(): void {
    this.imap.end();
  }
}
