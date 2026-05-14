import { Inject, Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { LlmService } from '../../llm/llm.service';
import type {
  ContextPackage,
  SessionRecord,
  TaskFraming,
} from '../../memory/types';
import { AdaptiveMemoryConfigService } from '../config/adaptive-memory-config.service';
import { Packer } from '../subagents/packer.service';
import { Picker } from '../subagents/picker.service';
import { SessionsStore } from '../stores/sessions.store';
import { TaskFramingService } from './task-framing.service';
import { buildWritebackTools } from '../tools/writeback';
import type {
  KGAdapter,
  PreferencesAdapter,
  RAGAdapter,
  WikiAdapter,
} from '../adapters/adapter.types';
import type { AdaptiveMemoryEvent } from './events';

/**
 * AdaptiveMemoryAgent — within-task orchestrator (PRD §5).
 *
 *   POST /api/adaptive-memory/:project/task → runTask(...)
 *     → 1. AdaptiveMemoryConfigService.isActive(project)         # activation gate
 *     → 2. TaskFraming.frame(prompt)                              # intent + activeSkillIds
 *     → 3. Picker.assemble(framing, project)                      # candidate context
 *     → 4. Packer.pack(candidate, prompt, {tokenBudget})          # firewall point 2 applied
 *     → 5. LlmService.runWithTools({ tools: buildWritebackTools }) # firewall point 1 inside each tool
 *     → 6. Close the session record
 *
 * Live updates flow over the existing multiplexed SSE channel
 * `'adaptive-memory'` via `getEventSubject(project)`. The HTTP response
 * carries the final text + summary; intermediate events come through SSE.
 */
@Injectable()
export class AdaptiveMemoryAgent {
  private readonly logger = new Logger(AdaptiveMemoryAgent.name);
  private readonly subjects = new Map<string, Subject<AdaptiveMemoryEvent>>();

  constructor(
    private readonly framing: TaskFramingService,
    private readonly picker: Picker,
    private readonly packer: Packer,
    private readonly llm: LlmService,
    private readonly sessions: SessionsStore,
    private readonly config: AdaptiveMemoryConfigService,
    @Inject('AgentAdapters') private readonly adapters: AgentAdapters,
  ) {}

  // --- SSE channel ---------------------------------------------------------

  getEventSubject(project: string): Subject<AdaptiveMemoryEvent> {
    let subj = this.subjects.get(project);
    if (!subj) {
      subj = new Subject<AdaptiveMemoryEvent>();
      this.subjects.set(project, subj);
    }
    return subj;
  }

  private emit(event: Omit<AdaptiveMemoryEvent, 'timestamp'>): void {
    this.getEventSubject(event.project).next({
      ...event,
      timestamp: new Date().toISOString(),
    } as AdaptiveMemoryEvent);
  }

  // --- main entry ----------------------------------------------------------

  async runTask(
    project: string,
    prompt: string,
  ): Promise<RunTaskResult> {
    // 1. Activation gate — refuse politely when no adaptive-memory.config.json.
    if (!this.config.isActive(project)) {
      throw new AdaptiveMemoryInactiveError(project);
    }
    const config = await this.config.get(project);
    const sessionId = `am-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;
    const startedAt = Date.now();

    this.emit({
      type: 'task-started',
      project,
      sessionId,
      payload: { prompt },
    });

    let session: SessionRecord | null = null;
    try {
      // 2. Frame the task.
      const framing = await this.framing.frame(project, prompt, { useLlm: false });
      this.emit({ type: 'frame', project, sessionId, payload: framing });

      session = await this.sessions.open(project, sessionId, {
        activeSkills: framing.activeSkillIds,
      });
      await this.sessions.appendTurn(project, session, {
        role: 'user',
        content: prompt,
        storeWrites: [],
      });
      // Pre-allocate the agent turn so writeback tools have somewhere to attach.
      await this.sessions.appendTurn(project, session, {
        role: 'agent',
        content: '',
        storeWrites: [],
      });

      // 3. Picker.
      const candidate = await this.picker.assemble(framing, project);
      this.emit({
        type: 'pick',
        project,
        sessionId,
        payload: {
          wikiPages: candidate.wikiPages.length,
          kgEntities: candidate.kgSubgraph.entities.length,
          kgEdges: candidate.kgSubgraph.edges.length,
          ragFragments: candidate.ragFragments.length,
          preferences: candidate.preferences.length,
          sorRecords: candidate.sorRecords.length,
          activeSkills: candidate.activeSkills.map((s) => s.name),
        },
      });

      // 4. Packer (firewall point 2).
      const pkg: ContextPackage = this.packer.pack(candidate, prompt, {
        tokenBudget: config.tokenBudget,
      });
      this.emit({ type: 'pack', project, sessionId, payload: pkg.meta });

      // 5. runWithTools (firewall point 1 inside each tool's execute).
      const tools = buildWritebackTools({
        projectId: project,
        session,
        wiki: this.adapters.wiki,
        kg: this.adapters.kg,
        rag: this.adapters.rag,
        preferences: this.adapters.preferences,
        sessions: this.sessions,
        onToolEvent: (e) => {
          this.emit({
            type: 'tool-use',
            project,
            sessionId,
            payload: {
              tool: e.tool,
              ok: e.ok,
              entryId: e.entryId,
              error: e.error,
            },
          });
        },
      });

      const userPrompt = pkg.knowledge
        ? `${pkg.knowledge}\n\n---\n\n${pkg.userPrompt}`
        : pkg.userPrompt;
      const result = await this.llm.runWithTools({
        tier: 'regular',
        projectDir: project,
        system: pkg.systemPrompt || undefined,
        messages: [{ role: 'user', content: userPrompt }],
        tools,
        maxSteps: 10,
      });

      // 6. Close.
      const finalSession = await this.sessions.read(project, sessionId);
      if (finalSession) {
        const lastAgentTurn = [...finalSession.turns].reverse().find((t) => t.role === 'agent');
        if (lastAgentTurn) lastAgentTurn.content = result.text;
        // Best-effort persistence of the final agent message.
        await this.sessions.appendTurn(project, finalSession, {
          role: 'tool',
          content: `steps=${result.steps} toolCalls=${result.toolCalls}`,
          storeWrites: [],
        });
        await this.sessions.close(project, finalSession);
      }

      const durationMs = Date.now() - startedAt;
      this.emit({
        type: 'task-completed',
        project,
        sessionId,
        payload: {
          text: result.text,
          toolCalls: result.toolCalls,
          steps: result.steps,
          durationMs,
        },
      });

      return {
        sessionId,
        text: result.text,
        toolCalls: result.toolCalls,
        steps: result.steps,
        durationMs,
        meta: pkg.meta,
      };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.error(`runTask failed for ${project}: ${message}`);
      this.emit({
        type: 'task-failed',
        project,
        sessionId,
        payload: { error: message },
      });
      if (session) {
        try {
          await this.sessions.close(project, session);
        } catch { /* swallow */ }
      }
      throw err;
    }
  }
}

// --- public types --------------------------------------------------------

export interface AgentAdapters {
  wiki: WikiAdapter;
  kg: KGAdapter;
  rag: RAGAdapter;
  preferences: PreferencesAdapter;
}

export interface RunTaskResult {
  sessionId: string;
  text: string;
  toolCalls: number;
  steps: number;
  durationMs: number;
  meta: ContextPackage['meta'];
}

export class AdaptiveMemoryInactiveError extends Error {
  readonly code = 'adaptive_memory_inactive';
  constructor(public readonly project: string) {
    super(`adaptive_memory_inactive: ${project}`);
    this.name = 'AdaptiveMemoryInactiveError';
  }
}
