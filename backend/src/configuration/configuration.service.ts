import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';

interface ConfigurationDto {
  CODING_AGENT?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_AGENTS_MODEL?: string;
  OPENAI_AGENTS_ENABLE_CODEX_TOOL?: string;
  OPENAI_AGENTS_PERMISSION_TIMEOUT_MS?: string;
  ANTHROPIC_MODELS?: string;
  OPENAI_MODELS?: string;
  WORKSPACE_ROOT?: string;
  FORCE_PROJECT_SCOPE?: string;
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
  OBSERVABILITY_PROVIDER?: string;
  OTEL_SPAN_PROCESSOR?: string;
  PHOENIX_COLLECTOR_ENDPOINT?: string;
  OTEL_SERVICE_NAME?: string;
  AZURE_MONITOR_CONNECTION_STRING?: string;
  AWS_OTEL_REGION?: string;
  AWS_OTEL_ENDPOINT?: string;
  DIFFBOT_TOKEN?: string;
  VAPI_TOKEN?: string;
  AGENT_BUS_LOG_CMS?: string;
  AGENT_BUS_LOG_DSS?: string;
  AGENT_BUS_LOG_SWE?: string;
  REGISTERED_PREVIEWERS?: string;
  SECRET_VAULT_PROVIDER?: string;
  OPENBAO_ADDR?: string;
  OPENBAO_DEV_ROOT_TOKEN?: string;
  AZURE_TENANT_ID?: string;
  AZURE_CLIENT_ID?: string;
  AZURE_CLIENT_SECRET?: string;
  AZURE_VAULT_URL?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SECRETS_PREFIX?: string;
  AUTH_PROVIDER?: string;
  AZURE_ENTRAID_TENANT_ID?: string;
  AZURE_ENTRAID_CLIENT_ID?: string;
  AZURE_ENTRAID_CLIENT_SECRET?: string;
  AZURE_ENTRAID_REDIRECT_URI?: string;
  AZURE_ENTRAID_ADMIN_GROUPS?: string;
  AWS_COGNITO_USER_POOL_ID?: string;
  AWS_COGNITO_CLIENT_ID?: string;
  AWS_COGNITO_CLIENT_SECRET?: string;
  AWS_COGNITO_REGION?: string;
  AWS_COGNITO_DOMAIN?: string;
  AWS_COGNITO_ADMIN_GROUPS?: string;
  [key: string]: string | undefined;
}

