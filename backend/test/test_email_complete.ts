/**
 * Complete Email Test
 *
 * Tests both sending (SMTP) and receiving (IMAP) emails
 */

import * as dotenv from 'dotenv';
import { SMTPClient, Message } from 'emailjs';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

dotenv.config();

const TEST_SUBJECT = `Test ${Date.now()}`;
const TEST_BODY = 'This is a complete test of SMTP sending and IMAP receiving.';

function parseConnectionString(connectionString: string): any {
  const parts = connectionString.split('|');
  return {
    host: parts[0],
    port: parseInt(parts[1], 10),
    secure: parts[2] === 'true',
    user: parts[3],
    password: parts[4],
  };
}

async function sendEmail(): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   Step 1: Sending Email (SMTP)       ║');
  console.log('╚═══════════════════════════════════════╝\n');

  const config = parseConnectionString(process.env.SMTP_CONNECTION!);

  const client = new SMTPClient({
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port,
    ssl: false,
    tls: true,
    timeout: 15000,
  });

  const message = new Message({
    from: config.user,
    to: config.user,
    subject: TEST_SUBJECT,
    text: TEST_BODY,
  });

  console.log(`Sending to: ${config.user}`);
  console.log(`Subject: ${TEST_SUBJECT}\n`);

  await client.sendAsync(message);
  console.log('✓ Email sent successfully!\n');
}

async function checkInbox(): Promise<boolean> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   Step 2: Checking Inbox (IMAP)      ║');
  console.log('╚═══════════════════════════════════════╝\n');

  return new Promise((resolve, reject) => {
    const config = parseConnectionString(process.env.IMAP_CONNECTION!);

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.secure,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    let found = false;

    imap.once('ready', () => {
      console.log('✓ Connected to IMAP server');

      imap.openBox('INBOX', false, (err: any, box: any) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        console.log(`✓ Opened INBOX (${box.messages.total} total messages)\n`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        imap.search([['SINCE', today]], (err: any, results: any) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            console.log('No messages found from today');
            imap.end();
            resolve(false);
            return;
          }

          console.log(`Found ${results.length} messages from today`);
          console.log('Searching for test email...\n');

          const fetch = imap.fetch(results, { bodies: '', markSeen: false });

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, async (err: any, parsed: any) => {
                if (err) return;

                const subject = parsed.subject || '';
                if (subject === TEST_SUBJECT) {
                  console.log('✓ FOUND TEST EMAIL!');
                  console.log(`  Subject: ${subject}`);
                  console.log(`  From: ${parsed.from?.text}`);
                  console.log(`  Date: ${parsed.date}`);
                  console.log(`  Body: ${parsed.text?.substring(0, 100)}`);
                  found = true;
                }
              });
            });
          });

          fetch.once('end', () => {
            imap.end();
          });
        });
      });
    });

    imap.once('error', (err: any) => {
      reject(err);
    });

    imap.once('end', () => {
      resolve(found);
    });

    imap.connect();
  });
}

async function runTest() {
  try {
    await sendEmail();

    console.log('Waiting 10 seconds for email to arrive...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const found = await checkInbox();

    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║          Test Results                 ║');
    console.log('╚═══════════════════════════════════════╝\n');

    if (found) {
      console.log('✓ SUCCESS: Email sent and received!');
      console.log('✓ Both SMTP and IMAP are working correctly.\n');
      process.exit(0);
    } else {
      console.log('⚠  Email was sent but not found in inbox yet.');
      console.log('  This may be due to email delivery delay.\n');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n✗ TEST FAILED');
    console.error(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

runTest();
