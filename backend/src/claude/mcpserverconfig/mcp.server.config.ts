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
    return { success: true };
  }
}
