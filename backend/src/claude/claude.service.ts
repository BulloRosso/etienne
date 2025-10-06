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
import { ChatPersistence } from './chat.persistence';

@Injectable()
export class ClaudeService {
  private readonly config = new ClaudeConfig();
  private queues = new Map<string, Promise<unknown>>();

  private async ensureProject(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    await fs.mkdir(join(root, 'data'), { recursive: true });
    await fs.mkdir(join(root, 'out'), { recursive: true });
    await fs.mkdir(join(root, '.claude'), { recursive: true });

    const cm = join(root, 'CLAUDE.md');
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
          greeting: 'Welcome to your new Etienne project. Please **change the system prompt** before we begin - for example give this agent the role web designer or spreadsheet expert.'
        }
      };
      await fs.writeFile(assistantPath, JSON.stringify(assistantConfig, null, 2), 'utf8');
    }

    return root;
  }

  public async addFile(projectDir: string, fileName: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const filePath = join(root, fileName);

    // Don't overwrite CLAUDE.md if it already exists
    if (fileName === 'CLAUDE.md') {
      try {
        await fs.access(filePath);
        return { ok: true, path: filePath, skipped: true };
      } catch {
        // File doesn't exist, create it
      }
    }

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
    const claudeMdPath = join(root, 'CLAUDE.md');
    try {
      const content = await fs.readFile(claudeMdPath, 'utf8');
      return { content };
    } catch {
      return { content: `# ${projectDir}\n` };
    }
  }

  public async saveStrategy(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const claudeMdPath = join(root, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content, 'utf8');
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

  public async getChatHistory(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const historyPath = join(root, 'data', 'chat.history.json');

    try {
      const content = await fs.readFile(historyPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return { messages: [] };
    }
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

    await fs.writeFile(mcpConfigPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

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

          if (entry.isDirectory()) {
            const children = await buildTree(fullPath, basePath);
            return {
              id: relativePath,
              label: entry.name,
              type: 'folder',
              children
            };
          } else {
            return {
              id: relativePath,
              label: entry.name,
              type: 'file'
            };
          }
        })
      );

      return items;
    };

    const tree = await buildTree(root, root);
    return { tree };
  }

  // SSE: emits events: session, stdout, usage, file_added, file_changed, completed, error
  streamPrompt(projectDir: string, prompt: string, agentMode?: string, aiModel?: string, memoryEnabled?: boolean): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const run = async () => {
        const projectRoot = await this.ensureProject(projectDir);
        const containerCwd = posixProjectPath(this.config.containerRoot, projectDir);
        const envHome = posixProjectPath(this.config.containerRoot, projectDir, '.claude');

        if (!containerCwd.startsWith('/') || !envHome.startsWith('/')) {
          throw new Error(`invalid container paths: cwd=${containerCwd} home=${envHome}`);
        }

        // Memory integration
        let enhancedPrompt = prompt;
        const userId = 'user'; // Default user ID for single-user system

        if (memoryEnabled) {
          try {
            const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

            // Search for relevant memories
            const searchResponse = await axios.post(
              `${memoryBaseUrl}/search?project=${encodeURIComponent(projectDir)}`,
              {
                query: prompt,
                user_id: userId,
                limit: 5
              }
            );

            const memories = searchResponse.data.results || [];

            if (memories.length > 0) {
              const memoryContext = memories.map((m: any) => m.memory).join('\n- ');
              enhancedPrompt = `[Context from previous conversations:\n- ${memoryContext}]\n\n${prompt}`;
            }
          } catch (error: any) {
            console.error('Failed to fetch memories:', error.message);
            // Continue without memories on error
          }
        }

        const sessionPath = join(projectRoot, 'data', 'session.id');
        let sessionId = '';
        try { sessionId = (await fs.readFile(sessionPath, 'utf8')).trim(); } catch { /* first run */ }
        const resumeArg = sessionId ? `--resume "$SESSION_ID"` : '--continue';

        // Setup file watcher
        const watcher = chokidar.watch(join(projectRoot, 'out'), {
          ignoreInitial: true,
          depth: 8,
          awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
        });
        const rel = (abs: string) => abs.slice(projectRoot.length + 1).replace(/\\/g, '/');
        watcher.on('add', (abs) => observer.next({ type: 'file_added', data: { path: rel(abs) } }));
        watcher.on('change', (abs) => observer.next({ type: 'file_changed', data: { path: rel(abs) } }));

        // Load permissions
        const { allowedTools } = await this.getPermissions(projectDir);

        // Determine planning mode
        const planningMode = agentMode === 'plan';

        // Build script and docker args
        const script = buildClaudeScript({ containerCwd, envHome, resumeArg, allowedTools, planningMode });
        const args = [
          'exec',
          '-w', containerCwd,
          '-e', `ANTHROPIC_API_KEY=${this.config.anthropicKey}`,
          '-e', `CLAUDE_PROMPT=${enhancedPrompt}`,
          ...(sessionId ? ['-e', `SESSION_ID=${sessionId}`] : []),
        ];

        // Add OpenAI environment variables if using OpenAI model
        if (aiModel === 'openai') {
          console.log(`🔄 Using OpenAI proxy: ${process.env.ANTHROPIC_BASE_URL} → ${process.env.ANTHROPIC_MODEL}`);
          args.push('-e', `ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL || 'https://api.openai.com/v1'}`);
          args.push('-e', `ANTHROPIC_AUTH_TOKEN=${process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENAI_API_KEY || ''}`);
          args.push('-e', `ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || 'gpt-4o-mini'}`);
        }

        args.push(this.config.container, 'bash', '-lc', script);

        // Spawn docker process
        const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const killTimer = setTimeout(() => child.kill('SIGKILL'), this.config.timeoutMs);

        let usage: Usage = {};
        let announcedSession = false;
        let assistantText = '';

        // Initialize structured parser
        const structuredParser = new ClaudeCodeStructuredParser();

        // Announce existing session immediately if resuming
        if (sessionId) {
          observer.next({ type: 'session', data: { session_id: sessionId, model: undefined } });
          announcedSession = true;
        }

        const emitText = (s: string) => {
          if (s) {
            assistantText += s;
            observer.next({ type: 'stdout', data: { chunk: s } });

            // Parse for structured events
            const structuredEvents = structuredParser.parseChunk(s);
            for (const evt of structuredEvents) {
              observer.next({ type: evt.type as any, data: evt });
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
                observer.next({ type: 'session', data: { session_id: sessionId, model: sModel } });
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

        const flushLines = createJsonLineParser(emitText, onJsonLine);

        child.stdout.on('data', (b) => {
          const chunk = b.toString('utf8');
          flushLines(chunk);
        });
        child.stderr.on('data', (b) => emitText(b.toString('utf8')));

        child.on('close', async (code) => {
          clearTimeout(killTimer);
          await watcher.close().catch(() => void 0);

          // Persist chat messages
          try {
            const chatPersistence = new ChatPersistence(projectRoot);
            const timestamp = new Date().toISOString();

            await chatPersistence.appendMessages([
              {
                timestamp,
                isAgent: false,
                message: prompt,
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

          // Extract and store memories if enabled
          if (memoryEnabled && assistantText) {
            try {
              const memoryBaseUrl = process.env.MEMORY_MANAGEMENT_URL || 'http://localhost:6060/api/memories';

              await axios.post(
                `${memoryBaseUrl}?project=${encodeURIComponent(projectDir)}`,
                {
                  messages: [
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: assistantText }
                  ],
                  user_id: userId,
                  metadata: {
                    session_id: sessionId,
                    source: 'chat',
                    timestamp: new Date().toISOString()
                  }
                }
              );
            } catch (error: any) {
              console.error('Failed to store memories:', error.message);
              // Don't fail the request if memory storage fails
            }
          }

          observer.next({ type: 'completed', data: { exitCode: code ?? 0, usage } });
          observer.complete();
        });

        child.on('error', async (err) => {
          clearTimeout(killTimer);
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
}
