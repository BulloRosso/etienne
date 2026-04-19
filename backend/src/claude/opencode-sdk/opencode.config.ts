import { join } from 'path';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

export class OpenCodeConfig {
  readonly hostRoot: string;
  anthropicApiKey: string;
  openAiApiKey: string;
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly permissionTimeoutMs: number;
  readonly serverPort: number;

  constructor(private secretsManager?: SecretsManagerService) {
    this.hostRoot = process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.openAiApiKey = process.env.OPENAI_API_KEY ?? '';
    this.defaultProvider = process.env.OPENCODE_PROVIDER ?? 'anthropic';
    this.defaultModel = process.env.OPENCODE_MODEL ?? 'claude-sonnet-4-5-20250514';
    this.permissionTimeoutMs = parseInt(process.env.OPENCODE_PERMISSION_TIMEOUT_MS ?? '300000', 10);
    this.serverPort = parseInt(process.env.OPENCODE_SERVER_PORT ?? '0', 10);
  }

  async initSecrets(): Promise<void> {
    if (this.secretsManager) {
      this.anthropicApiKey = await this.secretsManager.getSecret('ANTHROPIC_API_KEY') || this.anthropicApiKey;
      this.openAiApiKey = await this.secretsManager.getSecret('OPENAI_API_KEY') || this.openAiApiKey;
    }
  }

  /** Path to the opencode binary — can be overridden via env */
  get opencodeBinaryPath(): string {
    return process.env.OPENCODE_BINARY_PATH ?? 'opencode';
  }

  /**
   * Check if the OpenCode agent is the active coding agent
   */
  static isOpenCodeActive(): boolean {
    return (process.env.CODING_AGENT || 'anthropic') === 'open-code';
  }
}
