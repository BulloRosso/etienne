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

  /**
   * Env vars the Claude Code subprocess legitimately needs. Everything else
   * in process.env (JWT_SECRET, DB creds, ...) must NOT reach the agent:
   * its Bash tool runs in this environment, so any permitted shell command
   * can read whatever we pass here.
   */
  private static readonly ENV_PASSTHROUGH = [
    // POSIX basics
    'PATH', 'HOME', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'USER',
    // Windows basics (Node subprocesses fail to start without these)
    'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'WINDIR',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP',
    // Outbound proxy configuration, if any
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy',
    // Custom CA bundle, if the deployment uses one
    'NODE_EXTRA_CA_CERTS',
    // Claude Code specifics
    'CLAUDE_CONFIG_DIR',
  ];

  private buildSubprocessEnv(apiKey?: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of ClaudeSdkService.ENV_PASSTHROUGH) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
    return env;
  }

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
      abortController?: AbortController;  // pre-registered by the orchestrator
    } = {}
  ) {
    const { sessionId, agentMode, maxTurns, allowedTools, hooks, processId, canUseTool } = options;

    // Prefer the caller's controller (registered before async setup);
    // fall back to creating one here for callers that don't pass one.
    const abortController = options.abortController ?? new AbortController();
    if (processId && this.abortControllers.get(processId) !== abortController) {
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

      // Configure environment for the spawned Claude Code subprocess.
      // Allowlist only — never spread process.env into the agent's env.
      queryOptions.env = this.buildSubprocessEnv(
        altModelConfig?.token
          || await this.secretsManager.getSecret('ANTHROPIC_API_KEY')
          || process.env.ANTHROPIC_API_KEY
      );

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

      // Add stderr handler to capture subprocess errors.
      // Known benign noise from SDK 0.3.x teardown: when compaction-related hooks
      // (PreCompact / PostCompact) fire after the stream has already closed, the
      // SDK throws 'Error in hook callback hook_N: ... Stream closed' from its
      // internal sendRequest. The agent has already completed by this point —
      // demote to debug to keep ERROR logs meaningful.
      queryOptions.stderr = (data: string) => {
        const trimmed = data.trim();
        if (!trimmed) return;
        if (/Error in hook callback hook_\d+:/.test(trimmed) && /Stream closed/.test(trimmed)) {
          this.logger.debug(`[Claude Code stderr — benign teardown] ${trimmed.substring(0, 200)}…`);
          return;
        }
        this.logger.error(`[Claude Code stderr] ${trimmed}`);
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
   * Create and register an abort controller for a process BEFORE any async
   * setup work, so abort requests arriving during guardrails/memory/etc.
   * are honored instead of returning "not found".
   */
  public createAbortController(processId: string): AbortController {
    const controller = new AbortController();
    this.abortControllers.set(processId, controller);
    this.logger.log(`Registered abort controller (early) for process: ${processId}`);
    return controller;
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

    // failIfUnavailable: false — SDK 0.3 made this a hard error on Windows where
    // OS-level sandboxing isn't supported. Falling back to unsandboxed execution
    // is safe here because tool allow/deny lists (defaultAllowedTools /
    // defaultDeniedTools) already restrict what the agent can touch.
    if (forceScope) {
      // Strict: deny both read and write outside the project
      return {
        enabled: true,
        failIfUnavailable: false,
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
        failIfUnavailable: false,
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
