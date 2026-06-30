import { Logger } from '@nestjs/common';
import { PiAgentTool } from './mcp-bridge.extension';

/**
 * Minimal structural type for a pi-coding-agent 0.80.2 `ToolDefinition`. We don't
 * import the real type (the package is ESM-only and loaded via dynamic import at
 * runtime), so this captures just the fields we populate. pi accepts a TypeBox
 * schema for `parameters`; JSON Schema objects are structurally compatible for the
 * shapes our tools use (object/string/enum).
 */
export interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: any;
  execute: (
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: ((update: any) => void) | undefined,
    ctx: any,
  ) => Promise<PiAgentToolResult>;
}

export interface PiAgentToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: unknown;
}

/**
 * Adapt our simple `PiAgentTool` (`{name, description, parameters, execute(args)}`)
 * to pi 0.80.2's `ToolDefinition` (execute(toolCallId, params, signal, onUpdate, ctx)
 * returning an `AgentToolResult`). Used for MCP-bridge tools and the subagent Task tool.
 */
export function toPiToolDefinition(tool: PiAgentTool, logger?: Logger): PiToolDefinition {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters ?? { type: 'object', properties: {} },
    execute: async (_toolCallId, params) => {
      try {
        const raw = await tool.execute(params ?? {});
        return { content: toContent(raw), details: raw };
      } catch (err: any) {
        logger?.warn(`pi-mono tool ${tool.name} failed: ${err?.message}`);
        return { content: [{ type: 'text', text: `Error: ${err?.message}` }], details: undefined };
      }
    },
  };
}

/** Coerce an arbitrary tool return value into pi content blocks. */
function toContent(raw: any): Array<{ type: 'text'; text: string }> {
  if (raw == null) return [{ type: 'text', text: '' }];
  if (typeof raw === 'string') return [{ type: 'text', text: raw }];
  // MCP tool results are often { content: [{ type, text }] } — flatten text parts.
  if (Array.isArray(raw?.content)) {
    const text = raw.content
      .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
      .join('\n');
    return [{ type: 'text', text }];
  }
  return [{ type: 'text', text: JSON.stringify(raw) }];
}
