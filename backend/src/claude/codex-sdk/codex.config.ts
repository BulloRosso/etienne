import { join } from 'path';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';

export class CodexConfig {
  readonly hostRoot: string;
  openAiApiKey: string;
  readonly defaultModel: string;
  readonly sandboxMode = 'danger-full-access' as const;
  readonly approvalPolicy: 'never' | 'on-failure' | 'on-request' | 'untrusted';
  readonly permissionTimeoutMs: number;

  constructor(private secretsManager?: SecretsManagerService) {
    this.hostRoot = process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.openAiApiKey = process.env.OPENAI_API_KEY ?? '';
    this.defaultModel = process.env.CODEX_MODEL ?? 'gpt-5.2-codex';
    this.approvalPolicy = (process.env.CODEX_APPROVAL_POLICY as any) ?? 'on-failure';
    this.permissionTimeoutMs = parseInt(process.env.CODEX_PERMISSION_TIMEOUT_MS ?? '300000', 10);
  }

  /** Path to the codex binary — uses node_modules/.bin/codex from the backend package */
  async initSecrets(): Promise<void> {
    if (this.secretsManager) {
      this.openAiApiKey = await this.secretsManager.getSecret('OPENAI_API_KEY') || this.openAiApiKey;
    }
  }

  get codexBinaryPath(): string {
    return process.env.CODEX_BINARY_PATH ?? join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'codex');
  }

  /**
   * Check if the OpenAI Codex agent is the active coding agent
   */
  static isCodexActive(): boolean {
    return (process.env.CODING_AGENT || 'anthropic') === 'openai';
  }
}
