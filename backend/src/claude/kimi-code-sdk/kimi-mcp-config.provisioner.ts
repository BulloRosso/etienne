import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs-extra';
import { McpServerConfig } from '../mcpserverconfig/mcp.server.config';

/**
 * Provision the project's MCP servers for the Kimi CLI.
 *
 * Kimi reads MCP servers from `<shareDir>/mcp.json` (default `~/.kimi/mcp.json`)
 * in the SAME `{"mcpServers": {...}}` schema as the project's shared `.mcp.json`
 * — stdio entries (`command`/`args`/`env`) copy as-is, remote entries become
 * `{url, headers}`. Because the orchestrator passes `shareDir: <project>/.kimi`
 * to createSession, this write is per-project with no global-file contention.
 *
 * The file is only rewritten when its content actually changed to avoid mtime
 * churn (and needless CLI config reloads).
 */
export async function provisionKimiMcpConfig(opts: {
  logger: Logger;
  projectRoot: string;
  mcpServers: Record<string, McpServerConfig>;
}): Promise<void> {
  const { logger, projectRoot, mcpServers } = opts;

  const shareDir = path.join(projectRoot, '.kimi');
  const mcpPath = path.join(shareDir, 'mcp.json');

  const translated: Record<string, any> = {};
  for (const [name, server] of Object.entries(mcpServers ?? {})) {
    if (server.command) {
      // stdio transport — near-identity copy
      const entry: Record<string, any> = { command: server.command };
      if (server.args?.length) entry.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env;
      translated[name] = entry;
    } else if (server.url) {
      // remote (sse/http) transport — Kimi's remote form is {url, headers}
      const entry: Record<string, any> = { url: server.url };
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers;
      translated[name] = entry;
    } else {
      logger.warn(`Skipping MCP server '${name}' for Kimi: neither command nor url configured`);
    }
  }

  const next = JSON.stringify({ mcpServers: translated }, null, 2);

  let current: string | undefined;
  try {
    current = await fs.readFile(mcpPath, 'utf-8');
  } catch { /* file doesn't exist yet */ }

  if (current === next) return;

  await fs.ensureDir(shareDir);
  await fs.writeFile(mcpPath, next, 'utf-8');
  logger.debug(`Provisioned ${Object.keys(translated).length} MCP servers for Kimi at ${mcpPath}`);
}
