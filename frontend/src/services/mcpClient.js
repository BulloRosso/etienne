/**
 * Shared MCP client (Streamable HTTP transport, protocol 2026-07-28).
 * Talks to backend MCP endpoints at `/mcp/<group>`.
 *
 * The 2026-07-28 revision is stateless: there is no initialize handshake and
 * no Mcp-Session-Id. Every request carries its protocol version and client
 * identity in `_meta`, mirrored into the required HTTP headers
 * (MCP-Protocol-Version, Mcp-Method, Mcp-Name), and the server answers each
 * POST with a single JSON object or a request-scoped SSE stream.
 *
 * Note: backend tools don't use `x-mcp-header` parameter annotations, so no
 * Mcp-Param-* headers are mirrored here.
 *
 * Public API:
 *   callMcp(projectName, group, toolName, args?) -> tool result (parsed JSON if available)
 */

import axios from 'axios';
import { API_BASE } from './api';

const MCP_TOKEN = 'test123';
const PROTOCOL_VERSION = '2026-07-28';
const CLIENT_INFO = { name: 'mcp-frontend', version: '1.0.0' };

function parseSseOrJson(rawBody) {
  if (typeof rawBody === 'object' && rawBody !== null) return rawBody;
  if (typeof rawBody !== 'string') return rawBody;
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { return rawBody; }
  }
  // SSE stream: the final JSON-RPC response is the last data: line with a result/error
  const lines = trimmed.split(/\r?\n/);
  let last;
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      try {
        const parsed = JSON.parse(payload);
        if (parsed.result !== undefined || parsed.error !== undefined) last = parsed;
      } catch { /* ignore */ }
    }
  }
  return last !== undefined ? last : rawBody;
}

/**
 * Encode a value for an Mcp-* header. Plain ASCII passes through; anything
 * unsafe uses the spec's Base64 sentinel format (=?base64?...?=).
 */
function encodeHeaderValue(value) {
  const isPlainAscii = /^[\x21-\x7e]([\x20\x21-\x7e]*[\x21-\x7e])?$/.test(value);
  const matchesSentinel = value.startsWith('=?base64?') && value.endsWith('?=');
  if (isPlainAscii && !matchesSentinel) return value;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return `=?base64?${b64}?=`;
}

async function postMcp(project, group, body, { mcpName } = {}) {
  const headers = {
    'X-Project-Name': project,
    Authorization: `Bearer ${MCP_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    'Mcp-Method': body.method,
  };
  if (mcpName) headers['Mcp-Name'] = encodeHeaderValue(mcpName);
  const resp = await axios.post(`${API_BASE}/mcp/${group}`, body, {
    headers,
    transformResponse: [(data) => data],
    validateStatus: () => true,
    timeout: 60000,
  });
  return { status: resp.status, body: parseSseOrJson(resp.data) };
}

function metaEnvelope() {
  return {
    'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

export async function callMcp(project, group, toolName, args = {}) {
  if (!project || !group || !toolName) {
    throw new Error('callMcp requires project, group, and toolName');
  }
  const resp = await postMcp(project, group, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
      _meta: metaEnvelope(),
    },
  }, { mcpName: toolName });

  if (resp.status >= 400) {
    throw new Error(`MCP ${toolName} failed: ${resp.status} ${JSON.stringify(resp.body)}`);
  }
  if (resp.body?.error) {
    throw new Error(`MCP ${toolName} error: ${resp.body.error.message}`);
  }
  const result = resp.body?.result;
  if (result?.resultType === 'input_required') {
    // Multi-round-trip input requests aren't used by backend tools
    // (elicitation is routed out-of-band via SSE + REST).
    throw new Error(`MCP ${toolName} unexpectedly requested additional input`);
  }
  const text = result?.content?.[0]?.text;
  if (text) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return resp.body;
}
