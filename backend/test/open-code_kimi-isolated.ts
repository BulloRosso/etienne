/**
 * Isolated connectivity test: OpenCode SDK → Azure Foundry → Kimi K2 Thinking
 *
 * Starts a temporary OpenCode server with inline Azure Foundry provider config,
 * creates a session, sends a single prompt, and prints the response.
 *
 * Run:  cd backend && npx ts-node test/open-code_kimi-isolated.ts
 *
 * Requires in .env:
 *   OPENCODE_AZURE_DEPLOYMENT  — full chat completions URL
 *   OPENCODE_AZURE_API_KEY     — Azure API key
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DEPLOYMENT_URL = process.env.OPENCODE_AZURE_DEPLOYMENT;
const API_KEY = process.env.OPENCODE_AZURE_API_KEY;

if (!DEPLOYMENT_URL || !API_KEY) {
  console.error(
    'Missing env vars. Set OPENCODE_AZURE_DEPLOYMENT and OPENCODE_AZURE_API_KEY in backend/.env',
  );
  process.exit(1);
}

// Derive baseURL from the deployment URL.
// The @ai-sdk/openai-compatible adapter appends /chat/completions to the baseURL.
// IMPORTANT: Query params in baseURL get mangled (placed before /chat/completions).
// Instead, pass api-version via the headers option (Azure also accepts it as a header),
// or use the full URL as baseURL with a trailing slash trick.
//
// Strategy: use the full chat/completions path as the baseURL. The SDK model endpoint
// will be constructed as baseURL + "/chat/completions" but we set compatibility mode
// to avoid double-pathing. Simplest: just use the origin + /openai/v1 format which
// Azure Foundry supports, and pass api-version as a custom header.
const deployUrl = new URL(DEPLOYMENT_URL);
const apiVersion = deployUrl.searchParams.get('api-version') || '2024-05-01-preview';
// Use /models as the base — the SDK appends /chat/completions
const baseURL = `${deployUrl.origin}/models`;

async function main() {
  console.log('=== OpenCode SDK → Azure Foundry Kimi K2 — Isolated Test ===\n');
  console.log(`Deployment: ${DEPLOYMENT_URL}`);
  console.log(`Base URL:   ${baseURL}`);

  // Dynamic import for ESM-only SDK
  const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
  const sdk = await dynamicImport('@opencode-ai/sdk');

  // OpenCode config with Azure Foundry provider — passed via OPENCODE_CONFIG_CONTENT
  const opencodeConfig = {
    provider: {
      'azure-foundry': {
        npm: '@ai-sdk/openai-compatible',
        name: 'Azure Foundry',
        options: {
          baseURL,
          apiKey: API_KEY,
        },
        models: {
          'kimi-k2-thinking': {
            name: 'Kimi K2 Thinking (Azure Foundry)',
            limit: {
              context: 262144,
              output: 32768,
            },
          },
        },
      },
    },
    model: 'azure-foundry/kimi-k2-thinking',
  };

  // Create a temp workspace directory for the session
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-kimi-test-'));
  console.log(`Temp dir:   ${tmpDir}\n`);

  let server: any;
  try {
    // Start OpenCode server with the Azure config
    console.log('Starting OpenCode server...');
    server = await sdk.createOpencodeServer({
      port: 0,        // auto-assign port
      timeout: 60000, // 60s startup timeout (may need to npm-install the provider adapter)
      config: {
        ...opencodeConfig,
        logLevel: 'DEBUG',
      },
    });
    console.log(`Server URL: ${server.url}\n`);

    // Create client
    const client = sdk.createOpencodeClient({ baseUrl: server.url });

    // Create session
    console.log('Creating session...');
    const session = await client.session.create({
      body: { path: tmpDir },
    });
    const sessionId = session.data?.id ?? session.id ?? session;
    console.log(`Session ID: ${sessionId}\n`);

    // Subscribe to events BEFORE sending prompt
    const eventStream = await client.event.subscribe({
      query: { sessionID: sessionId },
    });

    // Send prompt
    const prompt = 'Say hello and tell me what model you are. Keep it to 2 sentences.';
    console.log(`Sending prompt: "${prompt}"\n`);
    await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text: prompt }] },
    });

    // Process events until session goes idle
    let assistantText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };
    const timeout = setTimeout(() => {
      console.error('\nTimeout: no response after 120 seconds');
      process.exit(1);
    }, 120_000);

    for await (const rawEvent of eventStream) {
      const ev = rawEvent?.payload ?? rawEvent;

      // Filter to our session
      const evSessionId = rawEvent?.properties?.sessionID;
      if (evSessionId && evSessionId !== sessionId) continue;

      // Debug: log every event type
      const evType = ev.type ?? 'unknown';
      const brief = evType === 'message.updated'
        ? `(role=${ev.message?.role ?? '?'}, parts=${ev.message?.parts?.length ?? 0})`
        : evType === 'session.updated'
          ? `(status=${ev.session?.status ?? '?'})`
          : '';
      console.log(`  [event] ${evType} ${brief}`);

      // Collect assistant text from message events
      if (ev.type === 'message.updated' || ev.type === 'message.created') {
        const msg = ev.message ?? ev;
        if (msg.role === 'assistant') {
          const parts = msg.parts ?? msg.content ?? [];
          for (const part of parts) {
            if (part.type === 'text' && part.text) {
              // Overwrite (message.updated sends full text, not delta)
              assistantText = part.text;
            }
          }
        }
      }

      // Collect token usage
      if (ev.type === 'session.updated') {
        const sess = ev.session ?? ev;
        if (sess.usage) {
          usage = {
            input_tokens: sess.usage.inputTokens ?? sess.usage.input_tokens ?? 0,
            output_tokens: sess.usage.outputTokens ?? sess.usage.output_tokens ?? 0,
          };
        }
        if (sess.status === 'idle') {
          clearTimeout(timeout);
          break;
        }
      }

      // Handle errors
      if (ev.type === 'session.error' || ev.type === 'error') {
        clearTimeout(timeout);
        console.error('Session error:', JSON.stringify(ev, null, 2));
        break;
      }
    }

    // Print results
    console.log('--- Response ---');
    console.log(assistantText.trim() || '(no text received)');
    console.log('---');
    console.log(`Tokens: ${usage.input_tokens} in, ${usage.output_tokens} out`);
    console.log(`\nPASSED`);
  } catch (err: any) {
    console.error(`\nFAILED: ${err.message}`);
    if (err.cause) console.error('Cause:', err.cause);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (server?.close) server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
