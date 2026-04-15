import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpServerConfig } from '../mcpserverconfig/mcp.server.config';

/**
 * Thin pi extension that bridges a selected subset of MCP tools into pi's AgentTool
 * interface. pi-mono deliberately excludes MCP, so we run our own MCP clients and
 * expose their tools as pi tools. Resources / prompts / sampling are intentionally
 * out of scope.
 *
 * Allowlist lives at <projectRoot>/.etienne/pi-mcp-bridge.json:
 *   {
 *     "servers": ["filesystem", "github"],
 *     "tools": ["filesystem__read_file", "github__create_issue"]
 *   }
 *
 * Tool naming: `<server>__<tool>` — matches the Anthropic harness convention.
 */

interface PiMcpBridgeAllowlist {
  servers?: string[];
  tools?: string[];
}

interface McpJsonFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface PiAgentTool {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

export interface PiMcpBridge {
  tools: PiAgentTool[];
  close: () => Promise<void>;
}

export async function buildPiMcpBridge(opts: {
  logger: Logger;
  projectRoot: string;
}): Promise<PiMcpBridge> {
  const { logger, projectRoot } = opts;

  const allowlist = await readAllowlist(projectRoot);
  if (!allowlist || !(allowlist.servers?.length || allowlist.tools?.length)) {
    logger.debug('pi-mono MCP bridge: no allowlist, skipping MCP tool exposure');
    return { tools: [], close: async () => {} };
  }

  const mcpJson = await readMcpJson(projectRoot);
  if (!mcpJson.mcpServers || Object.keys(mcpJson.mcpServers).length === 0) {
    logger.debug('pi-mono MCP bridge: no .mcp.json servers declared');
    return { tools: [], close: async () => {} };
  }

  const allowedServers = new Set(allowlist.servers ?? Object.keys(mcpJson.mcpServers));
  const allowedTools = allowlist.tools ? new Set(allowlist.tools) : undefined;

  const clients: Array<{ server: string; client: Client }> = [];
  const tools: PiAgentTool[] = [];

  for (const [serverName, serverCfg] of Object.entries(mcpJson.mcpServers)) {
    if (!allowedServers.has(serverName)) continue;

    try {
      const client = await connectMcpClient(serverName, serverCfg);
      clients.push({ server: serverName, client });

      const listed = await client.listTools();
      for (const mcpTool of listed.tools ?? []) {
        const bridgedName = `${serverName}__${mcpTool.name}`;
        if (allowedTools && !allowedTools.has(bridgedName)) continue;

        tools.push({
          name: bridgedName,
          description: `[MCP:${serverName}] ${mcpTool.description ?? mcpTool.name}`,
          parameters: mcpTool.inputSchema ?? { type: 'object', properties: {} },
          execute: async (args: any) => {
            const result = await client.callTool({ name: mcpTool.name, arguments: args });
            return result;
          },
        });
      }
      logger.log(`pi-mono MCP bridge: connected ${serverName}, exposed ${tools.filter(t => t.name.startsWith(`${serverName}__`)).length} tools`);
    } catch (err: any) {
      logger.warn(`pi-mono MCP bridge: failed to connect to ${serverName}: ${err?.message}`);
    }
  }

  return {
    tools,
    close: async () => {
      for (const { server, client } of clients) {
        try { await client.close(); }
        catch (err: any) { logger.debug(`pi-mono MCP bridge: close ${server} failed: ${err?.message}`); }
      }
    },
  };
}

async function readAllowlist(projectRoot: string): Promise<PiMcpBridgeAllowlist | undefined> {
  const p = path.join(projectRoot, '.etienne', 'pi-mcp-bridge.json');
  if (!(await fs.pathExists(p))) return undefined;
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    return undefined;
  }
}

async function readMcpJson(projectRoot: string): Promise<McpJsonFile> {
  const p = path.join(projectRoot, '.mcp.json');
  if (!(await fs.pathExists(p))) return {};
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    return {};
  }
}

async function connectMcpClient(serverName: string, cfg: McpServerConfig): Promise<Client> {
  const client = new Client({ name: `pi-mono-bridge-${serverName}`, version: '0.1.0' }, { capabilities: {} });

  if (cfg.type === 'sse' || cfg.type === 'http') {
    if (!cfg.url) throw new Error(`MCP server ${serverName} has no url`);
    const transport = new SSEClientTransport(new URL(cfg.url));
    await client.connect(transport);
    return client;
  }

  if (!cfg.command) throw new Error(`MCP server ${serverName} has no command`);
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: cfg.env as Record<string, string> | undefined,
  });
  await client.connect(transport);
  return client;
}
