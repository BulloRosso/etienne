import type { MessageEvent } from '../types';
import type { AppServerNotification } from './codex-sdk.service';

/**
 * Transforms Codex app-server notifications into the SSE MessageEvent format
 * that the frontend expects. Maintains compatibility with the existing
 * Anthropic SDK event protocol.
 *
 * App-server notification methods:
 *   thread/started                        → session
 *   turn/started                          → (internal — store turnId)
 *   item/agentMessage/delta               → stdout (true delta)
 *   item/started                          → tool (status: running)
 *   item/completed                        → tool / file_added / file_changed / stdout
 *   item/commandExecution/outputDelta     → (optional — live command output)
 *   thread/tokenUsage/updated             → (internal — track usage)
 *   turn/completed                        → usage + completed
 *   error                                 → error
 *
 * Item types are camelCase: agentMessage, commandExecution, fileChange,
 * mcpToolCall, webSearch, reasoning, contextCompaction
 */
export class CodexMessageTransformer {

  /**
   * Transform a single app-server notification into zero or more SSE MessageEvents.
   * Returns an array because some notifications (e.g. turn/completed) map to multiple SSE events.
   */
  static transform(notification: AppServerNotification, model?: string): MessageEvent[] {
    switch (notification.method) {
      case 'thread/started':
        return [{
          type: 'session',
          data: {
            session_id: notification.params?.thread?.id,
            model: model || 'codex',
          }
        }];

      case 'turn/started':
        // No SSE equivalent — orchestrator stores turnId internally
        return [];

      case 'item/agentMessage/delta':
        if (notification.params?.delta) {
          const chunk = CodexMessageTransformer.stripCitations(notification.params.delta);
          return chunk ? [{ type: 'stdout', data: { chunk } }] : [];
        }
        return [];

      case 'item/started':
        return CodexMessageTransformer.transformItemStarted(notification.params?.item);

      case 'item/completed':
        return CodexMessageTransformer.transformItemCompleted(notification.params?.item);

      case 'turn/completed':
        return CodexMessageTransformer.transformTurnCompleted(notification, model);

      case 'error':
        return [{
          type: 'error',
          data: {
            message: notification.params?.message || 'Unknown error',
            recoverable: false
          }
        }];

      default:
        return [];
    }
  }

  /**
   * Handle item/started — emit "running" indicators for tool-like items
   */
  private static transformItemStarted(item: any): MessageEvent[] {
    if (!item) return [];

    if (item.type === 'commandExecution') {
      return [{
        type: 'tool',
        data: {
          toolName: 'Bash',
          status: 'running',
          callId: item.id,
          input: { command: item.command || '' }
        }
      }];
    }

    if (item.type === 'fileChange') {
      const firstPath = item.changes?.[0]?.path || '';
      return [{
        type: 'tool',
        data: {
          toolName: 'Edit',
          status: 'running',
          callId: item.id,
          input: { file_path: firstPath }
        }
      }];
    }

    if (item.type === 'webSearch') {
      return [{
        type: 'tool',
        data: {
          toolName: 'WebSearch',
          status: 'running',
          callId: item.id,
          input: { query: item.query }
        }
      }];
    }

    return [];
  }

  /**
   * Handle item/completed — map to tool events, file events, or text
   */
  private static transformItemCompleted(item: any): MessageEvent[] {
    if (!item) return [];
    const events: MessageEvent[] = [];

    switch (item.type) {
      case 'agentMessage':
        // Final agent message text — orchestrator handles persistence
        break;

      case 'commandExecution':
        events.push({
          type: 'tool',
          data: {
            toolName: 'Bash',
            status: 'complete',
            callId: item.id,
            input: { command: item.command },
            result: item.aggregatedOutput || `Exit code: ${item.exitCode ?? 'unknown'}`
          }
        });
        break;

      case 'fileChange':
        if (item.changes && Array.isArray(item.changes)) {
          for (const change of item.changes) {
            if (change.kind === 'add') {
              events.push({ type: 'file_added', data: { path: change.path } });
            } else {
              events.push({ type: 'file_changed', data: { path: change.path } });
            }
          }
          const filePaths = item.changes.map((c: any) => c.path);
          const primaryPath = filePaths[0] || '';
          events.push({
            type: 'tool',
            data: {
              toolName: 'Edit',
              status: 'complete',
              callId: item.id,
              input: { file_path: primaryPath },
              result: item.changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n')
            }
          });
        }
        break;

      case 'mcpToolCall':
        events.push({
          type: 'tool',
          data: {
            toolName: `mcp__${item.server}__${item.tool}`,
            status: 'complete',
            callId: item.id,
            input: item.arguments,
            result: item.error?.message || JSON.stringify(item.result || '')
          }
        });
        break;

      case 'webSearch':
        events.push({
          type: 'tool',
          data: {
            toolName: 'WebSearch',
            status: 'complete',
            callId: item.id,
            input: { query: item.query },
            result: 'Search completed'
          }
        });
        break;

      case 'reasoning': {
        const summaryText = Array.isArray(item.summary) ? item.summary.join('\n') : '';
        const contentText = Array.isArray(item.content) ? item.content.join('\n') : '';
        const text = summaryText || contentText;
        if (text) {
          events.push({ type: 'thinking' as any, data: { content: text } });
        }
        break;
      }

      case 'contextCompaction':
        // Context was compacted — informational only
        break;
    }

    return events;
  }

  /**
   * Handle turn/completed — emit usage and completed events
   */
  private static transformTurnCompleted(notification: AppServerNotification, model?: string): MessageEvent[] {
    const events: MessageEvent[] = [];
    const turn = notification.params?.turn;

    if (turn?.status === 'failed') {
      events.push({
        type: 'error',
        data: {
          message: turn.error?.message || 'Turn failed',
          recoverable: false
        }
      });
    }

    // Note: usage is tracked via thread/tokenUsage/updated notifications,
    // not from turn/completed. The orchestrator accumulates usage separately.
    events.push({
      type: 'completed',
      data: {
        exitCode: turn?.status === 'failed' ? 1 : 0,
      }
    });

    return events;
  }

  /**
   * Extract the final response text from a completed item
   */
  static extractAgentText(item: any): string | null {
    if (item?.type === 'agentMessage' && item.text) {
      return CodexMessageTransformer.stripCitations(item.text);
    }
    return null;
  }

  /**
   * Strip leaked OpenAI citation tokens from Codex output.
   * Removes "citeturn0search0" style markers and Unicode private-use wrappers.
   */
  static stripCitations(text: string): string {
    if (!text) return text;
    let cleaned = text.replace(/[\ue200\ue201\ue202]/g, '');
    cleaned = cleaned.replace(/citeturn\d+(?:search|open|news|file)\d+/g, '');
    return cleaned;
  }
}
