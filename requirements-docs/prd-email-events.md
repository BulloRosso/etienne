# EMail Events

I want to add another event type "email" to the existing backend/src/event-handling system. It is based on a new node.js service IMAPConnector located in /imap which runs on :4440

The IMAPConnector service listens for new incomming emails and publishes one event per incomming email to the ZeroMQ event bus with this payload for an email:
* From
* To
* Important
* Subject
* BodyText
* Attachments[<List of filenames>]

**Important** Use the same IMAP libraries as in backend/src/mcpserver/email-tools.ts

## IMAPConnector service

The responsibility of the IMAPConnector is to publish all incomming emails as events to the ZeroMQ event bus so they can be received by the event-handling service.

### Connection to IMAP Service
We must use the IDLE feature of IMAP.

Example Code which you should adapt:
------
import { Connection, parseHeader } from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { Readable } from 'stream';

class EmailListener {
  private imap: Connection;
  private isIdle: boolean = false;
  
  constructor(config: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
  }) {
    this.imap = new Connection({
      ...config,
      tlsOptions: { rejectUnauthorized: false }, // Adjust for production
      keepalive: {
        interval: 10000,  // Send keepalive every 10s
        idleInterval: 300000, // IDLE for 5 minutes before renewing
        forceNoop: true
      }
    });
  }
  
  async start() {
    return new Promise<void>((resolve, reject) => {
      this.imap.once('ready', () => {
        console.log('✅ IMAP connection established');
        
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log(`📬 Monitoring INBOX (${box.messages.total} total messages)`);
          this.startIdle();
          resolve();
        });
      });

      // Event: New mail arrives (PUSH notification)
      this.imap.on('mail', (numNewMsgs: number) => {
        console.log(`\n📨 PUSH: ${numNewMsgs} new email(s) received`);
        this.stopIdle();
        this.fetchNewEmails();
      });

      // Event: Email marked as read/deleted/flagged
      this.imap.on('update', (seqno: number, info: any) => {
        console.log(`🔄 Email #${seqno} updated:`, info);
      });

      // Event: Email expunged (deleted)
      this.imap.on('expunge', (seqno: number) => {
        console.log(`🗑️  Email #${seqno} deleted`);
      });

      // Event: IDLE ended (Gmail/some servers end it after ~29 min)
      this.imap.on('idle-end', () => {
        console.log('⏱️  IDLE ended, restarting...');
        this.startIdle();
      });

      this.imap.on('error', (err: Error) => {
        console.error('❌ IMAP error:', err);
        reject(err);
      });

      this.imap.on('close', (hadError: boolean) => {
        console.log(`🔌 Connection closed ${hadError ? 'with error' : 'normally'}`);
        if (!hadError) {
          // Reconnect after clean disconnect
          setTimeout(() => this.reconnect(), 5000);
        }
      });

      this.imap.connect();
    });
  }

  private startIdle() {
    if (this.isIdle) return;
    
    try {
      this.imap.idle();
      this.isIdle = true;
      console.log('💤 Entered IDLE mode (waiting for push notifications)...');
    } catch (err) {
      console.error('Failed to enter IDLE:', err);
    }
  }

  private stopIdle() {
    if (!this.isIdle) return;
    
    try {
      this.imap.idle.stop();
      this.isIdle = false;
    } catch (err) {
      console.error('Failed to stop IDLE:', err);
    }
  }

  private async fetchNewEmails() {
    // Search for unseen emails
    this.imap.search(['UNSEEN'], async (err, results) => {
      if (err) {
        console.error('Search error:', err);
        this.startIdle(); // Resume IDLE even on error
        return;
      }

      if (!results || results.length === 0) {
        console.log('No new emails found');
        this.startIdle();
        return;
      }

      console.log(`📥 Fetching ${results.length} new email(s)...`);

      const fetch = this.imap.fetch(results, {
        bodies: '', // Fetch entire message
        struct: true,
        markSeen: false // Don't mark as read automatically
      });

      let processedCount = 0;

      fetch.on('message', (msg, seqno) => {
        let buffer = '';

        msg.on('body', (stream: Readable) => {
          stream.on('data', (chunk) => {
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

        msg.once('attributes', (attrs) => {
          console.log(`  ↳ Email #${seqno}: UID ${attrs.uid}`);
        });
      });

      fetch.once('error', (fetchErr) => {
        console.error('Fetch error:', fetchErr);
      });

      fetch.once('end', () => {
        console.log(`✅ Processed ${processedCount}/${results.length} emails\n`);
        this.startIdle(); // Resume IDLE after processing
      });
    });
  }

  private async handleNewEmail(parsed: ParsedMail, seqno: number) {
    const emailJob: EmailJob = {
      id: parsed.messageId || `${Date.now()}-${Math.random()}`,
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      subject: parsed.subject || '',
      bodyPreview: this.extractPreview(parsed.text || parsed.html || ''),
      receivedAt: parsed.date || new Date(),
      fullEmail: parsed.text || parsed.html || '',
      seqno, // Store for later operations (mark read, delete, etc.)
    };

    // Rule-based pre-filter
    if (this.isObviouslyIgnorable(emailJob)) {
      console.log(`  ⏭️  Auto-ignored: ${emailJob.subject}`);
      return;
    }

    // Enqueue for Haiku prescreening
    await prescreenQueue.enqueue(emailJob);
    console.log(`  ✅ Queued: ${emailJob.subject}`);
  }

  private extractPreview(text: string, maxLength: number = 500): string {
    return text.replace(/\s+/g, ' ').trim().substring(0, maxLength);
  }

  private isObviouslyIgnorable(email: EmailJob): boolean {
    const ignorePatterns = [
      'noreply@',
      'do-not-reply',
      'no-reply@',
      'notifications@',
      'automated@',
    ];

    const ignoreSubjects = [
      '[Newsletter]',
      '[Auto]',
      'Unsubscribe',
    ];

    return (
      ignorePatterns.some(p => email.from.toLowerCase().includes(p)) ||
      ignoreSubjects.some(s => email.subject.includes(s))
    );
  }

  // Helper: Mark email as read
  async markAsRead(seqno: number) {
    this.stopIdle();
    this.imap.addFlags(seqno, ['\\Seen'], (err) => {
      if (err) console.error('Failed to mark as read:', err);
      this.startIdle();
    });
  }

  // Helper: Move email to folder
  async moveToFolder(seqno: number, folderName: string) {
    this.stopIdle();
    this.imap.move(seqno, folderName, (err) => {
      if (err) console.error('Failed to move email:', err);
      this.startIdle();
    });
  }

  private reconnect() {
    console.log('🔄 Reconnecting to IMAP...');
    this.imap.connect();
  }

  stop() {
    this.stopIdle();
    this.imap.end();
  }
}

// Update EmailJob type
interface EmailJob {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  receivedAt: Date;
  fullEmail?: string;
  seqno?: number; // For IMAP operations
}import { Connection, parseHeader } from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { Readable } from 'stream';

class EmailListener {
  private imap: Connection;
  private isIdle: boolean = false;
  
  constructor(config: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
  }) {
    this.imap = new Connection({
      ...config,
      tlsOptions: { rejectUnauthorized: false }, // Adjust for production
      keepalive: {
        interval: 10000,  // Send keepalive every 10s
        idleInterval: 300000, // IDLE for 5 minutes before renewing
        forceNoop: true
      }
    });
  }
  
  async start() {
    return new Promise<void>((resolve, reject) => {
      this.imap.once('ready', () => {
        console.log('✅ IMAP connection established');
        
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log(`📬 Monitoring INBOX (${box.messages.total} total messages)`);
          this.startIdle();
          resolve();
        });
      });

      // Event: New mail arrives (PUSH notification)
      this.imap.on('mail', (numNewMsgs: number) => {
        console.log(`\n📨 PUSH: ${numNewMsgs} new email(s) received`);
        this.stopIdle();
        this.fetchNewEmails();
      });

      // Event: Email marked as read/deleted/flagged
      this.imap.on('update', (seqno: number, info: any) => {
        console.log(`🔄 Email #${seqno} updated:`, info);
      });

      // Event: Email expunged (deleted)
      this.imap.on('expunge', (seqno: number) => {
        console.log(`🗑️  Email #${seqno} deleted`);
      });

      // Event: IDLE ended (Gmail/some servers end it after ~29 min)
      this.imap.on('idle-end', () => {
        console.log('⏱️  IDLE ended, restarting...');
        this.startIdle();
      });

      this.imap.on('error', (err: Error) => {
        console.error('❌ IMAP error:', err);
        reject(err);
      });

      this.imap.on('close', (hadError: boolean) => {
        console.log(`🔌 Connection closed ${hadError ? 'with error' : 'normally'}`);
        if (!hadError) {
          // Reconnect after clean disconnect
          setTimeout(() => this.reconnect(), 5000);
        }
      });

      this.imap.connect();
    });
  }

  private startIdle() {
    if (this.isIdle) return;
    
    try {
      this.imap.idle();
      this.isIdle = true;
      console.log('💤 Entered IDLE mode (waiting for push notifications)...');
    } catch (err) {
      console.error('Failed to enter IDLE:', err);
    }
  }

  private stopIdle() {
    if (!this.isIdle) return;
    
    try {
      this.imap.idle.stop();
      this.isIdle = false;
    } catch (err) {
      console.error('Failed to stop IDLE:', err);
    }
  }

  private async fetchNewEmails() {
    // Search for unseen emails
    this.imap.search(['UNSEEN'], async (err, results) => {
      if (err) {
        console.error('Search error:', err);
        this.startIdle(); // Resume IDLE even on error
        return;
      }

      if (!results || results.length === 0) {
        console.log('No new emails found');
        this.startIdle();
        return;
      }

      console.log(`📥 Fetching ${results.length} new email(s)...`);

      const fetch = this.imap.fetch(results, {
        bodies: '', // Fetch entire message
        struct: true,
        markSeen: false // Don't mark as read automatically
      });

      let processedCount = 0;

      fetch.on('message', (msg, seqno) => {
        let buffer = '';

        msg.on('body', (stream: Readable) => {
          stream.on('data', (chunk) => {
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

        msg.once('attributes', (attrs) => {
          console.log(`  ↳ Email #${seqno}: UID ${attrs.uid}`);
        });
      });

      fetch.once('error', (fetchErr) => {
        console.error('Fetch error:', fetchErr);
      });

      fetch.once('end', () => {
        console.log(`✅ Processed ${processedCount}/${results.length} emails\n`);
        this.startIdle(); // Resume IDLE after processing
      });
    });
  }

  private async handleNewEmail(parsed: ParsedMail, seqno: number) {
    const emailJob: EmailJob = {
      id: parsed.messageId || `${Date.now()}-${Math.random()}`,
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      subject: parsed.subject || '',
      bodyPreview: this.extractPreview(parsed.text || parsed.html || ''),
      receivedAt: parsed.date || new Date(),
      fullEmail: parsed.text || parsed.html || '',
      seqno, // Store for later operations (mark read, delete, etc.)
    };

    // Rule-based pre-filter
    if (this.isObviouslyIgnorable(emailJob)) {
      console.log(`  ⏭️  Auto-ignored: ${emailJob.subject}`);
      return;
    }

    // Enqueue for Haiku prescreening
    await prescreenQueue.enqueue(emailJob);
    console.log(`  ✅ Queued: ${emailJob.subject}`);
  }

  private extractPreview(text: string, maxLength: number = 500): string {
    return text.replace(/\s+/g, ' ').trim().substring(0, maxLength);
  }

  private isObviouslyIgnorable(email: EmailJob): boolean {
    const ignorePatterns = [
      'noreply@',
      'do-not-reply',
      'no-reply@',
      'notifications@',
      'automated@',
    ];

    const ignoreSubjects = [
      '[Newsletter]',
      '[Auto]',
      'Unsubscribe',
    ];

    return (
      ignorePatterns.some(p => email.from.toLowerCase().includes(p)) ||
      ignoreSubjects.some(s => email.subject.includes(s))
    );
  }

  // Helper: Mark email as read
  async markAsRead(seqno: number) {
    this.stopIdle();
    this.imap.addFlags(seqno, ['\\Seen'], (err) => {
      if (err) console.error('Failed to mark as read:', err);
      this.startIdle();
    });
  }

  // Helper: Move email to folder
  async moveToFolder(seqno: number, folderName: string) {
    this.stopIdle();
    this.imap.move(seqno, folderName, (err) => {
      if (err) console.error('Failed to move email:', err);
      this.startIdle();
    });
  }

  private reconnect() {
    console.log('🔄 Reconnecting to IMAP...');
    this.imap.connect();
  }

  stop() {
    this.stopIdle();
    this.imap.end();
  }
}

// Update EmailJob type
interface EmailJob {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  receivedAt: Date;
  fullEmail?: string;
  seqno?: number; // For IMAP operations
}
------

## Backend 

The backend receives all incomming emails and evaluates the email rules  per project in the workspace. This means a single incomming email can have many rules to be evaluated.

### Starting the IMAPConnector
If the backend service has been started there is a new "InitExternalServices" method which uses the existing process-manager to start the IMAPConnector and other services.

In InitExternalServices we start the IMAPConnector service if the env variable IMAP_CONNECTION is set.

### Event Handling
We need to add a new event group "Email". The Email event group does only support the event type "Semantic".

#### Condition criteria for Emails
We must use the Haiku model for evaluating the criteria of the rule. If the rule is matched we execute the action as implemented now. Make sure that existing matchers in event-handling also use Haiku.

The user can enter the condition criteria as fulltext in the frontend, for example: "the mail should be flagged as important and the sender must be from the domain entegration.de", "the mail body contains the word 'update' and there are attachments"

## Frontend: Condition Monitoring
We need to add a new event group "Email" in the selection box of the condition. 

We need to support the condition criteria for Email and show the interna data structure of an email so the user knows how to construct the criteria.




