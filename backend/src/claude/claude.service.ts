import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import chokidar from 'chokidar';
import { join } from 'path';
import { Observable } from 'rxjs';
import axios from 'axios';
import { posixProjectPath } from '../common/path.util';
import { Usage, MessageEvent, ClaudeEvent } from './types';
import { norm, safeRoot } from './utils/path.utils';
import { extractText, parseSession, parseUsage, createJsonLineParser, ClaudeCodeStructuredParser } from './parsers/stream-parser';
import { buildClaudeScript } from './builders/script-builder';
import { ClaudeConfig } from './config/claude.config';
import { SessionsService } from '../sessions/sessions.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { GuardrailsService } from '../input-guardrails/guardrails.service';
import { sanitize_user_message } from '../input-guardrails/index';
import { OutputGuardrailsService } from '../output-guardrails/output-guardrails.service';

@Injectable()
export class ClaudeService {
  private readonly config = new ClaudeConfig();
  private queues = new Map<string, Promise<unknown>>();
  private processes = new Map<string, any>(); // Store process references by processId

  constructor(
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly guardrailsService: GuardrailsService,
    private readonly outputGuardrailsService: OutputGuardrailsService,
    private readonly sessionsService: SessionsService
  ) {}

  private async ensureProject(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    await fs.mkdir(join(root, 'data'), { recursive: true });
    await fs.mkdir(join(root, 'out'), { recursive: true });
    await fs.mkdir(join(root, '.claude'), { recursive: true });

    const cm = join(root, '.claude', 'CLAUDE.md');
    try { await fs.access(cm); } catch { await fs.writeFile(cm, `# ${projectDir}\n`); }

    // Create .claude/settings.json with interceptor hooks
    const settingsPath = join(root, '.claude', 'settings.json');
    try {
      await fs.access(settingsPath);
    } catch {
      const hooksConfig = this.config.getActiveEventsHooks(projectDir);
      await fs.writeFile(settingsPath, JSON.stringify(hooksConfig, null, 2), 'utf8');
    }

    // Create data/assistant.json with initial greeting
    const assistantPath = join(root, 'data', 'assistant.json');
    try {
      await fs.access(assistantPath);
    } catch {
      const assistantConfig = {
        assistant: {
          greeting: `Welcome to another session with your friendly general agent Etienne.
Remember to adjust the role prompt if required and then start to describe your
project using the [Scrapbook](#scrapbook)
`
        }
      };
      await fs.writeFile(assistantPath, JSON.stringify(assistantConfig, null, 2), 'utf8');
    }

    return root;
  }

