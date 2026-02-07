import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpServerEntry, McpRegistryData } from './dto/mcp-registry.dto';

@Injectable()
export class McpRegistryService {
  private readonly registryPath: string;

  constructor() {
    this.registryPath =
      process.env.MCP_REGISTRY ||
      path.resolve(process.cwd(), 'mcp-server-registry.json');
  }

  /**
   * Check if the MCP registry is available
   */
  async isRegistryAvailable(): Promise<boolean> {
    try {
      await fs.access(this.registryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all MCP servers from the registry
   */
  async loadRegistry(): Promise<McpServerEntry[]> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const data: McpRegistryData = JSON.parse(content);
      return data.servers || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Registry file doesn't exist, return empty array
        return [];
      }
      throw new Error(`Failed to load MCP registry: ${error.message}`);
    }
  }

  /**
   * Get a specific MCP server by name
   */
  async getServerByName(name: string): Promise<McpServerEntry | null> {
    const servers = await this.loadRegistry();
    return servers.find((s) => s.name === name) || null;
  }
}
