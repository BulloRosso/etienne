/**
 * Workflow templates for manual creation via the UI.
 *
 * Each template provides a `machineConfig` (the XState machine shape persisted
 * to .workflow.json) plus the metadata the create-dialog needs (label, default
 * tags, default description). Add new entries here to expose more "types"
 * in the create dialog without backend changes.
 */

export const WORKFLOW_TEMPLATES = {
  hypothesis: {
    id: 'hypothesis',
    label: 'Hypothesis',
    description:
      'Hypothesis lifecycle: propose → sharpen → test → support/refute, with stall/demote/supersede escape hatches.',
    defaultTags: ['hypothesis'],
    machineConfig: {
      initial: 'proposed',
      states: {
        proposed: {
          on: { SHARPEN: 'sharpened', DEMOTE: 'demoted', SUPERSEDE: 'superseded' },
          meta: {
            label: 'Proposed',
            description:
              'Claim stated; needs confirmation + refutation criteria before it can progress (anti-vagueness gate).',
          },
        },
        sharpened: {
          on: { START_TEST: 'under_test', DEMOTE: 'demoted', SUPERSEDE: 'superseded' },
          meta: {
            label: 'Sharpened',
            description:
              'Criteria exist; a test queue is generated and the engineer picks the first test.',
          },
        },
        under_test: {
          on: {
            PROVISIONAL_SUPPORT: 'provisional_support',
            PROVISIONAL_REFUTE: 'provisional_refute',
            STALL: 'stalled',
            DEMOTE: 'demoted',
            SUPERSEDE: 'superseded',
          },
          meta: {
            label: 'Under test',
            description:
              'Researcher pursues low-cost tests; critic runs falsification probes; evidence accumulates.',
          },
        },
        provisional_support: {
          on: {
            CONFIRM_SUPPORT: 'supported',
            REOPEN: 'under_test',
            STALL: 'stalled',
            DEMOTE: 'demoted',
            SUPERSEDE: 'superseded',
          },
          meta: {
            label: 'Provisional support',
            description:
              'Evidence leans confirm; not yet closed. May reopen if an entailing hypothesis is refuted.',
          },
        },
        provisional_refute: {
          on: {
            CONFIRM_REFUTE: 'refuted',
            REOPEN: 'under_test',
            STALL: 'stalled',
            DEMOTE: 'demoted',
            SUPERSEDE: 'superseded',
          },
          meta: {
            label: 'Provisional refutation',
            description:
              'Evidence leans refute; critic annotates dependent decisions as weakening.',
          },
        },
        stalled: {
          on: { RESUME: 'under_test', DEMOTE: 'demoted', SUPERSEDE: 'superseded' },
          meta: {
            label: 'Stalled',
            description: 'Evidence dried up. Added to the next review offer.',
            waitingFor: 'human_chat',
            waitingMessage:
              'This hypothesis has stalled (no new evidence). Commit to a real test (RESUME), or demote it (DEMOTE)?',
          },
        },
        supported: {
          type: 'final',
          meta: {
            label: 'Supported',
            description:
              'Confidence frozen. Synthesizer removes hedging from dependent wiki claims.',
          },
        },
        refuted: {
          type: 'final',
          meta: {
            label: 'Refuted',
            description: 'Cascade report scopes the downstream revision work.',
          },
        },
        demoted: {
          type: 'final',
          meta: {
            label: 'Demoted',
            description:
              'Converted to an Assumption with provenance + workflow history preserved.',
          },
        },
        superseded: {
          type: 'final',
          meta: {
            label: 'Superseded',
            description:
              'Reformulated; replacement started in Proposed inheriting links.',
          },
        },
      },
    },
  },
};

export const WORKFLOW_TEMPLATE_OPTIONS = Object.values(WORKFLOW_TEMPLATES).map((t) => ({
  value: t.id,
  label: t.label,
  description: t.description,
}));

/**
 * Slugify a freeform title into a workflow id (and wiki slug). Lowercase,
 * dash-separated, alphanumeric only.
 */
export function slugify(input) {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
