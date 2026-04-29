import { Inject, Injectable, Logger } from '@nestjs/common';
import { IMcpRegistryProvider } from './provider.interface';
import { McpServerEntry, ListServersOptions } from '../dto/mcp-registry.dto';
import { SecretResolverChain } from '../secrets/secret-resolver';

export const MCP_PROVIDERS = Symbol('MCP_PROVIDERS');
export const MCP_SECRET_RESOLVER = Symbol('MCP_SECRET_RESOLVER');

/**
 * Top-level service the rest of your app talks to.
 *
 * It merges entries from every registered provider, resolves a single
 * authoritative list (last provider wins on name collision — order
 * matters), and materializes configs for specific targets (Claude,
 * OpenAI, opencode) with secrets resolved at the last possible moment.
 */
@Injectable()
export class McpRegistryService {
  private readonly logger = new Logger(McpRegistryService.name);

  constructor(
    @Inject(MCP_PROVIDERS) private readonly providers: IMcpRegistryProvider[],
    @Inject(MCP_SECRET_RESOLVER) private readonly secrets: SecretResolverChain,
  ) {}

  // ─── new provider-based API ────────────────────────────────────────

  /**
   * List all servers across all providers. Entries still contain
   * placeholders. Prefer `listServersResolved` when generating config
   * files for a downstream client.
   */
  async listServers(options: ListServersOptions = {}): Promise<McpServerEntry[]> {
    const byName = new Map<string, McpServerEntry>();
    for (const provider of this.providers) {
      if (!(await provider.isAvailable())) {
        this.logger.warn(`Provider '${provider.id}' not available — skipping`);
        continue;
      }
      const entries = await provider.listServers(options);
      for (const entry of entries) {
        // Later providers override earlier ones on name collision. This
        // lets you, e.g., override a JSON file entry with an API Center
        // entry by ordering providers appropriately in the module.
        byName.set(entry.name, entry);
      }
    }
    return [...byName.values()];
  }

  async getServer(name: string): Promise<McpServerEntry | null> {
    // Walk providers in reverse: the last-registered provider wins
    // matching the merge semantics of listServers.
    for (let i = this.providers.length - 1; i >= 0; i--) {
      const provider = this.providers[i];
      if (!(await provider.isAvailable())) continue;
      const entry = await provider.getServer(name);
      if (entry) return entry;
    }
    return null;
  }

  /** Same as `listServers` but with secrets resolved. */
  async listServersResolved(
    options: ListServersOptions = {},
  ): Promise<McpServerEntry[]> {
    const entries = await this.listServers(options);
    return Promise.all(entries.map((e) => this.secrets.resolveDeep(e)));
  }

  async getServerResolved(name: string): Promise<McpServerEntry | null> {
    const entry = await this.getServer(name);
    return entry ? this.secrets.resolveDeep(entry) : null;
  }

  // ─── config materializers for downstream clients ───────────────────

  /** Claude Desktop / Claude Code format: `{ mcpServers: { name: { ... } } }`. */
  async toClaudeConfig(options: ListServersOptions = {}): Promise<ClaudeConfig> {
    const entries = await this.listServersResolved(options);
    const mcpServers: ClaudeConfig['mcpServers'] = {};
    for (const e of entries) {
      if (e.transport === 'stdio') {
        mcpServers[e.name] = {
          command: e.command!,
          args: e.args,
          env: e.env,
        };
      } else {
        mcpServers[e.name] = {
          url: e.url!,
          headers: e.headers,
        };
      }
    }
    return { mcpServers };
  }

  /**
   * Foundry Toolbox–aware config. Servers with `authType: 'UserEntraToken'`
   * are routed through the single Foundry Toolbox MCP endpoint (OBO identity
   * passthrough). All other servers are materialized in standard Claude format.
   */
  async toFoundryToolboxConfig(options: ListServersOptions = {}): Promise<ClaudeConfig> {
    const toolboxEndpoint = process.env.FOUNDRY_TOOLBOX_MCP_ENDPOINT;
    const entries = await this.listServersResolved(options);
    const mcpServers: ClaudeConfig['mcpServers'] = {};
    for (const e of entries) {
      if (e.authType === 'UserEntraToken' && toolboxEndpoint) {
        // Route through the Foundry Toolbox endpoint — auth handled by OBO
        mcpServers[e.name] = { url: toolboxEndpoint };
      } else if (e.transport === 'stdio') {
        mcpServers[e.name] = {
          command: e.command!,
          args: e.args,
          env: e.env,
        };
      } else {
        mcpServers[e.name] = {
          url: e.url!,
          headers: e.headers,
        };
      }
    }
    return { mcpServers };
  }

