import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';
import { posixProjectPath } from '../../common/path.util';
import { CanUseTool } from './sdk-permission.types';

// Use Function constructor to prevent TypeScript from transpiling dynamic import to require()
const dynamicImport = new Function('specifier', 'return import(specifier)');

@Injectable()
export class ClaudeSdkService {
  private readonly logger = new Logger(ClaudeSdkService.name);
  private readonly config = new ClaudeConfig();
  private query: any = null;
  private readonly abortControllers = new Map<string, AbortController>();

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
      hooks?: any;  // Hook handlers from orchestrator
      processId?: string;  // Process ID for abort tracking
      canUseTool?: CanUseTool;  // Permission callback for tool approval
    } = {}
  ) {
    const { sessionId, agentMode, maxTurns, allowedTools, hooks, processId, canUseTool } = options;

    // Create abort controller for this stream
    const abortController = new AbortController();
    if (processId) {
      this.abortControllers.set(processId, abortController);
      this.logger.log(`Registered abort controller for process: ${processId}`);
    }

    try {
      // Ensure SDK is loaded
      await this.ensureSdkLoaded();

      // Get the absolute path to the project workspace directory
      const isContainer = process.env.DEVCONTAINER === 'true';
      const projectRoot = isContainer
        ? posixProjectPath(this.config.containerRoot, projectDir)
        : safeRoot(this.config.hostRoot, projectDir);

      // Load permissions if not provided
      const tools = allowedTools || await this.loadPermissions(projectDir);

      // Load alternative AI model configuration
      const altModelConfig = await this.loadAlternativeModelConfig(projectDir);

      // Map agentMode to permissionMode
      // - 'plan': Planning mode - Claude creates a plan without executing tools
      // - 'work': Work mode - Claude executes tools and makes changes
      // - undefined/other: Use 'default' mode so canUseTool callback is invoked
      //   for tools that need user interaction (AskUserQuestion, ExitPlanMode)
      //   Other tools are auto-approved in PreToolUse hook
      const planningMode = agentMode === 'plan';
      const permissionMode = planningMode ? 'plan' : 'default';

      this.logger.log(`Agent mode: ${agentMode || 'default'} → Permission mode: ${permissionMode}`);

      // Configure SDK options
      // Note: systemPrompt is not included - Claude Code SDK will automatically
      // pick it up from .claude/CLAUDE.md in the project directory
      const queryOptions: any = {
        model: altModelConfig?.model || 'claude-opus-4-5-20251101',
        cwd: projectRoot,  // Set working directory to workspace/<project>
        allowedTools: tools,
        permissionMode: permissionMode as any,
        maxTurns: maxTurns || 20,
        settingSources: ['project' as const],
        includePartialMessages: true,  // Enable true streaming with partial message events
        abortController: abortController,  // Pass abort controller to SDK
        ...(sessionId && { resume: sessionId }),
        ...(hooks && { hooks }),  // Add hooks if provided
        ...(canUseTool && { canUseTool })  // Add canUseTool callback if provided
      };

      // Configure environment variables for API access
      // The SDK spawns a subprocess and passes these via env
      queryOptions.env = {
        ...process.env,  // Inherit existing environment
        ANTHROPIC_API_KEY: altModelConfig?.token || process.env.ANTHROPIC_API_KEY
      };

      // Add alternative model configuration via environment variables if present
      if (altModelConfig) {
        queryOptions.env.ANTHROPIC_BASE_URL = altModelConfig.baseUrl;
        // Only set ANTHROPIC_MODEL if it's not empty
        if (altModelConfig.model && altModelConfig.model.trim()) {
          queryOptions.env.ANTHROPIC_MODEL = altModelConfig.model;
        }
        this.logger.log(`Using alternative AI model: ${altModelConfig.model} @ ${altModelConfig.baseUrl}`);
      }

      // Add stderr handler to capture subprocess errors
      queryOptions.stderr = (data: string) => {
        if (data.trim()) {
          this.logger.error(`[Claude Code stderr] ${data.trim()}`);
        }
      };

      this.logger.log(`Starting SDK conversation for project: ${projectDir} (cwd: ${projectRoot}), session: ${sessionId || 'new'}`);
      this.logger.log(`Hooks passed to SDK: ${!!hooks}, PreToolUse: ${hooks?.PreToolUse?.length || 0}, PostToolUse: ${hooks?.PostToolUse?.length || 0}`);
      this.logger.log(`canUseTool callback provided: ${!!canUseTool}`);
      this.logger.log(`Query options keys: ${Object.keys(queryOptions).join(', ')}`);
      this.logger.log(`Hooks in queryOptions: ${!!queryOptions.hooks}`);

      // Stream conversation via SDK
      for await (const message of this.query({
        prompt: initialPrompt,
        options: queryOptions
      })) {
        yield message;
      }

      this.logger.log(`SDK conversation completed for project: ${projectDir}`);
    } catch (error: any) {
      // Check if this was an abort
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        this.logger.log(`SDK conversation aborted for process: ${processId}`);
      } else {
        this.logger.error(`SDK conversation failed: ${error.message}`, error.stack);
      }
      throw error;
    } finally {
      // Clean up abort controller
      if (processId) {
        this.abortControllers.delete(processId);
        this.logger.log(`Cleaned up abort controller for process: ${processId}`);
      }
    }
  }

  /**
   * Abort a running SDK conversation stream
   */
  public abortStream(processId: string): boolean {
    const controller = this.abortControllers.get(processId);
    if (controller) {
      this.logger.log(`Aborting SDK stream for process: ${processId}`);
      controller.abort();
      this.abortControllers.delete(processId);
      return true;
    }
    this.logger.warn(`No active stream found for process: ${processId}`);
    return false;
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

  /**
   * Load alternative AI model configuration from .etienne/ai-model.json
   */
  private async loadAlternativeModelConfig(projectDir: string): Promise<any | null> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const aiModelConfigPath = join(root, '.etienne', 'ai-model.json');

    try {
      const content = await fs.readFile(aiModelConfigPath, 'utf8');
      const config = JSON.parse(content);

      // Only return config if it's active
      if (config.isActive && config.model && config.baseUrl && config.token) {
        this.logger.log(`Loaded alternative AI model config: ${config.model} @ ${config.baseUrl}`);
        return config;
      }
    } catch (error: any) {
      // File doesn't exist or couldn't be parsed - that's OK
      if (error.code !== 'ENOENT') {
        this.logger.warn(`Failed to load alternative model config: ${error.message}`);
      }
    }

    return null;
  }
}
