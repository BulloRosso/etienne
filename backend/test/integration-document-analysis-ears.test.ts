/**
 * Integration test for the EARS document-analysis MCP tool.
 *
 * Exercises `document_analysis_ears` (group `document-analysis`) over the live
 * StreamableHTTP endpoint against a seeded demo PDF, and asserts the core
 * reliability guarantee introduced by the structured-output rework:
 *
 *   a "0 requirements" result is ALWAYS either a genuinely empty document
 *   (failed_chunks === 0) or an explicitly-flagged failure — never a silently
 *   swallowed parse error.
 *
 * Auto-SKIPS when the backend on :6060 is not reachable or the seeded demo
 * document is missing, so it is safe to run whether or not the dev server is up.
 *
 * Run with:  cd backend && tsx test/integration-document-analysis-ears.test.ts
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MCP_BASE = process.env.MCP_BASE_URL || 'http://localhost:6060';
const MCP_GROUP_URL = `${MCP_BASE}/mcp/document-analysis`;

const DEMO_PROJECT = 'document-creation-demo';
const DEMO_PDF = `${DEMO_PROJECT}/source/product-overview-en.pdf`;

let passed = 0;
let skipped = 0;

function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}
function skip(msg: string) {
  skipped += 1;
  console.log(`  SKIP  ${msg}`);
}

function repoRoot(): string {
  let here = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(here, 'workspace')) && existsSync(join(here, 'backend'))) {
      return here;
    }
    here = join(here, '..');
  }
  return join(process.cwd(), '..');
}

// ---------------------------------------------------------------------------
// Minimal StreamableHTTP MCP client (initialize → tools/call), no SDK dep.
// ---------------------------------------------------------------------------

async function rpc(
  sessionId: string | null,
  body: unknown,
): Promise<{ sessionId: string | null; json: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(MCP_GROUP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const newSession = res.headers.get('mcp-session-id') || sessionId;
  const text = await res.text();

  let json: any = null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    json = JSON.parse(trimmed);
  } else {
    for (const line of trimmed.split('\n')) {
      const l = line.trim();
      if (l.startsWith('data:')) {
        const payload = l.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          try { json = JSON.parse(payload); } catch { /* keep scanning */ }
        }
      }
    }
  }
  return { sessionId: newSession, json };
}

async function backendReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(MCP_BASE, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    return !!res;
  } catch {
    return false;
  }
}

async function callEarsAnalysis(documentPath: string): Promise<{ ok: boolean; parsed: any }> {
  const init = await rpc(null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ears-int-test', version: '1.0.0' },
    },
  });
  const sessionId = init.sessionId;
  assert.ok(init.json?.result, 'initialize should return a result');

  await rpc(sessionId, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }).catch(() => undefined);

  const call = await rpc(sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'document_analysis_ears',
      arguments: { document_path: documentPath, output_format: 'json' },
    },
  });

  assert.ok(call.json, 'tools/call should return a JSON-RPC envelope');
  assert.ok(!call.json.error, `tools/call error: ${JSON.stringify(call.json.error)}`);

  const result = call.json.result;
  const content = result?.content;
  assert.ok(Array.isArray(content), 'tool result should carry a content array');
  const textPart = content.find((c: any) => c.type === 'text');
  assert.ok(textPart, 'tool result should include a text content part');

  let parsed: any = textPart.text;
  try { parsed = JSON.parse(parsed); } catch { /* may already be object-ish */ }

  const isToolError =
    result?.isError === true ||
    (parsed && typeof parsed === 'object' && parsed.error === true);

  return { ok: !isToolError, parsed };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testEarsAnalysis(): Promise<void> {
  if (!(await backendReachable())) {
    skip(`backend not reachable at ${MCP_BASE} — EARS analysis tests skipped`);
    return;
  }

  const root = repoRoot();
  if (!existsSync(join(root, 'workspace', DEMO_PROJECT, 'source', 'product-overview-en.pdf'))) {
    skip(`seeded demo project missing at workspace/${DEMO_PROJECT} — EARS tests skipped`);
    return;
  }

  // 1. Healthy run over the demo PDF.
  const { ok, parsed } = await callEarsAnalysis(DEMO_PDF);
  assert.ok(ok, `document_analysis_ears should succeed on the demo PDF: ${JSON.stringify(parsed)?.slice(0, 300)}`);
  pass('document_analysis_ears returns a successful result for the demo PDF');

  // 2. Result shape.
  assert.ok(parsed && typeof parsed === 'object', 'result is an object');
  assert.ok(Array.isArray(parsed.requirements), 'result has a requirements array');
  assert.ok(parsed.source_language && typeof parsed.source_language === 'object', 'result has source_language');
  assert.ok(parsed.quality_analysis && typeof parsed.quality_analysis === 'object', 'result has quality_analysis');
  pass('result carries requirements, source_language, quality_analysis');

  // 3. extraction_health is present and numeric.
  const health = parsed.extraction_health;
  assert.ok(health && typeof health === 'object', 'result has extraction_health');
  assert.equal(typeof health.total_chunks, 'number', 'total_chunks is numeric');
  assert.equal(typeof health.failed_chunks, 'number', 'failed_chunks is numeric');
  assert.equal(typeof health.truncated_chunks, 'number', 'truncated_chunks is numeric');
  pass(`extraction_health present (${health.failed_chunks}/${health.total_chunks} failed, ${health.truncated_chunks} truncated)`);

  // 4. CORE GUARANTEE: a zero result is never a swallowed failure.
  assert.ok(
    parsed.requirements.length > 0 || health.failed_chunks === 0,
    'zero requirements must imply a genuinely empty doc (failed_chunks === 0), never a swallowed failure',
  );
  pass('core guarantee: requirements.length > 0 || failed_chunks === 0');

  // 5. A healthy doc does not fail every chunk.
  assert.ok(
    health.total_chunks === 0 || health.failed_chunks < health.total_chunks,
    'a healthy doc should not fail every chunk',
  );
  pass('not all chunks failed on a healthy doc');

  // 6. Missing document surfaces a clean tool error (not a crash, not empty success).
  const missing = await callEarsAnalysis(`${DEMO_PROJECT}/source/does-not-exist.pdf`);
  assert.equal(missing.ok, false, 'missing document should be reported as a tool error');
  const msg = JSON.stringify(missing.parsed).toLowerCase();
  assert.ok(msg.includes('not found') || msg.includes('no text'), `error should mention not-found: ${msg.slice(0, 200)}`);
  pass('missing document surfaces a clean not-found tool error');
}

async function main(): Promise<void> {
  console.log('\nEARS document-analysis integration test\n');
  await testEarsAnalysis();
  console.log(`\n${passed} passed, ${skipped} skipped.\n`);
  if (passed === 0 && skipped === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exitCode = 1;
});
