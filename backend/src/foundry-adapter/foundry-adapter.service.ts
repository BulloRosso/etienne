import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as express from 'express';
import * as http from 'http';
import * as url from 'url';
import { v4 as uuid } from 'uuid';
import { ClaudeSdkOrchestratorService } from '../claude/sdk/claude-sdk-orchestrator.service';
import { FoundrySessionService } from './foundry-session.service';
import { ResponsesRequest } from './dto/responses.dto';
import { InvocationsRequest } from './dto/invocations.dto';

const FOUNDRY_PORT = 8088;
const BACKEND_TARGET = 'http://localhost:6060';

/**
 * Starts a lightweight Express server on port 8088 implementing the
 * Foundry hosted-agent protocol (readiness, responses, invocations).
 *
 * Bridges incoming Foundry requests to the existing
 * ClaudeSdkOrchestratorService streaming pipeline.
 */
@Injectable()
export class FoundryAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoundryAdapterService.name);
  private server: http.Server | null = null;

  constructor(
    private readonly orchestrator: ClaudeSdkOrchestratorService,
    private readonly sessionService: FoundrySessionService,
  ) {}

  async onModuleInit() {
    const app = express();

    // ── CORS for externally hosted frontend ─────────────────────────
    const allowedOrigin = process.env.FOUNDRY_FRONTEND_ORIGIN || '*';
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-session-id');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') { res.status(204).end(); return; }
      next();
    });

    // JSON body parsing only for Foundry protocol routes.
    // Proxy routes need the raw request stream — express.json() would
    // consume the body and leave req.pipe() with nothing to forward.
    const jsonParser = express.json({ limit: '10mb' });

    // ── GET /readiness ──────────────────────────────────────────────
    app.get('/readiness', (_req, res) => {
      res.status(200).json({ status: 'ready' });
    });

    // ── POST /responses  (OpenAI Responses API) ─────────────────────
    app.post('/responses', jsonParser, (req, res) => this.handleResponses(req, res));

    // ── POST /invocations ───────────────────────────────────────────
    app.post('/invocations', jsonParser, (req, res) => this.handleInvocations(req, res));

    // ── Reverse proxy: forward /api, /auth, /mcp to backend ────────
    // In Foundry mode the frontend is hosted externally and can only
    // reach the container through port 8088. These proxy rules let the
    // frontend talk to the NestJS backend transparently.
    // The proxy pipes the raw request stream to the backend, so these
    // routes must NOT go through express.json().
    const proxyToBackend = (
      req: express.Request,
      res: express.Response,
    ) => {
      const target = url.parse(BACKEND_TARGET);
      const proxyReq = http.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: req.originalUrl,
          method: req.method,
          headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );
      proxyReq.on('error', (err) => {
        this.logger.error(`Proxy error: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: 'Backend unavailable' });
      });
      req.pipe(proxyReq, { end: true });
    };
    app.use('/api', proxyToBackend);
    app.use('/auth', proxyToBackend);
    app.use('/mcp', proxyToBackend);

    this.server = app.listen(FOUNDRY_PORT, () => {
      this.logger.log(
        `Foundry protocol adapter listening on port ${FOUNDRY_PORT}`,
      );
    });
  }

  async onModuleDestroy() {
    if (this.server) {
      this.server.close();
      this.logger.log('Foundry protocol adapter stopped');
    }
  }

  // ─── POST /responses ───────────────────────────────────────────────

  private handleResponses(req: express.Request, res: express.Response): void {
    const body: ResponsesRequest = req.body;
    const foundrySessionId =
      (req.headers['x-session-id'] as string) || uuid();

    // Extract user prompt from the Responses API input
    const prompt = this.extractPrompt(body);
    if (!prompt) {
      res.status(400).json({ error: 'No user message found in input' });
      return;
    }

    const projectDir =
      this.sessionService.resolveProjectDir(foundrySessionId);
    const responseId = `resp_${uuid().replace(/-/g, '')}`;

    // Non-streaming: collect full response
    if (!body.stream) {
      this.collectFullResponse(projectDir, prompt, responseId, res);
      return;
    }

    // Streaming: SSE in Responses API format
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Emit response.created
    this.sendSSE(res, 'response.created', {
      id: responseId,
      object: 'response',
      status: 'in_progress',
      output: [],
    });

    const outputItemId = `msg_${uuid().replace(/-/g, '')}`;
    this.sendSSE(res, 'response.output_item.added', {
      output_index: 0,
      item: {
        type: 'message',
        id: outputItemId,
        role: 'assistant',
        content: [],
        status: 'in_progress',
      },
    });

    const observable = this.orchestrator.streamPrompt(projectDir, prompt);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const subscription = observable.subscribe({
      next: (event: any) => {
        if (res.writableEnded) return;

        switch (event.type) {
          case 'stdout':
            if (event.data?.chunk) {
              this.sendSSE(res, 'response.output_text.delta', {
                output_index: 0,
                content_index: 0,
                delta: event.data.chunk,
              });
            }
            break;

          case 'usage':
            if (event.data) {
              totalInputTokens += event.data.input_tokens || 0;
              totalOutputTokens += event.data.output_tokens || 0;
            }
            break;

          case 'session':
            if (event.data?.process_id) {
              this.sessionService.setEtienneSessionId(
                foundrySessionId,
                event.data.process_id,
              );
            }
            break;
        }
      },
      error: (err: any) => {
        if (!res.writableEnded) {
          this.sendSSE(res, 'error', {
            type: 'server_error',
            message: err.message || 'Internal error',
          });
          res.end();
        }
      },
      complete: () => {
        if (!res.writableEnded) {
          this.sendSSE(res, 'response.output_text.done', {
            output_index: 0,
            content_index: 0,
          });
          this.sendSSE(res, 'response.completed', {
            id: responseId,
            object: 'response',
            status: 'completed',
            usage: {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              total_tokens: totalInputTokens + totalOutputTokens,
            },
          });
          res.end();
        }
      },
    });

    req.on('close', () => subscription.unsubscribe());
  }

  // ─── POST /invocations ─────────────────────────────────────────────

  private handleInvocations(
    req: express.Request,
    res: express.Response,
  ): void {
    const body: InvocationsRequest = req.body;
    const foundrySessionId =
      body.session_id ||
      (req.headers['x-session-id'] as string) ||
      uuid();

    if (!body.prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const projectDir =
      this.sessionService.resolveProjectDir(foundrySessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const observable = this.orchestrator.streamPrompt(
      projectDir,
      body.prompt,
      undefined, // agentMode
      undefined, // memoryEnabled
      undefined, // skipChatPersistence
      body.max_turns,
    );

    const subscription = observable.subscribe({
      next: (event: any) => {
        if (res.writableEnded) return;

        switch (event.type) {
          case 'stdout':
            if (event.data?.chunk) {
              this.sendSSE(res, 'text_delta', { text: event.data.chunk });
            }
            break;

          case 'tool':
            this.sendSSE(res, 'tool_use', event.data);
            break;

          case 'usage':
            this.sendSSE(res, 'usage', event.data);
            break;

          case 'session':
            if (event.data?.process_id) {
              this.sessionService.setEtienneSessionId(
                foundrySessionId,
                event.data.process_id,
              );
            }
            break;
        }
      },
      error: (err: any) => {
        if (!res.writableEnded) {
          this.sendSSE(res, 'error', {
            message: err.message || 'Internal error',
          });
          res.end();
        }
      },
      complete: () => {
        if (!res.writableEnded) {
          this.sendSSE(res, 'completed', {});
          res.end();
        }
      },
    });

    req.on('close', () => subscription.unsubscribe());
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private collectFullResponse(
    projectDir: string,
    prompt: string,
    responseId: string,
    res: express.Response,
  ): void {
    const chunks: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const observable = this.orchestrator.streamPrompt(projectDir, prompt);
    observable.subscribe({
      next: (event: any) => {
        if (event.type === 'stdout' && event.data?.chunk) {
          chunks.push(event.data.chunk);
        }
        if (event.type === 'usage' && event.data) {
          totalInputTokens += event.data.input_tokens || 0;
          totalOutputTokens += event.data.output_tokens || 0;
        }
      },
      error: (err: any) => {
        res.status(500).json({
          id: responseId,
          object: 'response',
          status: 'failed',
          error: { message: err.message || 'Internal error' },
        });
      },
      complete: () => {
        res.json({
          id: responseId,
          object: 'response',
          created_at: Math.floor(Date.now() / 1000),
          status: 'completed',
          output: [
            {
              type: 'message',
              id: `msg_${uuid().replace(/-/g, '')}`,
              role: 'assistant',
              content: [{ type: 'output_text', text: chunks.join('') }],
              status: 'completed',
            },
          ],
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalInputTokens + totalOutputTokens,
          },
        });
      },
    });
  }

  /** Extract the user's prompt string from a Responses API input. */
  private extractPrompt(body: ResponsesRequest): string | null {
    if (typeof body.input === 'string') return body.input;
    if (Array.isArray(body.input)) {
      // Find the last user message
      for (let i = body.input.length - 1; i >= 0; i--) {
        const msg = body.input[i];
        if (msg.role === 'user') {
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            const textPart = msg.content.find(
              (p) => p.type === 'input_text',
            );
            return textPart?.text || null;
          }
        }
      }
    }
    return null;
  }

  /** Write a single SSE event to the response stream. */
  private sendSSE(
    res: express.Response,
    event: string,
    data: unknown,
  ): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
