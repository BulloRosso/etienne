/**
 * Writeback tools (PRD §5.3) — exactly five, exposed to the within-task LLM:
 *   wiki_put_page, kg_assert_entity, kg_assert_edge, rag_index_fragment, preference_record.
 *
 * **FIREWALL POINT 1** (PRD §9 row 1): every tool's `execute` calls
 * `enforceWriteClassification(input)` as its first statement. A missing or
 * invalid `classification` value rejects the call before any side-effect runs.
 *
 * Skills and Personality are read-only during within-task — there is NO
 * `skill_edit` or `personality_write` tool.
 *
 * Each tool also calls `sessions.recordWrite(...)` after a successful write so
 * the SessionTurn.storeWrites array reflects what the agent did. Callers
 * thread the current SessionRecord through `buildWritebackTools` so the tool
 * can attribute writes to the right turn.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  ClassificationViolation,
  enforceWriteClassification,
} from '../../memory/classification';
import type {
  Classification,
  Provenance,
  SessionRecord,
} from '../../memory/types';
import type {
  KGAdapter,
  PreferencesAdapter,
  RAGAdapter,
  WikiAdapter,
} from '../adapters/adapter.types';
import type { SessionsStore } from '../stores/sessions.store';

// --- shared Zod blocks ---------------------------------------------------

const classificationSchema = z.enum(['public', 'private', 'secret']);
const provenanceSchema = z.object({
  sourceSessions: z.array(z.string()),
  sourceEntries: z.array(z.string()),
  createdBy: z.enum(['agent', 'ponderer', 'user']),
  createdAt: z.string(),
  updatedAt: z.string(),
  inferenceTag: z.string().optional(),
});

const sourceSchema = z.union([
  z.object({
    kind: z.literal('conversation'),
    turn: z.string(),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal('file'),
    path: z.string(),
    lines: z.string().optional(),
  }),
]);

// --- factory -------------------------------------------------------------

export interface WritebackToolDeps {
  projectId: string;
  session: SessionRecord;
  wiki: WikiAdapter;
  kg: KGAdapter;
  rag: RAGAdapter;
  preferences: PreferencesAdapter;
  sessions: SessionsStore;
  /**
   * Optional hook fired *after* each tool's `execute` (success OR rejection).
   * Used by the agent orchestrator to mirror tool activity onto its RxJS Subject.
   */
  onToolEvent?: (event: ToolEvent) => void;
}

export interface ToolEvent {
  tool: 'wiki_put_page' | 'kg_assert_entity' | 'kg_assert_edge' | 'rag_index_fragment' | 'preference_record';
  ok: boolean;
  /** Only present on `ok: true`. */
  entryId?: string;
  /** Only present on `ok: false`; carries the classification-rejection code or other error. */
  error?: string;
  input: unknown;
}

/**
 * Build the five tools, bound to the project, session, and a set of adapters.
 *
 * Returns a `Record<name, Tool>` shaped for `LlmService.runWithTools({ tools })`.
 */
