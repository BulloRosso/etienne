import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { norm, safeRoot } from './utils/path.utils';
import { ClaudeConfig } from './config/claude.config';
import { SessionsService } from '../sessions/sessions.service';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';
import { McpServerConfigService } from './mcpserverconfig/mcp.server.config';
import { LlmService } from '../llm/llm.service';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly config: ClaudeConfig;

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
    private readonly mcpServerConfigService: McpServerConfigService,
    private readonly llmService: LlmService,
    private readonly secretsManager: SecretsManagerService,
  ) {
    this.config = new ClaudeConfig(secretsManager);
  }

  async onModuleInit() {
    await this.config.initSecrets();
  }

  private async ensureProject(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    await fs.mkdir(join(root, 'data'), { recursive: true });
    await fs.mkdir(join(root, 'out'), { recursive: true });
    await fs.mkdir(join(root, '.claude'), { recursive: true });

    const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    if (agentConfigDir !== '.claude') {
      await fs.mkdir(join(root, agentConfigDir), { recursive: true });
    }

    const cm = join(root, agentConfigDir, missionFileName);
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

    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();

    // Don't overwrite mission file if it already exists
    if (fileName === 'CLAUDE.md' || fileName === 'AGENTS.md') {
      const missionPath = join(root, agentConfigDir, missionFileName);
      try {
        await fs.access(missionPath);
        return { ok: true, path: missionPath, skipped: true };
      } catch {
        // File doesn't exist, ensureProject() already created it
        return { ok: true, path: missionPath, skipped: false };
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
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return { path: filePath, content: data };
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        this.logger.warn(`getFile: file not found: ${filePath}`);
        throw new NotFoundException(`File not found: ${fileName}`);
      }
      throw err;
    }
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
    const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const rolePath = join(root, agentConfigDir, missionFileName);
    try {
      const content = await fs.readFile(rolePath, 'utf8');
      return { content };
    } catch {
      return { content: `# ${projectDir}\n` };
    }
  }

  public async saveStrategy(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const rolePath = join(root, agentConfigDir, missionFileName);
    await fs.writeFile(rolePath, content, 'utf8');
    return { success: true };
  }

  public async getMission(projectDir: string) {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const missionPath = join(root, missionFileName);
    try {
      const content = await fs.readFile(missionPath, 'utf8');
      return { content };
    } catch {
      return { content: '' };
    }
  }

  public async saveMission(projectDir: string, content: string) {
    const root = await this.ensureProject(projectDir);
    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const missionPath = join(root, missionFileName);
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
      return { allowedTools: [...basePermissions, ...mcpPermissions], deniedTools: this.config.defaultDeniedTools };
    } catch {
      // If settings.json doesn't exist or has no MCP permissions, just return base
      return { allowedTools: basePermissions, deniedTools: this.config.defaultDeniedTools };
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
    return this.mcpServerConfigService.getMcpConfig(projectDir);
  }

  public async saveMcpConfig(projectDir: string, mcpServers: Record<string, any>) {
    await this.ensureProject(projectDir);

    // Inject project name into HTTP/SSE MCP server URLs for A2A tool support
    const processedServers = this.injectProjectIntoMcpUrls(projectDir, mcpServers);

    // Delegate persistence to McpServerConfigService (handles both Claude and Codex formats)
    return this.mcpServerConfigService.saveMcpConfig(projectDir, { mcpServers: processedServers });
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
    if (!(await this.llmService.hasApiKey())) {
      return {
        healthy: false,
        reason: `${this.llmService.getKeyEnvName()} not set in environment`
      };
    }

    try {
      const text = await this.llmService.generateText({
        tier: 'small',
        prompt: 'What is your model id? Reply with just the model id.',
        maxOutputTokens: 50,
      });

      return {
        healthy: true,
        model: this.llmService.getModelId('small'),
        provider: this.llmService.getProvider(),
        response: text.trim(),
      };
    } catch (error: any) {
      return {
        healthy: false,
        reason: error.message || 'Unknown error connecting to LLM API',
      };
    }
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
}
