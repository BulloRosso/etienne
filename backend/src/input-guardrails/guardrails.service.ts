import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GuardrailsConfig {
  enabled: string[]; // Array of enabled guardrail names: 'creditCard', 'ipAddress', 'email', 'url', 'iban'
}

@Injectable()
export class GuardrailsService {
  private readonly workspaceDir = path.resolve(process.cwd(), '../workspace');

  /**
   * Get the guardrails config file path for a project
   */
  private getConfigPath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne', 'input-guardrails.json');
  }

  /**
   * Ensure the .etienne directory exists
   */
  private async ensureEtienneDir(project: string): Promise<void> {
    const etienneDir = path.join(this.workspaceDir, project, '.etienne');
    try {
      await fs.access(etienneDir);
    } catch {
      await fs.mkdir(etienneDir, { recursive: true });
    }
  }

  /**
   * Load guardrails configuration for a project
   */
  async getConfig(project: string): Promise<GuardrailsConfig> {
    const configPath = this.getConfigPath(project);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Return default config if file doesn't exist
      return { enabled: [] };
    }
  }

  /**
   * Save guardrails configuration for a project
   */
  async saveConfig(project: string, config: GuardrailsConfig): Promise<void> {
    await this.ensureEtienneDir(project);
    const configPath = this.getConfigPath(project);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Update guardrails configuration for a project
   */
  async updateConfig(project: string, enabled: string[]): Promise<GuardrailsConfig> {
    const config: GuardrailsConfig = { enabled };
    await this.saveConfig(project, config);
    return config;
  }
}