export function buildWritebackTools(
  deps: WritebackToolDeps,
): Record<string, ReturnType<typeof tool>> {
  return {
    wiki_put_page: tool({
      description:
        'Create or update a Wiki page. Whole pages only (never split). Requires explicit classification.',
      inputSchema: z.object({
        title: z.string(),
        slug: z.string().optional(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        sources: z.array(sourceSchema),
        classification: classificationSchema,
        provenance: provenanceSchema,
      }),
      execute: async (input) => {
        return runFirewallGated('wiki_put_page', input, deps, async () => {
          const { slug } = await deps.wiki.putPage(deps.projectId, input);
          await deps.sessions.recordWrite(deps.projectId, deps.session, 'wiki', slug);
          return { slug };
        });
      },
    }),

    kg_assert_entity: tool({
      description: 'Assert a knowledge-graph entity. Requires explicit classification.',
      inputSchema: z.object({
        id: z.string(),
        type: z.string(),
        label: z.string(),
        attributes: z.record(z.string(), z.unknown()).default({}),
        classification: classificationSchema,
        provenance: provenanceSchema,
      }),
      execute: async (input) => {
        return runFirewallGated('kg_assert_entity', input, deps, async () => {
          await deps.kg.assertEntity(deps.projectId, {
            id: input.id,
            type: input.type,
            label: input.label,
            attributes: input.attributes,
            classification: input.classification as Classification,
            provenance: input.provenance as Provenance,
          });
          await deps.sessions.recordWrite(deps.projectId, deps.session, 'kg', input.id);
          return { id: input.id };
        });
      },
    }),

    kg_assert_edge: tool({
      description: 'Assert a knowledge-graph edge. Requires explicit classification.',
      inputSchema: z.object({
        id: z.string(),
        subject: z.string(),
        predicate: z.string(),
        object: z.string(),
        classification: classificationSchema,
        provenance: provenanceSchema,
      }),
      execute: async (input) => {
        return runFirewallGated('kg_assert_edge', input, deps, async () => {
          await deps.kg.assertEdge(deps.projectId, {
            id: input.id,
            subject: input.subject,
            predicate: input.predicate,
            object: input.object,
            classification: input.classification as Classification,
            provenance: input.provenance as Provenance,
          });
          await deps.sessions.recordWrite(deps.projectId, deps.session, 'kg', input.id);
          return { id: input.id };
        });
      },
    }),

    rag_index_fragment: tool({
      description: 'Index a text fragment into RAG. Requires explicit classification.',
      inputSchema: z.object({
        id: z.string(),
        text: z.string(),
        tags: z.array(z.string()).default([]),
        classification: classificationSchema,
        provenance: provenanceSchema,
      }),
      execute: async (input) => {
        return runFirewallGated('rag_index_fragment', input, deps, async () => {
          await deps.rag.index(deps.projectId, {
            id: input.id,
            text: input.text,
            embeddingId: input.id, // real adapter will overwrite with the vector id
            tags: input.tags,
            classification: input.classification as Classification,
            provenance: input.provenance as Provenance,
          });
          await deps.sessions.recordWrite(deps.projectId, deps.session, 'rag', input.id);
          return { id: input.id };
        });
      },
    }),

    preference_record: tool({
      description: 'Record a user or collaborator preference. Requires explicit classification.',
      inputSchema: z.object({
        id: z.string(),
        scope: z.enum(['user', 'collaborator']),
        subject: z.string().optional(),
        statement: z.string(),
        confidence: z.number().min(0).max(1),
        classification: classificationSchema,
        provenance: provenanceSchema,
      }),
      execute: async (input) => {
        return runFirewallGated('preference_record', input, deps, async () => {
          await deps.preferences.record(deps.projectId, {
            id: input.id,
            scope: input.scope,
            subject: input.subject,
            statement: input.statement,
            confidence: input.confidence,
            classification: input.classification as Classification,
            provenance: input.provenance as Provenance,
          });
          await deps.sessions.recordWrite(
            deps.projectId,
            deps.session,
            'preferences',
            input.id,
          );
          return { id: input.id };
        });
      },
    }),
  };
}

/**
 * Run the firewall (firewall point 1) and translate violations into a typed
 * rejection visible to the LLM. The LLM SHOULD react by re-issuing the call
 * with a valid classification rather than retrying with the same input.
 *
 * Successes and rejections are both surfaced through `onToolEvent` for the
 * orchestrator's SSE channel.
 */
async function runFirewallGated<T extends { id?: string; slug?: string }>(
  toolName: ToolEvent['tool'],
  input: { classification?: unknown },
  deps: WritebackToolDeps,
  doWork: () => Promise<T>,
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  try {
    enforceWriteClassification(input);
  } catch (err) {
    const code = err instanceof ClassificationViolation ? err.code : 'firewall_unknown';
    deps.onToolEvent?.({ tool: toolName, ok: false, error: code, input });
    return { ok: false, error: code };
  }
  try {
    const out = await doWork();
    const entryId = String(out.slug ?? out.id ?? '');
    deps.onToolEvent?.({ tool: toolName, ok: true, entryId, input });
    return { ok: true, entryId };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    deps.onToolEvent?.({ tool: toolName, ok: false, error, input });
    return { ok: false, error };
  }
}
