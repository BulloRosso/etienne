export class ClaudeConfig {
  readonly container: string;
  readonly hostRoot: string;
  readonly containerRoot: string;
  readonly timeoutMs: number;
  readonly anthropicKey: string;

  constructor() {
    this.container = process.env.CLAUDE_CONTAINER_NAME ?? 'claude-code';
    this.hostRoot = process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.containerRoot = '/workspace';
    this.timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS ?? 600000);
    this.anthropicKey = process.env.ANTHROPIC_API_KEY ?? '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';
  }
}
