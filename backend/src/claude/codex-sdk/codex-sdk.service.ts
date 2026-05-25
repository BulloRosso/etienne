import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CodexConfig } from './codex.config';
import { safeRoot } from '../utils/path.utils';

// @openai/codex-sdk is ESM-only — same pattern as @anthropic-ai/claude-agent-sdk.
// new Function() prevents TS from transpiling import() into require().
const dynamicImport = new Function('specifier', 'return import(specifier)');
let CodexCtor: any = null;
async function loadCodex(): Promise<any> {
  if (!CodexCtor) {
    const mod = await dynamicImport('@openai/codex-sdk');
    CodexCtor = mod.Codex;
  }
  return CodexCtor;
}

// Re-export ThreadEvent as a structural type since the typed import would
// require resolution-mode attributes our CommonJS build doesn't handle.
export type ThreadEvent = any;

/**
 * Codex SDK service — typed @openai/codex-sdk wrapper.
 *
 * Migrated from the hand-rolled JSON-RPC app-server transport. The typed SDK
 * collapses ~400 lines of subprocess + JSON-RPC framing into a Codex().startThread()
 * call. Interactive approvals are gone (approvalPolicy is now static 'never'); the
 * sandbox mode is the user-facing safety boundary.
 */
@Injectable()
export class CodexSdkService {
  private readonly logger = new Logger(CodexSdkService.name);
  private readonly config = new CodexConfig();

  /**
   * Stream a conversation. Yields ThreadEvent objects for the orchestrator to dispatch.
   * Pass `abortController` in options to interrupt the turn from the outside.
   */
  async *streamConversation(
    projectDir: string,
    prompt: string,
    options: {
      threadId?: string;
      abortController?: AbortController;
    } = {}
  ): AsyncGenerator<ThreadEvent> {
    const { threadId, abortController } = options;

    const altModelConfig = await this.loadAlternativeModelConfig(projectDir);
    const apiKey = altModelConfig?.token || this.config.openAiApiKey;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured. Set it in .env or project .etienne/ai-model.json');
    }
    const model = altModelConfig?.model || this.config.defaultModel;
    const baseUrl = altModelConfig?.baseUrl;

    const projectRoot = safeRoot(this.config.hostRoot, projectDir);

    this.logger.log(`Starting Codex (typed SDK): project=${projectDir}, cwd=${projectRoot}, thread=${threadId || 'new'}, model=${model}`);

    const Codex = await loadCodex();
    const codex = new Codex({
      codexPathOverride: this.config.codexBinaryPath,
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    });

    const threadOptions = {
      model,
      sandboxMode: this.config.sandboxMode,
      workingDirectory: projectRoot,
      // Approval flow is no longer interactive — 'never' lets the sandbox be the
      // sole safety boundary. Restoring user-in-the-loop approvals requires either
      // a future SDK callback or reviving the app-server JSON-RPC path.
      approvalPolicy: 'never' as const,
      skipGitRepoCheck: true,
    };

    const thread = threadId
      ? codex.resumeThread(threadId, threadOptions)
      : codex.startThread(threadOptions);

    const { events } = await thread.runStreamed(prompt, {
      ...(abortController ? { signal: abortController.signal } : {}),
    });

    try {
      for await (const event of events) {
        yield event;
      }
      this.logger.log(`Codex conversation completed for project: ${projectDir}`);
    } catch (error: any) {
      if (abortController?.signal.aborted) {
        this.logger.log(`Codex conversation aborted for project: ${projectDir}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Load alternative AI model configuration from .etienne/ai-model.json
   */
  private async loadAlternativeModelConfig(projectDir: string): Promise<any | null> {
    const root = safeRoot(this.config.hostRoot, projectDir);
    const aiModelConfigPath = join(root, '.etienne', 'ai-model.json');
    try {
      const content = await fs.readFile(aiModelConfigPath, 'utf8');
      const config = JSON.parse(content);
      if (config.isActive && config.model && config.baseUrl && config.token) {
        this.logger.log(`Loaded alternative AI model config: ${config.model} @ ${config.baseUrl}`);
        return config;
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(`Failed to load alternative model config: ${error.message}`);
      }
    }
    return null;
  }
}
