/**
 * Runtime smoke test for the MCP 2026-07-28 migration.
 * Replicates the backend's server pattern (low-level Server + createMcpHandler
 * + toNodeHandler + AsyncLocalStorage project context) and exercises it with:
 *   1. a v2 SDK client (versionNegotiation auto → modern era)
 *   2. a raw legacy 2025-era handshake client (initialize → tools/call)
 *   3. a raw stateless 2026-07-28 client (the frontend/seed-script wire format)
 * Run with: node test/mcp-dual-era-smoke.mjs (from backend/)
 */
import { createServer as createHttpServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const als = new AsyncLocalStorage();

function buildServer(projectRoot) {
  // Enter the project ALS inside each handler: the per-request server was
  // built for exactly this exchange, so the captured projectRoot is correct
  // for every handler invocation on this instance.
  const scoped = (fn) => (request, ctx) => als.run({ projectRoot }, () => fn(request, ctx));

  const server = new Server(
    { name: 'mcp-smoke', version: '1.0.0' },
    {
      capabilities: { tools: {}, resources: {} },
      cacheHints: {
        'tools/list': { ttlMs: 60_000, cacheScope: 'private' },
        'resources/list': { ttlMs: 300_000, cacheScope: 'private' },
        'resources/read': { ttlMs: 300_000, cacheScope: 'private' },
      },
    },
  );
  server.setRequestHandler('tools/list', scoped(async () => ({
    tools: [{
      name: 'echo_project',
      description: 'Echo ambient project context',
      inputSchema: { type: 'object', properties: {} },
    }],
  })));
  server.setRequestHandler('tools/call', scoped(async (request, ctx) => {
    const store = als.getStore();
    const progressToken = ctx.mcpReq._meta?.progressToken;
    if (progressToken) {
      await ctx.mcpReq.notify({
        method: 'notifications/progress',
        params: { progressToken, progress: 1, total: 1 },
      });
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ tool: request.params.name, project: store?.projectRoot ?? null }) }],
    };
  }));
  server.setRequestHandler('resources/list', scoped(async () => ({
    resources: [{ uri: 'ui://smoke/app.html', name: 'smoke', mimeType: 'text/html' }],
  })));
  server.setRequestHandler('resources/read', scoped(async (request) => ({
    contents: [{ uri: request.params.uri, mimeType: 'text/html', text: '<html>ok</html>' }],
  })));
  return server;
}

function projectRootFromRequest(requestInfo) {
  if (!requestInfo) return null;
  const header = requestInfo.headers.get('x-project-name');
  const query = new URL(requestInfo.url).searchParams.get('project');
  const projectName = header || query;
  return projectName ? `/workspace/${projectName}` : null;
}

const handler = createMcpHandler(
  (mcpCtx) => buildServer(projectRootFromRequest(mcpCtx.requestInfo)),
  { legacy: 'stateless' },
);
const nodeHandler = toNodeHandler(handler);

const httpServer = createHttpServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = body ? JSON.parse(body) : undefined;
    nodeHandler(req, res, parsed).catch((e) => {
      console.error('handler error', e);
      if (!res.headersSent) { res.writeHead(500); res.end(); }
    });
  });
});

await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
const port = httpServer.address().port;
const url = `http://127.0.0.1:${port}/mcp/smoke`;
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log(`PASS ${name}`);
  else { failures++; console.error(`FAIL ${name}`, detail ?? ''); }
}

// ── 1. v2 SDK client, auto negotiation (should land on modern era) ──────────
{
  const client = new Client({ name: 'smoke-client', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { 'X-Project-Name': 'proj-modern' } },
  });
  await client.connect(transport);
  check('v2 client negotiated era', client.getProtocolEra() === 'modern', client.getProtocolEra());
  const tools = await client.listTools();
  check('v2 client tools/list', tools.tools?.[0]?.name === 'echo_project', JSON.stringify(tools).slice(0, 200));
  check('v2 client tools/list cache hints', typeof tools.ttlMs === 'number' && !!tools.cacheScope, JSON.stringify({ ttlMs: tools.ttlMs, cacheScope: tools.cacheScope }));
  const result = await client.callTool({ name: 'echo_project', arguments: {} });
  const payload = JSON.parse(result.content[0].text);
  check('v2 client callTool + ALS project context', payload.project === '/workspace/proj-modern', payload);
  const res = await client.readResource({ uri: 'ui://smoke/app.html' });
  check('v2 client resources/read', res.contents?.[0]?.text === '<html>ok</html>');
  await client.close();
}

// ── 2. legacy 2025-era raw client (initialize → tools/call) ─────────────────
{
  const post = async (body) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-project-name': 'proj-legacy',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    if (text.trim().startsWith('{')) json = JSON.parse(text);
    else for (const line of text.split('\n')) if (line.startsWith('data:')) { try { json = JSON.parse(line.slice(5)); } catch {} }
    return { status: r.status, json, sessionId: r.headers.get('mcp-session-id') };
  };
  const init = await post({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'legacy-smoke', version: '1.0.0' } },
  });
  check('legacy initialize answered', !!init.json?.result?.protocolVersion, JSON.stringify(init.json).slice(0, 200));
  check('legacy initialize is sessionless', !init.sessionId, init.sessionId);
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const call = await post({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'echo_project', arguments: {} },
  });
  const legacyPayload = JSON.parse(call.json?.result?.content?.[0]?.text ?? '{}');
  check('legacy tools/call + ALS project context', legacyPayload.project === '/workspace/proj-legacy', call.json);
}

// ── 3. raw stateless 2026-07-28 client (frontend/seed-script wire format) ───
{
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-project-name': 'proj-2026',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'echo_project',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: {
        name: 'echo_project', arguments: {},
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'raw-2026', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  const text = await r.text();
  let json = null;
  if (text.trim().startsWith('{')) json = JSON.parse(text);
  else for (const line of text.split('\n')) if (line.startsWith('data:')) { try { json = JSON.parse(line.slice(5)); } catch {} }
  check('raw 2026 call HTTP 200', r.status === 200, `${r.status} ${text.slice(0, 300)}`);
  check('raw 2026 resultType complete', json?.result?.resultType === 'complete', JSON.stringify(json).slice(0, 300));
  const rawPayload = JSON.parse(json?.result?.content?.[0]?.text ?? '{}');
  check('raw 2026 ALS project context', rawPayload.project === '/workspace/proj-2026', rawPayload);
  const serverInfo = json?.result?._meta?.['io.modelcontextprotocol/serverInfo'];
  check('raw 2026 serverInfo in result _meta', serverInfo?.name === 'mcp-smoke', JSON.stringify(json?.result?._meta));
}

await handler.close();
httpServer.close();
console.log(failures === 0 ? 'ALL SMOKE TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
