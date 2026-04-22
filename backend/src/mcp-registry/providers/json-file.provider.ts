import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  IMcpRegistryProvider,
  IMutableMcpRegistryProvider,
} from '../core/provider.interface';
import {
  McpServerEntry,
  ListServersOptions,
  McpRegistryData,
} from '../dto/mcp-registry.dto';

export interface JsonFileProviderOptions {
  /** Path to the registry JSON. Defaults to $MCP_REGISTRY or ./mcp-server-registry.json */
  registryPath?: string;
  /** If true, writes are persisted back to disk. Defaults to false. */
  writable?: boolean;
}

/**
 * JSON file-backed provider. This is the drop-in replacement for your
 * current `McpRegistryService.loadRegistry()`.
 *
 * Note: placeholders are NOT resolved here. That was a correctness bug
 * in the original service — resolving `${VAR}` at load time meant missing
 * env vars silently became literal `${VAR}` strings in the output. The
 * new design keeps placeholders intact until materialization so that
 * missing secrets can be detected and reported precisely.
 */
@Injectable()
export class JsonFileRegistryProvider
  implements IMcpRegistryProvider, IMutableMcpRegistryProvider
{
  readonly id = 'json-file';
  private readonly logger = new Logger(JsonFileRegistryProvider.name);
  private readonly registryPath: string;
  private readonly writable: boolean;

  constructor(options: JsonFileProviderOptions = {}) {
    this.registryPath =
      options.registryPath ??
      process.env.MCP_REGISTRY ??
      path.resolve(process.cwd(), 'mcp-server-registry.json');
    this.writable = options.writable ?? false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.registryPath);
      return true;
    } catch {
      return false;
    }
  }

  async listServers(options: ListServersOptions = {}): Promise<McpServerEntry[]> {
    const raw = await this.loadRaw();
    return raw
      .map((s) => this.normalize(s))
      .filter((s) => this.matches(s, options));
  }

  async getServer(name: string): Promise<McpServerEntry | null> {
    const all = await this.listServers();
    return all.find((s) => s.name === name) ?? null;
  }

  async registerServer(entry: McpServerEntry): Promise<McpServerEntry> {
    this.assertWritable();
    const raw = await this.loadRaw();
    if (raw.some((s) => s.name === entry.name)) {
      throw new Error(`Server '${entry.name}' already exists`);
    }
    raw.push(entry);
    await this.persist(raw);
    return this.normalize(entry);
  }

  async updateServer(
    name: string,
    patch: Partial<McpServerEntry>,
  ): Promise<McpServerEntry> {
    this.assertWritable();
    const raw = await this.loadRaw();
    const idx = raw.findIndex((s) => s.name === name);
    if (idx === -1) throw new Error(`Server '${name}' not found`);
    raw[idx] = { ...raw[idx], ...patch, name: raw[idx].name };
    await this.persist(raw);
    return this.normalize(raw[idx]);
  }

  async deleteServer(name: string): Promise<void> {
    this.assertWritable();
    const raw = await this.loadRaw();
    const next = raw.filter((s) => s.name !== name);
    if (next.length === raw.length) throw new Error(`Server '${name}' not found`);
    await this.persist(next);
  }

  // --- internals ---

  private async loadRaw(): Promise<any[]> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const data: McpRegistryData = JSON.parse(content);
      return data.servers ?? [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw new Error(`Failed to load MCP registry: ${err.message}`);
    }
  }

  private async persist(servers: any[]): Promise<void> {
    const data: McpRegistryData = { servers };
    await fs.writeFile(this.registryPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private normalize(raw: any): McpServerEntry {
    return {
      name: raw.name,
      description: raw.description,
      transport: raw.transport ?? 'http',
      url: raw.url,
      command: raw.command,
      args: raw.args,
      headers: raw.headers,
      env: raw.env,
      providerId: this.id,
      isStandard: raw.isStandard ?? undefined,
      metadata: {
        environment: raw.environment,
        version: raw.version,
        lifecycle: raw.isStandard ? 'standard' : undefined,
        owner: raw.owner,
      },
    };
  }

  private matches(entry: McpServerEntry, options: ListServersOptions): boolean {
    if (options.environment && entry.metadata?.environment !== options.environment) {
      return false;
    }
    if (options.query) {
      const q = options.query.toLowerCase();
      const hay = `${entry.name} ${entry.description ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  private assertWritable(): void {
    if (!this.writable) {
      throw new Error(
        `JsonFileRegistryProvider is read-only. Set writable: true to allow writes.`,
      );
    }
  }
}
