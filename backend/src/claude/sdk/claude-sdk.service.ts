import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeConfig } from '../config/claude.config';
import { safeRoot } from '../utils/path.utils';
import { posixProjectPath } from '../../common/path.util';
import { CanUseTool } from './sdk-permission.types';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

// Use Function constructor to prevent TypeScript from transpiling dynamic import to require()
const dynamicImport = new Function('specifier', 'return import(specifier)');

@Injectable()
export class ClaudeSdkService {
  private readonly logger = new Logger(ClaudeSdkService.name);
  private readonly config: ClaudeConfig;

  constructor(private readonly secretsManager: SecretsManagerService) {
    this.config = new ClaudeConfig(secretsManager);
  }

  async onModuleInit() {
    await this.config.initSecrets();
  }
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
      const loaded = allowedTools ? { allowedTools, deniedTools: this.config.defaultDeniedTools } : await this.loadPermissions(projectDir);
      const tools = loaded.allowedTools;

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

      // Build sandbox configuration for project isolation
      const workspaceRoot = isContainer ? this.config.containerRoot : this.config.hostRoot;
      const sandbox = this.buildSandboxConfig(projectRoot, workspaceRoot);

      // Configure SDK options
      // Note: systemPrompt is not included - Claude Code SDK will automatically
      // pick it up from .claude/CLAUDE.md in the project directory
      const queryOptions: any = {
        model: altModelConfig?.model || 'claude-opus-4-6',
        cwd: projectRoot,  // Set working directory to workspace/<project>
        ...(sandbox && { sandbox }),
        allowedTools: tools,
        disallowedTools: loaded.deniedTools,
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
        ANTHROPIC_API_KEY: altModelConfig?.token || await this.secretsManager.getSecret('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY
      };

      // Foundry hosted agent — use managed identity token for model access
      if (process.env.AZURE_FOUNDRY_AGENT_ID) {
        const endpoint = process.env.AZURE_AI_ENDPOINT || process.env.ANTHROPIC_FOUNDRY_RESOURCE;
        if (endpoint) {
          queryOptions.env.ANTHROPIC_BASE_URL = endpoint.startsWith('http')
            ? endpoint.replace(/\/messages$/, '')
            : `https://${endpoint}.services.ai.azure.com/anthropic/v1`;
        }
        // The managed identity token is refreshed by LlmService and stored in env
        if (process.env._FOUNDRY_MODEL_TOKEN) {
          queryOptions.env.ANTHROPIC_API_KEY = process.env._FOUNDRY_MODEL_TOKEN;
        }
      }

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
   * Build sandbox configuration based on FORCE_PROJECT_SCOPE setting.
   * - true (default): agent can only read/write within its own project directory
   * - false: agent can read sibling project directories but cannot write to them
   */
  private buildSandboxConfig(projectRoot: string, workspaceRoot: string): any {
    const forceScope = this.config.forceProjectScope;
    this.logger.log(`FORCE_PROJECT_SCOPE=${forceScope} — sandbox isolation for: ${projectRoot}`);

    const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');
    const normalizedWorkspaceRoot = workspaceRoot.replace(/\\/g, '/');

    if (forceScope) {
      // Strict: deny both read and write outside the project
      return {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        filesystem: {
          allowWrite: [`${normalizedProjectRoot}/**`],
          denyRead: [`${normalizedWorkspaceRoot}/**`],
          denyWrite: [`${normalizedWorkspaceRoot}/**`],
        },
      };
    } else {
      // Relaxed: allow reading siblings, deny writing to them
      return {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        filesystem: {
          allowWrite: [`${normalizedProjectRoot}/**`],
          denyWrite: [`${normalizedWorkspaceRoot}/**`],
        },
      };
    }
  }

  /**
   * Load allowed and denied tools from permissions.json and settings.json
   */
  private async loadPermissions(projectDir: string): Promise<{ allowedTools: string[]; deniedTools: string[] }> {
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

    const deniedTools = this.config.defaultDeniedTools;

    // Load MCP permissions from settings.json and merge
    try {
      const settingsContent = await fs.readFile(settingsJsonPath, 'utf8');
      const settingsJson = JSON.parse(settingsContent);
      const mcpPermissions = (settingsJson.allowedTools || []).filter((tool: string) => tool.startsWith('mcp__'));

      // Merge: base permissions + MCP permissions
      return { allowedTools: [...basePermissions, ...mcpPermissions], deniedTools };
    } catch {
      // If settings.json doesn't exist or has no MCP permissions, just return base
      return { allowedTools: basePermissions, deniedTools };
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
