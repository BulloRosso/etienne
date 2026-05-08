// A2A + A2UI agent server for the restaurant-booking demo.
//
// Endpoints:
//   GET  /.well-known/agent.json   Agent Card declaring the A2UI extension
//   POST /a2a                      JSON-RPC 2.0
//      method "message/stream"  -> opens an SSE stream emitting A2A Messages
//                                  whose DataParts carry A2UI v0.9 messages
//                                  (mimeType: application/json+a2ui)
//      method "action/submit"   -> consumes a userAction, advances the agent,
//                                  pushes follow-up A2UI messages over the
//                                  matching open stream
//
// Transport: A2A Extension https://a2ui.org/a2a-extension/a2ui/v0.8
// (current published extension URI; the A2UI payload itself is v0.9.)

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { A2uiMessage } from './a2ui-messages.js';
import {
  newSession,
  start,
  handleAction,
  type SessionState,
  type UserAction,
} from './booking-state-machine.js';

const PORT = Number(process.env.PORT || 4110);
const HOST = process.env.HOST || '127.0.0.1';
const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.8';
const A2UI_MIME_TYPE = 'application/json+a2ui';

interface Stream {
  res: Response;
  session: SessionState;
}
const streams = new Map<string, Stream>();

const app = express();
app.use(express.json({ limit: '1mb' }));

// --------- Agent Card ---------
app.get('/.well-known/agent.json', (_req, res) => {
  res.json({
    name: 'A2UI Restaurant Booking',
    description:
      'Demo agent. Drives the A2UI restaurant-booking lifecycle over A2A+SSE. No LLM, no Google services.',
    url: `http://${HOST}:${PORT}/a2a`,
    version: '0.1.0',
    protocolVersion: '0.2.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    extensions: [
      {
        uri: A2UI_EXTENSION_URI,
        description: 'A2UI v0.9 over A2A DataParts',
        required: true,
      },
    ],
    defaultInputModes: ['application/json'],
    defaultOutputModes: [A2UI_MIME_TYPE],
    skills: [
      {
        id: 'book-table',
        name: 'Book a table',
        description: 'Renders a booking form and confirms the reservation.',
        tags: ['booking', 'demo'],
      },
    ],
  });
});

// --------- A2A JSON-RPC ---------
app.post('/a2a', (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(res, body?.id ?? null, -32600, 'Invalid Request');
  }
  switch (body.method) {
    case 'message/stream':
      return handleMessageStream(req, res, body);
    case 'action/submit':
      return handleActionSubmit(res, body);
    default:
      return rpcError(res, body.id ?? null, -32601, `Method not found: ${body.method}`);
  }
});

// --------- message/stream: open SSE, emit A2UI lifecycle ---------
function handleMessageStream(_req: Request, res: Response, body: any) {
  const streamId = randomUUID();
  const session = newSession();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-A2A-Extensions', A2UI_EXTENSION_URI);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Stream-Id, X-A2A-Extensions');
  res.setHeader('X-Stream-Id', streamId);
  res.flushHeaders?.();

  streams.set(streamId, { res, session });
  console.log(`[a2ui-restaurant] stream OPEN ${streamId} (active: ${streams.size})`);

  // Heartbeat keeps the SSE socket alive through proxies / idle timeouts.
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // Send a "stream-open" event so the client knows its streamId.
  writeEvent(res, 'stream-open', { streamId });

  // Push initial A2UI surface as an A2A response.
  const initial = start(session);
  pushA2uiMessages(res, body.id ?? null, streamId, initial);

  res.on('close', () => {
    clearInterval(heartbeat);
    streams.delete(streamId);
    console.log(`[a2ui-restaurant] stream CLOSE ${streamId} (active: ${streams.size})`);
  });
}

// --------- action/submit: feed userAction, push follow-up surface ---------
function handleActionSubmit(res: Response, body: any) {
  const params = body.params || {};
  const streamId: string | undefined = params.streamId;
  const action: UserAction | undefined = params.action;

  if (!streamId || !action) {
    return rpcError(res, body.id ?? null, -32602, 'Missing streamId or action');
  }
  const stream = streams.get(streamId);
  if (!stream) {
    return rpcError(res, body.id ?? null, -32004, 'Unknown streamId');
  }

  const followUp = handleAction(stream.session, action);
  pushA2uiMessages(stream.res, null, streamId, followUp);

  res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { ok: true } });
}

// --------- Helpers ---------

// Wrap A2UI messages into one A2A Message containing a DataPart per A2UI message.
function pushA2uiMessages(
  res: Response,
  rpcId: string | number | null,
  streamId: string,
  messages: A2uiMessage[],
) {
  if (!messages.length) return;
  const a2aMessage = {
    role: 'agent',
    messageId: randomUUID(),
    contextId: streamId,
    parts: messages.map((m) => ({
      kind: 'data',
      data: m,
      metadata: { mimeType: A2UI_MIME_TYPE },
    })),
  };
  const rpcResponse = {
    jsonrpc: '2.0',
    id: rpcId,
    result: a2aMessage,
  };
  writeEvent(res, 'message', rpcResponse);
}

function writeEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function rpcError(res: Response, id: any, code: number, message: string) {
  res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });
}

// --------- Health ---------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeStreams: streams.size });
});

app.listen(PORT, HOST, () => {
  console.log(`[a2ui-restaurant] agent listening on http://${HOST}:${PORT}`);
  console.log(`[a2ui-restaurant] Agent Card: http://${HOST}:${PORT}/.well-known/agent.json`);
});
