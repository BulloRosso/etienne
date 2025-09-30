import { ClaudeEvent, Usage } from '../types';

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

export function createJsonLineParser(
  onText: (text: string) => void,
  onJson: (evt: ClaudeEvent) => void
): (chunk: string) => void {
  let buf = '';

  return (chunk: string) => {
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
}