  public async addFile(projectDir: string, fileName: string, content: string) {
    const root = await this.ensureProject(projectDir);

    // Don't overwrite CLAUDE.md if it already exists (check .claude/CLAUDE.md location)
    if (fileName === 'CLAUDE.md') {
      const claudeMdPath = join(root, '.claude', 'CLAUDE.md');
      try {
        await fs.access(claudeMdPath);
        return { ok: true, path: claudeMdPath, skipped: true };
      } catch {
        // File doesn't exist, ensureProject() already created it
        return { ok: true, path: claudeMdPath, skipped: false };
      }
    }

    // For all other files, create at specified location
    const filePath = join(root, fileName);
    await fs.mkdir(norm(join(filePath, '..')), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return { ok: true, path: filePath };
  }

  public async getFile(projectDir: string, fileName: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const filePath = join(root, fileName);
    const data = await fs.readFile(filePath, 'utf8');
    return { path: filePath, content: data };
  }

  public async listFiles(projectDir: string, subDir = '.') {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const dir = join(root, subDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
  }

  public async listProjects() {
    try {
      const entries = await fs.readdir(this.config.hostRoot, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
      return { projects };
    } catch {
      return { projects: [] };
    }
  }

  public async getStrategy(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const claudeMdPath = join(root, '.claude', 'CLAUDE.md');
    try {
      const content = await fs.readFile(claudeMdPath, 'utf8');
      return { content };
    } catch {
      return { content: `# ${projectDir}\n` };
    }
  }

  public async saveStrategy(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const claudeMdPath = join(root, '.claude', 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content, 'utf8');
    return { success: true };
  }

  public async getMission(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const missionPath = join(root, 'CLAUDE.md');
    try {
      const content = await fs.readFile(missionPath, 'utf8');
      return { content };
    } catch {
      return { content: '' };
    }
  }

  public async saveMission(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const missionPath = join(root, 'CLAUDE.md');
    await fs.writeFile(missionPath, content, 'utf8');
    return { success: true };
  }

  public async getPermissions(projectDir: string) {
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
      return { allowedTools: [...basePermissions, ...mcpPermissions] };
    } catch {
      // If settings.json doesn't exist or has no MCP permissions, just return base
      return { allowedTools: basePermissions };
    }
  }

  public async savePermissions(projectDir: string, allowedTools: string[]) {
    const root = await this.ensureProject(projectDir);
    const dataDir = join(root, 'data');
    const permissionsPath = join(dataDir, 'permissions.json');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(permissionsPath, JSON.stringify({ allowedTools }, null, 2), 'utf8');

    // Force new session so permissions are reloaded
    // This ensures the agent picks up the new permissions on the next request
    const sessionPath = join(root, 'data', 'session.id');
    try {
      await fs.unlink(sessionPath);
    } catch {
      // Session file might not exist yet - that's OK
    }

    return { success: true };
  }

  public async getAssistant(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const assistantPath = join(root, 'data', 'assistant.json');

    try {
      const content = await fs.readFile(assistantPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return { assistant: { greeting: '' } };
    }
  }

  public async getChatHistory(projectDir: string, sessionId?: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    console.log(`[getChatHistory] projectDir: ${projectDir}, root: ${root}, sessionId: ${sessionId || 'current'}`);
    const history = await this.sessionsService.loadHistory(root, sessionId);
    console.log(`[getChatHistory] Loaded ${history.messages.length} messages`);
    return history;
  }

  public async getMcpConfig(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const mcpConfigPath = join(root, '.mcp.json');

    try {
      const content = await fs.readFile(mcpConfigPath, 'utf8');
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      return { mcpServers: {} };
    }
  }

  public async saveMcpConfig(projectDir: string, mcpServers: Record<string, any>) {
    const root = await this.ensureProject(projectDir);
    const mcpConfigPath = join(root, '.mcp.json');

    // Inject project name into HTTP/SSE MCP server URLs for A2A tool support
    const processedServers = this.injectProjectIntoMcpUrls(projectDir, mcpServers);

    await fs.writeFile(mcpConfigPath, JSON.stringify({ mcpServers: processedServers }, null, 2), 'utf8');

    // Update .claude/.claude.json with enabled MCP servers
    await this.updateClaudeJsonServers(projectDir, mcpServers);

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
   * Inject project name into HTTP/SSE MCP server URLs
   * This ensures A2A dynamic tools work correctly by providing project context
   */
  private injectProjectIntoMcpUrls(projectDir: string, mcpServers: Record<string, any>): Record<string, any> {
    const processed: Record<string, any> = {};

    for (const [name, config] of Object.entries(mcpServers)) {
      const serverConfig = { ...config };

      // Only process HTTP/SSE servers with URLs
      if (serverConfig.url && (serverConfig.type === 'http' || serverConfig.type === 'sse')) {
        try {
          const url = new URL(serverConfig.url);
          // Add or update the project query parameter
          url.searchParams.set('project', projectDir);
          serverConfig.url = url.toString();
        } catch {
          // Invalid URL - leave it as-is
        }
      }

      processed[name] = serverConfig;
    }

    return processed;
  }

  /**
   * Update enabledMcpjsonServers and allowedTools in .claude/settings.json
   */
  private async updateClaudeJsonServers(projectDir: string, mcpServers: Record<string, any>): Promise<void> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const settingsJsonPath = join(root, '.claude', 'settings.json');

    // Extract server names from mcpServers
    const serverNames = Object.keys(mcpServers || {});

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

  public async getFilesystem(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);

    const buildTree = async (dirPath: string, basePath: string): Promise<any[]> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));

      const items = await Promise.all(
        sorted.map(async (entry) => {
          const fullPath = join(dirPath, entry.name);
          const relativePath = fullPath.slice(basePath.length + 1).replace(/\\/g, '/');
          const stats = await fs.stat(fullPath);

          if (entry.isDirectory()) {
            const children = await buildTree(fullPath, basePath);
            return {
              id: relativePath,
              label: entry.name,
              type: 'folder',
              mtime: stats.mtime.toISOString(),
              children
            };
          } else {
            return {
              id: relativePath,
              label: entry.name,
              type: 'file',
              mtime: stats.mtime.toISOString()
            };
          }
        })
      );

      return items;
    };

    const tree = await buildTree(root, root);
    return { tree };
  }

  public async checkHealth() {
    // Basic health check - backend is responding
    return { healthy: true };
  }

