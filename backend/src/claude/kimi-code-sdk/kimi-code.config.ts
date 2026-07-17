import { join } from 'path';
import * as fs from 'fs-extra';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';
import { safeRoot } from '../utils/path.utils';

/**
 * Per-project model configuration loaded from `<project>/.etienne/ai-model.json`.
 * Same file/shape as the opencode and pi-mono orchestrators, so switching the
 * active coding agent never requires touching project config.
 */
export type AiModelConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  token?: string;
  isActive?: boolean;
};

/**
 * Resolved model/credentials for a Kimi session. `model` may be undefined —
 * the Kimi CLI then falls back to the `default_model` in its config.toml.
 */
export type ResolvedKimiModel = {
  model?: string;
  baseUrl?: string;
  apiKey: string;
  thinking: boolean;
  /** Stable cache key — a changed config recreates the live CLI session. */
  signature: string;
};

export class KimiCodeConfig {
  readonly hostRoot: string;
  moonshotApiKey: string;
  readonly defaultModel?: string;
  readonly defaultThinking: boolean;

  constructor(private secretsManager?: SecretsManagerService) {
    this.hostRoot = process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.moonshotApiKey = process.env.MOONSHOT_API_KEY ?? '';
    this.defaultModel = process.env.KIMI_MODEL || undefined;
    this.defaultThinking = process.env.KIMI_THINKING === 'true';
  }

  async initSecrets(): Promise<void> {
    if (this.secretsManager) {
      this.moonshotApiKey = (await this.secretsManager.getSecret('MOONSHOT_API_KEY')) || this.moonshotApiKey;
    }
  }

  /** Path to the kimi CLI binary — can be overridden via env */
  get kimiBinaryPath(): string {
    return process.env.KIMI_BINARY_PATH ?? 'kimi';
  }

  /**
   * Check if the Kimi Code agent is the active coding agent
   */
  static isKimiCodeActive(): boolean {
    return (process.env.CODING_AGENT || 'anthropic') === 'kimi-code';
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
   *   2. Env-level `KIMI_MODEL` / `KIMI_THINKING`
   *   3. Kimi CLI defaults (`default_model` from its config.toml)
   *
   * The api key is the project config's `token` or the env-level MOONSHOT_API_KEY.
   */
  async resolveModelForProject(projectDir: string): Promise<ResolvedKimiModel> {
    const projectCfg = await this.loadProjectModelConfig(projectDir);

    const model = projectCfg?.model || this.defaultModel;
    const baseUrl = projectCfg?.baseUrl || undefined;
    const apiKey = projectCfg?.token || this.moonshotApiKey;
    const thinking = this.defaultThinking;

    return {
      model,
      baseUrl,
      apiKey,
      thinking,
      signature: `${model ?? ''}|${baseUrl ?? ''}|${thinking}|${apiKey ? apiKey.slice(0, 8) : ''}`,
    };
  }
}
