import { Logger } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { SubagentsService, SubagentConfig } from '../../subagents/subagents.service';
import { MessageEvent } from '../types';
import { piEventToMessageEvents, PiEvent } from './pi-mono-event-adapter';
import { PiAgentTool } from './mcp-bridge.extension';
import { toPiToolDefinition, PiToolDefinition } from './pi-tool-adapter';
import { PiModelConfig, resolveModel, resolveModelId } from './pi-model-resolver';

const MAX_SUBAGENT_DEPTH = 2;
const SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Translates Anthropic-format subagent definitions (.claude/agents/*.md) into a pi
 * `Task` tool that the main agent calls like Claude Code's native subagent tool.
 *
 * Rewritten for pi-coding-agent 0.80.2: nested sessions use `createAgentSession`
 * with a `DefaultResourceLoader({ extensionFactories: [...] })` carrying a minimal
 * child extension that registers the filtered tool set and forwards events. The
 * subagent's system prompt is injected as the first message (0.80.2 has no
 * `systemPrompt` option on createAgentSession; the resource loader owns the system
 * prompt, so we prepend the role to the task prompt).
 *
 * Recursion is capped at MAX_SUBAGENT_DEPTH; a timeout kills runaway subagents.
 */

export interface SubagentToolOpts {
  logger: Logger;
  subagentsService: SubagentsService;
  projectDir: string;
  parentProcessId: string;
  /** The parent's custom tools (MCP bridge etc.) the child may inherit. */
  parentTools: PiAgentTool[];
  /** Dynamically-imported `@earendil-works/pi-coding-agent` module. */
  piModule: any;
  /** Dynamically-imported `@earendil-works/pi-ai/compat` module (for getModel). */
  piAi: any;
  modelConfig?: PiModelConfig;
  projectRoot: string;
  emit: (ev: MessageEvent) => void;
  depth?: number;
  /** Track nested sessions here so the parent can abort them. */
  nestedSessions: Map<string, { abort?: () => void | Promise<void> }>;
}

export async function buildSubagentTool(opts: SubagentToolOpts): Promise<PiAgentTool | null> {
  const { logger, subagentsService, projectDir } = opts;
  const depth = opts.depth ?? 0;

  if (depth >= MAX_SUBAGENT_DEPTH) {
    logger.debug(`pi-mono subagent: depth ${depth} >= max ${MAX_SUBAGENT_DEPTH}, not registering Task tool`);
    return null;
  }

  let subagents: SubagentConfig[];
  try {
    subagents = await subagentsService.listSubagents(projectDir);
  } catch (err: any) {
    logger.warn(`pi-mono subagent: failed to list subagents for ${projectDir}: ${err?.message}`);
    return null;
  }

  if (subagents.length === 0) {
    logger.debug(`pi-mono subagent: no subagents defined in ${projectDir}, skipping Task tool`);
    return null;
  }

  const subagentNames = subagents.map(s => s.name);
  const subagentIndex = new Map(subagents.map(s => [s.name, s]));
  const subagentDescriptions = subagents.map(s => `- **${s.name}**: ${s.description}`).join('\n');

  return {
    name: 'Task',
    description:
      `Delegate a focused sub-task to a specialized subagent that runs in an isolated session. ` +
      `Use when the task benefits from a separate context (research, review, file survey, etc.).\n\n` +
      `Available subagents:\n${subagentDescriptions}`,
    parameters: {
      type: 'object',
      required: ['description', 'prompt'],
      properties: {
        description: { type: 'string', description: 'Short description of the task to delegate.' },
        prompt: { type: 'string', description: 'Self-contained task description for the subagent.' },
        subagent_type: {
          type: 'string',
          enum: subagentNames,
          description: `Which subagent to use. One of: ${subagentNames.join(', ')}`,
        },
      },
    },
    execute: async (args: any) => {
      const subagentName = args.subagent_type || subagentNames[0];
      const taskPrompt: string = args.prompt || args.description || '';
      const config = subagentIndex.get(subagentName);

      if (!config) {
        return { error: `Unknown subagent: ${subagentName}. Available: ${subagentNames.join(', ')}` };
      }

      const callId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      opts.emit({ type: 'subagent_start', data: { name: config.name, status: 'active', callId, parentProcessId: opts.parentProcessId } });

      try {
        const result = await runNestedSession({ ...opts, config, taskPrompt, callId, depth: depth + 1 });
        opts.emit({ type: 'subagent_end', data: { name: config.name, status: 'complete', callId, content: result.text } });
        return result.text || '(subagent returned no text)';
      } catch (err: any) {
        opts.emit({ type: 'subagent_end', data: { name: config.name, status: 'complete', callId, content: `Error: ${err?.message}` } });
        return `Subagent error: ${err?.message}`;
      }
    },
  };
}

interface NestedRunOpts extends SubagentToolOpts {
  config: SubagentConfig;
  taskPrompt: string;
  callId: string;
  depth: number;
}

async function runNestedSession(opts: NestedRunOpts): Promise<{ text: string }> {
  const {
    logger, piModule, piAi, config, taskPrompt, callId,
    parentTools, modelConfig, projectRoot, emit, nestedSessions, depth,
  } = opts;

  const createAgentSession = piModule.createAgentSession ?? piModule.default?.createAgentSession;
  const DefaultResourceLoader = piModule.DefaultResourceLoader ?? piModule.default?.DefaultResourceLoader;
  const SessionManager = piModule.SessionManager ?? piModule.default?.SessionManager;

  if (typeof createAgentSession !== 'function') {
    throw new Error('pi-mono: createAgentSession not available for nested session');
  }

  // Filter the parent's tools to the subagent's allowlist, then adapt to pi tools.
  const childTools = filterToolsForSubagent(parentTools, config.tools);

  // Recursively expose a child Task tool (null at depth cap).
  const childTaskTool = await buildSubagentTool({ ...opts, depth });
  if (childTaskTool) childTools.push(childTaskTool);

  const childToolDefs: PiToolDefinition[] = childTools.map(t => toPiToolDefinition(t, logger));

  // Resolve the model — honour the subagent's override, else inherit parent.
  const resolvedModel = resolveModel(piAi, {
    ...modelConfig,
    model: resolveModelId(config.model, modelConfig?.model),
  });

  let assistantText = '';

  // Minimal child extension: register tools + forward events to the parent observer.
  const childExtension = (pi: any) => {
    for (const tool of childToolDefs) {
      try { pi.registerTool(tool); } catch (err: any) { logger.warn(`pi-mono subagent registerTool failed: ${err?.message}`); }
    }
    pi.on('message_update', (ev: any) => {
      const ame = ev?.assistantMessageEvent;
      if (ame?.type === 'text_delta' && typeof ame.delta === 'string') {
        assistantText += ame.delta;
        for (const m of forward({ type: 'text_delta', delta: ame.delta })) emit(m);
      } else if (ame?.type === 'thinking_delta' && typeof ame.delta === 'string') {
        for (const m of forward({ type: 'thinking_delta', delta: ame.delta })) emit(m);
      }
    });
    pi.on('tool_execution_start', (ev: any) => {
      for (const m of forward({ type: 'tool_execution_start', toolCallId: ev?.toolCallId, toolName: ev?.toolName, args: ev?.args })) emit(m);
    });
    pi.on('tool_execution_end', (ev: any) => {
      for (const m of forward({ type: 'tool_execution_end', toolCallId: ev?.toolCallId, toolName: ev?.toolName, result: ev?.result, isError: ev?.isError })) emit(m);
    });
  };
  const forward = (ev: PiEvent): MessageEvent[] => piEventToMessageEvents(ev, { processId: callId });

  const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
  const resourceLoader = DefaultResourceLoader
    ? new DefaultResourceLoader({
        cwd: projectRoot,
        agentDir,
        extensionFactories: [childExtension],
        // Subagent role is its system prompt; suppress project skills/themes for isolation.
        systemPrompt: config.systemPrompt || undefined,
        noSkills: true,
        noThemes: true,
      })
    : undefined;
  if (resourceLoader?.reload) {
    try { await resourceLoader.reload(); } catch (err: any) { logger.debug(`pi-mono subagent resourceLoader reload failed: ${err?.message}`); }
  }

  const { session } = await createAgentSession({
    cwd: projectRoot,
    sessionManager: SessionManager?.inMemory ? SessionManager.inMemory(projectRoot) : undefined,
    model: resolvedModel,
    resourceLoader,
  });

  nestedSessions.set(callId, session);

  const fullPrompt = taskPrompt;

  return new Promise<{ text: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { session.abort?.(); } catch { /* ignore */ }
      nestedSessions.delete(callId);
      reject(new Error(`Subagent ${config.name} timed out after ${SUBAGENT_TIMEOUT_MS / 1000}s`));
    }, SUBAGENT_TIMEOUT_MS);

    const unsubscribe = session.subscribe?.((ev: any) => {
      try {
        if (ev?.type === 'agent_end') {
          clearTimeout(timeout);
          nestedSessions.delete(callId);
          if (typeof unsubscribe === 'function') unsubscribe();
          resolve({ text: assistantText });
        }
      } catch (err: any) {
        logger.error(`pi-mono nested event handler error: ${err?.message}`);
      }
    });

    session.prompt(fullPrompt).catch((err: any) => {
      clearTimeout(timeout);
      nestedSessions.delete(callId);
      reject(err);
    });
  });
}

/**
 * Filter the parent's tool set to match the subagent's frontmatter `tools` field
 * (comma-separated). Empty/undefined → all parent tools (matches Anthropic behavior).
 */
function filterToolsForSubagent(parentTools: PiAgentTool[], toolsField?: string): PiAgentTool[] {
  if (!toolsField || !toolsField.trim()) return [...parentTools];
  const allowed = new Set(toolsField.split(',').map(t => t.trim()).filter(Boolean));
  return parentTools.filter(t => allowed.has(t.name));
}
