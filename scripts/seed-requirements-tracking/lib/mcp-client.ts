/**
 * Minimal Streamable-HTTP MCP client for the seed script (protocol 2026-07-28).
 *
 * The backend serves each tool group as an MCP server at
 * http://localhost:6060/mcp/<group> (see backend/src/mcpserver/
 * mcp-server.controller.ts). Rather than pulling the client half of the
 * SDK into scripts/ (which has no node_modules of its own), this is a
 * plain-fetch JSON-RPC 2.0 client speaking the stateless 2026-07-28
 * revision of the Streamable HTTP transport:
 *
 *   - no initialize handshake and no mcp-session-id — every POST is
 *     self-contained
 *   - each request carries its protocol version and client identity in
 *     `params._meta` (io.modelcontextprotocol/* envelope keys)
 *   - the body's method/tool name are mirrored into the required
 *     MCP-Protocol-Version, Mcp-Method, and Mcp-Name headers
 *
 * Responses may arrive as `application/json` or as `text/event-stream`;
 * both are handled. Tool results come back as MCP content blocks;
 * `callTool` unwraps the JSON in the first text block — including the
 * double-wrapped case where that text is itself a serialized
 * content-block array.
 */

const JSONRPC = '2.0';
const PROTOCOL_VERSION = '2026-07-28';
const CLIENT_INFO = { name: 'seed-requirements-tracking', version: '1.0.0' };

export class McpToolError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class McpClient {
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  /** Stateless transport: nothing to do, kept for call-site compatibility. */
  async connect(): Promise<void> {}

  /**
   * Call one tool and return the parsed JSON payload from its first text
   * content block. Handles the double-wrapped case where the text block
   * contains a serialized `[{type:'text', text:'…'}]` array.
   */
  async callTool<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
    const { message } = await this.post(
      {
        jsonrpc: JSONRPC,
        id: this.nextId++,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
      { mcpName: name },
    );
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

  /** Stateless transport: no session to tear down. */
  async close(): Promise<void> {}

  // ── transport plumbing ─────────────────────────────────────────────────────

  private firstText(result: any): string | null {
    const block = Array.isArray(result?.content)
      ? result.content.find((c: any) => c?.type === 'text' && typeof c.text === 'string')
      : null;
    return block ? block.text : null;
  }

  /**
   * Encode a value for an Mcp-* header: plain ASCII passes through,
   * anything unsafe uses the spec's Base64 sentinel format (=?base64?...?=).
   */
  private encodeHeaderValue(value: string): string {
    const isPlainAscii = /^[\x21-\x7e]([\x20\x21-\x7e]*[\x21-\x7e])?$/.test(value);
    const matchesSentinel = value.startsWith('=?base64?') && value.endsWith('?=');
    if (isPlainAscii && !matchesSentinel) return value;
    return `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private async post(
    body: Record<string, unknown>,
    opts: { mcpName?: string; isNotification?: boolean } = {},
  ): Promise<{ response: Response; message: any | null }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      'mcp-method': String(body.method),
      ...this.headers,
    };
    if (opts.mcpName) headers['mcp-name'] = this.encodeHeaderValue(opts.mcpName);

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
    if (opts.isNotification || response.status === 202) {
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
