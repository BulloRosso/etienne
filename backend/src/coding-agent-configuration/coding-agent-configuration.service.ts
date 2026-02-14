import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

interface AgentTypeConfig {
  fileName: string;
  projectDir: string;
  templateFile: string;
}

@Injectable()
export class CodingAgentConfigurationService {
  private readonly logger = new Logger(CodingAgentConfigurationService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  private readonly agentConfigs: Record<string, AgentTypeConfig> = {
    anthropic: {
      fileName: 'settings.json',
      projectDir: '.claude',
      templateFile: 'claude-settings.json',
    },
    openai: {
      fileName: 'config.toml',
      projectDir: '.codex',
      templateFile: 'codex-config.toml',
    },
  };

  private get templatesDir(): string {
    return path.join(process.cwd(), 'src', 'coding-agent-configuration', 'templates');
  }

  private getCustomOverridePath(agentType: string): string {
    const config = this.agentConfigs[agentType];
    return path.join(
      this.workspaceDir,
      '.etienne',
      'coding-agent-configuration',
      agentType,
      config.fileName,
    );
  }

  private getTemplatePath(agentType: string): string {
    const config = this.agentConfigs[agentType];
    return path.join(this.templatesDir, config.templateFile);
  }

  getActiveAgentType(): string {
    return process.env.CODING_AGENT || 'anthropic';
  }

  /**
   * Get the mission/role markdown filename based on the active coding agent.
   * - anthropic: CLAUDE.md
   * - openai/others: AGENTS.md
   */
  getMissionFileName(): string {
    return this.getActiveAgentType() === 'anthropic' ? 'CLAUDE.md' : 'AGENTS.md';
  }

  /**
   * Get the agent config directory based on the active coding agent.
   * - anthropic: .claude
   * - openai/others: .codex
   */
  getAgentConfigDir(): string {
    return this.getActiveAgentType() === 'anthropic' ? '.claude' : '.codex';
  }

  async getConfig(agentType: string): Promise<{ content: string; isCustom: boolean }> {
    const customPath = this.getCustomOverridePath(agentType);

    if (await fs.pathExists(customPath)) {
      const content = await fs.readFile(customPath, 'utf-8');
      return { content, isCustom: true };
    }

    const templatePath = this.getTemplatePath(agentType);
    const content = await fs.readFile(templatePath, 'utf-8');
    return { content, isCustom: false };
  }

  async saveConfig(agentType: string, content: string): Promise<void> {
    const customPath = this.getCustomOverridePath(agentType);
    await fs.ensureDir(path.dirname(customPath));
    await fs.writeFile(customPath, content, 'utf-8');
    this.logger.log(`Saved custom ${agentType} configuration`);
  }

  async deleteConfig(agentType: string): Promise<void> {
    const customPath = this.getCustomOverridePath(agentType);
    if (await fs.pathExists(customPath)) {
      await fs.remove(customPath);
      this.logger.log(`Removed custom ${agentType} configuration, reverted to defaults`);
    }
  }

  async getConfigForProject(agentType: string): Promise<string> {
    const { content } = await this.getConfig(agentType);
    return content;
  }
}
