import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpServerEntry, McpRegistryData } from './dto/mcp-registry.dto';

@Injectable()
export class McpRegistryService {
  private readonly logger = new Logger(McpRegistryService.name);
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

  /**
   * List tools from an MCP server by calling tools/list via the MCP protocol
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
      const initData = await this.parseMcpResponse(initResponse);

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
}
