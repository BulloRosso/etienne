/**
 * Configuration for the OpenAI Agents SDK integration.
 * Loads settings from environment variables with sensible defaults.
 */
export class OpenAIAgentsConfig {
  /** Root directory where workspace projects live */
  readonly hostRoot: string;

  /** OpenAI API key (shared with Codex SDK) */
  readonly openAiApiKey: string;

  /** Default model for the Agents SDK */
  readonly defaultModel: string;

  /** Model for the experimental Codex tool sub-agent */
  readonly codexModel: string;

  /** Timeout in ms for permission/approval requests */
  readonly permissionTimeoutMs: number;

  /** Whether to include the experimental codex tool */
  readonly enableCodexTool: boolean;

  constructor() {
    this.hostRoot =
      process.env.WORKSPACE_ROOT ??
      process.env.WORKSPACE_HOST_ROOT ??
      'C:/Data/GitHub/claude-multitenant/workspace';
    this.openAiApiKey = process.env.OPENAI_API_KEY ?? '';
    this.defaultModel = process.env.OPENAI_AGENTS_MODEL ?? 'gpt-5.3-codex';
    this.codexModel = process.env.CODEX_MODEL ?? 'o4-mini';
    this.permissionTimeoutMs = parseInt(
      process.env.OPENAI_AGENTS_PERMISSION_TIMEOUT_MS ?? '300000',
      10,
    );
    this.enableCodexTool =
      (process.env.OPENAI_AGENTS_ENABLE_CODEX_TOOL ?? 'false') === 'true';
  }

  /** Check whether this agent backend is the active one */
  static isOpenAIAgentsActive(): boolean {
    return (process.env.CODING_AGENT || 'anthropic') === 'openai-agents';
  }
}
