import { join } from 'path';

export class CodexConfig {
  readonly hostRoot: string;
  readonly openAiApiKey: string;
  readonly defaultModel: string;
  readonly sandboxMode = 'danger-full-access' as const;

  constructor() {
    this.hostRoot = process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.openAiApiKey = process.env.OPENAI_API_KEY ?? '';
    this.defaultModel = process.env.CODEX_MODEL ?? 'gpt-5.2-codex';
  }

  /** Path to the codex binary — uses node_modules/.bin/codex from the backend package */
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
