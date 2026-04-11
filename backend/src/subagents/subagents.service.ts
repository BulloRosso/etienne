import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { parse, stringify } from 'smol-toml';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';

export interface SubagentConfig {
  name: string;
  description: string;
  tools?: string;
  model?: string;
  systemPrompt: string;
}

export interface RepositorySubagent {
  name: string;
  source: 'standard' | 'optional';
  description?: string;
  hasThumbnail?: boolean;
}

export interface ProvisionSubagentResult {
  subagentName: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class SubagentsService {
  private readonly logger = new Logger(SubagentsService.name);
  private readonly workspacePath = path.resolve(process.cwd(), '../workspace');

  constructor(
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
  ) {}

  private isCodex(): boolean {
    return this.codingAgentConfigService.getActiveAgentType() === 'openai';
  }

  // ── Public API (dispatches to Claude or Codex) ───────────────────────

  async ensureAgentsDirectory(project: string): Promise<void> {
    const agentsPath = this.isCodex()
      ? this.getCodexAgentsDir(project)
      : this.getClaudeAgentsPath(project);
    await fs.mkdir(agentsPath, { recursive: true });
  }

  async listSubagents(project: string): Promise<SubagentConfig[]> {
    if (this.isCodex()) {
      return this.listSubagentsCodex(project);
    }
    return this.listSubagentsClaude(project);
  }

  async getSubagent(project: string, name: string): Promise<SubagentConfig | null> {
    if (this.isCodex()) {
      return this.getSubagentCodex(project, name);
    }
    return this.getSubagentClaude(project, name);
  }

  async createSubagent(project: string, config: SubagentConfig): Promise<void> {
    if (this.isCodex()) {
      return this.createSubagentCodex(project, config);
    }
    return this.createSubagentClaude(project, config);
  }

  async updateSubagent(project: string, originalName: string, config: SubagentConfig): Promise<void> {
    if (this.isCodex()) {
      return this.updateSubagentCodex(project, originalName, config);
    }
    return this.updateSubagentClaude(project, originalName, config);
  }

  async deleteSubagent(project: string, name: string): Promise<void> {
    if (this.isCodex()) {
      return this.deleteSubagentCodex(project, name);
    }
    return this.deleteSubagentClaude(project, name);
  }

  // ── Claude (anthropic) path ──────────────────────────────────────────

  private getClaudeAgentsPath(project: string): string {
    return path.join(this.workspacePath, project, '.claude', 'agents');
  }

  private async listSubagentsClaude(project: string): Promise<SubagentConfig[]> {
    try {
      const agentsPath = this.getClaudeAgentsPath(project);
      await fs.mkdir(agentsPath, { recursive: true });

      const files = await fs.readdir(agentsPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      const subagents: SubagentConfig[] = [];

      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(agentsPath, file), 'utf-8');
        const subagent = this.parseClaudeSubagentFile(content);
        if (subagent) {
          subagents.push(subagent);
        }
      }

      return subagents;
    } catch (error) {
      this.logger.error('Error listing Claude subagents:', error);
      return [];
    }
  }

  private async getSubagentClaude(project: string, name: string): Promise<SubagentConfig | null> {
    try {
      const agentsPath = this.getClaudeAgentsPath(project);
      const filePath = path.join(agentsPath, `${name}.md`);

      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseClaudeSubagentFile(content);
    } catch (error) {
      this.logger.error('Error getting Claude subagent:', error);
      return null;
    }
  }

