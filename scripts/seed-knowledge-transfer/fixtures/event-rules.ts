/**
 * Event rules + prompts seeded by the knowledge-transfer project.
 *
 * Canonical schema (mirrors backend/src/event-handling/core/rule-engine.service.ts):
 *
 *   rule = {
 *     id, name, enabled,
 *     condition: { type: 'simple' | 'semantic' | 'knowledge-graph' | 'compound',
 *                  ... type-specific fields ... },
 *     action: { type: 'prompt', promptId: '<id-in-prompts.json>' },
 *     createdAt, updatedAt,
 *   }
 *
 * Rules with cron-style triggers do NOT belong here — the rule engine
 * fires only on events. Recurring jobs (e.g. the nightly progress
 * recompute) go through the scheduler API as a separate seed step.
 */

const NOW = '2026-05-29T08:00:00Z';

export interface EventRule {
  id: string;
  name: string;
  enabled: boolean;
  condition:
    | {
        type: 'simple';
        event: Record<string, unknown>;
      }
    | {
        type: 'knowledge-graph';
        sparqlQuery: string;
      }
    | {
        type: 'semantic' | 'compound';
        [key: string]: unknown;
      };
  action: { type: 'prompt'; promptId: string };
  createdAt: string;
  updatedAt: string;
}

export interface SeedPrompt {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const EVENT_RULES: EventRule[] = [
  {
    id: 'rag-auto-index-on-upload',
    name: 'Auto-index documents for RAG search',
    enabled: true,
    condition: {
      type: 'simple',
      event: {
        group: 'Filesystem',
        name: 'File Created',
        'payload.path': '*/documents/*',
      },
    },
    action: { type: 'prompt', promptId: 'rag-auto-index' },
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const SEED_PROMPTS: SeedPrompt[] = [
  {
    id: 'rag-auto-index',
    title: 'Auto-index a new document into the RAG pool',
    content:
      'A new file was created under documents/. Index it into the RAG vector store via POST /api/workspace/<project>/rag/index-document with the new path. Skip the re-indexing if the file extension is not in {md, markdown, pdf, docx, doc, xlsx, pptx}. Do not message the user; this is a maintenance task.',
    createdAt: NOW,
    updatedAt: NOW,
  },
];

/**
 * Recurring scheduler tasks (nightly cron etc.). Not rules — these
 * go through POST /api/scheduler/<project>/task.
 */
export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  timeZone: string;
  type: 'recurring';
}

export const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    id: 'nightly-progress-recompute',
    name: 'Nightly progress recompute',
    prompt:
      'Nightly maintenance for the onboarding project. Walk every progress/*.progress.json. For each file: (a) if last_activity older than 36 h, decrement streak_days (floor 0); (b) recompute percent_complete from leaf states weighted by ToC weights; (c) collect any node where state == "in-progress" with no Q/A in the last 7 days. Write a single needs-attention summary to progress/_attention.json (overwriting). Do not message the user.',
    cronExpression: '17 3 * * *',
    timeZone: 'UTC',
    type: 'recurring',
  },
];
