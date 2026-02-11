import express from 'express';
import { EmailListener } from './email-listener';
import { ImapConfig } from './types';

const PORT = 4440;

function parseConnectionString(): ImapConfig {
  const connectionString = process.env.IMAP_CONNECTION;
  if (!connectionString) {
    throw new Error('IMAP_CONNECTION environment variable is not set. Format: host|port|secure|user|password');
  }

  const parts = connectionString.split('|');
  if (parts.length !== 5) {
    throw new Error('IMAP_CONNECTION must be in format: host|port|secure|user|password');
  }

  const [host, portStr, secureStr, user, password] = parts;
  return {
    host,
    port: parseInt(portStr, 10),
    tls: secureStr === 'true',
    user,
    password,
  };
}

async function main() {
  const config = parseConnectionString();
  console.log(`Starting IMAP Connector for ${config.user}@${config.host}:${config.port}`);

  const listener = new EmailListener(config);

  // Health check endpoint
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'imap-connector' });
  });

  const server = app.listen(PORT, () => {
    console.log(`Health endpoint running on :${PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down IMAP Connector...');
    listener.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await listener.start();
  } catch (err) {
    console.error('Failed to start IMAP listener:', err);
    server.close();
    process.exit(1);
  }
}

main();