  private async createSubagentClaude(project: string, config: SubagentConfig): Promise<void> {
    const agentsPath = this.getClaudeAgentsPath(project);
    await fs.mkdir(agentsPath, { recursive: true });

    const filePath = path.join(agentsPath, `${config.name}.md`);
    const content = this.formatClaudeSubagentFile(config);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async updateSubagentClaude(project: string, originalName: string, config: SubagentConfig): Promise<void> {
    const agentsPath = this.getClaudeAgentsPath(project);
    const oldFilePath = path.join(agentsPath, `${originalName}.md`);
    const newFilePath = path.join(agentsPath, `${config.name}.md`);

    if (originalName !== config.name) {
      try {
        await fs.unlink(oldFilePath);
      } catch (error) {
        this.logger.error('Error deleting old Claude subagent file:', error);
      }
    }

    const content = this.formatClaudeSubagentFile(config);
    await fs.writeFile(newFilePath, content, 'utf-8');
  }

  private async deleteSubagentClaude(project: string, name: string): Promise<void> {
    const agentsPath = this.getClaudeAgentsPath(project);
    const filePath = path.join(agentsPath, `${name}.md`);
    await fs.unlink(filePath);
  }

  private parseClaudeSubagentFile(content: string): SubagentConfig | null {
    try {
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        return null;
      }

      const frontmatter = yaml.load(match[1]) as any;
      const systemPrompt = match[2].trim();

      return {
        name: frontmatter.name || '',
        description: frontmatter.description || '',
        tools: frontmatter.tools || '',
        model: frontmatter.model || '',
        systemPrompt,
      };
    } catch (error) {
      this.logger.error('Error parsing Claude subagent file:', error);
      return null;
    }
  }

  private formatClaudeSubagentFile(config: SubagentConfig): string {
    const frontmatter: any = {
      name: config.name,
      description: config.description,
    };

    if (config.tools) {
      frontmatter.tools = config.tools;
    }

    if (config.model) {
      frontmatter.model = config.model;
    }

    const yamlContent = yaml.dump(frontmatter, { lineWidth: -1 });

    return `---\n${yamlContent}---\n\n${config.systemPrompt}\n`;
  }

  // ── Codex (openai) path ──────────────────────────────────────────────

  private getCodexConfigPath(project: string): string {
    return path.join(this.workspacePath, project, '.codex', 'config.toml');
  }

  private getCodexAgentsDir(project: string): string {
    return path.join(this.workspacePath, project, '.codex', 'agents');
  }

