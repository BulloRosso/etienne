import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'smol-toml';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';
import { CodingAgentConfigurationService } from '../../coding-agent-configuration/coding-agent-configuration.service';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  type?: 'stdio' | 'http' | 'sse';
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface McpConfiguration {
  mcpServers: Record<string, McpServerConfig>;
}

@Injectable()
export class McpServerConfigService {
  private readonly logger = new Logger(McpServerConfigService.name);
  private readonly config = new ClaudeConfig();

  constructor(
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
  ) {}

  /**
   * Get MCP configuration for a project
   */
  public async getMcpConfig(projectName: string): Promise<McpConfiguration> {
    const root = safeRoot(this.config.hostRoot, projectName);

    if (this.codingAgentConfigService.getActiveAgentType() === 'openai') {
      return this.getMcpConfigCodex(root);
    }

    return this.getMcpConfigClaude(root);
  }

  /**
   * Save MCP configuration for a project
   */
  public async saveMcpConfig(projectName: string, config: McpConfiguration): Promise<{ success: boolean }> {
    const root = safeRoot(this.config.hostRoot, projectName);
    await fs.mkdir(root, { recursive: true });

    if (this.codingAgentConfigService.getActiveAgentType() === 'openai') {
      return this.saveMcpConfigCodex(root, config);
    }

    return this.saveMcpConfigClaude(root, projectName, config);
  }

  // ── Claude (anthropic) path ──────────────────────────────────────────

  private async getMcpConfigClaude(root: string): Promise<McpConfiguration> {
    const mcpConfigPath = join(root, '.mcp.json');
    try {
      const content = await fs.readFile(mcpConfigPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return { mcpServers: {} };
    }
  }

  private async saveMcpConfigClaude(root: string, projectName: string, config: McpConfiguration): Promise<{ success: boolean }> {
    const mcpConfigPath = join(root, '.mcp.json');

    // Write configuration to .mcp.json
    await fs.writeFile(mcpConfigPath, JSON.stringify(config, null, 2), 'utf8');

    // Update .claude/settings.json with enabled MCP servers
    await this.updateClaudeJsonServers(projectName, config);

    // Force new session by deleting session ID so MCP config is loaded
    const sessionPath = join(root, 'data', 'session.id');
    try {
      await fs.unlink(sessionPath);
    } catch {
      // Session file might not exist yet - that's OK
    }

    return { success: true };
  }

  /**
   * Update enabledMcpjsonServers and allowedTools in .claude/settings.json
   */
  private async updateClaudeJsonServers(projectName: string, config: McpConfiguration): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const settingsJsonPath = join(root, '.claude', 'settings.json');

    const serverNames = Object.keys(config.mcpServers || {});

    try {
      let settingsJson: any;
      try {
        const content = await fs.readFile(settingsJsonPath, 'utf8');
        settingsJson = JSON.parse(content);
      } catch {
        settingsJson = {};
      }

      settingsJson.enabledMcpjsonServers = serverNames;

      const existingAllowedTools = settingsJson.allowedTools || [];
      const nonMcpTools = existingAllowedTools.filter((tool: string) => !tool.startsWith('mcp__'));
      const mcpServerPermissions = serverNames.map(serverName => `mcp__${serverName}`);
      settingsJson.allowedTools = [...nonMcpTools, ...mcpServerPermissions];

      await fs.mkdir(join(root, '.claude'), { recursive: true });
      await fs.writeFile(settingsJsonPath, JSON.stringify(settingsJson, null, 2), 'utf8');
    } catch (error: any) {
      console.error(`Error updating .claude/settings.json: ${error.message}`);
    }
  }

  // ── Codex (openai) path ──────────────────────────────────────────────

  private async getMcpConfigCodex(root: string): Promise<McpConfiguration> {
    const configPath = join(root, '.codex', 'config.toml');
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const parsed = parse(content);
      return { mcpServers: this.codexTomlToMcpServers(parsed) };
    } catch {
      return { mcpServers: {} };
    }
  }

  private async saveMcpConfigCodex(root: string, config: McpConfiguration): Promise<{ success: boolean }> {
    const configPath = join(root, '.codex', 'config.toml');
    await fs.mkdir(join(root, '.codex'), { recursive: true });

    // Read existing config.toml to preserve non-MCP settings
    let existing: Record<string, any> = {};
    try {
      const content = await fs.readFile(configPath, 'utf8');
      existing = parse(content) as Record<string, any>;
    } catch {
      // File doesn't exist or is invalid — start fresh
    }

    // Remove old MCP servers
    delete existing.mcp_servers;

    // Add new MCP servers in Codex TOML format
    if (Object.keys(config.mcpServers).length > 0) {
      existing.mcp_servers = {};
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const codexEntry: Record<string, any> = {};
        if (serverConfig.command) codexEntry.command = serverConfig.command;
        if (serverConfig.args?.length) codexEntry.args = serverConfig.args;
        if (serverConfig.url) codexEntry.url = serverConfig.url;
        if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
          codexEntry.env = serverConfig.env;
        }
        if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
          codexEntry.http_headers = serverConfig.headers;
        }
        existing.mcp_servers[name] = codexEntry;
      }
    }

    await fs.writeFile(configPath, stringify(existing), 'utf8');
    this.logger.log(`Saved MCP config to .codex/config.toml`);

    return { success: true };
  }

  /**
   * Extract McpServerConfig entries from a parsed Codex TOML object.
   */
  private codexTomlToMcpServers(parsed: Record<string, any>): Record<string, McpServerConfig> {
    const mcpServers: Record<string, McpServerConfig> = {};
    const rawServers = parsed.mcp_servers || {};

    for (const [name, raw] of Object.entries(rawServers)) {
      const r = raw as Record<string, any>;
      const entry: McpServerConfig = {};
      if (r.command) entry.command = r.command;
      if (r.args) entry.args = r.args;
      if (r.url) entry.url = r.url;
      if (r.env) entry.env = r.env;
      if (r.http_headers) entry.headers = r.http_headers;
      mcpServers[name] = entry;
    }

    return mcpServers;
  }
}
