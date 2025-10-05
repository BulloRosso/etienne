import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';

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
  private readonly config = new ClaudeConfig();

  /**
   * Get MCP configuration for a project
   */
  public async getMcpConfig(projectName: string): Promise<McpConfiguration> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const mcpConfigPath = join(root, '.mcp.json');

    try {
      const content = await fs.readFile(mcpConfigPath, 'utf8');
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      // Return default empty configuration if file doesn't exist
      return { mcpServers: {} };
    }
  }

  /**
   * Save MCP configuration for a project
   */
  public async saveMcpConfig(projectName: string, config: McpConfiguration): Promise<{ success: boolean }> {
    const root = safeRoot(this.config.hostRoot, projectName);
    const mcpConfigPath = join(root, '.mcp.json');

    // Ensure project directory exists
    await fs.mkdir(root, { recursive: true });

    // Write configuration to .mcp.json
    await fs.writeFile(mcpConfigPath, JSON.stringify(config, null, 2), 'utf8');

    // Update .claude/.claude.json with enabled MCP servers
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

    // Extract server names from mcpServers
    const serverNames = Object.keys(config.mcpServers || {});

    try {
      // Read existing settings.json
      let settingsJson: any;
      try {
        const content = await fs.readFile(settingsJsonPath, 'utf8');
        settingsJson = JSON.parse(content);
      } catch {
        // If file doesn't exist, create a minimal structure
        settingsJson = {};
      }

      // Update enabledMcpjsonServers with server names
      settingsJson.enabledMcpjsonServers = serverNames;

      // Update allowedTools to grant permission for all MCP server tools
      // Format: "mcp__servername" grants all tools from that server
      const existingAllowedTools = settingsJson.allowedTools || [];

      // Filter out old MCP permissions (those starting with "mcp__")
      const nonMcpTools = existingAllowedTools.filter((tool: string) => !tool.startsWith('mcp__'));

      // Add new MCP server permissions
      const mcpServerPermissions = serverNames.map(serverName => `mcp__${serverName}`);

      settingsJson.allowedTools = [...nonMcpTools, ...mcpServerPermissions];

      // Ensure .claude directory exists
      await fs.mkdir(join(root, '.claude'), { recursive: true });

      // Write updated settings.json
      await fs.writeFile(settingsJsonPath, JSON.stringify(settingsJson, null, 2), 'utf8');
    } catch (error: any) {
      // Log error but don't fail the save operation
      console.error(`Error updating .claude/settings.json: ${error.message}`);
    }
  }
}
