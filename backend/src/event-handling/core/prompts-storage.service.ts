import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface Prompt {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PromptsStorageService {
  private readonly logger = new Logger(PromptsStorageService.name);

  private getPromptsPath(projectName: string): string {
    return path.join(
      process.cwd(),
      '..',
      'workspace',
      projectName,
      '.etienne',
      'prompts.json',
    );
  }

  async loadPrompts(projectName: string): Promise<Prompt[]> {
    try {
      const promptsPath = this.getPromptsPath(projectName);

      if (await fs.pathExists(promptsPath)) {
        const data = await fs.readJson(promptsPath);
        return data.prompts || [];
      }

      return [];
    } catch (error) {
      this.logger.error(`Failed to load prompts for project ${projectName}`, error);
      return [];
    }
  }

  async savePrompts(projectName: string, prompts: Prompt[]): Promise<void> {
    try {
      const promptsPath = this.getPromptsPath(projectName);
      await fs.ensureDir(path.dirname(promptsPath));
      await fs.writeJson(promptsPath, { prompts }, { spaces: 2 });
      this.logger.log(`Saved ${prompts.length} prompts for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Failed to save prompts for project ${projectName}`, error);
      throw error;
    }
  }

  async getPrompt(projectName: string, promptId: string): Promise<Prompt | null> {
    const prompts = await this.loadPrompts(projectName);
    return prompts.find((p) => p.id === promptId) || null;
  }

  async addPrompt(projectName: string, prompt: Prompt): Promise<void> {
    const prompts = await this.loadPrompts(projectName);
    prompts.push(prompt);
    await this.savePrompts(projectName, prompts);
  }

  async updatePrompt(projectName: string, promptId: string, updates: Partial<Prompt>): Promise<Prompt | null> {
    const prompts = await this.loadPrompts(projectName);
    const index = prompts.findIndex((p) => p.id === promptId);

    if (index === -1) {
      return null;
    }

    prompts[index] = {
      ...prompts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.savePrompts(projectName, prompts);
    return prompts[index];
  }

  async deletePrompt(projectName: string, promptId: string): Promise<boolean> {
    const prompts = await this.loadPrompts(projectName);
    const filtered = prompts.filter((p) => p.id !== promptId);

    if (filtered.length === prompts.length) {
      return false;
    }

    await this.savePrompts(projectName, filtered);
    return true;
  }
}
