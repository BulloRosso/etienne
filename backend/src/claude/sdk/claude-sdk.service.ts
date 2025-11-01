import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';

// Use Function constructor to prevent TypeScript from transpiling dynamic import to require()
const dynamicImport = new Function('specifier', 'return import(specifier)');

@Injectable()
export class ClaudeSdkService {
  private readonly logger = new Logger(ClaudeSdkService.name);
  private readonly config = new ClaudeConfig();
  private query: any = null;

  /**
   * Lazy load the SDK to avoid require() of ESM
   */
  private async ensureSdkLoaded() {
    if (!this.query) {
      const sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk');
      this.query = sdk.query;
      this.logger.log('Agent SDK loaded successfully via dynamic import');
    }
  }

  /**
   * Stream a conversation using the Agent SDK
   * This replaces the bash subprocess approach with direct SDK integration
   */
  async *streamConversation(
    projectDir: string,
    initialPrompt: string,
    options: {
      sessionId?: string;
      agentMode?: string;
      maxTurns?: number;
      allowedTools?: string[];
    } = {}
  ) {
    const { sessionId, agentMode, maxTurns, allowedTools } = options;

    try {
      // Ensure SDK is loaded
      await this.ensureSdkLoaded();

      // Get the absolute path to the project workspace directory
      const projectRoot = safeRoot(this.config.hostRoot, projectDir);

      // Load system prompt from CLAUDE.md
      const systemPrompt = await this.loadSystemPrompt(projectDir);

      // Load permissions if not provided
      const tools = allowedTools || await this.loadPermissions(projectDir);

      // Use bypassPermissions mode to avoid permission prompts
      const permissionMode = 'bypassPermissions';

      // Configure SDK options
      const queryOptions = {
        model: 'claude-sonnet-4-5',
        apiKey: process.env.ANTHROPIC_API_KEY,  // Use direct API calls, not CLI process
        cwd: projectRoot,  // Set working directory to workspace/<project>
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: systemPrompt
        },
        allowedTools: tools,
        permissionMode: permissionMode as any,
        maxTurns: maxTurns || 20,
        settingSources: ['project' as const],
        includePartialMessages: true,  // Enable true streaming with partial message events
        ...(sessionId && { resume: sessionId })
      };

      this.logger.log(`Starting SDK conversation for project: ${projectDir} (cwd: ${projectRoot}), session: ${sessionId || 'new'}`);

      // Stream conversation via SDK
      for await (const message of this.query({
        prompt: initialPrompt,
        options: queryOptions
      })) {
        yield message;
      }

      this.logger.log(`SDK conversation completed for project: ${projectDir}`);
    } catch (error: any) {
      this.logger.error(`SDK conversation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Load system prompt from CLAUDE.md file
   */
  private async loadSystemPrompt(projectDir: string): Promise<string> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const claudeMdPath = join(root, 'CLAUDE.md');

    try {
      const content = await fs.readFile(claudeMdPath, 'utf8');
      this.logger.debug(`Loaded system prompt from ${claudeMdPath}`);
      return content;
    } catch {
      this.logger.debug(`No CLAUDE.md found, using default for ${projectDir}`);
      return `# ${projectDir}\n`;
    }
  }

  /**
   * Load allowed tools from permissions.json and settings.json
   */
  private async loadPermissions(projectDir: string): Promise<string[]> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const permissionsPath = join(root, 'data', 'permissions.json');
    const settingsJsonPath = join(root, '.claude', 'settings.json');

    // Load base permissions from permissions.json
    let basePermissions: string[];
    try {
      const content = await fs.readFile(permissionsPath, 'utf8');
      const parsed = JSON.parse(content);
      basePermissions = parsed.allowedTools || this.config.defaultAllowedTools;
    } catch {
      basePermissions = this.config.defaultAllowedTools;
    }

    // Load MCP permissions from settings.json and merge
    try {
      const settingsContent = await fs.readFile(settingsJsonPath, 'utf8');
      const settingsJson = JSON.parse(settingsContent);
      const mcpPermissions = (settingsJson.allowedTools || []).filter((tool: string) => tool.startsWith('mcp__'));

      // Merge: base permissions + MCP permissions
      return [...basePermissions, ...mcpPermissions];
    } catch {
      // If settings.json doesn't exist or has no MCP permissions, just return base
      return basePermissions;
    }
  }
}
