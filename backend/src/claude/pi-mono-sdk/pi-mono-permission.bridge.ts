import { Logger } from '@nestjs/common';
import { SdkPermissionService } from '../sdk/sdk-permission.service';
import { ContextInterceptorService } from '../../contexts/context-interceptor.service';
import { MessageEvent } from '../types';

/**
 * Bridges pi-agent-core's `beforeToolCall` hook to the existing SdkPermissionService.
 *
 * pi-mono has no native permission UI — it expects the host to gate tool calls via
 * `beforeToolCall`. We route every tool call through the same service the Anthropic
 * harness uses, so the frontend sees identical `permission_request` SSE events and
 * users answer with the same dialogs.
 *
 * Returns a hook function with the shape pi-agent-core expects:
 *   (toolCall) => { allowed: boolean; updatedArgs?: any; reason?: string }
 */
export function createPiMonoPermissionHook(opts: {
  logger: Logger;
  permissionService: SdkPermissionService;
  contextInterceptor?: ContextInterceptorService;
  projectName: string;
  sessionId?: string;
  requireAllPermissions: boolean;
  emit: (ev: MessageEvent) => void;
}) {
  const { logger, permissionService, contextInterceptor, projectName, sessionId, requireAllPermissions, emit } = opts;
  const canUseTool = permissionService.createCanUseToolCallback(
    projectName,
    sessionId,
    requireAllPermissions,
  );

  return async function beforeToolCall(toolCall: { name: string; args?: any; id?: string }) {
    // Context interceptor gate — runs before the user permission dialog so context
    // violations short-circuit without prompting the user at all.
    if (contextInterceptor && sessionId) {
      try {
        const check = await contextInterceptor.validateToolUse(
          projectName,
          sessionId,
          toolCall.name,
          toolCall.args ?? {},
        );
        if (!check.allowed) {
          return { allowed: false, reason: check.reason ?? 'Blocked by active context' };
        }
      } catch (err: any) {
        logger.warn(`pi-mono context validation failed for ${toolCall.name}: ${err?.message}`);
      }
    }

    try {
      emit({
        type: 'permission_request',
        data: {
          permissionId: toolCall.id ?? '',
          message: `Permission requested for ${toolCall.name}`,
        },
      });

      const result = await canUseTool(toolCall.name, toolCall.args ?? {}, {
        signal: new AbortController().signal,
      });

      if (result.behavior === 'allow') {
        return { allowed: true, updatedArgs: result.updatedInput };
      }
      return { allowed: false, reason: result.message || 'Denied by user' };
    } catch (err: any) {
      logger.error(`pi-mono permission bridge failed for ${toolCall.name}: ${err?.message}`);
      return { allowed: false, reason: `Permission bridge error: ${err?.message}` };
    }
  };
}
