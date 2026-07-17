/**
 * Isolated connectivity test: Kimi Agent SDK → Kimi CLI → Moonshot API
 *
 * Creates a session in a temp workspace directory (yoloMode), sends a prompt
 * that writes a file, dumps EVERY raw stream event as JSON (this is the ground
 * truth for the event adapter: text delta-vs-cumulative semantics, real tool
 * names, StatusUpdate/token_usage units) and asserts the turn finished plus
 * the file exists.
 *
 * Run:  cd backend && npx tsx test/kimi-code-isolated.ts
 *       (add --mcp to also verify shareDir mcp.json pickup)
 *
 * Requires:
 *   - Kimi CLI installed (`kimi` on PATH or KIMI_BINARY_PATH in .env)
 *   - MOONSHOT_API_KEY in backend/.env (forwarded to the CLI as KIMI_API_KEY)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY = process.env.MOONSHOT_API_KEY;
const BINARY = process.env.KIMI_BINARY_PATH || 'kimi';
const MODEL = process.env.KIMI_MODEL || undefined;
const WITH_MCP = process.argv.includes('--mcp');

if (!API_KEY) {
  console.error('Missing MOONSHOT_API_KEY in backend/.env');
  process.exit(1);
}

async function main() {
  console.log('=== Kimi Agent SDK — Isolated Test ===\n');
  console.log(`Executable: ${BINARY}`);
  console.log(`Model:      ${MODEL ?? '(CLI default)'}`);

  // Dynamic import for ESM/CJS interop parity with the backend services
  const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
  const sdk = await dynamicImport('@moonshot-ai/kimi-agent-sdk');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-code-test-'));
  const shareDir = path.join(tmpDir, '.kimi');
  fs.mkdirSync(shareDir, { recursive: true });
  console.log(`Temp dir:   ${tmpDir}\n`);

  if (WITH_MCP) {
    // Provision a trivial stdio MCP server to verify shareDir mcp.json pickup.
    fs.writeFileSync(
      path.join(shareDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { echo: { command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] } } }, null, 2),
      'utf-8',
    );
    console.log('Provisioned shareDir mcp.json with a dummy stdio server\n');
  }

  let session: any;
  const timeout = setTimeout(() => {
    console.error('\nTimeout: no completion after 120 seconds');
    process.exit(1);
  }, 120_000);

  try {
    session = sdk.createSession({
      workDir: tmpDir,
      model: MODEL,
      yoloMode: true,
      executable: BINARY,
      shareDir,
      env: {
        KIMI_API_KEY: API_KEY,
        MOONSHOT_API_KEY: API_KEY,
      },
    });
    console.log(`Session ID: ${session.sessionId}\n`);

    const promptText = "Create a file named hello.txt containing exactly the text 'hi', then say done in one short sentence.";
    console.log(`Sending prompt: "${promptText}"\n--- raw events ---`);

    const turn = session.prompt(promptText);

    let textOut = '';
    let lastTokenUsage: any;
    for await (const ev of turn) {
      // Full raw dump — the ground truth for the event adapter.
      console.log(JSON.stringify(ev));

      if (ev.type === 'ContentPart' && ev.payload?.type === 'text') {
        textOut += ev.payload.text;
      }
      if (ev.type === 'StatusUpdate' && ev.payload?.token_usage) {
        lastTokenUsage = ev.payload.token_usage;
      }
      // yoloMode should prevent these, but never let the turn stall:
      if (ev.type === 'ApprovalRequest') {
        console.log(`  -> auto-approving ${ev.payload?.id}`);
        await turn.approve(ev.payload.id, 'approve');
      }
      if (ev.type === 'QuestionRequest') {
        const answers: Record<string, string> = {};
        for (const q of ev.payload?.questions ?? []) {
          answers[q.question] = q.options?.[0]?.label ?? '';
        }
        console.log(`  -> auto-answering question ${ev.payload?.id}`);
        await turn.respondQuestion(ev.payload.id, ev.payload.id, answers);
      }
    }

    const result = await turn.result;
    clearTimeout(timeout);

    console.log('--- end raw events ---\n');
    console.log('--- Response text ---');
    console.log(textOut.trim() || '(no text received)');
    console.log('---');
    console.log(`RunResult:  ${JSON.stringify(result)}`);
    console.log(`TokenUsage: ${JSON.stringify(lastTokenUsage)}`);

    const helloPath = path.join(tmpDir, 'hello.txt');
    const fileOk = fs.existsSync(helloPath);
    console.log(`hello.txt:  ${fileOk ? `exists (${JSON.stringify(fs.readFileSync(helloPath, 'utf-8'))})` : 'MISSING'}`);

    if (result.status === 'finished' && fileOk && textOut.trim()) {
      console.log('\nPASSED');
    } else {
      console.error('\nFAILED (see assertions above)');
      process.exitCode = 1;
    }
  } catch (err: any) {
    clearTimeout(timeout);
    const code = typeof sdk?.getErrorCode === 'function' ? sdk.getErrorCode(err) : undefined;
    console.error(`\nFAILED: ${err?.message}${code ? ` (code=${code})` : ''}`);
    if (code === 'CLI_NOT_FOUND') {
      console.error('Kimi CLI not found. Install it (PowerShell: Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression) or set KIMI_BINARY_PATH in backend/.env');
    }
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    try { await session?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
