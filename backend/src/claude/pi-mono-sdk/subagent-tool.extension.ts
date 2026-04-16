import { Logger } from '@nestjs/common';
import { SubagentsService, SubagentConfig } from '../../subagents/subagents.service';
import { MessageEvent } from '../types';
import { piEventToMessageEvents, PiEvent } from './pi-mono-event-adapter';
import { PiAgentTool } from './mcp-bridge.extension';

const MAX_SUBAGENT_DEPTH = 2;
const SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Translates Anthropic-format subagent definitions (.claude/agents/*.md) into a pi
 * `Task` AgentTool that the main agent calls like Claude Code's native subagent tool.
 *
 * On each invocation the tool:
 * 1. Reads the subagent definition via SubagentsService (same files the UI manages).
 * 2. Spawns a nested pi session with the subagent's systemPrompt and tool allowlist.
 * 3. Forwards events to the parent observer as subagent_start / subagent_end plus
 *    nested text/thinking/tool events.
 * 4. Returns the final assistant text as the tool result.
 *
 * Recursion is capped at MAX_SUBAGENT_DEPTH. Timeout kills runaway subagents.
 */

export interface SubagentToolOpts {
  logger: Logger;
  subagentsService: SubagentsService;
  projectDir: string;
  parentProcessId: string;
  parentTools: PiAgentTool[];
  piModule: any;
  modelConfig?: { model?: string; provider?: string; baseUrl?: string; token?: string };
  projectRoot: string;
  beforeToolCall?: (toolCall: { name: string; args?: any; id?: string }) => Promise<any>;
  emit: (ev: MessageEvent) => void;
  depth?: number;
  /** Track nested sessions here so the parent can abort them. */
  nestedSessions: Map<string, { abort?: () => void | Promise<void> }>;
}

export async function buildSubagentTool(opts: SubagentToolOpts): Promise<PiAgentTool | null> {
  const {
    logger, subagentsService, projectDir, parentProcessId,
    parentTools, piModule, modelConfig, projectRoot,
    beforeToolCall, emit, nestedSessions,
  } = opts;
  const depth = opts.depth ?? 0;

  if (depth >= MAX_SUBAGENT_DEPTH) {
    logger.debug(`pi-mono subagent: depth ${depth} >= max ${MAX_SUBAGENT_DEPTH}, not registering Task tool`);
    return null;
  }

  // Read all available subagent definitions to build the enum + description.
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

  const subagentDescriptions = subagents
    .map(s => `- **${s.name}**: ${s.description}`)
    .join('\n');

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
        description: {
          type: 'string',
          description: 'Short description of the task to delegate.',
        },
        prompt: {
          type: 'string',
          description: 'Self-contained task description for the subagent.',
        },
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

      // Emit subagent_start
      emit({
        type: 'subagent_start',
        data: { name: config.name, status: 'active', callId, parentProcessId },
      });

      try {
        const result = await runNestedSession({
          logger,
          piModule,
          config,
          taskPrompt,
          callId,
          parentTools,
          modelConfig,
          projectRoot,
          beforeToolCall,
          emit,
          nestedSessions,
          subagentsService,
          projectDir,
          parentProcessId,
          depth: depth + 1,
        });

        // Emit subagent_end
        emit({
          type: 'subagent_end',
          data: { name: config.name, status: 'complete', callId, content: result.text },
        });

        return result.text || '(subagent returned no text)';
      } catch (err: any) {
        emit({
          type: 'subagent_end',
          data: { name: config.name, status: 'complete', callId, content: `Error: ${err?.message}` },
        });
        return `Subagent error: ${err?.message}`;
      }
    },
  };
}

interface NestedRunOpts {
  logger: Logger;
  piModule: any;
  config: SubagentConfig;
  taskPrompt: string;
  callId: string;
  parentTools: PiAgentTool[];
  modelConfig?: { model?: string; provider?: string; baseUrl?: string; token?: string };
  projectRoot: string;
  beforeToolCall?: (toolCall: { name: string; args?: any; id?: string }) => Promise<any>;
  emit: (ev: MessageEvent) => void;
  nestedSessions: Map<string, { abort?: () => void | Promise<void> }>;
  subagentsService: SubagentsService;
  projectDir: string;
  parentProcessId: string;
  depth: number;
}

