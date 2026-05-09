import { join } from 'path';
import * as fs from 'fs-extra';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';
import { safeRoot } from '../utils/path.utils';

/**
 * Per-project model configuration loaded from `<project>/.etienne/ai-model.json`.
 * Mirrors the pi-mono shape so the same file can drive either orchestrator.
 */
export type AiModelConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  token?: string;
  isActive?: boolean;
};

/**
 * Resolved provider/model/credentials used by the OpenCode SDK.
 * Always non-empty after `OpenCodeConfig.resolveModelForProject(...)`.
 */
export type ResolvedModel = {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
  /**
   * Stable cache key — distinct configs yield distinct OpenCode server instances.
   */
  signature: string;
};

export class OpenCodeConfig {
  readonly hostRoot: string;
  anthropicApiKey: string;
  openAiApiKey: string;
  deepseekApiKey: string;
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly defaultBaseUrl?: string;
  readonly permissionTimeoutMs: number;
  readonly serverPort: number;

  constructor(private secretsManager?: SecretsManagerService) {
    this.hostRoot = process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.openAiApiKey = process.env.OPENAI_API_KEY ?? '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY ?? '';
    this.defaultProvider = process.env.OPENCODE_PROVIDER ?? 'anthropic';
    this.defaultModel = process.env.OPENCODE_MODEL ?? 'claude-sonnet-4-5-20250514';
    this.defaultBaseUrl = process.env.OPENCODE_BASE_URL || undefined;
    this.permissionTimeoutMs = parseInt(process.env.OPENCODE_PERMISSION_TIMEOUT_MS ?? '300000', 10);
    this.serverPort = parseInt(process.env.OPENCODE_SERVER_PORT ?? '0', 10);
  }

  async initSecrets(): Promise<void> {
    if (this.secretsManager) {
      this.anthropicApiKey = (await this.secretsManager.getSecret('ANTHROPIC_API_KEY')) || this.anthropicApiKey;
      this.openAiApiKey = (await this.secretsManager.getSecret('OPENAI_API_KEY')) || this.openAiApiKey;
      this.deepseekApiKey = (await this.secretsManager.getSecret('DEEPSEEK_API_KEY')) || this.deepseekApiKey;
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

  /**
   * Load `<project>/.etienne/ai-model.json` if present and active.
   * Returns undefined if missing or `isActive === false`.
   */
  async loadProjectModelConfig(projectDir: string): Promise<AiModelConfig | undefined> {
    const projectRoot = safeRoot(this.hostRoot, projectDir);
    const candidate = join(projectRoot, '.etienne', 'ai-model.json');
    if (!(await fs.pathExists(candidate))) return undefined;
    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as AiModelConfig;
      if (parsed.isActive === false) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve the effective model for a project. Order of precedence:
   *   1. `<project>/.etienne/ai-model.json` (if active)
   *   2. Env-level `OPENCODE_PROVIDER` / `OPENCODE_MODEL` / `OPENCODE_BASE_URL`
   *   3. Built-in defaults (`anthropic`/`claude-sonnet-4-5-20250514`)
   *
   * The api key is resolved from the project config's `token`, or from the
   * env var matching the provider (DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY).
   */
  async resolveModelForProject(projectDir: string): Promise<ResolvedModel> {
    const projectCfg = await this.loadProjectModelConfig(projectDir);

    const provider = projectCfg?.provider || this.defaultProvider;
    const model = projectCfg?.model || this.defaultModel;
    const baseUrl = projectCfg?.baseUrl || this.defaultBaseUrl;
    const apiKey = projectCfg?.token || this.envKeyForProvider(provider);

    return {
      provider,
      model,
      baseUrl,
      apiKey,
      signature: `${provider}|${model}|${baseUrl ?? ''}|${apiKey ? apiKey.slice(0, 8) : ''}`,
    };
  }

  /**
   * Pick the appropriate env-level api key for a given provider name.
   * Falls back to ANTHROPIC_API_KEY for any provider whose name contains
   * "anthropic", OPENAI_API_KEY for "openai"/"openai-compatible", and
   * DEEPSEEK_API_KEY for "deepseek".
   */
  private envKeyForProvider(provider: string): string {
    const p = provider.toLowerCase();
    if (p.includes('deepseek')) return this.deepseekApiKey;
    if (p.includes('anthropic')) return this.anthropicApiKey;
    if (p.includes('openai')) return this.openAiApiKey;
    return this.anthropicApiKey || this.openAiApiKey || this.deepseekApiKey || '';
  }
}