/** Declarative .env section template — drives formatEnvFile */
const ENV_SECTIONS: { comment: string; keys: string[] }[] = [
  { comment: '# Coding Agent Selection', keys: ['CODING_AGENT'] },
  { comment: '# Anthropic API Key', keys: ['ANTHROPIC_API_KEY'] },
  { comment: '# OpenAI API Key', keys: ['OPENAI_API_KEY'] },
  { comment: '# Model tiers per provider (comma-separated: small,regular)', keys: ['ANTHROPIC_MODELS', 'OPENAI_MODELS'] },
  { comment: '# OpenAI Agents SDK Configuration', keys: ['OPENAI_AGENTS_MODEL', 'OPENAI_AGENTS_ENABLE_CODEX_TOOL', 'OPENAI_AGENTS_PERMISSION_TIMEOUT_MS'] },
  { comment: '# Workspace', keys: ['WORKSPACE_ROOT', 'FORCE_PROJECT_SCOPE'] },
  { comment: '# Memory Management Configuration', keys: ['MEMORY_MANAGEMENT_URL', 'MEMORY_DECAY_DAYS'] },
  { comment: '# Budget Control Configuration', keys: ['COSTS_CURRENCY_UNIT', 'COSTS_PER_MIO_INPUT_TOKENS', 'COSTS_PER_MIO_OUTPUT_TOKENS'] },
  { comment: '# MCP Tools', keys: ['DIFFBOT_TOKEN', 'VAPI_TOKEN'] },
  { comment: '# Checkpoint Provider Configuration', keys: ['CHECKPOINT_PROVIDER', 'GITEA_URL', 'GITEA_USERNAME', 'GITEA_PASSWORD', 'GITEA_REPO'] },
  {
    comment: '# Email Configuration\n# SMTP_CONNECTION format: host|port|secure|user|password\n# IMAP_CONNECTION format: host|port|secure|user|password',
    keys: ['SMTP_CONNECTION', 'IMAP_CONNECTION', 'SMTP_WHITELIST'],
  },
  { comment: '# Agent Bus Logging', keys: ['AGENT_BUS_LOG_CMS', 'AGENT_BUS_LOG_DSS', 'AGENT_BUS_LOG_SWE'] },
  { comment: "# Observability - Provider Selection\n# OBSERVABILITY_PROVIDER: 'phoenix' (default), 'azure', or 'aws'", keys: ['OBSERVABILITY_PROVIDER', 'OTEL_ENABLED', 'OTEL_SERVICE_NAME', 'OTEL_SPAN_PROCESSOR'] },
  { comment: '# Observability - Phoenix Arize', keys: ['PHOENIX_COLLECTOR_ENDPOINT'] },
  { comment: '# Observability - Azure Application Insights', keys: ['AZURE_MONITOR_CONNECTION_STRING'] },
  { comment: '# Observability - AWS CloudWatch / X-Ray OTLP', keys: ['AWS_OTEL_REGION', 'AWS_OTEL_ENDPOINT'] },
  { comment: '# File Previewer Mappings (pipe-separated: viewer:.ext1,.ext2)', keys: ['REGISTERED_PREVIEWERS'] },
  { comment: '# Secrets Manager Configuration', keys: ['SECRET_VAULT_PROVIDER', 'OPENBAO_ADDR', 'OPENBAO_DEV_ROOT_TOKEN'] },
  { comment: '# Azure Key Vault Configuration', keys: ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_VAULT_URL'] },
  { comment: '# AWS Secrets Manager Configuration', keys: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECRETS_PREFIX'] },
  { comment: "# Authentication Provider Configuration\n# Provider: 'local' (default), 'azure-entraid', or 'aws-cognito'", keys: ['AUTH_PROVIDER'] },
  { comment: '# Azure Entra ID Authentication (only used when AUTH_PROVIDER=azure-entraid)', keys: ['AZURE_ENTRAID_TENANT_ID', 'AZURE_ENTRAID_CLIENT_ID', 'AZURE_ENTRAID_CLIENT_SECRET', 'AZURE_ENTRAID_REDIRECT_URI', 'AZURE_ENTRAID_ADMIN_GROUPS'] },
  { comment: '# AWS Cognito Authentication (only used when AUTH_PROVIDER=aws-cognito)', keys: ['AWS_COGNITO_USER_POOL_ID', 'AWS_COGNITO_CLIENT_ID', 'AWS_COGNITO_CLIENT_SECRET', 'AWS_COGNITO_REGION', 'AWS_COGNITO_DOMAIN', 'AWS_COGNITO_ADMIN_GROUPS'] },
];

@Injectable()
export class ConfigurationService {
  private readonly envFilePath: string;

  constructor() {
    // In Docker, .env is mounted at /app/backend/.env
    // Outside Docker, it's relative to the compiled output directory
    const dockerEnvPath = '/app/backend/.env';
    const localEnvPath = join(__dirname, '..', '..', '.env');

    this.envFilePath = existsSync(dockerEnvPath) ? dockerEnvPath : localEnvPath;
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
   * Format configuration object as .env file content using a declarative section template.
   * Sections are only emitted when at least one key in the section has a value.
   */
  private formatEnvFile(config: ConfigurationDto): string {
    const lines: string[] = [];
    const writtenKeys = new Set<string>();

    for (const section of ENV_SECTIONS) {
      const sectionValues = section.keys.filter(k => config[k]);
      if (sectionValues.length === 0) continue;

      if (lines.length > 0) lines.push('');
      for (const commentLine of section.comment.split('\n')) {
        lines.push(commentLine);
      }
      for (const key of section.keys) {
        if (config[key]) {
          lines.push(`${key}=${config[key]}`);
          writtenKeys.add(key);
        }
      }
    }

    // Write any remaining keys not covered by the template
    const remaining = Object.entries(config).filter(
      ([k, v]) => v && !writtenKeys.has(k),
    );
    if (remaining.length > 0) {
      lines.push('');
      lines.push('# Additional Configuration');
      for (const [key, value] of remaining) {
        lines.push(`${key}=${value}`);
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
