import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, normalize, relative } from 'path';
import { OpenAIAgentsConfig } from './openai-agents.config';
import { safeRoot } from '../utils/path.utils';
import { z } from 'zod';

// Use Function constructor to prevent TypeScript from transpiling dynamic import to require()
const dynamicImport = new Function('specifier', 'return import(specifier)');

/**
 * Internal event types yielded by streamConversation to the orchestrator.
 * These wrap or supplement the SDK's native RunStreamEvent types.
 */
export interface SessionInitEvent {
  type: 'session_init';
  sessionId: string;
  model: string;
}

export interface RunCompletedEvent {
  type: 'run_completed';
  finalOutput: string;
  usage: any;
  interruptions?: any[];
}

export interface ApprovalRequiredEvent {
  type: 'approval_required';
  interruptions: any[];
  state: any;
}

export type InternalEvent =
  | SessionInitEvent
  | RunCompletedEvent
  | ApprovalRequiredEvent;

/** Approval resolution callback provided by the orchestrator */
export type ApprovalResolver = (
  interruptions: any[],
) => Promise<Map<any, { approved: boolean }>>;

@Injectable()
export class OpenAIAgentsSdkService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenAIAgentsSdkService.name);
  private readonly config = new OpenAIAgentsConfig();

  // Lazy-loaded SDK modules
  private Agent: any = null;
  private run: any = null;
  private tool: any = null;
  private webSearchTool: any = null;
  private codexToolFn: any = null;
  private MCPServerStdio: any = null;
  private MCPServerStreamableHttp: any = null;
  private MCPServerSSE: any = null;
  private sdkLoaded = false;

  // Active MCP server connections (keyed by processId for cleanup)
  private readonly activeMcpServers = new Map<string, any[]>();

  // Per-project conversation history (manual session management)
  private readonly conversationHistory = new Map<string, any[]>();

  // Per-project last response ID for multi-turn continuity via OpenAI Responses API
  private readonly lastResponseIds = new Map<string, string>();

  // Abort controllers for active runs
  private readonly abortControllers = new Map<string, AbortController>();

  /**
   * Lazy-load the @openai/agents SDK (ESM) via dynamic import.
   */
  private async ensureSdkLoaded(): Promise<void> {
    if (this.sdkLoaded) return;

    const key = this.config.openAiApiKey;
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set it in .env or project .etienne/ai-model.json',
      );
    }

    // Set the env var so the SDK picks it up
    process.env.OPENAI_API_KEY = key;

    const agents = await dynamicImport('@openai/agents');
    this.Agent = agents.Agent;
    this.run = agents.run;
    this.tool = agents.tool;
    this.webSearchTool = agents.webSearchTool;

    this.MCPServerStdio = agents.MCPServerStdio;
    this.MCPServerStreamableHttp = agents.MCPServerStreamableHttp;
    this.MCPServerSSE = agents.MCPServerSSE;

    this.logger.log('OpenAI Agents SDK loaded successfully via dynamic import');

    // Optionally load the experimental codex tool
    if (this.config.enableCodexTool) {
      try {
        const ext = await dynamicImport(
          '@openai/agents-extensions/experimental/codex',
        );
        this.codexToolFn = ext.codexTool;
        this.logger.log('Experimental Codex tool extension loaded');
      } catch (e: any) {
        this.logger.warn(
          `Failed to load codex tool extension: ${e.message}`,
        );
      }
    }

    this.sdkLoaded = true;
  }

  /**
   * Get or create conversation history for a project.
   * Always keyed by projectDir to ensure continuity across requests
   * (sessionId changes between first and subsequent requests).
   */
  private getConversationHistory(projectDir: string): any[] {
    if (!this.conversationHistory.has(projectDir)) {
      this.conversationHistory.set(projectDir, []);
    }
    return this.conversationHistory.get(projectDir)!;
  }

  /**
   * Replace conversation history with the SDK's full history from the run.
   * The SDK's stream.history returns properly formatted AgentInputItem[]
   * that can be fed back as input for subsequent runs.
   * Always keyed by projectDir for consistent lookup.
   */
  private replaceHistory(projectDir: string, items: any[]): void {
    this.conversationHistory.set(projectDir, items);
  }

  /**
   * Resolve a user-supplied path to an absolute path within the project root.
   * Throws if the resolved path escapes the sandbox.
   */
  private safePath(projectRoot: string, filePath: string): string {
    const resolved = normalize(join(projectRoot, filePath));
    if (!resolved.startsWith(normalize(projectRoot))) {
      throw new Error('Path traversal: path escapes project workspace');
    }
    return resolved;
  }

  /**
   * Build workspace file tools sandboxed to the project directory.
   */
  private buildFileTools(projectRoot: string): any[] {
    const svc = this;

    const readFileTool = this.tool({
      name: 'read_file',
      description:
        'Read the contents of a file in the project workspace. ' +
        'The path is relative to the project root.',
      parameters: z.object({
        path: z.string().describe('Relative file path to read'),
      }),
      execute: async (input: { path: string }) => {
        const absPath = svc.safePath(projectRoot, input.path);
        const content = await fs.readFile(absPath, 'utf8');
        return content;
      },
    });

    const writeFileTool = this.tool({
      name: 'write_file',
      description:
        'Write content to a file in the project workspace. ' +
        'Creates the file and parent directories if they do not exist. ' +
        'The path is relative to the project root.',
      parameters: z.object({
        path: z.string().describe('Relative file path to write'),
        content: z.string().describe('File content to write'),
      }),
      execute: async (input: { path: string; content: string }) => {
        const absPath = svc.safePath(projectRoot, input.path);
        await fs.mkdir(join(absPath, '..'), { recursive: true });
        await fs.writeFile(absPath, input.content, 'utf8');
        return `File written: ${input.path}`;
      },
    });

    const listDirectoryTool = this.tool({
      name: 'list_directory',
      description:
        'List files and directories in the project workspace. ' +
        'The path is relative to the project root. Use "." for the root.',
      parameters: z.object({
        path: z.string().describe('Relative directory path to list, use "." for the root'),
      }),
      execute: async (input: { path: string }) => {
        const absPath = svc.safePath(projectRoot, input.path || '.');
        const entries = await fs.readdir(absPath, { withFileTypes: true });
        return entries
          .map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`)
          .join('\n');
      },
    });

    const searchFilesTool = this.tool({
      name: 'search_files',
      description:
        'Search for files by name pattern (glob-like) in the project workspace. ' +
        'Returns matching file paths relative to the project root. ' +
        'Pattern examples: "*.ts", "src/**/*.json".',
      parameters: z.object({
        pattern: z.string().describe('File name or pattern to search for'),
        directory: z.string().describe('Subdirectory to search in, use "." for the root'),
      }),
      execute: async (input: { pattern: string; directory: string }) => {
        const absDir = svc.safePath(projectRoot, input.directory || '.');
        const results: string[] = [];
        const searchPattern = input.pattern.toLowerCase();

        async function walk(dir: string) {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                  await walk(fullPath);
                }
              } else if (entry.name.toLowerCase().includes(searchPattern) ||
                         matchGlob(entry.name, input.pattern)) {
                results.push(relative(projectRoot, fullPath).replace(/\\/g, '/'));
              }
            }
          } catch { /* skip inaccessible dirs */ }
        }

        function matchGlob(name: string, pattern: string): boolean {
          const regex = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          return new RegExp(`^${regex}$`, 'i').test(name);
        }

        await walk(absDir);
        return results.length > 0
          ? results.slice(0, 100).join('\n')
          : 'No matching files found.';
      },
    });

    const grepTool = this.tool({
      name: 'grep',
      description:
        'Search for text content within files in the project workspace. ' +
        'Returns matching lines with file paths and line numbers.',
      parameters: z.object({
        pattern: z.string().describe('Text or regex pattern to search for'),
        directory: z.string().describe('Subdirectory to search in, use "." for the root'),
        fileExtension: z.string().nullable().describe('Only search files with this extension (e.g. ".ts"), or null for all files'),
      }),
      execute: async (input: { pattern: string; directory: string; fileExtension: string | null }) => {
        const absDir = svc.safePath(projectRoot, input.directory || '.');
        const matches: string[] = [];
        const regex = new RegExp(input.pattern, 'i');
        const maxResults = 50;

        async function walk(dir: string) {
          if (matches.length >= maxResults) return;
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (matches.length >= maxResults) return;
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                  await walk(fullPath);
                }
              } else {
                if (input.fileExtension && !entry.name.endsWith(input.fileExtension)) continue;
                try {
                  const content = await fs.readFile(fullPath, 'utf8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (regex.test(lines[i])) {
                      const relPath = relative(projectRoot, fullPath).replace(/\\/g, '/');
                      matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                      if (matches.length >= maxResults) return;
                    }
                  }
                } catch { /* skip binary/unreadable files */ }
              }
            }
          } catch { /* skip inaccessible dirs */ }
        }

        await walk(absDir);
        return matches.length > 0
          ? matches.join('\n')
          : 'No matches found.';
      },
    });

    return [readFileTool, writeFileTool, listDirectoryTool, searchFilesTool, grepTool];
  }

  /**
   * Load MCP server configuration from the project's .mcp.json file.
   * Returns the parsed McpConfiguration or an empty config if not found.
   */
  private async loadMcpConfig(projectRoot: string): Promise<{ mcpServers: Record<string, any> }> {
    const mcpConfigPath = join(projectRoot, '.mcp.json');
    try {
      const content = await fs.readFile(mcpConfigPath, 'utf8');
      const config = JSON.parse(content);
      return config || { mcpServers: {} };
    } catch {
      return { mcpServers: {} };
    }
  }

  /**
   * Build and connect MCP server instances from the project's .mcp.json config.
   * Returns an array of connected MCPServer instances ready for the Agent.
   *
   * Supports three transport types:
   *  - stdio: Spawns a local process (command + args)
   *  - http:  Connects via HTTP (Streamable HTTP transport)
   *  - sse:   Connects via Server-Sent Events
   */
  private async buildMcpServers(projectRoot: string): Promise<any[]> {
    const config = await this.loadMcpConfig(projectRoot);
    const servers: any[] = [];

    if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
      return servers;
    }

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        let server: any;
        const type = serverConfig.type || (serverConfig.command ? 'stdio' : serverConfig.url ? 'http' : null);

        if (type === 'stdio' && serverConfig.command) {
          server = new this.MCPServerStdio({
            name,
            command: serverConfig.command,
            args: serverConfig.args || [],
            env: serverConfig.env || {},
            cwd: projectRoot,
            cacheToolsList: true,
          });
        } else if (type === 'http' && serverConfig.url) {
          // Build requestInit for headers if provided
          const requestInit = serverConfig.headers
            ? { headers: serverConfig.headers }
            : undefined;

          server = new this.MCPServerStreamableHttp({
            name,
            url: serverConfig.url,
            cacheToolsList: true,
            requestInit,
          });
        } else if (type === 'sse' && serverConfig.url) {
          const requestInit = serverConfig.headers
            ? { headers: serverConfig.headers }
            : undefined;

          server = new this.MCPServerSSE({
            name,
            url: serverConfig.url,
            cacheToolsList: true,
            requestInit,
          });
        } else {
          this.logger.warn(`Skipping MCP server '${name}': unsupported type or missing config`);
          continue;
        }

        // Connect the server
        await server.connect();
        servers.push(server);
        this.logger.log(`MCP server '${name}' connected (${type})`);
      } catch (e: any) {
        this.logger.warn(`Failed to connect MCP server '${name}': ${e.message}`);
      }
    }

    return servers;
  }

  /**
   * Close all MCP servers associated with a process.
   */
  private async closeMcpServers(processId: string): Promise<void> {
    const servers = this.activeMcpServers.get(processId);
    if (!servers?.length) return;

    for (const server of servers) {
      try {
        await server.close();
        this.logger.log(`MCP server '${server.name}' closed`);
      } catch (e: any) {
        this.logger.warn(`Failed to close MCP server '${server.name}': ${e.message}`);
      }
    }
    this.activeMcpServers.delete(processId);
  }

  /**
   * Build the agent graph with agents-as-tools orchestration and file tools.
   *
   * Manager agent has:
   *   - File tools (read, write, list, search, grep) sandboxed to project
   *   - CodingAssistant sub-agent (via asTool)
   *   - Experimental Codex tool (optional)
   */
  private async buildAgentGraph(
    projectDir: string,
    instructions: string,
    model: string,
    mcpServers: any[] = [],
  ): Promise<any> {
    const projectRoot = safeRoot(this.config.hostRoot, projectDir);

    // File tools sandboxed to the project workspace
    const fileTools = this.buildFileTools(projectRoot);

    // Model settings: enable reasoning summary so thinking steps are visible
    const modelSettings: any = {};
    if (model.startsWith('gpt-5') && !model.startsWith('gpt-5-chat')) {
      modelSettings.reasoning = { effort: 'medium', summary: 'auto' };
    }

    // Coding specialist sub-agent (also gets MCP servers for tool access)
    const codingAgent = new this.Agent({
      name: 'CodingAssistant',
      instructions:
        'You are a specialist coding agent. You help with code generation, ' +
        'refactoring, debugging, and analysis. When given a coding task, break it down ' +
        'into clear steps and implement them. Return your results clearly.',
      model,
      modelSettings,
      tools: fileTools,
      mcpServers,
    });

    const codingTool = codingAgent.asTool({
      toolName: 'coding_assistant',
      toolDescription:
        'Delegate code generation, analysis, refactoring, and debugging tasks to a specialist coding agent.',
    });

    const tools: any[] = [...fileTools, codingTool];

    // Experimental Codex tool (workspace-aware operations)
    if (this.codexToolFn && this.config.enableCodexTool) {
      try {
        tools.push(
          this.codexToolFn({
            name: 'workspace_engineer',
            sandboxMode: 'workspace-write',
            workingDirectory: projectRoot,
            useRunContextThreadId: true,
            defaultThreadOptions: {
              model: this.config.codexModel,
              approvalPolicy: 'never',
            },
          }),
        );
        this.logger.log(
          `Codex tool added for project: ${projectDir} at ${projectRoot}`,
        );
      } catch (e: any) {
        this.logger.warn(`Failed to create codex tool: ${e.message}`);
      }
    }

    // Manager agent with project-specific instructions and MCP servers
    return new this.Agent({
      name: 'Manager',
      instructions,
      model,
      modelSettings,
      tools,
      mcpServers,
    });
  }

  /**
   * Stream a conversation using the OpenAI Agents SDK.
   * Yields both native RunStreamEvent objects and internal events
   * (session_init, run_completed, approval_required) for the orchestrator.
   *
   * @param approvalResolver Optional callback for HITL approval flow.
   *        When the stream pauses for approvals, this callback is invoked
   *        with the interruptions and must return a map of decisions.
   */
  async *streamConversation(
    projectDir: string,
    prompt: string,
    options: {
      sessionId?: string;
      processId?: string;
      instructions?: string;
      approvalResolver?: ApprovalResolver;
    } = {},
  ): AsyncGenerator<any> {
    const { sessionId, processId, instructions, approvalResolver } = options;

    await this.ensureSdkLoaded();

    // Load alternative AI model config
    const altModelConfig = await this.loadAlternativeModelConfig(projectDir);
    const apiKey =
      altModelConfig?.token || this.config.openAiApiKey;
    const model = altModelConfig?.model || this.config.defaultModel;

    // Ensure the API key is set
    process.env.OPENAI_API_KEY = apiKey;

    const abortController = new AbortController();
    if (processId) {
      this.abortControllers.set(processId, abortController);
    }

    // Resolve the process ID for MCP server lifecycle tracking
    const resolvedProcessId = processId || `agents_tmp_${Date.now()}`;

    try {
      // Build and connect MCP servers from project's .mcp.json
      const projectRoot = safeRoot(this.config.hostRoot, projectDir);
      const mcpServers = await this.buildMcpServers(projectRoot);
      if (mcpServers.length > 0) {
        this.activeMcpServers.set(resolvedProcessId, mcpServers);
        this.logger.log(
          `Connected ${mcpServers.length} MCP server(s) for project: ${projectDir}`,
        );
      }

      const agentInstructions =
        instructions || 'You are a helpful coding assistant.';
      const agent = await this.buildAgentGraph(
        projectDir,
        agentInstructions,
        model,
        mcpServers,
      );

      // Generate a session ID for tracking
      const resolvedSessionId =
        sessionId || `agents_session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Yield session initialization
      yield {
        type: 'session_init',
        sessionId: resolvedSessionId,
        model,
      } as SessionInitEvent;

      this.logger.log(
        `Starting OpenAI Agents stream: project=${projectDir}, session=${resolvedSessionId}, model=${model}`,
      );

      // Multi-turn continuity: use previousResponseId if available
      // This tells the OpenAI Responses API to chain off the prior response
      // so the model sees the full conversation without us replaying history.
      const previousResponseId = this.lastResponseIds.get(projectDir);

      // Also keep local history as fallback
      const history = this.getConversationHistory(projectDir);
      const input = (!previousResponseId && history.length > 0)
        ? [...history, { role: 'user', content: prompt }]
        : prompt;

      // Run with streaming
      const runOptions: any = {
        stream: true,
        signal: abortController.signal,
      };
      if (previousResponseId) {
        runOptions.previousResponseId = previousResponseId;
      }

      let stream = await this.run(agent, input, runOptions);

      // Process stream events, handling HITL approval loops
      let continueStreaming = true;
      while (continueStreaming) {
        for await (const event of stream) {
          yield event;
        }

        // Wait for stream completion
        await stream.completed;

        // Check for interruptions (HITL approval flow)
        if (stream.interruptions?.length && approvalResolver) {
          this.logger.log(
            `Stream paused with ${stream.interruptions.length} approval(s) required`,
          );

          // Ask the orchestrator/permission service to resolve approvals
          const decisions = await approvalResolver(stream.interruptions);
          const state = stream.state;

          for (const interruption of stream.interruptions) {
            const decision = decisions.get(interruption);
            if (decision?.approved) {
              state.approve(interruption);
            } else {
              state.reject(interruption);
            }
          }

          // Resume the stream with decisions applied
          stream = await this.run(agent, state, {
            stream: true,
            signal: abortController.signal,
          });
        } else {
          continueStreaming = false;
        }
      }

      // Yield run completion with final output and usage
      // Usage is not directly on StreamedRunResult; aggregate from rawResponses
      const aggregatedUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
      try {
        const responses = stream.rawResponses || [];
        for (const resp of responses) {
          if (resp.usage) {
            aggregatedUsage.inputTokens += resp.usage.inputTokens || 0;
            aggregatedUsage.outputTokens += resp.usage.outputTokens || 0;
            aggregatedUsage.totalTokens += resp.usage.totalTokens || 0;
            aggregatedUsage.requests++;
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to aggregate usage: ${e.message}`);
      }

      this.logger.log(
        `Stream finished: finalOutput length=${String(stream.finalOutput ?? '').length}, usage=${JSON.stringify(aggregatedUsage)}`,
      );
      const finalOutput =
        stream.finalOutput ?? '';
      const usage = aggregatedUsage.requests > 0 ? aggregatedUsage : null;

      // Store the last response ID for multi-turn chaining
      try {
        const respId = stream.lastResponseId;
        if (respId) {
          this.lastResponseIds.set(projectDir, respId);
          this.logger.log(
            `Stored lastResponseId for ${projectDir}: ${respId}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`Failed to get lastResponseId: ${e.message}`);
      }

      // Also persist history as fallback for multi-turn context
      try {
        const fullHistory = stream.history;
        if (fullHistory && fullHistory.length > 0) {
          this.replaceHistory(projectDir, fullHistory);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to persist conversation history: ${e.message}`);
      }

      yield {
        type: 'run_completed',
        finalOutput,
        usage,
      } as RunCompletedEvent;

      this.logger.log(
        `OpenAI Agents stream completed for project: ${projectDir}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Stream error: ${error.name}: ${error.message}`,
        error.stack,
      );
      if (
        error.name === 'AbortError' ||
        abortController.signal.aborted
      ) {
        this.logger.log(
          `Stream aborted for process: ${processId}`,
        );
        return;
      }
      throw error;
    } finally {
      if (processId) {
        this.abortControllers.delete(processId);
      }
      // Close MCP servers after stream completes
      await this.closeMcpServers(resolvedProcessId);
    }
  }

  /**
   * Abort a running stream.
   */
  async abortStream(processId: string): Promise<boolean> {
    const controller = this.abortControllers.get(processId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(processId);
      // Also close any MCP servers for this process
      await this.closeMcpServers(processId);
      this.logger.log(`Aborted stream for process: ${processId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear conversation history for a project.
   */
  clearSession(projectDir: string): void {
    this.conversationHistory.delete(projectDir);
    this.lastResponseIds.delete(projectDir);
    this.logger.log(
      `Cleared OpenAI Agents session for project: ${projectDir}`,
    );
  }

  /**
   * Load alternative AI model configuration from .etienne/ai-model.json
   */
  private async loadAlternativeModelConfig(
    projectDir: string,
  ): Promise<any | null> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const aiModelConfigPath = join(root, '.etienne', 'ai-model.json');

    try {
      const content = await fs.readFile(aiModelConfigPath, 'utf8');
      const config = JSON.parse(content);

      if (config.isActive && config.model && config.baseUrl && config.token) {
        this.logger.log(
          `Loaded alternative AI model config: ${config.model} @ ${config.baseUrl}`,
        );
        return config;
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(
          `Failed to load alternative model config: ${error.message}`,
        );
      }
    }

    return null;
  }

  /**
   * Gracefully clean up on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    // Abort all active streams
    for (const [processId, controller] of Array.from(this.abortControllers.entries())) {
      controller.abort();
      this.logger.log(`Aborted stream on shutdown: ${processId}`);
    }
    this.abortControllers.clear();
    this.conversationHistory.clear();
    this.lastResponseIds.clear();

    // Close all active MCP server connections
    for (const processId of Array.from(this.activeMcpServers.keys())) {
      await this.closeMcpServers(processId);
    }
  }
}
