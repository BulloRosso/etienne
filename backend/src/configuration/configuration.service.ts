import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

interface ConfigurationDto {
  ANTHROPIC_API_KEY?: string;
  WORKSPACE_ROOT?: string;
  CHECKPOINT_PROVIDER?: string;
  GITEA_URL?: string;
  GITEA_USERNAME?: string;
  GITEA_PASSWORD?: string;
  GITEA_REPO?: string;
  IMAP_CONNECTION?: string;
  SMTP_CONNECTION?: string;
  SMTP_WHITELIST?: string;
  COSTS_CURRENCY_UNIT?: string;
  COSTS_PER_MIO_INPUT_TOKENS?: string;
  COSTS_PER_MIO_OUTPUT_TOKENS?: string;
  MEMORY_MANAGEMENT_URL?: string;
  MEMORY_DECAY_DAYS?: string;
  OTEL_ENABLED?: string;
  PHOENIX_COLLECTOR_ENDPOINT?: string;
  OTEL_SERVICE_NAME?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class ConfigurationService {
  private readonly envFilePath: string;

  constructor() {
    // .env file is in the backend directory
    this.envFilePath = join(__dirname, '..', '..', '.env');
  }

  /**
   * Read and parse the .env file
   */
  async getConfiguration(): Promise<ConfigurationDto | null> {
    try {
      const content = await fs.readFile(this.envFilePath, 'utf8');
      return this.parseEnvFile(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write configuration to .env file and export to environment
   */
  async saveConfiguration(config: ConfigurationDto): Promise<void> {
    // Convert config object to .env format
    const envContent = this.formatEnvFile(config);

    // Write the .env file
    await fs.writeFile(this.envFilePath, envContent, 'utf8');

    // Export variables to the current process environment
    this.exportToEnvironment(config);
  }

  /**
   * Parse .env file content into an object
   */
  private parseEnvFile(content: string): ConfigurationDto {
    const config: ConfigurationDto = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE format
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        config[key] = value;
      }
    }

    return config;
  }

  /**
   * Format configuration object as .env file content
   */
  private formatEnvFile(config: ConfigurationDto): string {
    const lines: string[] = [];

    // Core settings
    if (config.ANTHROPIC_API_KEY) {
      lines.push('# Anthropic API Key (used for direct Claude API calls when aiModel=claude)');
      lines.push(`ANTHROPIC_API_KEY=${config.ANTHROPIC_API_KEY}`);
    }

    if (config.WORKSPACE_ROOT) {
      lines.push('# Local path to workspace files');
      lines.push(`WORKSPACE_ROOT=${config.WORKSPACE_ROOT}`);
    }

    // Memory Management Configuration
    if (config.MEMORY_MANAGEMENT_URL || config.MEMORY_DECAY_DAYS) {
      lines.push('');
      lines.push('# Memory Management Configuration');
      if (config.MEMORY_MANAGEMENT_URL) {
        lines.push(`MEMORY_MANAGEMENT_URL=${config.MEMORY_MANAGEMENT_URL}`);
      }
      if (config.MEMORY_DECAY_DAYS) {
        lines.push(`MEMORY_DECAY_DAYS=${config.MEMORY_DECAY_DAYS}`);
      }
    }

    // Budget Control Configuration
    if (config.COSTS_CURRENCY_UNIT || config.COSTS_PER_MIO_INPUT_TOKENS || config.COSTS_PER_MIO_OUTPUT_TOKENS) {
      lines.push('');
      lines.push('# Budget Control Configuration');
      if (config.COSTS_CURRENCY_UNIT) {
        lines.push(`COSTS_CURRENCY_UNIT=${config.COSTS_CURRENCY_UNIT}`);
      }
      if (config.COSTS_PER_MIO_INPUT_TOKENS) {
        lines.push(`COSTS_PER_MIO_INPUT_TOKENS=${config.COSTS_PER_MIO_INPUT_TOKENS}`);
      }
      if (config.COSTS_PER_MIO_OUTPUT_TOKENS) {
        lines.push(`COSTS_PER_MIO_OUTPUT_TOKENS=${config.COSTS_PER_MIO_OUTPUT_TOKENS}`);
      }
    }

    // Checkpoint Provider Configuration
    if (config.CHECKPOINT_PROVIDER || config.GITEA_URL || config.GITEA_USERNAME || config.GITEA_PASSWORD || config.GITEA_REPO) {
      lines.push('');
      lines.push('# Checkpoint Provider Configuration');
      if (config.CHECKPOINT_PROVIDER) {
        lines.push(`CHECKPOINT_PROVIDER=${config.CHECKPOINT_PROVIDER}`);
      }
      if (config.GITEA_URL) {
        lines.push(`GITEA_URL=${config.GITEA_URL}`);
      }
      if (config.GITEA_USERNAME) {
        lines.push(`GITEA_USERNAME=${config.GITEA_USERNAME}`);
      }
      if (config.GITEA_PASSWORD) {
        lines.push(`GITEA_PASSWORD=${config.GITEA_PASSWORD}`);
      }
      if (config.GITEA_REPO) {
        lines.push(`GITEA_REPO=${config.GITEA_REPO}`);
      }
    }

    // Email Configuration
    if (config.SMTP_CONNECTION || config.IMAP_CONNECTION || config.SMTP_WHITELIST) {
      lines.push('');
      lines.push('# Email Configuration');
      lines.push('# SMTP_CONNECTION format: host|port|secure|user|password');
      lines.push('# Port 587 uses STARTTLS (secure=false triggers STARTTLS mode)');
      lines.push('# Port 993 uses direct SSL/TLS (secure=true)');
      if (config.SMTP_CONNECTION) {
        lines.push(`SMTP_CONNECTION=${config.SMTP_CONNECTION}`);
      }
      lines.push('');
      lines.push('# IMAP_CONNECTION format: host|port|secure|user|password');
      lines.push('# IMAP uses SSL on port 993');
      if (config.IMAP_CONNECTION) {
        lines.push(`IMAP_CONNECTION=${config.IMAP_CONNECTION}`);
      }
      lines.push('');
      lines.push('# SMTP Whitelist - comma-separated list of allowed recipients');
      lines.push('# This prevents AI agents from sending emails to unauthorized recipients');
      if (config.SMTP_WHITELIST) {
        lines.push(`SMTP_WHITELIST=${config.SMTP_WHITELIST}`);
      }
    }

    // OpenTelemetry Observability Configuration
    if (config.OTEL_ENABLED || config.PHOENIX_COLLECTOR_ENDPOINT || config.OTEL_SERVICE_NAME) {
      lines.push('');
      lines.push('# OpenTelemetry Observability Configuration');
      if (config.OTEL_ENABLED) {
        lines.push(`OTEL_ENABLED=${config.OTEL_ENABLED}`);
      }
      if (config.PHOENIX_COLLECTOR_ENDPOINT) {
        lines.push(`PHOENIX_COLLECTOR_ENDPOINT=${config.PHOENIX_COLLECTOR_ENDPOINT}`);
      }
      if (config.OTEL_SERVICE_NAME) {
        lines.push(`OTEL_SERVICE_NAME=${config.OTEL_SERVICE_NAME}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Export configuration values to process.env
   */
  private exportToEnvironment(config: ConfigurationDto): void {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null && value !== '') {
        process.env[key] = value;
      }
    }
  }
}
