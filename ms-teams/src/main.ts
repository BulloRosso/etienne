import express from 'express';
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
  ConversationReference,
} from 'botbuilder';
import { loadConfig } from './config/config';
import { TeamsBot } from './bot';
import { SessionManagerClientService } from './services/session-manager-client.service';
import { SSEListenerService } from './services/sse-listener.service';
import { ProviderEvent } from './types';

async function main() {
  console.log('========================================');
  console.log('  MS Teams Provider for Etienne');
  console.log('========================================');
  console.log('');

  // Load configuration
  const config = loadConfig();
  console.log(`[Config] Backend URL: ${config.backendUrl}`);

  // Create Bot Framework authentication
  const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.microsoftAppId,
    MicrosoftAppPassword: config.microsoftAppPassword,
  });

  // Create adapter
  const adapter = new CloudAdapter(botFrameworkAuth);

  // Error handler
  adapter.onTurnError = async (context: TurnContext, error: Error) => {
    console.error(`[Bot] Error while handling update:`, error);
    try {
      await context.sendActivity('❌ An error occurred. Please try again.');
    } catch {
      // Ignore if we can't send the error message
    }
  };

  // Create services
  const sessionManagerClient = new SessionManagerClientService(config.backendUrl);
  const sseListener = new SSEListenerService(config.backendUrl, 'teams');

  // Create bot
  const bot = new TeamsBot(sessionManagerClient);

  // Store conversation references for proactive messaging
  const conversationReferences = new Map<string, Partial<ConversationReference>>();

  // Subscribe to SSE events for sending responses back to users
  sseListener.subscribe(async (event: ProviderEvent) => {
    const conversationId = event.data?.chatId;
    if (!conversationId) {
      console.warn('[SSE] Event missing chatId:', event);
      return;
    }

    const reference = conversationReferences.get(String(conversationId));
    if (!reference) {
      console.warn(`[SSE] No conversation reference for: ${conversationId}`);
      return;
    }

    try {
      await adapter.continueConversationAsync(
        config.microsoftAppId,
        reference as ConversationReference,
        async (context) => {
          switch (event.type) {
            case 'pairing_approved':
              console.log(`[SSE] Pairing approved for conversationId ${conversationId}`);
              await context.sendActivity(
                '✅ Pairing approved!\n\n' +
                'Use `/projects` to see available projects.\n' +
                'Use `project \'project-name\'` to select one.'
              );
              break;

            case 'pairing_denied':
              console.log(`[SSE] Pairing denied for conversationId ${conversationId}`);
              await context.sendActivity(
                `❌ Pairing denied: ${event.data.message || 'Access denied by admin'}\n\n` +
                'Contact the administrator for access.'
              );
              break;

            case 'etienne_response':
              // Response from Etienne (when using async message handling)
              console.log(`[SSE] Etienne response for conversationId ${conversationId}`);
              if (event.data.response) {
                await sendLongMessage(context, event.data.response);
              }
              break;

            case 'error':
              console.log(`[SSE] Error for conversationId ${conversationId}: ${event.data.error}`);
              await context.sendActivity(`❌ Error: ${event.data.error}`);
              break;

            default:
              console.log(`[SSE] Unknown event type: ${event.type}`);
          }
        }
      );
    } catch (error) {
      console.error(`[SSE] Error handling event for conversationId ${conversationId}:`, error);
    }
  });

  // Start SSE listener
  sseListener.start();

  // Create Express server
  const app = express();
  app.use(express.json());

  // Webhook endpoint for Bot Framework
  app.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, async (context) => {
      // Store conversation reference for proactive messaging
      const reference = TurnContext.getConversationReference(context.activity);
      conversationReferences.set(context.activity.conversation.id, reference);

      await bot.run(context);
    });
  });

  // Health check endpoint
  app.get('/health', (req, res) => res.json({ status: 'ok', provider: 'teams' }));

  // Start server
  app.listen(config.port, () => {
    console.log('');
    console.log('========================================');
    console.log(`  Teams Provider listening on port ${config.port}`);
    console.log('========================================');
    console.log('');
    console.log('Webhook endpoint: POST /api/messages');
    console.log('');
    console.log('Note: For Teams to reach this endpoint, you need:');
    console.log(`1. HTTPS (use ngrok for local dev: ngrok http ${config.port})`);
    console.log('2. Configure Azure Bot messaging endpoint to your HTTPS URL');
    console.log('');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Bot] Shutting down...');
    sseListener.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Bot] Shutting down...');
    sseListener.stop();
    process.exit(0);
  });
}

/**
 * Send a long message by splitting it into chunks
 * Teams supports larger messages but we split for readability
 */
async function sendLongMessage(context: TurnContext, text: string): Promise<void> {
  const maxLength = 4000;

  if (text.length <= maxLength) {
    await context.sendActivity(text);
    return;
  }

  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      if (currentChunk) {
        await context.sendActivity(currentChunk);
      }
      if (paragraph.length > maxLength) {
        // Split by lines if paragraph is too long
        const lines = paragraph.split('\n');
        currentChunk = '';
        for (const line of lines) {
          if (currentChunk.length + line.length + 1 > maxLength) {
            await context.sendActivity(currentChunk);
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
    await context.sendActivity(currentChunk);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