  private async readCodexConfig(project: string): Promise<Record<string, any>> {
    try {
      const content = await fs.readFile(this.getCodexConfigPath(project), 'utf-8');
      return parse(content) as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async writeCodexConfig(project: string, parsed: Record<string, any>): Promise<void> {
    const configPath = this.getCodexConfigPath(project);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, stringify(parsed), 'utf-8');
  }

  private async listSubagentsCodex(project: string): Promise<SubagentConfig[]> {
    try {
      const parsed = await this.readCodexConfig(project);
      const agentsSection = (parsed.agents || {}) as Record<string, any>;
      const subagents: SubagentConfig[] = [];

      for (const [name, entry] of Object.entries(agentsSection)) {
        // Skip non-table entries (max_threads, max_depth are numbers)
        if (typeof entry !== 'object' || entry === null) continue;

        const agentEntry = entry as Record<string, any>;
        let model = '';
        let systemPrompt = '';

        // Read the referenced config file if it exists
        if (agentEntry.config_file) {
          try {
            const configFilePath = path.join(
              this.workspacePath, project, '.codex', agentEntry.config_file,
            );
            const configContent = await fs.readFile(configFilePath, 'utf-8');
            const agentConfig = parse(configContent) as Record<string, any>;
            model = agentConfig.model || '';
            systemPrompt = (agentConfig.developer_instructions || '').trim();
          } catch {
            // Config file might not exist yet
          }
        }

        subagents.push({
          name,
          description: agentEntry.description || '',
          model,
          systemPrompt,
        });
      }

      return subagents;
    } catch (error) {
      this.logger.error('Error listing Codex subagents:', error);
      return [];
    }
  }

  private async getSubagentCodex(project: string, name: string): Promise<SubagentConfig | null> {
    try {
      const parsed = await this.readCodexConfig(project);
      const agentsSection = (parsed.agents || {}) as Record<string, any>;
      const agentEntry = agentsSection[name] as Record<string, any> | undefined;

      if (!agentEntry || typeof agentEntry !== 'object') {
        return null;
      }

      let model = '';
      let systemPrompt = '';

      if (agentEntry.config_file) {
        try {
          const configFilePath = path.join(
            this.workspacePath, project, '.codex', agentEntry.config_file,
          );
          const configContent = await fs.readFile(configFilePath, 'utf-8');
          const agentConfig = parse(configContent) as Record<string, any>;
          model = agentConfig.model || '';
          systemPrompt = (agentConfig.developer_instructions || '').trim();
        } catch {
          // Config file might not exist
        }
      }

      return {
        name,
        description: agentEntry.description || '',
        model,
        systemPrompt,
      };
    } catch (error) {
      this.logger.error('Error getting Codex subagent:', error);
      return null;
    }
  }

  private async createSubagentCodex(project: string, config: SubagentConfig): Promise<void> {
    const parsed = await this.readCodexConfig(project);

    // Ensure agents section exists
    if (!parsed.agents) {
      parsed.agents = {};
    }

    const configFile = `agents/${config.name}.toml`;

    // Add agent entry to config.toml
    (parsed.agents as Record<string, any>)[config.name] = {
      description: config.description,
      config_file: configFile,
    };

    // Write the agent-specific TOML config file
    await this.writeCodexAgentConfig(project, config);

    // Write back config.toml
    await this.writeCodexConfig(project, parsed);
  }

  private async updateSubagentCodex(project: string, originalName: string, config: SubagentConfig): Promise<void> {
    const parsed = await this.readCodexConfig(project);

    if (!parsed.agents) {
      parsed.agents = {};
    }

    const agentsSection = parsed.agents as Record<string, any>;

    // If name changed, remove old entry and old config file
    if (originalName !== config.name) {
      delete agentsSection[originalName];
      try {
        await fs.unlink(path.join(this.getCodexAgentsDir(project), `${originalName}.toml`));
      } catch {
        // Old file might not exist
      }
    }

    const configFile = `agents/${config.name}.toml`;

    // Add/update agent entry
    agentsSection[config.name] = {
      description: config.description,
      config_file: configFile,
    };

    // Write/overwrite the agent-specific TOML config file
    await this.writeCodexAgentConfig(project, config);

    // Write back config.toml
    await this.writeCodexConfig(project, parsed);
  }

  private async deleteSubagentCodex(project: string, name: string): Promise<void> {
    const parsed = await this.readCodexConfig(project);

    if (parsed.agents) {
      delete (parsed.agents as Record<string, any>)[name];
    }

    // Delete the agent-specific config file
    try {
      await fs.unlink(path.join(this.getCodexAgentsDir(project), `${name}.toml`));
    } catch {
      // File might not exist
    }

    // Write back config.toml
    await this.writeCodexConfig(project, parsed);
  }

  private async writeCodexAgentConfig(project: string, config: SubagentConfig): Promise<void> {
    const agentsDir = this.getCodexAgentsDir(project);
    await fs.mkdir(agentsDir, { recursive: true });

    const agentToml: Record<string, any> = {};

    if (config.model) {
      agentToml.model = config.model;
    }

    if (config.systemPrompt) {
      agentToml.developer_instructions = config.systemPrompt;
    }

    const filePath = path.join(agentsDir, `${config.name}.toml`);
    await fs.writeFile(filePath, stringify(agentToml), 'utf-8');
  }

  // ── Subagent Repository ──────────────────────────────────────────────

  private getSubagentRepositoryPath(): string {
    const envPath = process.env.SUBAGENT_REPOSITORY;
    if (envPath) return envPath;
    return path.resolve(process.cwd(), '..', 'subagent-repository');
  }

  private getStandardSubagentsDir(): string {
    return path.join(this.getSubagentRepositoryPath(), 'standard');
  }

  private getOptionalSubagentsDir(): string {
    return path.join(this.getSubagentRepositoryPath(), 'standard', 'optional');
  }

  private getRepoSubagentDir(name: string, source: 'standard' | 'optional'): string {
    const baseDir = source === 'optional'
      ? this.getOptionalSubagentsDir()
      : this.getStandardSubagentsDir();
    return path.join(baseDir, name);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isRepositoryAvailable(): Promise<boolean> {
    return this.fileExists(this.getSubagentRepositoryPath());
  }

  /**
   * List subagents from the subagent repository
   */
  async listRepositorySubagents(includeOptional: boolean = false): Promise<RepositorySubagent[]> {
    const subagents: RepositorySubagent[] = [];
    const standardDir = this.getStandardSubagentsDir();
    const optionalDir = this.getOptionalSubagentsDir();

    // List standard subagents (excluding the 'optional' subdirectory)
    try {
      const entries = await fs.readdir(standardDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'optional') {
          const subagentDir = path.join(standardDir, entry.name);
          const config = await this.readRepoSubagentConfig(subagentDir);
          const hasThumbnail = await this.fileExists(path.join(subagentDir, 'thumbnail.png'));
          subagents.push({
            name: entry.name,
            source: 'standard',
            description: config?.description,
            hasThumbnail,
          });
        }
      }
    } catch (error) {
      // Standard directory doesn't exist or is not accessible
    }

    // List optional subagents if requested
    if (includeOptional) {
      try {
        const entries = await fs.readdir(optionalDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subagentDir = path.join(optionalDir, entry.name);
            const config = await this.readRepoSubagentConfig(subagentDir);
            const hasThumbnail = await this.fileExists(path.join(subagentDir, 'thumbnail.png'));
            subagents.push({
              name: entry.name,
              source: 'optional',
              description: config?.description,
              hasThumbnail,
            });
          }
        }
      } catch (error) {
        // Optional directory doesn't exist or is not accessible
      }
    }

    return subagents.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Read a SUBAGENT.md from a repository subagent directory
   */
  private async readRepoSubagentConfig(subagentDir: string): Promise<SubagentConfig | null> {
    try {
      const subagentPath = path.join(subagentDir, 'SUBAGENT.md');
      const content = await fs.readFile(subagentPath, 'utf-8');
      return this.parseClaudeSubagentFile(content);
    } catch {
      return null;
    }
  }

  /**
   * Provision all standard subagents to a project
   */
  async provisionStandardSubagents(project: string): Promise<ProvisionSubagentResult[]> {
    const results: ProvisionSubagentResult[] = [];
    const standardDir = this.getStandardSubagentsDir();

    try {
      const entries = await fs.readdir(standardDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'optional') {
          const result = await this.provisionSingleSubagent(project, entry.name, 'standard');
          results.push(result);
        }
      }
    } catch (error) {
      this.logger.warn('Subagent repository not available for provisioning');
    }

    return results;
  }

