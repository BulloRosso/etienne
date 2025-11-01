import { ClaudeEvent, Usage, StructuredEvent } from '../types';

export function extractText(evt: ClaudeEvent): string {
  if (typeof evt.delta === 'string') return evt.delta;
  if (typeof evt.delta === 'object' && evt.delta?.text) return evt.delta.text;
  if (typeof evt.partial_text === 'string') return evt.partial_text;
  if (typeof evt.text === 'string') return evt.text;
  if (typeof evt.message?.delta === 'string') return evt.message.delta;

  const blocks = Array.isArray(evt.message?.content) ? evt.message.content
               : Array.isArray(evt.content) ? evt.content
               : null;
  if (blocks) {
    for (const b of blocks) {
      if (typeof b?.text === 'string') return b.text;
      if (typeof b?.delta === 'string') return b.delta;
      if (b?.delta?.text) return b.delta.text;
    }
  }
  if (typeof evt.content === 'object' && evt.content?.text) return evt.content.text;
  return '';
}

export function parseSession(evt: ClaudeEvent): { sessionId?: string; model?: string } {
  const sessionId = evt.session_id ?? evt.sessionId ?? evt.session?.id ?? evt.meta?.session_id;
  const model = evt.model ?? evt.meta?.model;
  return { sessionId: sessionId ? String(sessionId) : undefined, model };
}

export function parseUsage(evt: ClaudeEvent, currentUsage: Usage): Usage | null {
  const u = evt.usage ?? evt.token_usage ?? evt.metrics;
  if (!u) return null;

  const model = evt.model ?? evt.meta?.model ?? currentUsage.model;
  return {
    model,
    input_tokens: u.input_tokens ?? u.input ?? currentUsage.input_tokens,
    output_tokens: u.output_tokens ?? u.output ?? currentUsage.output_tokens,
    total_tokens: u.total_tokens ?? (
      (u.input_tokens != null && u.output_tokens != null)
        ? (u.input_tokens + u.output_tokens)
        : currentUsage.total_tokens
    ),
  };
}

// Structured event parser for Claude Code output
export class ClaudeCodeStructuredParser {
  private activeToolCalls = new Map<string, { toolName: string; args: any; startTime: number }>();
  private activeSubagents = new Map<string, { startTime: number }>();
  private pendingPermissions = new Map<string, { message: string; timestamp: number; resolved: boolean }>();

  parseLine(line: string): StructuredEvent | null {
    // Note: Claude Code actual output patterns may vary
    // This parser attempts to detect common patterns from Claude Code stdout

    // Skip empty lines
    if (!line.trim()) return null;

    // User message/response (plain text without special markers)
    // We'll only treat it as a user_message if it doesn't match any other pattern
    const isPlainText = !line.startsWith('[') && line.trim();

    // Tool calls - format: [TOOL_CALL] tool_name(args)
    const toolCallMatch = line.match(/\[TOOL_CALL\]\s+(\w+)\((.*)\)/);
    if (toolCallMatch) {
      const [, toolName, argsStr] = toolCallMatch;
      let args: any = {};
      try {
        args = JSON.parse(argsStr || '{}');
      } catch {
        args = { raw: argsStr };
      }

      const callId = `${toolName}_${Date.now()}`;
      this.activeToolCalls.set(callId, { toolName, args, startTime: Date.now() });

      return {
        type: 'tool_call',
        toolName,
        args,
        status: 'running',
        callId,
      };
    }

    // Tool results - format: [TOOL_RESULT] result_data
    const toolResultMatch = line.match(/\[TOOL_RESULT\]\s+(.*)/);
    if (toolResultMatch) {
      const [, result] = toolResultMatch;
      const lastCall = Array.from(this.activeToolCalls.entries()).pop();

      if (lastCall) {
        const [callId, callData] = lastCall;
        this.activeToolCalls.delete(callId);

        return {
          type: 'tool_call',
          toolName: callData.toolName,
          args: callData.args,
          status: 'complete',
          result,
          callId,
        };
      }
    }

    // Permission requests - format: [PERMISSION_REQUIRED] message
    const permissionMatch = line.match(/\[PERMISSION_REQUIRED\]\s+(.*)/);
    if (permissionMatch) {
      const [, message] = permissionMatch;
      const permissionId = `perm_${Date.now()}`;

      this.pendingPermissions.set(permissionId, {
        message,
        timestamp: Date.now(),
        resolved: false,
      });

      return {
        type: 'permission_request',
        permissionId,
        message,
      };
    }

    // Errors - format: [ERROR] error_message
    const errorMatch = line.match(/\[ERROR\]\s+(.*)/);
    if (errorMatch) {
      // Return as user_message with error context
      return {
        type: 'user_message',
        content: `Error: ${errorMatch[1]}`,
        timestamp: new Date().toISOString(),
      };
    }

    // Subagent start - format: [SUBAGENT_START] name
    const subagentStartMatch = line.match(/\[SUBAGENT_START\]\s+(.*)/);
    if (subagentStartMatch) {
      const name = subagentStartMatch[1];
      this.activeSubagents.set(name, { startTime: Date.now() });

      return {
        type: 'subagent_start',
        name,
        status: 'active',
      };
    }

    // Subagent end - format: [SUBAGENT_END] name
    const subagentEndMatch = line.match(/\[SUBAGENT_END\]\s+(.*)/);
    if (subagentEndMatch) {
      const name = subagentEndMatch[1];
      this.activeSubagents.delete(name);

      return {
        type: 'subagent_end',
        name,
        status: 'complete',
      };
    }

    // Thinking blocks - format: [THINKING] content
    const thinkingMatch = line.match(/\[THINKING\]\s+(.*)/);
    if (thinkingMatch) {
      return {
        type: 'thinking',
        content: thinkingMatch[1],
      };
    }

    // Plain text as user message (if it wasn't matched by any pattern above)
    if (isPlainText) {
      return {
        type: 'user_message',
        content: line,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  parseChunk(chunk: string): StructuredEvent[] {
    const lines = chunk.split('\n');
    const events: StructuredEvent[] = [];

    for (const line of lines) {
      const event = this.parseLine(line.trim());
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  resolvePermission(permissionId: string, approved: boolean): boolean {
    const perm = this.pendingPermissions.get(permissionId);
    if (perm && !perm.resolved) {
      perm.resolved = true;
      return true;
    }
    return false;
  }
}

export function createJsonLineParser(
  onText: (text: string) => void,
  onJson: (evt: ClaudeEvent) => void
): { flushLines: (chunk: string) => void; flush: () => void } {
  let buf = '';

  const flushLines = (chunk: string) => {
    buf += chunk;
    for (;;) {
      const idx = buf.indexOf('\n');
      if (idx < 0) break;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed[0] !== '{') {
        onText(trimmed + '\n');
        continue;
      }
      try {
        onJson(JSON.parse(trimmed));
      } catch {
        onText(trimmed + '\n');
      }
    }
  };

  const flush = () => {
    if (buf.trim()) {
      onText(buf);
      buf = '';
    }
  };

  return { flushLines, flush };
}
