/**
 * Shared MCP JSON-RPC client (Streamable HTTP transport).
 * Talks to backend MCP endpoints at `/mcp/<group>`. Handles session init,
 * single re-init on session loss, and SSE-or-JSON response parsing.
 *
 * Public API:
 *   callMcp(projectName, group, toolName, args?) -> tool result (parsed JSON if available)
 */

import axios from 'axios';
import { API_BASE } from './api';

const MCP_TOKEN = 'test123';
// Session cache keyed by `${project}:${group}` so different MCP groups don't collide.
const sessionCache = new Map();

function parseSseOrJson(rawBody) {
  if (typeof rawBody === 'object' && rawBody !== null) return rawBody;
  if (typeof rawBody !== 'string') return rawBody;
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { return rawBody; }
  }
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      try { return JSON.parse(payload); } catch { /* ignore */ }
    }
  }
  return rawBody;
}

async function postMcp(project, group, body, sessionId) {
  const headers = {
    'X-Project-Name': project,
    Authorization: `Bearer ${MCP_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const resp = await axios.post(`${API_BASE}/mcp/${group}`, body, {
    headers,
    transformResponse: [(data) => data],
    validateStatus: () => true,
    timeout: 60000,
  });
  const parsed = parseSseOrJson(resp.data);
  const returnedSession = resp.headers['mcp-session-id'];
  return { status: resp.status, body: parsed, sessionId: returnedSession };
}

async function ensureSession(project, group) {
  const key = `${project}:${group}`;
  if (sessionCache.has(key)) return sessionCache.get(key);
  const init = await postMcp(project, group, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-frontend', version: '1.0.0' },
    },
  });
  if (init.status >= 400) throw new Error(`MCP init failed: ${init.status} ${JSON.stringify(init.body)}`);
  const sid = init.sessionId;
  if (!sid) throw new Error('MCP init did not return Mcp-Session-Id header');
  sessionCache.set(key, sid);
  await postMcp(project, group, { jsonrpc: '2.0', method: 'notifications/initialized' }, sid).catch(() => {});
  return sid;
}

export async function callMcp(project, group, toolName, args = {}) {
  if (!project || !group || !toolName) {
    throw new Error('callMcp requires project, group, and toolName');
  }
  const key = `${project}:${group}`;
  let sid = await ensureSession(project, group);
  let resp = await postMcp(project, group, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  }, sid);

  const sessionLost =
    resp.status === 404 ||
    (resp.status >= 400 && /session|not initialized|unknown/i.test(resp.body?.error?.message || ''));
  if (sessionLost) {
    sessionCache.delete(key);
    sid = await ensureSession(project, group);
    resp = await postMcp(project, group, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }, sid);
  }
  if (resp.status >= 400) {
    throw new Error(`MCP ${toolName} failed: ${resp.status} ${JSON.stringify(resp.body)}`);
  }
  if (resp.body?.error) {
    throw new Error(`MCP ${toolName} error: ${resp.body.error.message}`);
  }
  const text = resp.body?.result?.content?.[0]?.text;
  if (text) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return resp.body;
}
