import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface SubagentConfig {
  name: string;
  description: string;
  tools?: string;
  model?: string;
  systemPrompt: string;
}

@Injectable()
export class SubagentsService {
  private readonly workspacePath = path.resolve(process.cwd(), '../workspace');

  private getAgentsPath(project: string): string {
    return path.join(this.workspacePath, project, '.claude', 'agents');
  }

  async ensureAgentsDirectory(project: string): Promise<void> {
    const agentsPath = this.getAgentsPath(project);
    await fs.mkdir(agentsPath, { recursive: true });
  }

  async listSubagents(project: string): Promise<SubagentConfig[]> {
    try {
      const agentsPath = this.getAgentsPath(project);
      await this.ensureAgentsDirectory(project);

      const files = await fs.readdir(agentsPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      const subagents: SubagentConfig[] = [];

      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(agentsPath, file), 'utf-8');
        const subagent = this.parseSubagentFile(content);
        if (subagent) {
          subagents.push(subagent);
        }
      }

      return subagents;
    } catch (error) {
      console.error('Error listing subagents:', error);
      return [];
    }
  }

  async getSubagent(project: string, name: string): Promise<SubagentConfig | null> {
    try {
      const agentsPath = this.getAgentsPath(project);
      const filePath = path.join(agentsPath, `${name}.md`);

      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseSubagentFile(content);
    } catch (error) {
      console.error('Error getting subagent:', error);
      return null;
    }
  }

  async createSubagent(project: string, config: SubagentConfig): Promise<void> {
    await this.ensureAgentsDirectory(project);

    const agentsPath = this.getAgentsPath(project);
    const filePath = path.join(agentsPath, `${config.name}.md`);

    const content = this.formatSubagentFile(config);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async updateSubagent(project: string, originalName: string, config: SubagentConfig): Promise<void> {
    const agentsPath = this.getAgentsPath(project);
    const oldFilePath = path.join(agentsPath, `${originalName}.md`);
    const newFilePath = path.join(agentsPath, `${config.name}.md`);

    // If name changed, delete old file
    if (originalName !== config.name) {
      try {
        await fs.unlink(oldFilePath);
      } catch (error) {
        console.error('Error deleting old subagent file:', error);
      }
    }

    const content = this.formatSubagentFile(config);
    await fs.writeFile(newFilePath, content, 'utf-8');
  }

  async deleteSubagent(project: string, name: string): Promise<void> {
    const agentsPath = this.getAgentsPath(project);
    const filePath = path.join(agentsPath, `${name}.md`);

    await fs.unlink(filePath);
  }

  private parseSubagentFile(content: string): SubagentConfig | null {
    try {
      // Split frontmatter and body
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
      console.error('Error parsing subagent file:', error);
      return null;
    }
  }

  private formatSubagentFile(config: SubagentConfig): string {
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
}