async function runNestedSession(opts: NestedRunOpts): Promise<{ text: string }> {
  const {
    logger, piModule, config, taskPrompt, callId,
    parentTools, modelConfig, projectRoot,
    beforeToolCall, emit, nestedSessions,
    subagentsService, projectDir, parentProcessId, depth,
  } = opts;

  const createAgentSession = piModule.createAgentSession ?? piModule.default?.createAgentSession;
  const SessionManager = piModule.SessionManager ?? piModule.default?.SessionManager;

  if (typeof createAgentSession !== 'function') {
    throw new Error('pi-mono: createAgentSession not available for nested session');
  }

  // Filter parent tools to the subagent's allowlist.
  const childTools = filterToolsForSubagent(parentTools, config.tools);

  // Recursively build a Task tool for the child (will return null if depth >= max).
  const childTaskTool = await buildSubagentTool({
    logger,
    subagentsService,
    projectDir,
    parentProcessId,
    parentTools,
    piModule,
    modelConfig,
    projectRoot,
    beforeToolCall,
    emit,
    nestedSessions,
    depth,
  });
  if (childTaskTool) childTools.push(childTaskTool);

  // Resolve the model — honour the subagent's model override.
  const resolvedModel = resolveModel(config.model, modelConfig?.model);

  const { session } = await createAgentSession({
    cwd: projectRoot,
    sessionManager: SessionManager?.inMemory ? SessionManager.inMemory() : undefined,
    systemPrompt: config.systemPrompt || undefined,
    model: resolvedModel,
    provider: modelConfig?.provider,
    baseUrl: modelConfig?.baseUrl,
    apiKey: modelConfig?.token,
    tools: childTools,
    beforeToolCall,
  });

  nestedSessions.set(callId, session);

  let assistantText = '';

  return new Promise<{ text: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { session.abort?.(); } catch { /* ignore */ }
      nestedSessions.delete(callId);
      reject(new Error(`Subagent ${config.name} timed out after ${SUBAGENT_TIMEOUT_MS / 1000}s`));
    }, SUBAGENT_TIMEOUT_MS);

    const handler = (ev: PiEvent) => {
      try {
        if (ev.type === 'text_delta') assistantText += (ev as any).delta ?? '';

        // Forward nested events to the parent observer so the frontend can render them.
        const mapped = piEventToMessageEvents(ev, { processId: callId });
        for (const m of mapped) emit(m);

        if (ev.type === 'agent_end') {
          clearTimeout(timeout);
          nestedSessions.delete(callId);
          resolve({ text: assistantText });
        }
      } catch (err: any) {
        logger.error(`pi-mono nested event handler error: ${err?.message}`);
      }
    };

    session.subscribe?.(handler);

    session.prompt(taskPrompt).catch((err: any) => {
      clearTimeout(timeout);
      nestedSessions.delete(callId);
      reject(err);
    });
  });
}

/**
 * Filter the parent's tool set to match the subagent's frontmatter `tools` field.
 * `tools` is a comma-separated list like "WebSearch, WebFetch, Read".
 * If empty/undefined, all parent tools are available (matching Anthropic behavior).
 */
function filterToolsForSubagent(parentTools: PiAgentTool[], toolsField?: string): PiAgentTool[] {
  if (!toolsField || !toolsField.trim()) {
    // No restriction — clone to avoid mutation.
    return [...parentTools];
  }

  const allowed = new Set(
    toolsField.split(',').map(t => t.trim()).filter(Boolean),
  );

  return parentTools.filter(t => allowed.has(t.name));
}

/**
 * Resolve model for a subagent.
 * Frontmatter values: 'sonnet', 'haiku', 'opus', 'inherit', or empty.
 * Translate short names to full model IDs used by pi-mono.
 */
function resolveModel(subagentModel?: string, parentModel?: string): string | undefined {
  if (!subagentModel || subagentModel === 'inherit' || subagentModel === '') {
    return parentModel;
  }

  const modelMap: Record<string, string> = {
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
    opus: 'claude-opus-4-6',
  };

  return modelMap[subagentModel] ?? subagentModel ?? parentModel;
}
