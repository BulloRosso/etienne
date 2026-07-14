import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SdkHookEmitterService } from '../sdk/sdk-hook-emitter.service';
import { normalizeOpenCodeToolName } from './opencode-tool-name.util';

/**
 * Receives tool-execution callbacks from the provisioned OpenCode plugin
 * (`.opencode/plugin/etienne-hooks.js`, written by the hook-plugin
 * provisioner) and translates them into the same PreToolUse / PostToolUse
 * interceptor events the Claude Agent SDK path emits via its native hooks.
 *
 * Auth model: the plugin file embeds a per-boot shared secret. A backend
 * restart rotates the token AND kills the embedded OpenCode server, so a
 * stale plugin file is re-provisioned on the next run — there is no
 * stale-token window.
 */
@Injectable()
export class OpenCodeHookBridgeService {
  private readonly logger = new Logger(OpenCodeHookBridgeService.name);

  /** Per-boot shared secret embedded into the provisioned plugin file. */
  readonly token = randomBytes(24).toString('hex');

  /** Window after which a silent plugin is considered inactive (fallback kicks in). */
  private static readonly ACTIVE_WINDOW_MS = 10 * 60 * 1000;

  private readonly lastSeen = new Map<string, number>();

  constructor(private readonly hookEmitter: SdkHookEmitterService) {}

  /** Record that the plugin for a project is alive (called on every callback). */
  markSeen(projectDir: string): void {
    this.lastSeen.set(projectDir, Date.now());
  }

  /**
   * Whether the plugin bridge has phoned home recently for this project.
   * Used by the orchestrator to suppress its event-derived fallback emissions
   * so tool events are not duplicated when the plugin is active.
   */
  isActive(projectDir: string): boolean {
    const seen = this.lastSeen.get(projectDir);
    return seen !== undefined && Date.now() - seen < OpenCodeHookBridgeService.ACTIVE_WINDOW_MS;
  }

  handle(projectDir: string, body: any): void {
    const kind = body?.kind;
    switch (kind) {
      case 'plugin_init':
        this.logger.debug(`OpenCode hook plugin loaded for ${projectDir} (${body?.directory ?? 'unknown dir'})`);
        return;

      case 'pre_tool_use':
        this.hookEmitter.emitPreToolUse(projectDir, {
          tool_name: normalizeOpenCodeToolName(body?.tool),
          tool_input: body?.args,
          call_id: body?.callID,
          session_id: body?.sessionID,
        });
        return;

      case 'post_tool_use':
        this.hookEmitter.emitPostToolUse(projectDir, {
          tool_name: normalizeOpenCodeToolName(body?.tool),
          tool_output: {
            title: body?.title,
            output: body?.output,
            metadata: body?.metadata,
          },
          call_id: body?.callID,
          session_id: body?.sessionID,
        });
        return;

      default:
        this.logger.warn(`Unknown OpenCode hook kind '${kind}' for ${projectDir}`);
    }
  }
}
