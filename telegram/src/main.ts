import { loadConfig } from './config/config';
import { createBot } from './bot';
import { SessionManagerClientService } from './services/session-manager-client.service';
import { SSEListenerService } from './services/sse-listener.service';
import { registerCommandHandlers } from './handlers/command.handler';
import { registerMessageHandler } from './handlers/message.handler';
import { ProviderEvent } from './types';

async function main() {
  console.log('========================================');
  console.log('  Telegram Provider for Etienne');
  console.log('========================================');
  console.log('');

  // Load configuration
  const config = loadConfig();
  console.log(`[Config] Backend URL: ${config.backendUrl}`);

  // Create services
  const sessionManagerClient = new SessionManagerClientService(config.backendUrl);
  const sseListener = new SSEListenerService(config.backendUrl);

  // Create bot
  const bot = createBot(config.botToken);

  // Register handlers
  registerCommandHandlers(bot, sessionManagerClient);
  registerMessageHandler(bot, sessionManagerClient);

  // Subscribe to SSE events for sending responses back to users
  sseListener.subscribe(async (event: ProviderEvent) => {
    const chatId = event.data?.chatId;
    if (!chatId) {
      console.warn('[SSE] Event missing chatId:', event);
      return;
    }

    try {
      switch (event.type) {
        case 'pairing_approved':
          console.log(`[SSE] Pairing approved for chatId ${chatId}`);
          await bot.api.sendMessage(
            chatId,
            '✅ Pairing approved!\n\n' +
            'Use `/projects` to see available projects.\n' +
            'Use `project \'project-name\'` to select one.',
            { parse_mode: 'Markdown' }
          );
          break;

        case 'pairing_denied':
          console.log(`[SSE] Pairing denied for chatId ${chatId}`);
          await bot.api.sendMessage(
            chatId,
            `❌ Pairing denied: ${event.data.message || 'Access denied by admin'}\n\n` +
            'Contact the administrator for access.'
          );
          break;

        case 'etienne_response':
          // Response from Etienne (when using async message handling)
          // Currently handled synchronously in message handler
          console.log(`[SSE] Etienne response for chatId ${chatId}`);
          if (event.data.response) {
            await sendLongMessage(bot, chatId, event.data.response);
          }
          break;

        case 'error':
          console.log(`[SSE] Error for chatId ${chatId}: ${event.data.error}`);
          await bot.api.sendMessage(chatId, `❌ Error: ${event.data.error}`);
          break;

        default:
          console.log(`[SSE] Unknown event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`[SSE] Error handling event for chatId ${chatId}:`, error);
    }
  });

  // Start SSE listener
  sseListener.start();

  // Start bot with long polling
  console.log('[Bot] Starting with long polling...');

  bot.start({
    onStart: (botInfo) => {
      console.log('');
      console.log('========================================');
      console.log(`  Bot @${botInfo.username} is running!`);
      console.log('========================================');
      console.log('');
      console.log('To use this bot:');
      console.log(`1. Open Telegram and search for @${botInfo.username}`);
      console.log('2. Send /start to begin pairing');
      console.log('3. Approve the pairing request in the web UI');
      console.log('4. Select a project and start chatting!');
      console.log('');
    },
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Bot] Shutting down...');
    sseListener.stop();
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Bot] Shutting down...');
    sseListener.stop();
    bot.stop();
    process.exit(0);
  });
}

/**
 * Send a long message by splitting it into chunks
 * Telegram has a 4096 character limit per message
 */
async function sendLongMessage(bot: any, chatId: number, text: string): Promise<void> {
  const maxLength = 4000;

  if (text.length <= maxLength) {
    await bot.api.sendMessage(chatId, text);
    return;
  }

  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      if (currentChunk) {
        await bot.api.sendMessage(chatId, currentChunk);
      }
      if (paragraph.length > maxLength) {
        // Split by lines if paragraph is too long
        const lines = paragraph.split('\n');
        currentChunk = '';
        for (const line of lines) {
          if (currentChunk.length + line.length + 1 > maxLength) {
            await bot.api.sendMessage(chatId, currentChunk);
            currentChunk = line;
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk) {
    await bot.api.sendMessage(chatId, currentChunk);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
