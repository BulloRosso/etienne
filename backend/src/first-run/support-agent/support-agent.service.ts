import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as path from 'path';
import { ClaudeSdkService } from '../../claude/sdk/claude-sdk.service';
import { SdkPermissionService } from '../../claude/sdk/sdk-permission.service';
import { ClaudeConfig } from '../../claude/config/claude.config';
import { SecretsManagerService } from '../../secrets-manager/secrets-manager.service';
import { MessageEvent } from '../../claude/types';
import { DiagnosticsReport } from '../types';
import { SUPPORT_AGENT_SYSTEM_PROMPT, buildContextMessage, buildFixItNowMessage } from './support-agent.prompts';
import { createSupportAgentCanUseTool } from './support-agent.policy';

/**
 * Bridges first-run support sessions into the Claude Agent SDK.
 *
 * The session runs with cwd = repoRoot (NOT a user project) so it can read repo config
 * (scripts/install.*, .env files) but the policy callback hard-rejects any path under
 * WORKSPACE_ROOT. There is no project-level CLAUDE.md to interfere — we inject the
 * system prompt directly into the SDK query.
 */
@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger(SupportAgentService.name);
  private readonly config: ClaudeConfig;

  constructor(
    private readonly claudeSdkService: ClaudeSdkService,
    private readonly sdkPermissionService: SdkPermissionService,
    private readonly secretsManager: SecretsManagerService,
  ) {
    this.config = new ClaudeConfig(secretsManager);
  }

  async onModuleInit() {
    await this.config.initSecrets();
  }

  /**
   * Run a support session. Phase 1 emits a structured plan (no tool writes).
   * Phase 2 (apply) is launched with `applyItemId` and uses the policy callback
   * to gate every Write/Edit/Bash call.
   */
  startSession(
    report: DiagnosticsReport,
    options: { applyItemId?: string; userPrompt?: string } = {},
  ): Observable<MessageEvent> {
    const processId = `support_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return new Observable<MessageEvent>((observer) => {
      observer.next({ data: { kind: 'session', process_id: processId } } as any);
      this.runSession(observer, report, processId, options).catch((err) => {
        this.logger.error(`Support session failed: ${err.message}`, err.stack);
        observer.next({ data: { kind: 'error', message: err.message } } as any);
        observer.complete();
      });
      return () => {
        /* unsubscribe noop */
      };
    });
  }

  private async runSession(
    observer: any,
    report: DiagnosticsReport,
    processId: string,
    options: { applyItemId?: string; userPrompt?: string },
  ) {
    const repoRoot = path.resolve(__dirname, '../../../..'); // backend/src/first-run/support-agent → repo root
    const workspaceRoot = this.config.hostRoot;
    const allowedWritePaths = [
      path.join(repoRoot, 'backend', '.env'),
      path.join(repoRoot, 'oauth-server', '.env'),
    ];

    const phase: 'plan' | 'apply' = options.applyItemId ? 'apply' : 'plan';

    const canUseTool = createSupportAgentCanUseTool({
      workspaceRoot,
      repoRoot,
      allowedWritePaths,
      sdkPermissionService: this.sdkPermissionService,
      projectName: '__first_run_support__',
    });

    let userMessage: string;
    if (phase === 'plan') {
      userMessage = buildContextMessage(report);
    } else {
      // Apply phase: locate the targeted check by id and build a focused fix-it-now message.
      const target = report.checks.find((c) => c.id === options.applyItemId);
      if (!target) {
        observer.next({
          data: {
            kind: 'error',
            message: `Cannot fix: no check with id "${options.applyItemId}" in the current report. Re-run diagnostics and try again.`,
          },
        } as any);
        observer.complete();
        return;
      }
      userMessage = buildFixItNowMessage(target, report);
      if (options.userPrompt) {
        userMessage += `\n\nAdditional user instruction: ${options.userPrompt}`;
      }
    }

    // The SDK's streamConversation derives cwd from projectDir via safeRoot(hostRoot, ...).
    // For first-run, we want cwd at repoRoot. Easiest path: call query() directly here
    // rather than reusing streamConversation. We'll re-load the SDK on our own.
    const sdk = await this.loadSdk();

    const queryOptions: any = {
      model: process.env.SUPPORT_AGENT_MODEL || 'claude-sonnet-4-6',
      cwd: repoRoot,
      systemPrompt: SUPPORT_AGENT_SYSTEM_PROMPT,
      // 'default' mode for both phases: there is no separate planning UI. The agent
      // either lays out a plan in text (phase: plan) or executes directly (phase: apply).
      permissionMode: 'default',
      // Explicitly exclude AskUserQuestion and ExitPlanMode — there is no chat input
      // in the first-run UI to answer them, so they would just hang the session.
      allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'],
      disallowedTools: ['AskUserQuestion', 'ExitPlanMode'],
      maxTurns: phase === 'plan' ? 6 : 30,
      includePartialMessages: true,
      canUseTool,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY:
          (await this.secretsManager.getSecret('ANTHROPIC_API_KEY')) || process.env.ANTHROPIC_API_KEY,
      },
    };

    this.logger.log(`Starting first-run support session (processId=${processId}, phase=${phase})`);

    let streamedAnyText = false;
    try {
      for await (const sdkMessage of sdk.query({ prompt: userMessage, options: queryOptions })) {
        // Forward a minimal subset of SDK messages. Mirrors ClaudeSdkOrchestratorService at a high level
        // but without all the budget/memory/context plumbing we don't need here.
        const t = sdkMessage?.type;
        if (t === 'stream_event') {
          const ev = (sdkMessage as any).event;
          if (ev?.type === 'content_block_delta' && ev?.delta?.type === 'text_delta') {
            streamedAnyText = true;
            observer.next({ data: { kind: 'stdout', chunk: ev.delta.text } } as any);
          }
          continue;
        }
        if (t === 'system' && (sdkMessage as any).subtype === 'init') {
          observer.next({ data: { kind: 'session', session_id: (sdkMessage as any).session_id } } as any);
          continue;
        }
        if (sdkMessage?.message?.content) {
          const content = (sdkMessage as any).message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                observer.next({
                  data: { kind: 'tool', toolName: block.name, status: 'running', callId: block.id, input: block.input },
                } as any);
              }
            }
          }
        }
        if (t === 'result') {
          const isError = (sdkMessage as any).is_error === true;
          const text = (sdkMessage as any).result;
          if (isError && text) {
            observer.next({ data: { kind: 'error', message: text } } as any);
          } else if (text && !streamedAnyText) {
            // Only emit the result text if we did NOT already stream it via content_block_delta —
            // otherwise the frontend shows the agent's final answer twice.
            observer.next({ data: { kind: 'stdout', chunk: text } } as any);
          }
          observer.next({ data: { kind: 'completed', phase } } as any);
          break;
        }
      }
      observer.complete();
    } catch (err: any) {
      this.logger.error(`Support agent SDK stream error: ${err.message}`, err.stack);
      observer.next({ data: { kind: 'error', message: err.message } } as any);
      observer.complete();
    }
  }

  private async loadSdk(): Promise<any> {
    // Mirror ClaudeSdkService's dynamic ESM import.
    const dynamicImport = new Function('s', 'return import(s)');
    return dynamicImport('@anthropic-ai/claude-agent-sdk');
  }
}
