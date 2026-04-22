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

  // --- config materializers for downstream clients ---

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
}

// --- output types for the materializers ---

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