  public async checkModelHealth() {
    // Check if ANTHROPIC_API_KEY is set
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        healthy: false,
        reason: 'ANTHROPIC_API_KEY not set in environment'
      };
    }

    // Try a simple API request to Anthropic
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 50,
          messages: [{ role: 'user', content: 'What is your model id? Reply with just the model id.' }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        }
      );

      const modelResponse = response.data?.content?.[0]?.text || 'Unknown';
      return {
        healthy: true,
        model: response.data?.model,
        response: modelResponse
      };
    } catch (error: any) {
      const reason = error.response?.data?.error?.message
        || error.message
        || 'Unknown error connecting to Anthropic API';
      return {
        healthy: false,
        reason
      };
    }
  }

  // SSE: emits events: session, stdout, usage, file_added, file_changed, completed, error
  streamPrompt(projectDir: string, prompt: string, agentMode?: string, aiModel?: string, memoryEnabled?: boolean, skipChatPersistence?: boolean, maxTurns?: number): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const run = async () => {
        const projectRoot = await this.ensureProject(projectDir);
        const containerCwd = posixProjectPath(this.config.containerRoot, projectDir);
        const envHome = posixProjectPath(this.config.containerRoot, projectDir, '.claude');

        if (!containerCwd.startsWith('/') || !envHome.startsWith('/')) {
          throw new Error(`invalid container paths: cwd=${containerCwd} home=${envHome}`);
        }

        // Check if this is a new session (first request)
        const sessionPath = join(projectRoot, 'data', 'session.id');
        let sessionId = '';
        try { sessionId = (await fs.readFile(sessionPath, 'utf8')).trim(); } catch { /* first run */ }
        const isFirstRequest = !sessionId;

        // Apply input guardrails
        let sanitizedPrompt = prompt;
        let guardrailsTriggered = false;
        let triggeredPlugins: string[] = [];
        let detections: Record<string, string[]> = {};

        try {
          const guardrailsConfig = await this.guardrailsService.getConfig(projectDir);
          if (guardrailsConfig.enabled.length > 0) {
            const sanitizationResult = sanitize_user_message(prompt, guardrailsConfig.enabled);
            sanitizedPrompt = sanitizationResult.sanitizedText;

            // Log if any sensitive data was detected
            if (sanitizationResult.triggeredPlugins.length > 0) {
              guardrailsTriggered = true;
              triggeredPlugins = sanitizationResult.triggeredPlugins;
              detections = sanitizationResult.detections;
              console.log(`🛡️ Guardrails triggered for ${projectDir}:`, sanitizationResult.triggeredPlugins);
            }
          }
        } catch (error: any) {
          console.error('Failed to apply guardrails:', error.message);
          // Continue with original prompt on error
        }

        // Memory integration - only append memories on first request
        let enhancedPrompt = sanitizedPrompt;
        const userId = 'user'; // Default user ID for single-user system

        if (memoryEnabled && isFirstRequest) {
          try {
            const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

            // Search for relevant memories
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              {
                query: sanitizedPrompt,
                user_id: userId,
                limit: 5
              }
            );

            const memories = searchResponse.data.results || [];

            if (memories.length > 0) {
              const memoryContext = memories.map((m: any) => m.memory).join('\n- ');
              enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${sanitizedPrompt}`;
            }
          } catch (error: any) {
            console.error('Failed to fetch memories:', error.message);
            // Continue without memories on error
          }
        }
        // Only use --resume if we have a sessionId. For new sessions, don't pass any resume flag.
        const resumeArg = sessionId ? `--resume "$SESSION_ID"` : '';

        // Setup file watcher
        const watcher = chokidar.watch(join(projectRoot, 'out'), {
          ignoreInitial: true,
          depth: 8,
          awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
        });
        const rel = (abs: string) => abs.slice(projectRoot.length + 1).replace(/\\/g, '/');
        watcher.on('add', (abs) => observer.next({ type: 'file_added', data: { path: rel(abs) } }));
        watcher.on('change', (abs) => observer.next({ type: 'file_changed', data: { path: rel(abs) } }));

        // Emit guardrails event if triggered
        if (guardrailsTriggered) {
          observer.next({
            type: 'guardrails_triggered',
            data: {
              plugins: triggeredPlugins,
              detections,
              count: Object.values(detections).reduce((sum, arr) => sum + arr.length, 0)
            }
          });
        }

        // Load permissions
        const { allowedTools } = await this.getPermissions(projectDir);

        // Determine planning mode
        const planningMode = agentMode === 'plan';

        // Build script and docker args
        const script = buildClaudeScript({ containerCwd, envHome, resumeArg, allowedTools, planningMode, maxTurns });
        const args = [
          'exec',
          '-w', containerCwd,
          '-e', `ANTHROPIC_API_KEY=${this.config.anthropicKey}`,
          '-e', `CLAUDE_PROMPT=${enhancedPrompt}`,
          ...(sessionId ? ['-e', `SESSION_ID=${sessionId}`] : []),
        ];

        // Route OpenAI models through LiteLLM proxy
        // LiteLLM translates Anthropic API format to OpenAI backends (gpt-5-codex, gpt-5-mini)
        if (aiModel === 'openai') {
          // Determine which Claude model name to use based on aiModel variant
          // claude-sonnet-4-5 routes to gpt-5-codex in litellm
          // claude-haiku-4-5 routes to gpt-5-mini in litellm
          const claudeModel = 'claude-sonnet-4-5'; // Default to sonnet (you can make this configurable)

          console.log(`🔄 Using LiteLLM proxy: Claude Code → http://host.docker.internal:4000 → OpenAI (${claudeModel})`);
          args.push('-e', `ANTHROPIC_BASE_URL=http://host.docker.internal:4000`);
          args.push('-e', `ANTHROPIC_API_KEY=sk-1234`); // LiteLLM master key (Claude Code uses ANTHROPIC_API_KEY)
          args.push('-e', `ANTHROPIC_MODEL=${claudeModel}`);
        }

        args.push(this.config.container, 'bash', '-lc', script);

        // Spawn docker process
        const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const processId = `${projectDir}_${Date.now()}`;
        this.processes.set(processId, child);
        const killTimer = setTimeout(() => child.kill('SIGKILL'), this.config.timeoutMs);

        let usage: Usage = {};
        let announcedSession = false;
        let assistantText = '';

        // Check if output guardrails are enabled
        const outputGuardrailsConfig = await this.outputGuardrailsService.getConfig(projectDir);
        const shouldBufferOutput = outputGuardrailsConfig.enabled;
        let bufferedChunks: string[] = [];

        // Initialize structured parser
        const structuredParser = new ClaudeCodeStructuredParser();

        // Announce existing session immediately if resuming
        if (sessionId) {
          observer.next({ type: 'session', data: { session_id: sessionId, process_id: processId, model: undefined } });
          announcedSession = true;
        }

        const emitText = (s: string) => {
          if (s) {
            assistantText += s;

            // If output guardrails enabled, buffer instead of streaming
            if (shouldBufferOutput) {
              bufferedChunks.push(s);
            } else {
              observer.next({ type: 'stdout', data: { chunk: s } });

              // Parse for structured events
              const structuredEvents = structuredParser.parseChunk(s);
              for (const evt of structuredEvents) {
                observer.next({ type: evt.type as any, data: evt });
              }
            }
          }
        };

        const onJsonLine = (evt: ClaudeEvent) => {
          if (evt.type === 'system') {
            const model = evt.model ?? evt.meta?.model;
            if (model) usage.model = model;

            if (!announcedSession) {
              const { sessionId: sid, model: sModel } = parseSession(evt);
              if (sid) {
                announcedSession = true;
                sessionId = sid;
                observer.next({ type: 'session', data: { session_id: sessionId, process_id: processId, model: sModel } });
                fs.mkdir(join(projectRoot, 'data'), { recursive: true })
                  .then(() => fs.writeFile(sessionPath, sessionId, 'utf8'))
                  .catch(() => void 0);
              }
            }
            return;
          }

          const parsedUsage = parseUsage(evt, usage);
          if (parsedUsage) {
            usage = parsedUsage;
            observer.next({ type: 'usage', data: usage });
          }

          const text = extractText(evt);
          if (text) emitText(text);
        };

        const { flushLines, flush } = createJsonLineParser(emitText, onJsonLine);

        child.stdout.on('data', (b) => {
          const chunk = b.toString('utf8');
          flushLines(chunk);
        });
        child.stderr.on('data', (b) => {
          const text = b.toString('utf8');
          emitText(text);

          // Check for common Claude Code error patterns
          if (text.includes('ECONNREFUSED') || text.includes('ETIMEDOUT') ||
              text.includes('MaxTokensExceeded') || text.includes('rate_limit') ||
              text.includes('ENOTFOUND') || text.includes('EHOSTUNREACH') ||
              text.includes('invalid_api_key') || text.includes('permission_denied') ||
              text.includes('overloaded_error') || text.includes('Error:')) {
            console.error(`[Claude Code Error - ${projectDir}]:`, text.trim());
          }
        });

        child.on('close', async (code) => {
          // Flush any remaining buffered content before closing
          flush();

          clearTimeout(killTimer);
          this.processes.delete(processId);
          await watcher.close().catch(() => void 0);

          // Apply output guardrails if enabled
          if (shouldBufferOutput && assistantText) {
            try {
              console.log('🛡️ Applying output guardrails...');
              const guardrailResult = await this.outputGuardrailsService.checkGuardrail(assistantText, projectDir);

              // Emit guardrails event if triggered
              if (guardrailResult.guardrailTriggered) {
                observer.next({
                  type: 'output_guardrails_triggered',
                  data: {
                    violations: guardrailResult.violations,
                    count: guardrailResult.violations.length,
                    runtimeMilliseconds: guardrailResult.runtimeMilliseconds
                  }
                });
                console.log(`🛡️ Output guardrails triggered: ${guardrailResult.violations.join(', ')}`);
              }

              // Use modified content if guardrails were triggered
              const finalText = guardrailResult.modifiedContent;
              assistantText = finalText;

              // Now emit the final (possibly modified) text
              observer.next({ type: 'stdout', data: { chunk: finalText } });

              // Parse for structured events
              const structuredEvents = structuredParser.parseChunk(finalText);
              for (const evt of structuredEvents) {
                observer.next({ type: evt.type as any, data: evt });
              }
            } catch (error: any) {
              console.error('Failed to apply output guardrails:', error.message);
              // Continue with original text on error
              observer.next({ type: 'stdout', data: { chunk: assistantText } });
            }
          }

          // Persist chat messages (unless skipChatPersistence is true, e.g., for scheduled tasks)
          if (!skipChatPersistence && sessionId) {
            try {
              const timestamp = new Date().toISOString();

              await this.sessionsService.appendMessages(projectRoot, sessionId, [
                {
                  timestamp,
                  isAgent: false,
                  message: sanitizedPrompt,
                  costs: undefined
                },
                {
                  timestamp,
                  isAgent: true,
                  message: assistantText,
                  costs: usage
                }
              ]);
            } catch (err) {
              // Don't fail the request if persistence fails
              console.error('Failed to persist chat history:', err);
            }
          }

          // Track budget costs if we have token usage (unless skipChatPersistence, which means scheduler handles it)
          if (!skipChatPersistence && usage.input_tokens && usage.output_tokens) {
            try {
              console.log(`Tracking costs for project ${projectDir}: ${usage.input_tokens} input, ${usage.output_tokens} output tokens`);
              await this.budgetMonitoringService.trackCosts(
                projectDir,
                usage.input_tokens,
                usage.output_tokens
              );
              console.log('Budget costs tracked successfully');
            } catch (err) {
              console.error('Failed to track budget costs:', err);
              // Don't fail the request if budget tracking fails
            }
          } else {
            console.log('No token usage data available for budget tracking:', usage);
          }

          // Extract and store memories if enabled (fire-and-forget)
          if (memoryEnabled && assistantText) {
            const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

            // Fire-and-forget: don't await, let it run in background
            axios.post(
              `${memoryBaseUrl}?project=${encodeURIComponent(projectDir)}`,
              {
                messages: [
                  { role: 'user', content: sanitizedPrompt },
                  { role: 'assistant', content: assistantText }
                ],
                user_id: userId,
                metadata: {
                  session_id: sessionId,
                  source: 'chat',
                  timestamp: new Date().toISOString()
                }
              }
            ).catch((error: any) => {
              console.error('Failed to store memories:', error.message);
              // Don't fail the request if memory storage fails
            });
          }

          observer.next({ type: 'completed', data: { exitCode: code ?? 0, usage } });
          observer.complete();
        });

        child.on('error', async (err) => {
          clearTimeout(killTimer);
          this.processes.delete(processId);
          await watcher.close().catch(() => void 0);
          observer.next({ type: 'error', data: { message: String(err) } });
          observer.complete();
        });
      };

      const prev = this.queues.get(projectDir) ?? Promise.resolve();
      const cur = prev.then(run).finally(() => {
        if (this.queues.get(projectDir) === cur) this.queues.delete(projectDir);
      });
      this.queues.set(projectDir, cur);

      return () => void 0;
    });
  }

  public async clearSession(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const sessionPath = join(root, 'data', 'session.id');

    try {
      await fs.unlink(sessionPath);
      return { success: true, message: 'Session cleared' };
    } catch (error: any) {
      // If file doesn't exist, that's fine
      if (error.code === 'ENOENT') {
        return { success: true, message: 'No session to clear' };
      }
      return { success: false, message: error.message };
    }
  }

  public async abortProcess(processId: string) {
    const child = this.processes.get(processId);
    if (child) {
      try {
        child.kill('SIGTERM');
        this.processes.delete(processId);
        return { success: true, message: 'Process terminated' };
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    }
    return { success: false, message: 'Process not found' };
  }
}
