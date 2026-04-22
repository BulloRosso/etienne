import { Injectable, Logger } from '@nestjs/common';
import {
  IMcpRegistryProvider,
  IMutableMcpRegistryProvider,
} from '../core/provider.interface';
import { McpServerEntry, ListServersOptions } from '../dto/mcp-registry.dto';

export interface ComposioProviderOptions {
  /**
   * Composio API key. Accepts a placeholder, but in practice you will
   * pass an already-resolved value here because the provider itself needs
   * it at construction time to talk to Composio.
   */
  apiKey: string;

  /**
   * If set, `listServers` returns one synthetic per-user instance per
   * configured user. Useful when you generate configs for multiple
   * end-users from the same backend. If unset, listServers returns the
   * shared server URLs (pre-per-user).
   */
  defaultUserId?: string;

  /** Optional explicit base URL. Defaults to Composio prod. */
  baseUrl?: string;
}

/**
 * Composio provider.
 *
 * Maps the Composio MCP API onto the IMcpRegistryProvider contract.
 * Notes on the mapping:
 *
 * - Every Composio MCP server generates ONE URL that fronts one or more
 *   toolkits. We surface each Composio server as a single McpServerEntry.
 *   The `allowedTools` allowlist lives in `metadata.allowedTools`.
 *
 * - Composio REQUIRES the `x-api-key` header on all MCP traffic (since
 *   the March 2026 default change). We set the value as a placeholder
 *   so the resolver can either inject the literal key from the constructor
 *   or re-fetch it from Key Vault at materialization time.
 *
 * - If `defaultUserId` is set, we call `composio.mcp.generate(userId, id)`
 *   to get a per-user URL. Otherwise we use the shared `MCPUrl` — some
 *   Composio setups require auth before that URL is usable, so prefer the
 *   per-user form in production.
 *
 * This class uses dynamic `require()` for `@composio/core` so the Composio
 * SDK only needs to be installed when you actually enable this provider.
 */
@Injectable()
export class ComposioProvider
  implements IMcpRegistryProvider, IMutableMcpRegistryProvider
{
  readonly id = 'composio';
  private readonly logger = new Logger(ComposioProvider.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private composio: any;

  constructor(private readonly options: ComposioProviderOptions) {
    // Lazy-load to keep @composio/core an optional peer dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Composio } = require('@composio/core');
    this.composio = new Composio({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      experimental: { mcp: true },
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.composio.mcp.list({ limit: 1, page: 1 });
      return true;
    } catch (err: any) {
      this.logger.warn(`Composio not reachable: ${err.message}`);
      return false;
    }
  }

  async listServers(options: ListServersOptions = {}): Promise<McpServerEntry[]> {
    const result = await this.composio.mcp.list({
      toolkits: [],
      authConfigs: [],
      name: options.query,
      limit: 50,
      page: 1,
    });

    const entries: McpServerEntry[] = [];
    for (const item of result.items ?? []) {
      entries.push(await this.mapEntry(item));
    }
    return entries;
  }

  async getServer(name: string): Promise<McpServerEntry | null> {
    // Composio's `get` takes server id, not name. For a name lookup we
    // list with a name filter — Composio supports filtering by name.
    const result = await this.composio.mcp.list({ name, limit: 1, page: 1 });
    const first = result.items?.[0];
    if (!first) return null;
    return this.mapEntry(first);
  }

  async registerServer(entry: McpServerEntry): Promise<McpServerEntry> {
    const toolkits = (entry.metadata?.toolkits as string[] | undefined) ?? [];
    const allowedTools = entry.metadata?.allowedTools ?? [];
    const created = await this.composio.mcp.create(entry.name, {
      toolkits,
      allowedTools,
    });
    return this.mapEntry(created);
  }

  async updateServer(
    name: string,
    patch: Partial<McpServerEntry>,
  ): Promise<McpServerEntry> {
    const existing = await this.getServer(name);
    if (!existing) throw new Error(`Composio server '${name}' not found`);
    const id = existing.metadata?.composioId as string;
    const updated = await this.composio.mcp.update(id, {
      name: patch.name,
      allowedTools: patch.metadata?.allowedTools,
    });
    return this.mapEntry(updated);
  }

  async deleteServer(name: string): Promise<void> {
    const existing = await this.getServer(name);
    if (!existing) throw new Error(`Composio server '${name}' not found`);
    const id = existing.metadata?.composioId as string;
    await this.composio.mcp.delete(id);
  }

  // --- internals ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async mapEntry(item: any): Promise<McpServerEntry> {
    let url: string = item.MCPUrl;
    if (this.options.defaultUserId) {
      const instance = await this.composio.mcp.generate(
        this.options.defaultUserId,
        item.id,
      );
      url = instance.url;
    }

    return {
      name: item.name,
      description: `Composio-managed MCP (toolkits: ${(item.toolkits ?? []).join(', ')})`,
      transport: 'http',
      url,
      // Note the placeholder — resolved at materialization time. This lets
      // us keep the Composio API key in Key Vault for production while
      // still allowing env-var use in dev.
      headers: {
        'x-api-key': '${kv:composio-api-key}',
      },
      providerId: this.id,
      metadata: {
        composioId: item.id,
        toolkits: item.toolkits,
        allowedTools: item.allowedTools,
      },
    };
  }
}