  /**
   * Provision specific subagents from the repository to a project
   */
  async provisionSubagentsFromRepository(
    project: string,
    subagentNames: string[],
    source: 'standard' | 'optional',
  ): Promise<ProvisionSubagentResult[]> {
    const results: ProvisionSubagentResult[] = [];

    for (const name of subagentNames) {
      const result = await this.provisionSingleSubagent(project, name, source);
      results.push(result);
    }

    return results;
  }

  private async provisionSingleSubagent(
    project: string,
    name: string,
    source: 'standard' | 'optional',
  ): Promise<ProvisionSubagentResult> {
    try {
      // Check if subagent already exists in the project
      const existing = await this.getSubagent(project, name);
      if (existing) {
        return { subagentName: name, success: true }; // Already exists, skip
      }

      const subagentDir = this.getRepoSubagentDir(name, source);
      const config = await this.readRepoSubagentConfig(subagentDir);

      if (!config) {
        return { subagentName: name, success: false, error: 'SUBAGENT.md not found or invalid' };
      }

      await this.createSubagent(project, config);
      return { subagentName: name, success: true };
    } catch (error: any) {
      this.logger.error(`Failed to provision subagent ${name}:`, error);
      return { subagentName: name, success: false, error: error.message };
    }
  }

  getSubagentThumbnailPath(name: string, source: 'standard' | 'optional'): string {
    return path.join(this.getRepoSubagentDir(name, source), 'thumbnail.png');
  }
}
