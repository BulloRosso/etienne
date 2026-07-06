/**
 * Minimal Streamable-HTTP MCP client for the seed script.
 *
 * The backend serves each tool group as an MCP server at
 * http://localhost:6060/mcp/<group> via the SDK's
 * StreamableHTTPServerTransport (see backend/src/mcpserver/
 * mcp-server.controller.ts). Rather than pulling the client half of the
 * SDK into scripts/ (which has no node_modules of its own), this is a
 * plain-fetch JSON-RPC 2.0 client that speaks just enough of the
 * Streamable HTTP transport for a linear seed replay:
 *
 *   1. POST {method:'initialize'}   → captures the `mcp-session-id` header
 *   2. POST notifications/initialized
 *   3. POST tools/call with the session header for every tool invocation
 *
 * Responses may arrive as `application/json` or as `text/event-stream`
 * (the transport streams a single message per POST in practice); both are
 * handled. Tool results come back as MCP content blocks; `callTool`
 * unwraps the JSON in the first text block — including the double-wrapped
 * case where that text is itself a serialized content-block array.
 */

const JSONRPC = '2.0';

export class McpToolError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  /** initialize + notifications/initialized handshake */
  async connect(): Promise<void> {
    const { response, message } = await this.post({
      jsonrpc: JSONRPC,
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'seed-requirements-tracking', version: '1.0.0' },
      },
    });
    const sid = response.headers.get('mcp-session-id');
    if (!sid) {
      throw new McpToolError('initialize response carried no mcp-session-id header');
    }
    this.sessionId = sid;
    if (message?.error) {
      throw new McpToolError(`initialize failed: ${message.error.message}`, message.error);
    }
    // Required by the Streamable HTTP transport before any request.
    await this.post({ jsonrpc: JSONRPC, method: 'notifications/initialized' }, true);
  }

  /**
   * Call one tool and return the parsed JSON payload from its first text
   * content block. Handles the double-wrapped case where the text block
   * contains a serialized `[{type:'text', text:'…'}]` array.
   */
  async callTool<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.sessionId) await this.connect();
    const { message } = await this.post({
      jsonrpc: JSONRPC,
      id: this.nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    if (!message) throw new McpToolError(`tools/call ${name}: empty response`);
    if (message.error) {
      throw new McpToolError(`tools/call ${name}: ${message.error.message}`, message.error);
    }
    const result = message.result ?? {};
    if (result.isError) {
      const text = this.firstText(result) ?? JSON.stringify(result);
      throw new McpToolError(`tool ${name} returned isError: ${text.slice(0, 500)}`);
    }
    const text = this.firstText(result);
    if (text === null) return result as T;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text as unknown as T;
    }
    // double-wrapped: text block containing a serialized content-block array
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed[0] &&
      typeof parsed[0] === 'object' &&
      parsed[0].type === 'text' &&
      typeof parsed[0].text === 'string'
    ) {
      try {
        return JSON.parse(parsed[0].text) as T;
      } catch {
        return parsed[0].text as unknown as T;
      }
    }
    return parsed as T;
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, {
        method: 'DELETE',
        headers: { ...this.headers, 'mcp-session-id': this.sessionId },
      });
    } catch {
      /* best effort */
    }
    this.sessionId = null;
  }

  // ── transport plumbing ─────────────────────────────────────────────────────

  private firstText(result: any): string | null {
    const block = Array.isArray(result?.content)
      ? result.content.find((c: any) => c?.type === 'text' && typeof c.text === 'string')
      : null;
    return block ? block.text : null;
  }

  private async post(
    body: Record<string, unknown>,
    isNotification = false,
  ): Promise<{ response: Response; message: any | null }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...this.headers,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new McpToolError(
        `MCP POST ${body.method} → HTTP ${response.status}: ${text.slice(0, 400)}`,
      );
    }
    if (isNotification || response.status === 202) {
      // notifications get 202 Accepted with no body
      await response.text().catch(() => '');
      return { response, message: null };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (contentType.includes('text/event-stream')) {
      return { response, message: this.parseSse(raw, body.id as number | undefined) };
    }
    if (!raw) return { response, message: null };
    return { response, message: JSON.parse(raw) };
  }

  /** Parse an SSE body; return the JSON-RPC message matching `id` (or the last response). */
  private parseSse(raw: string, id?: number): any | null {
    let match: any = null;
    for (const chunk of raw.split(/\n\n/)) {
      const dataLines = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) continue;
      try {
        const message = JSON.parse(dataLines.join('\n'));
        if (message && (message.result !== undefined || message.error !== undefined)) {
          if (id === undefined || message.id === id) match = message;
          else if (!match) match = message;
        }
      } catch {
        /* skip non-JSON events */
      }
    }
    return match;
  }
}
