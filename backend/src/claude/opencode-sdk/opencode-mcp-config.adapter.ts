import { Logger } from '@nestjs/common';
import { McpServerConfig } from '../mcpserverconfig/mcp.server.config';

/**
 * Translates the shared `.mcp.json` format (used by Anthropic/Codex/pi-mono)
 * into OpenCode's `opencode.json` MCP format.
 *
 * OpenCode uses a different schema for MCP servers:
 *
 * Shared (.mcp.json):                OpenCode (opencode.json mcp):
 * {                                  {
 *   "mcpServers": {                    "mcp": {
 *     "github": {                        "github": {
 *       "command": "npx",                  "type": "local",
 *       "args": ["-y", "@mcp/g"],          "command": ["npx", "-y", "@mcp/g"],
 *       "env": { "TOKEN": "..." }          "environment": { "TOKEN": "..." }
 *     }                                  }
 *   }                                  }
 * }                                  }
 */

export interface OpenCodeMcpServer {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface OpenCodeMcpConfig {
  mcp: Record<string, OpenCodeMcpServer>;
}

/**
 * Convert shared McpServerConfig entries to OpenCode format.
 */
export function translateMcpConfig(
  mcpServers: Record<string, McpServerConfig>,
  logger?: Logger,
): Record<string, OpenCodeMcpServer> {
  const result: Record<string, OpenCodeMcpServer> = {};

  for (const [name, server] of Object.entries(mcpServers)) {
    try {
      if (server.type === 'sse' || server.type === 'http') {
        // Remote MCP server (SSE or HTTP Streamable)
        result[name] = {
          type: 'remote',
          url: server.url,
          enabled: true,
          headers: server.headers,
        };
      } else {
        // Local MCP server (stdio — default)
        const command: string[] = [];
        if (server.command) command.push(server.command);
        if (server.args) command.push(...server.args);

        result[name] = {
          type: 'local',
          command: command.length > 0 ? command : undefined,
          enabled: true,
          environment: server.env,
        };
      }
    } catch (err: any) {
      logger?.warn(`Failed to translate MCP server '${name}': ${err?.message}`);
    }
  }

  return result;
}

/**
 * Convert OpenCode MCP format back to shared McpServerConfig format.
 * Used when saving MCP config from the frontend.
 */
export function translateMcpConfigReverse(
  openCodeMcp: Record<string, OpenCodeMcpServer>,
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  for (const [name, server] of Object.entries(openCodeMcp)) {
    if (server.type === 'remote') {
      result[name] = {
        type: server.url?.includes('/sse') ? 'sse' : 'http',
        url: server.url,
        headers: server.headers,
      };
    } else {
      const parts = server.command ?? [];
      result[name] = {
        command: parts[0],
        args: parts.slice(1),
        env: server.environment,
      };
    }
  }

  return result;
}