  /** OpenAI Responses API MCP tools array. */
  async toOpenAiTools(options: ListServersOptions = {}): Promise<OpenAiMcpTool[]> {
    const entries = await this.listServersResolved(options);
    return entries
      .filter((e) => e.transport === 'http' && !!e.url)
      .map((e) => ({
        type: 'mcp',
        server_label: e.name,
        server_url: e.url!,
        headers: e.headers,
        require_approval: 'never',
      }));
  }

  // ─── backward-compatible methods ───────────────────────────────────
  // These delegate to the new provider-based implementation so existing
  // consumers (controller, auto-configuration, projects) keep working.

  /** @deprecated Use listServersResolved() instead. */
  async loadRegistry(): Promise<McpServerEntry[]> {
    return this.listServersResolved();
  }

  /** @deprecated Use getServerResolved(name) instead. */
  async getServerByName(name: string): Promise<McpServerEntry | null> {
    return this.getServerResolved(name);
  }

  /** @deprecated Use listServersResolved() + filter instead. */
  async getServerByUrl(url: string): Promise<McpServerEntry | null> {
    const entries = await this.listServersResolved();
    return entries.find((s) => s.url === url) ?? null;
  }

  /** Check if at least one provider is available. */
  async isRegistryAvailable(): Promise<boolean> {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) return true;
    }
    return false;
  }

  // ─── MCP protocol tool listing (carried over from old service) ─────

  /**
   * List tools from an MCP server by calling tools/list via the MCP protocol.
   */
  async listToolsFromServer(
    url: string,
    headers?: Record<string, string>,
  ): Promise<any[]> {
    try {
      // MCP Streamable HTTP requires Accept: application/json, text/event-stream
      const mcpAccept = 'application/json, text/event-stream';

      // Initialize MCP session
      const initResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: mcpAccept,
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'etienne-registry', version: '1.0.0' },
          },
        }),
      });

      if (!initResponse.ok) {
        throw new Error(`Initialize failed: ${initResponse.status}`);
      }

      // Parse initialize response (may be JSON or SSE)
      await this.parseMcpResponse(initResponse);

      // Extract session ID from response header
      const sessionId = initResponse.headers.get('mcp-session-id');
      const sessionHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: mcpAccept,
        ...headers,
      };
      if (sessionId) {
        sessionHeaders['mcp-session-id'] = sessionId;
      }

      // Send initialized notification
      await fetch(url, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });

      // Call tools/list
      const toolsResponse = await fetch(url, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      });

      if (!toolsResponse.ok) {
        throw new Error(`tools/list failed: ${toolsResponse.status}`);
      }

      // Parse tools response (may be JSON or SSE)
      const toolsData = await this.parseMcpResponse(toolsResponse);
      return toolsData.result?.tools || [];
    } catch (error: any) {
      this.logger.error(`Failed to list tools from ${url}: ${error.message}`);
      throw new Error(`Failed to list tools: ${error.message}`);
    }
  }

  /**
   * Parse a response that may be JSON or SSE (text/event-stream).
   * SSE format: "event: message\ndata: {json}\n\n"
   */
  private async parseMcpResponse(response: globalThis.Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      // Extract JSON from SSE data lines
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6).trim();
          if (jsonStr) {
            return JSON.parse(jsonStr);
          }
        }
      }
      throw new Error('No data found in SSE response');
    }

    return response.json();
  }
}

// ─── output types for the materializers ──────────────────────────────

export interface ClaudeConfig {
  mcpServers: Record<
    string,
    | { command: string; args?: string[]; env?: Record<string, string> }
    | { url: string; headers?: Record<string, string> }
  >;
}

export interface OpenAiMcpTool {
  type: 'mcp';
  server_label: string;
  server_url: string;
  headers?: Record<string, string>;
  require_approval: 'never' | 'always';
}
