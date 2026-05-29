/**
 * Event rules seeded by the knowledge-transfer project.
 *
 * Two rules, both enabled at seed time:
 *
 *   1. rag-auto-index-on-upload
 *      Watches documents/ for file create/update events and re-runs
 *      RAG indexing. Keeps the retrieval substrate fresh as the expert
 *      drops new internal docs in.
 *
 *   2. nightly-progress-recompute
 *      Walks every progress/*.progress.json overnight and:
 *        - decays streak_days when last_activity is older than 36h,
 *        - recomputes the leaf-weighted percent_complete value,
 *        - re-emits a small "needs-attention" summary the expert
 *          can review the next morning.
 *
 * Written to .etienne/event-handling.json by the seed runner.
 */

export interface EventRule {
  id: string;
  description: string;
  enabled: boolean;
  trigger: {
    kind: 'filesystem' | 'cron';
    config: Record<string, unknown>;
  };
  action: {
    kind: 'agent-prompt' | 'http';
    config: Record<string, unknown>;
  };
}

export const EVENT_RULES: EventRule[] = [
  {
    id: 'rag-auto-index-on-upload',
    description:
      'Re-index documents/ whenever a markdown or office file is created or updated. Keeps the agent grounded in the latest expert-curated material.',
    enabled: true,
    trigger: {
      kind: 'filesystem',
      config: {
        watch: 'documents/',
        events: ['create', 'update'],
        glob: '**/*.{md,markdown,pdf,docx,doc,xlsx,xls,pptx,ppt}',
        debounce_ms: 2000,
      },
    },
    action: {
      kind: 'agent-prompt',
      config: {
        prompt:
          'A file was added or updated under documents/. Re-run RAG indexing via POST /api/workspace/<project>/rag/index-document for the affected path. Do not commentate; this is a maintenance task.',
        unattended: true,
      },
    },
  },
  {
    id: 'nightly-progress-recompute',
    description:
      'Walk every progress/*.progress.json, decay streak_days when last activity is older than 36 h, recompute weighted percent_complete, surface a "needs-attention" summary for the expert.',
    enabled: true,
    trigger: {
      kind: 'cron',
      config: {
        // Every day at 03:17 local time (avoids the round-hour stampede).
        schedule: '17 3 * * *',
      },
    },
    action: {
      kind: 'agent-prompt',
      config: {
        prompt:
          'Nightly maintenance: read every progress/*.progress.json. For each file: (a) if last_activity older than 36h, decrement streak_days (floor 0); (b) recompute percent_complete from leaf states weighted by ToC weights; (c) collect any node where state == "in-progress" with no Q/A in the last 7 days. Write a single needs-attention summary to progress/_attention.json (overwriting). Do not message the user.',
        unattended: true,
      },
    },
  },
];
