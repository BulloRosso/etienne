import { promises as fs } from 'fs';
import { join } from 'path';
import { McpTool, ToolService } from './types';
import type { RequirementsTrackingService } from '../requirements-tracking/requirements-tracking.service';
import type {
  ProposalDecision,
  ProposalKind,
  SeedOverride,
} from '../requirements-tracking/types/tendertrace-types';

/** Resource URI for the TenderTrace MCP App UI */
export const REQUIREMENTS_TRACKING_RESOURCE_URI = 'ui://requirements-tracking/tendertrace.html';
export const REQUIREMENTS_TRACKING_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Requirements Tracking (TenderTrace) tools.
 *
 * Three tool families in one group (served at :6060/mcp/requirements-tracking):
 *  - render_requirements_tracking — the MCP-App render tool the .tendertrace.json
 *    previewer calls; carries _meta.ui.resourceUri.
 *  - rt_* — data/action tools the sandboxed app calls via App.callServerTool.
 *    ALL human decisions flow through rt_decide_proposal (first-writer-wins).
 *  - agent-facing tools (spec §3.3 names): get_document_section,
 *    search_requirements, get_requirement, search_catalog, get_service,
 *    search_issues, get_issue, submit_proposal, ask_user — the project's
 *    Claude Code agent gets these via .mcp.json; submit_proposal is its ONLY
 *    write path.
 *
 * `_seed {at, by}` on mutating tools backdates records during seed replay.
 * It is a deliberate, documented backdoor for the seed script (the MCP endpoint
 * is admin-token-guarded); production deployments should reject it.
 */

export async function loadRequirementsTrackingResourceHtml(): Promise<string | null> {
  const candidates = [
    join(__dirname, '..', '..', '..', 'mcp-app-requirements-tracking', 'dist', 'mcp-app.html'),
    join(__dirname, '..', '..', 'mcp-app-requirements-tracking', 'dist', 'mcp-app.html'),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf-8');
    } catch {
      // try next
    }
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[requirements-tracking] dist/mcp-app.html not found — run `npm install && npm run build` in mcp-app-requirements-tracking/',
  );
  return null;
}

const projectNameProp = {
  projectName: { type: 'string', description: 'Workspace project name' },
};

const seedProp = {
  _seed: {
    type: 'object',
    description: 'Seed-only override {at, by} to backdate records during seed replay',
    properties: { at: { type: 'string' }, by: { type: 'string' } },
  },
};

const tools: McpTool[] = [
  // ---------------------------------------------------------------------------
  // Render tool (MCP App entry)
  // ---------------------------------------------------------------------------
  {
    name: 'render_requirements_tracking',
    description:
      'Render the TenderTrace requirements-tracking app for a .tendertrace.json ' +
      'sentinel file. The sentinel carries {schema, page}; the payload returns ' +
      'tender meta + open-work counts and the app navigates to the page.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Path of the .tendertrace.json sentinel' },
        content: { type: 'string', description: 'Sentinel file content (JSON)' },
        ...projectNameProp,
      },
      required: ['content'],
    },
    _meta: { ui: { resourceUri: REQUIREMENTS_TRACKING_RESOURCE_URI } },
  } as McpTool & { _meta?: any },

  // ---------------------------------------------------------------------------
  // Dashboard / workspace / events
  // ---------------------------------------------------------------------------
  {
    name: 'rt_get_dashboard',
    description: 'Tender summary: meta, phase, KPI counts, open work per queue.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_init_tender',
    description: 'Create/update the tender workspace meta (key, title, phase, language).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        key: { type: 'string' },
        title: { type: 'string' },
        phase: { type: 'string', enum: ['intake', 'bid', 'implementation', 'closed'] },
        language: { type: 'string' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_get_events',
    description:
      'Activity feed poll: events with seq > sinceSeq. The sandboxed app cannot ' +
      'open SSE and polls this instead.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        sinceSeq: { type: 'number', description: 'Return events after this sequence number' },
        limit: { type: 'number' },
      },
      required: ['projectName'],
    },
  },

  // ---------------------------------------------------------------------------
  // Documents & artifacts
  // ---------------------------------------------------------------------------
  {
    name: 'rt_list_documents',
    description: 'List tender documents and implementation artifacts with parse status.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_register_document',
    description:
      'Register a file already inside the project (e.g. documents/foo.docx) or inline ' +
      'text as a tender document or implementation artifact, then parse it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        path: { type: 'string', description: 'Project-relative path of the source file' },
        text: { type: 'string', description: 'Inline text content instead of a file' },
        title: { type: 'string' },
        kind: { type: 'string', enum: ['tender', 'artifact'] },
        artifactType: {
          type: 'string',
          enum: ['email', 'minutes', 'change_request', 'spec', 'paste'],
        },
        artifactDate: { type: 'string' },
        artifactParties: { type: 'string' },
        parse: { type: 'boolean', description: 'Parse immediately (default true)' },
      },
      required: ['projectName', 'title', 'kind'],
    },
  },
  {
    name: 'rt_parse_document',
    description: 'Parse (or re-parse) a registered document into normalized sections.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, docId: { type: 'string' } },
      required: ['projectName', 'docId'],
    },
  },
  {
    name: 'rt_start_extraction',
    description:
      'Start the EARS extraction pipeline (P-EXTRACT) for a parsed tender document. ' +
      'Runs in the background; progress arrives as pipeline.progress events and ' +
      'proposals land in the Review Queue.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, docId: { type: 'string' } },
      required: ['projectName', 'docId'],
    },
  },

  // ---------------------------------------------------------------------------
  // Proposals (all review queues)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_list_proposals',
    description:
      'Queue contents: proposals filtered by kind (extraction, drift, link, ' +
      'shadow_scope, mapping, compliance, catalog_import, progress_update, ' +
      'acceptance_signal) and status (proposed, approved, rejected).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        kind: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_get_proposal',
    description:
      'Proposal detail including evidence and — for extraction proposals — the ' +
      'source section text with char offsets for the provenance highlight.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, proposalId: { type: 'string' } },
      required: ['projectName', 'proposalId'],
    },
  },
  {
    name: 'rt_decide_proposal',
    description:
      'Decide a proposal (THE human approval gate). decision by kind: extraction → ' +
      'approved/rejected; drift → in_scope/change_order/rejected/clarify; link → ' +
      'linked/rejected; shadow_scope → linked/internal/escalated_to_drift; mapping → ' +
      'approved/rejected; catalog_import → published/merged_as_version/rejected; ' +
      'progress_update → noted; acceptance_signal → confirmed_acceptance/rejected. ' +
      'First-writer-wins: a concurrent second decision returns {conflict:true, winning}.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        proposalId: { type: 'string' },
        decision: { type: 'string' },
        edits: { type: 'object', description: 'Reviewer edits applied before approval' },
        resolutionNote: { type: 'string' },
        actor: { type: 'string', description: 'Deciding user (defaults to "user")' },
        ...seedProp,
      },
      required: ['projectName', 'proposalId', 'decision'],
    },
  },
  {
    name: 'rt_bulk_decide',
    description:
      'Bulk-decide proposals of one kind above a confidence threshold (cards with ' +
      'ambiguities or confidence < 0.7 are never bulk-approved), or an explicit id list.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        kind: { type: 'string' },
        decision: { type: 'string' },
        minConfidence: { type: 'number' },
        proposalIds: { type: 'array', items: { type: 'string' } },
        actor: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'kind', 'decision'],
    },
  },

  // ---------------------------------------------------------------------------
  // Requirements
  // ---------------------------------------------------------------------------
  {
    name: 'rt_list_requirements',
    description:
      'Requirement rows (current version, status, implementation status) with ' +
      'optional filters: category, modality, status, implementationStatus, text.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        category: { type: 'string' },
        modality: { type: 'string' },
        status: { type: 'string' },
        implementationStatus: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_get_requirement',
    description: 'One requirement: record, current version, relations.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, reqId: { type: 'string' } },
      required: ['projectName', 'reqId'],
    },
  },

  // ---------------------------------------------------------------------------
  // Drift & Quick Capture (Phase 3)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_start_drift',
    description:
      'Start the drift pipeline for an inbound implementation artifact (email, ' +
      'minutes, change request): screening → analysis → conflict cross-check. ' +
      'Runs in the background; cards land in the Drift Inbox.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, artifactId: { type: 'string' } },
      required: ['projectName', 'artifactId'],
    },
  },
  {
    name: 'rt_get_drift_card',
    description:
      'Drift-card detail: before/after diff, evidence, conflict cross-checks, ' +
      'scope recommendation — everything P-08 renders for one card.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, proposalId: { type: 'string' } },
      required: ['projectName', 'proposalId'],
    },
  },
  {
    name: 'rt_create_capture',
    description:
      'Quick Capture (P-14): paste an email/thread; a conversational agent session ' +
      'parses it, may ask up to 3 clarifying questions (poll rt_get_capture), and ' +
      'submits proposals into the Drift Inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        pastedText: { type: 'string' },
        hint: { type: 'string' },
        createdBy: { type: 'string' },
      },
      required: ['projectName', 'pastedText'],
    },
  },
  {
    name: 'rt_get_capture',
    description:
      'Capture state: processing / awaiting_answers (with questions) / ' +
      'proposals_ready (with proposal ids) / closed / failed.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, captureId: { type: 'string' } },
      required: ['projectName', 'captureId'],
    },
  },
  {
    name: 'rt_answer_capture',
    description:
      'Submit answers to a capture\'s clarifying questions; resumes the suspended ' +
      'agent session. answers: [{questionId, answer?, skipped?}].',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        captureId: { type: 'string' },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'string' },
              answer: { type: 'string' },
              skipped: { type: 'boolean' },
            },
            required: ['questionId'],
          },
        },
        answeredBy: { type: 'string' },
      },
      required: ['projectName', 'captureId', 'answers'],
    },
  },
  {
    name: 'rt_close_capture',
    description: 'Abandon a capture: pending questions become skipped, the session finalizes.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, captureId: { type: 'string' } },
      required: ['projectName', 'captureId'],
    },
  },
  {
    name: 'rt_list_captures',
    description: 'List Quick-Capture sessions with status.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },

  // ---------------------------------------------------------------------------
  // Thread / baseline / relations (Phase 2)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_get_requirement_thread',
    description:
      'The full requirement thread (P-09): tender quote → baseline → every ' +
      'approved diff with evidence and decision → current version → mappings → ' +
      'linked issues with status → acceptance state.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, reqId: { type: 'string' } },
      required: ['projectName', 'reqId'],
    },
  },
  {
    name: 'rt_freeze_baseline',
    description:
      'Freeze the approved requirement set as an immutable baseline (e.g. "v1.0"). ' +
      'Blocked while unresolved conflicts_with relations exist — returns ' +
      '{blocked:true, blockers[]} instead of partial success.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        label: { type: 'string' },
        actor: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'label'],
    },
  },
  {
    name: 'rt_list_baselines',
    description: 'List frozen baselines with labels and timestamps.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_accept_requirement',
    description:
      'Manual acceptance (Abnahme) of a requirement — the only human-set ' +
      'implementation state (spec §3.5).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        reqId: { type: 'string' },
        actor: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'reqId'],
    },
  },
  {
    name: 'rt_create_relation',
    description:
      'Create a manual requirement↔requirement relation (§3.6): depends_on, ' +
      'refines, derived_from_same_clause, conflicts_with, merged_into.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        kind: { type: 'string' },
        fromRequirementId: { type: 'string' },
        toRequirementId: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'kind', 'fromRequirementId', 'toRequirementId'],
    },
  },
  {
    name: 'rt_resolve_conflict',
    description:
      'Resolve a conflicts_with relation with a resolution note. Unresolved ' +
      'conflicts block baseline freeze and response export.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        relationId: { type: 'string' },
        resolutionNote: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'relationId', 'resolutionNote'],
    },
  },

  // ---------------------------------------------------------------------------
  // Tracker / links / shadow scope (Phase 4)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_seed_tracker',
    description:
      'Seed-only: replace the mock tracker issue set (tracker/seed-issues.json) ' +
      'and sync the local mirror.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        issues: { type: 'array', items: { type: 'object' } },
      },
      required: ['projectName', 'issues'],
    },
  },
  {
    name: 'rt_sync_tracker',
    description: 'Force full tracker reconciliation into the local mirror + status derivation.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_list_issues',
    description: 'Mirrored tracker issues, optionally filtered to linked/unlinked.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, linked: { type: 'boolean' } },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_run_link_batch',
    description:
      'Run the linking pipeline (deterministic REQ-id pre-pass → P-LINK) over all ' +
      'or selected issues. Proposals land in Link Review.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        issueKeys: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_run_shadow_scan',
    description:
      'Run the shadow-scope pipeline (P-SHADOW) over unlinked, non-internal issues: ' +
      'work in progress without contractual basis is caught while it is one ticket.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_list_links',
    description: 'requirement↔issue links, optionally only stale ones.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, stale: { type: 'boolean' } },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_create_link',
    description: 'Create a manual approved requirement↔issue link.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementId: { type: 'string' },
        issueKey: { type: 'string' },
        relationship: {
          type: 'string',
          enum: ['implements', 'partially_implements', 'tests', 'documents', 'related'],
        },
        ...seedProp,
      },
      required: ['projectName', 'requirementId', 'issueKey'],
    },
  },
  {
    name: 'rt_confirm_link_updated',
    description:
      'Clear stale_since on a link after a human confirmed the tracker issue was ' +
      'updated to the new requirement version.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, linkId: { type: 'string' } },
      required: ['projectName', 'linkId'],
    },
  },
  {
    name: 'rt_list_stale_notices',
    description: 'Drafted tracker comments for stale links (posted only by a human).',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_post_stale_notice',
    description: 'Post an approved stale-notice comment to the tracker (one click).',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, noticeId: { type: 'string' }, actor: { type: 'string' } },
      required: ['projectName', 'noticeId'],
    },
  },
  {
    name: 'rt_simulate_issue_event',
    description:
      'Demo webhook: change a mock issue\'s status (todo/in_progress/done) and let ' +
      'status derivation react.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        issueKey: { type: 'string' },
        status: { type: 'string' },
        statusCategory: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        comment: { type: 'string' },
      },
      required: ['projectName', 'issueKey'],
    },
  },

  // ---------------------------------------------------------------------------
  // Deviation reports & exports (Phase 5)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_generate_deviation_report',
    description:
      'Generate a deviation report: deterministic thread/KPI/coverage assembly ' +
      'plus the P-DEVREP narrative. Snapshotted — reproducible as-of its date.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        sinceBaseline: { type: 'string' },
        dateTo: { type: 'string', description: 'As-of date (ISO); default now' },
        actor: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_list_reports',
    description: 'List snapshotted deviation reports.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_get_report',
    description: 'One report with its snapshotted data + narrative.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, reportId: { type: 'string' } },
      required: ['projectName', 'reportId'],
    },
  },
  {
    name: 'rt_edit_report_narrative',
    description: 'Edit the narrative (executive summary / lines) before export.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        reportId: { type: 'string' },
        narrative: { type: 'object' },
      },
      required: ['projectName', 'reportId', 'narrative'],
    },
  },
  {
    name: 'rt_generate_export',
    description:
      'Server-side DOCX export. kind: bieterfragen (drafted clarification questions) ' +
      '| deviation (needs ref=reportId) | response | matrix | claim (needs ref=claimId). ' +
      'Returns {path} to open via the host preview.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        kind: { type: 'string', enum: ['bieterfragen', 'deviation', 'response', 'matrix', 'claim'] },
        ref: { type: 'string' },
        force: { type: 'boolean' },
      },
      required: ['projectName', 'kind'],
    },
  },

  // ---------------------------------------------------------------------------
  // Catalog, mappings & compliance (Phase 6)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_list_services',
    description: 'Service catalog entries with their current published version.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        q: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_get_service',
    description: 'One catalog entry: body markdown, scope, tags, version history, usage.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        serviceId: { type: 'string' },
        versionNo: { type: 'number' },
      },
      required: ['projectName', 'serviceId'],
    },
  },
  {
    name: 'rt_save_service_draft',
    description:
      'Create/update the draft version of a catalog entry (markdown body, tags, ' +
      'scope). Creates the service first if serviceId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        serviceId: { type: 'string' },
        title: { type: 'string' },
        kind: { type: 'string', enum: ['service', 'reference', 'certification', 'text_block'] },
        bodyMarkdown: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        scope: { type: 'object' },
      },
      required: ['projectName', 'bodyMarkdown'],
    },
  },
  {
    name: 'rt_publish_service_version',
    description: 'Publish a draft version — immutable from here; republishing marks mappings stale.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        serviceId: { type: 'string' },
        versionNo: { type: 'number' },
        actor: { type: 'string' },
        ...seedProp,
      },
      required: ['projectName', 'serviceId', 'versionNo'],
    },
  },
  {
    name: 'rt_start_catalog_import',
    description:
      'Import wizard step 1: convert an uploaded DOCX (project-relative path) to ' +
      'markdown + images, then P-CAT-I segments it into proposed entries.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, path: { type: 'string' } },
      required: ['projectName', 'path'],
    },
  },
  {
    name: 'rt_get_import',
    description: 'Import wizard data: converted preview, segmentation proposals, unassigned sections.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, importId: { type: 'string' } },
      required: ['projectName', 'importId'],
    },
  },
  {
    name: 'rt_get_service_usage',
    description: 'Where a service is mapped (approved mappings across requirements).',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, serviceId: { type: 'string' } },
      required: ['projectName', 'serviceId'],
    },
  },
  {
    name: 'rt_list_mappings',
    description: 'requirement↔service mappings, filterable by requirement and staleness.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementId: { type: 'string' },
        stale: { type: 'boolean' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_create_mapping',
    description: 'Manual mapping (drag a service onto a requirement in the matrix).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementId: { type: 'string' },
        serviceVersionId: { type: 'string', description: 'e.g. SVC-012/v/3' },
        coverage: { type: 'string', enum: ['full', 'partial', 'related'] },
        ...seedProp,
      },
      required: ['projectName', 'requirementId', 'serviceVersionId', 'coverage'],
    },
  },
  {
    name: 'rt_delete_mapping',
    description: 'Remove a mapping.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, mappingId: { type: 'string' } },
      required: ['projectName', 'mappingId'],
    },
  },
  {
    name: 'rt_run_automap',
    description: 'Run P-CAT-M auto-mapping (all or selected requirements) → mapping proposals.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_confirm_mapping',
    description: 'Clear the stale flag on a mapping after a human re-check.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, mappingId: { type: 'string' } },
      required: ['projectName', 'mappingId'],
    },
  },
  {
    name: 'rt_get_compliance_matrix',
    description:
      'Full matrix: one row per requirement with verdict, mapped services, ' +
      'assignment, pending verdict proposals.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_run_compliance',
    description: 'Run P-RESP-C verdict classification (all or selected requirements).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_assign_needs_input',
    description: 'Assign a NEEDS_INPUT requirement to an internal expert.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        requirementId: { type: 'string' },
        assignee: { type: 'string' },
      },
      required: ['projectName', 'requirementId', 'assignee'],
    },
  },

  // ---------------------------------------------------------------------------
  // Response builder & claims (Phases 7–8)
  // ---------------------------------------------------------------------------
  {
    name: 'rt_get_response_sections',
    description: 'Response section tree with bodies, trace markers and open [MISSING] placeholders.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_create_response_section',
    description: 'Add a response section (title, instructions, allocated requirement ids).',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        title: { type: 'string' },
        instructions: { type: 'string' },
        allocatedRequirementIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectName', 'title'],
    },
  },
  {
    name: 'rt_draft_section',
    description:
      'Run P-RESP-D for one section — approved verdicts + mapped services only; ' +
      'gaps become visible [MISSING] placeholders.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, sectionId: { type: 'string' } },
      required: ['projectName', 'sectionId'],
    },
  },
  {
    name: 'rt_save_section',
    description: 'Save manual edits as a new append-only section version.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        sectionId: { type: 'string' },
        markdown: { type: 'string' },
      },
      required: ['projectName', 'sectionId', 'markdown'],
    },
  },
  {
    name: 'rt_export_response',
    description:
      'Assemble the response DOCX. Fails with {blocked:true, blockers[]} on open ' +
      '[MISSING] placeholders or unresolved conflicts unless force=true.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, force: { type: 'boolean' } },
      required: ['projectName'],
    },
  },
  {
    name: 'rt_list_claims',
    description: 'Claims with items, plus the approved change-order proposals available as items.',
    inputSchema: { type: 'object', properties: { ...projectNameProp }, required: ['projectName'] },
  },
  {
    name: 'rt_create_claim',
    description: 'Create a claim (Nachtrag) shell.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, title: { type: 'string' } },
      required: ['projectName', 'title'],
    },
  },
  {
    name: 'rt_add_claim_items',
    description: 'Attach approved change-order proposals to a claim.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        claimId: { type: 'string' },
        proposalIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectName', 'claimId', 'proposalIds'],
    },
  },
  {
    name: 'rt_generate_claim',
    description: 'Assemble the Nachtrag (deterministic) + P-CLAIM narrative per item.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, claimId: { type: 'string' } },
      required: ['projectName', 'claimId'],
    },
  },
  {
    name: 'rt_set_claim_pricing',
    description: 'Set pricing per claim item: {proposalId: "12.500 EUR", …}.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        claimId: { type: 'string' },
        pricing: { type: 'object' },
      },
      required: ['projectName', 'claimId', 'pricing'],
    },
  },
  {
    name: 'rt_export_claim',
    description: 'Export the Nachtrag DOCX for a generated claim.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, claimId: { type: 'string' } },
      required: ['projectName', 'claimId'],
    },
  },
  {
    name: 'rt_get_agent_runs',
    description: 'Audit: agent runs with pipeline, prompt version/hash, model, outcome.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, pipeline: { type: 'string' } },
      required: ['projectName'],
    },
  },

  // ---------------------------------------------------------------------------
  // Agent-facing tools (spec §3.3) — the project agent's surface
  // ---------------------------------------------------------------------------
  {
    name: 'get_document_section',
    description:
      'Normalized text + offsets of one document section (sectionId like "D-01/sec/4").',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, sectionId: { type: 'string' } },
      required: ['projectName', 'sectionId'],
    },
  },
  {
    name: 'search_requirements',
    description:
      'Hybrid search (embeddings + full-text) over the current requirement set. ' +
      'Read-only baseline access for drift analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        query: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['projectName', 'query'],
    },
  },
  {
    name: 'get_requirement',
    description: 'Read one requirement with its current version and version chain.',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, reqId: { type: 'string' } },
      required: ['projectName', 'reqId'],
    },
  },
  {
    name: 'search_catalog',
    description: 'Hybrid search over published service-catalog entries.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        query: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['projectName', 'query'],
    },
  },
  {
    name: 'get_service',
    description: 'Read one catalog service (published versions only): body, scope, tags.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        serviceId: { type: 'string' },
        versionNo: { type: 'number' },
      },
      required: ['projectName', 'serviceId'],
    },
  },
  {
    name: 'search_issues',
    description: 'Hybrid search over locally mirrored tracker issues.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        query: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['projectName', 'query'],
    },
  },
  {
    name: 'get_issue',
    description: 'Read one mirrored tracker issue by key (local mirror only).',
    inputSchema: {
      type: 'object',
      properties: { ...projectNameProp, issueKey: { type: 'string' } },
      required: ['projectName', 'issueKey'],
    },
  },
  {
    name: 'submit_proposal',
    description:
      'THE ONLY WRITE PATH for agents: submit a proposal (extraction, drift, link, ' +
      'shadow_scope, mapping, catalog_import, progress_update, acceptance_signal). ' +
      'Payload is validated (schema + verbatim evidence-quote check); validation ' +
      'errors are returned so you can self-correct. A human decides every proposal.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        kind: { type: 'string' },
        payload: { type: 'object' },
        evidence: {
          type: 'object',
          properties: {
            quote: { type: 'string' },
            location: { type: 'string' },
            speaker_or_author: { type: 'string' },
            date: { type: 'string' },
          },
        },
        affectedRequirementIds: { type: 'array', items: { type: 'string' } },
        classification: { type: 'string' },
        decisionStatus: { type: 'string' },
        scopeAssessment: { type: 'string' },
        scopeRationale: { type: 'string' },
        confidence: { type: 'number' },
        sourceArtifactId: {
          type: 'string',
          description: 'Document/artifact id the evidence quote comes from (enables the verbatim check)',
        },
        ...seedProp,
      },
      required: ['projectName', 'kind', 'payload'],
    },
  },
  {
    name: 'ask_user',
    description:
      'Capture sessions ONLY: present up to 3 short clarifying questions to the user. ' +
      'Outside an active Quick-Capture session this tool returns an error.',
    inputSchema: {
      type: 'object',
      properties: {
        ...projectNameProp,
        captureId: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
            },
            required: ['question'],
          },
        },
      },
      required: ['projectName', 'questions'],
    },
  },
];

export function createRequirementsTrackingToolsService(
  rt: RequirementsTrackingService,
): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    const projectName: string | undefined =
      (typeof args?.projectName === 'string' && args.projectName) || undefined;

    switch (toolName) {
      // -----------------------------------------------------------------------
      // Render
      // -----------------------------------------------------------------------
      case 'render_requirements_tracking': {
        let sentinel: any = {};
        try {
          sentinel = JSON.parse(args.content);
        } catch {
          sentinel = {};
        }
        const project = projectName || sentinel?.workspaceProject;
        if (!project) {
          return { error: 'projectName is required (host context or sentinel.workspaceProject)' };
        }
        const summary = await rt.getTenderSummary(project);
        return {
          schema: 'tendertrace.v1',
          workspaceProject: project,
          page: sentinel?.page ?? 'dashboard',
          entityId: sentinel?.entityId,
          tender: summary.tender,
          counts: summary.counts,
        };
      }

      // -----------------------------------------------------------------------
      // Dashboard / events / tender meta
      // -----------------------------------------------------------------------
      case 'rt_get_dashboard': {
        return rt.getTenderSummary(requireProject(projectName));
      }
      case 'rt_init_tender': {
        return rt.initTender(requireProject(projectName), {
          key: args.key,
          title: args.title,
          phase: args.phase,
          language: args.language,
        });
      }
      case 'rt_get_events': {
        return rt.events.since(requireProject(projectName), args.sinceSeq ?? 0, args.limit ?? 200);
      }

      // -----------------------------------------------------------------------
      // Documents
      // -----------------------------------------------------------------------
      case 'rt_list_documents': {
        return { documents: await rt.repository.listDocuments(requireProject(projectName)) };
      }
      case 'rt_register_document': {
        const project = requireProject(projectName);
        const document = await rt.ingestion.registerDocument(project, {
          projectRelativePath: args.path,
          text: args.text,
          title: args.title,
          kind: args.kind,
          artifactType: args.artifactType,
          artifactDate: args.artifactDate,
          artifactParties: args.artifactParties,
        });
        if (args.parse !== false) {
          const parsed = await rt.ingestion.parseDocument(project, document.id);
          return { success: true, document: parsed };
        }
        return { success: true, document };
      }
      case 'rt_parse_document': {
        const document = await rt.ingestion.parseDocument(
          requireProject(projectName),
          args.docId,
        );
        return { success: true, document };
      }
      case 'rt_start_extraction': {
        const project = requireProject(projectName);
        // Long-running: fire and forget; progress + completion arrive as events.
        rt.extraction
          .run(project, args.docId)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', {
              pipeline: 'extraction',
              docId: args.docId,
              error: error.message,
            }),
          );
        return { started: true, docId: args.docId };
      }

      // -----------------------------------------------------------------------
      // Proposals
      // -----------------------------------------------------------------------
      case 'rt_list_proposals': {
        const proposals = await rt.repository.listProposals(requireProject(projectName), {
          kind: args.kind,
          status: args.status,
        });
        return { proposals };
      }
      case 'rt_get_proposal': {
        const project = requireProject(projectName);
        const proposal = await rt.repository.getProposal(project, args.proposalId);
        if (!proposal) return { error: `Unknown proposal ${args.proposalId}` };
        let section: any = null;
        const sectionRef =
          proposal.payload?.source?.documentId && proposal.payload?.source?.sectionId
            ? `${proposal.payload.source.documentId}/sec/${proposal.payload.source.sectionId}`
            : null;
        if (sectionRef) {
          section = await rt.ingestion.getSection(project, sectionRef);
        }
        return { proposal, section };
      }
      case 'rt_decide_proposal': {
        return rt.proposals.decide(requireProject(projectName), args.proposalId, {
          decision: args.decision as ProposalDecision,
          edits: args.edits,
          resolutionNote: args.resolutionNote,
          actor: args.actor ?? 'user',
          seed: args._seed as SeedOverride | undefined,
        });
      }
      case 'rt_bulk_decide': {
        const results = await rt.proposals.bulkDecide(requireProject(projectName), {
          kind: args.kind as ProposalKind,
          decision: args.decision as ProposalDecision,
          minConfidence: args.minConfidence,
          proposalIds: args.proposalIds,
          actor: args.actor ?? 'user',
          seed: args._seed as SeedOverride | undefined,
        });
        return { results };
      }

      // -----------------------------------------------------------------------
      // Requirements
      // -----------------------------------------------------------------------
      case 'rt_list_requirements': {
        const project = requireProject(projectName);
        const requirements = await rt.repository.listRequirements(project);
        const rows = [] as any[];
        for (const requirement of requirements) {
          if (args.status && requirement.status !== args.status) continue;
          if (
            args.implementationStatus &&
            requirement.implementationStatus !== args.implementationStatus
          )
            continue;
          const versions = await rt.repository.getVersions(project, requirement.id);
          const current = versions[versions.length - 1];
          if (!current) continue;
          if (args.category && current.category !== args.category) continue;
          if (args.modality && current.modality !== args.modality) continue;
          if (
            args.text &&
            !current.earsText?.toLowerCase().includes(String(args.text).toLowerCase())
          )
            continue;
          rows.push({ ...requirement, currentVersion: current, versionCount: versions.length });
        }
        return { requirements: rows };
      }
      case 'rt_get_requirement':
      case 'get_requirement': {
        const project = requireProject(projectName);
        const requirement = await rt.repository.getRequirement(project, args.reqId);
        if (!requirement) return { error: `Unknown requirement ${args.reqId}` };
        const versions = await rt.repository.getVersions(project, args.reqId);
        const relations = await rt.repository.listRelations(project, args.reqId);
        return {
          requirement,
          currentVersion: versions[versions.length - 1] ?? null,
          versions,
          relations,
        };
      }

      // -----------------------------------------------------------------------
      // Drift & Quick Capture
      // -----------------------------------------------------------------------
      case 'rt_start_drift': {
        const project = requireProject(projectName);
        rt.drift
          .run(project, args.artifactId)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', {
              pipeline: 'drift',
              artifactId: args.artifactId,
              error: error.message,
            }),
          );
        return { started: true, artifactId: args.artifactId };
      }
      case 'rt_get_drift_card': {
        const project = requireProject(projectName);
        const proposal = await rt.repository.getProposal(project, args.proposalId);
        if (!proposal) return { error: `Unknown proposal ${args.proposalId}` };
        // resolve affected requirements' current text for the before-pane
        const affected: any[] = [];
        for (const reqId of proposal.affectedRequirementIds ?? []) {
          const versions = await rt.repository.getVersions(project, reqId);
          const current = versions[versions.length - 1];
          if (current) {
            affected.push({
              reqId,
              versionNo: current.versionNo,
              earsText: current.earsText,
              modality: current.modality,
            });
          }
        }
        const clarifications = proposal.payload?.captureId
          ? await rt.repository.listClarifications(project, proposal.payload.captureId)
          : [];
        return { proposal, affected, clarifications };
      }
      case 'rt_create_capture': {
        const capture = await rt.startCapture(
          requireProject(projectName),
          args.pastedText,
          args.createdBy ?? 'user',
          args.hint,
        );
        return { success: true, captureId: capture.id };
      }
      case 'rt_get_capture': {
        const capture = await rt.captures.get(requireProject(projectName), args.captureId);
        return capture ?? { error: `Unknown capture ${args.captureId}` };
      }
      case 'rt_answer_capture': {
        const capture = await rt.captures.answer(requireProject(projectName), args.captureId, {
          answers: args.answers,
          answeredBy: args.answeredBy ?? 'user',
        });
        return { success: true, capture };
      }
      case 'rt_close_capture': {
        await rt.captures.close(requireProject(projectName), args.captureId);
        return { success: true };
      }
      case 'rt_list_captures': {
        return { captures: await rt.repository.listCaptures(requireProject(projectName)) };
      }

      // -----------------------------------------------------------------------
      // Thread / baseline / relations
      // -----------------------------------------------------------------------
      case 'rt_get_requirement_thread': {
        const thread = await rt.threads.getThread(requireProject(projectName), args.reqId);
        return thread ?? { error: `Unknown requirement ${args.reqId}` };
      }
      case 'rt_freeze_baseline': {
        return rt.baselines.freeze(
          requireProject(projectName),
          args.label,
          args.actor ?? 'user',
          args._seed as SeedOverride | undefined,
        );
      }
      case 'rt_list_baselines': {
        return { baselines: await rt.repository.listBaselines(requireProject(projectName)) };
      }
      case 'rt_accept_requirement': {
        try {
          const requirement = await rt.requirements.accept(
            requireProject(projectName),
            args.reqId,
            args.actor ?? 'user',
            args._seed as SeedOverride | undefined,
          );
          return { success: true, requirement };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_create_relation': {
        const relation = await rt.requirements.createRelation(
          requireProject(projectName),
          {
            kind: args.kind,
            fromRequirementId: args.fromRequirementId,
            toRequirementId: args.toRequirementId,
            origin: 'manual',
          },
          args._seed as SeedOverride | undefined,
        );
        return { success: true, relation };
      }
      case 'rt_resolve_conflict': {
        try {
          const relation = await rt.requirements.resolveConflict(
            requireProject(projectName),
            args.relationId,
            args.resolutionNote,
            args._seed as SeedOverride | undefined,
          );
          return { success: true, relation };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }

      // -----------------------------------------------------------------------
      // Tracker / links / shadow scope
      // -----------------------------------------------------------------------
      case 'rt_seed_tracker': {
        const project = requireProject(projectName);
        await rt.tracker.seedIssues(project, args.issues);
        const result = await rt.trackerMirror.sync(project);
        return { success: true, ...result };
      }
      case 'rt_sync_tracker': {
        const result = await rt.trackerMirror.sync(requireProject(projectName));
        return { success: true, ...result };
      }
      case 'rt_list_issues': {
        const project = requireProject(projectName);
        const issues = await rt.repository.listIssues(project);
        if (args.linked === undefined) return { issues };
        const links = await rt.repository.listLinks(project, {});
        const linkedKeys = new Set(
          links.filter((link) => link.status !== 'rejected').map((link) => link.issueKey),
        );
        return {
          issues: issues.filter((issue) => linkedKeys.has(issue.key) === args.linked),
        };
      }
      case 'rt_run_link_batch': {
        const project = requireProject(projectName);
        rt.linking
          .run(project, args.issueKeys)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', { pipeline: 'linking', error: error.message }),
          );
        return { started: true };
      }
      case 'rt_list_links': {
        return {
          links: await rt.repository.listLinks(requireProject(projectName), {
            stale: args.stale,
          }),
        };
      }
      case 'rt_create_link': {
        const project = requireProject(projectName);
        const at = (args._seed as SeedOverride | undefined)?.at ?? new Date().toISOString();
        const linkId = await rt.repository.nextKey(project, 'link', 'L-', 4);
        await rt.repository.saveLink(project, {
          id: linkId,
          requirementId: args.requirementId,
          issueKey: args.issueKey,
          relationship: args.relationship ?? 'implements',
          status: 'approved',
          createdAt: at,
        });
        await rt.tracker.addLabel(project, args.issueKey, args.requirementId);
        await rt.lifecycle.recompute(project, args.requirementId);
        await rt.events.emit(project, 'link.created', {
          linkId,
          requirementId: args.requirementId,
          issueKey: args.issueKey,
        });
        return { success: true, linkId };
      }
      case 'rt_confirm_link_updated': {
        const project = requireProject(projectName);
        const links = await rt.repository.listLinks(project, {});
        const link = links.find((entry) => entry.id === args.linkId);
        if (!link) return { error: `Unknown link ${args.linkId}` };
        await rt.repository.updateLink(project, { ...link, staleSince: undefined });
        await rt.lifecycle.recompute(project, link.requirementId);
        return { success: true };
      }
      case 'rt_list_stale_notices': {
        return { notices: await rt.repository.listStaleNotices(requireProject(projectName)) };
      }
      case 'rt_post_stale_notice': {
        const project = requireProject(projectName);
        const notices = await rt.repository.listStaleNotices(project);
        const notice = notices.find((entry) => entry.id === args.noticeId);
        if (!notice) return { error: `Unknown notice ${args.noticeId}` };
        if (notice.postedAt) return { error: 'Notice already posted' };
        for (const issueKey of notice.issueKeys) {
          await rt.tracker.addComment(project, issueKey, args.actor ?? 'user', notice.draftComment);
        }
        await rt.repository.updateStaleNotice(project, {
          ...notice,
          postedAt: new Date().toISOString(),
        });
        await rt.trackerMirror.sync(project);
        return { success: true, postedTo: notice.issueKeys };
      }
      case 'rt_simulate_issue_event': {
        const project = requireProject(projectName);
        const issue = await rt.tracker.simulateEvent(project, args.issueKey, {
          status: args.status,
          statusCategory: args.statusCategory,
          comment: args.comment,
        });
        return issue ? { success: true, issue } : { error: `Unknown issue ${args.issueKey}` };
      }

      // -----------------------------------------------------------------------
      // Shadow scan, reports & exports
      // -----------------------------------------------------------------------
      case 'rt_run_shadow_scan': {
        const project = requireProject(projectName);
        rt.shadow
          .run(project)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', {
              pipeline: 'shadow-scope',
              error: error.message,
            }),
          );
        return { started: true };
      }
      case 'rt_generate_deviation_report': {
        const report = await rt.reports.generate(
          requireProject(projectName),
          { sinceBaseline: args.sinceBaseline, dateTo: args.dateTo },
          (args._seed as SeedOverride | undefined)?.by ?? args.actor ?? 'user',
        );
        return { success: true, report };
      }
      case 'rt_list_reports': {
        return { reports: await rt.repository.listReports(requireProject(projectName)) };
      }
      case 'rt_get_report': {
        const bundle = await rt.reports.getReportWithData(
          requireProject(projectName),
          args.reportId,
        );
        return bundle ?? { error: `Unknown report ${args.reportId}` };
      }
      case 'rt_edit_report_narrative': {
        await rt.reports.updateNarrative(
          requireProject(projectName),
          args.reportId,
          args.narrative,
        );
        return { success: true };
      }
      case 'rt_generate_export': {
        const project = requireProject(projectName);
        try {
          switch (args.kind) {
            case 'bieterfragen': {
              const result = await rt.exporter.exportBieterfragen(project);
              return { success: true, ...result };
            }
            case 'deviation': {
              if (!args.ref) return { error: 'deviation export needs ref=reportId' };
              const path = await rt.reports.exportDocx(project, args.ref);
              return { success: true, path };
            }
            case 'response': {
              const result = await rt.response.export(project, args.force);
              return result.blocked ? result : { success: true, ...result };
            }
            case 'claim': {
              if (!args.ref) return { error: 'claim export needs ref=claimId' };
              const path = await rt.claims.exportDocx(project, args.ref);
              return { success: true, path };
            }
            default:
              return { error: `Export kind ${args.kind} is not available yet` };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }

      // -----------------------------------------------------------------------
      // Catalog, mappings & compliance
      // -----------------------------------------------------------------------
      case 'rt_list_services': {
        const services = await rt.catalog.list(requireProject(projectName), {
          q: args.q,
          tags: args.tags,
          kind: args.kind,
        });
        return { services };
      }
      case 'rt_get_service': {
        const project = requireProject(projectName);
        const bundle = await rt.catalog.getWithBody(project, args.serviceId, args.versionNo);
        if (!bundle) return { error: `Unknown service ${args.serviceId}` };
        const usage = await rt.catalog.usage(project, args.serviceId);
        return { ...bundle, usage };
      }
      case 'rt_save_service_draft': {
        const project = requireProject(projectName);
        let serviceId: string = args.serviceId;
        if (!serviceId) {
          if (!args.title) return { error: 'title is required when creating a new service' };
          const created = await rt.catalog.createService(project, {
            title: args.title,
            kind: args.kind,
          });
          serviceId = created.id;
        }
        const draft = await rt.catalog.saveDraftVersion(project, serviceId, {
          bodyMarkdown: args.bodyMarkdown,
          tags: args.tags,
          scope: args.scope,
        });
        return { success: true, serviceId, version: draft };
      }
      case 'rt_publish_service_version': {
        try {
          const published = await rt.catalog.publish(
            requireProject(projectName),
            args.serviceId,
            args.versionNo,
            args.actor ?? 'user',
            args._seed as SeedOverride | undefined,
          );
          return { success: true, version: published };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_start_catalog_import': {
        const project = requireProject(projectName);
        try {
          const result = await rt.catalogImport.run(project, args.path);
          return { success: true, ...result };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_get_import': {
        return rt.catalogImport.getImport(requireProject(projectName), args.importId);
      }
      case 'rt_get_service_usage': {
        return rt.catalog.usage(requireProject(projectName), args.serviceId);
      }
      case 'rt_list_mappings': {
        return {
          mappings: await rt.repository.listMappings(requireProject(projectName), {
            requirementId: args.requirementId,
            stale: args.stale,
          }),
        };
      }
      case 'rt_create_mapping': {
        const project = requireProject(projectName);
        const at = (args._seed as SeedOverride | undefined)?.at ?? new Date().toISOString();
        const mappingId = await rt.repository.nextKey(project, 'mapping', 'M-', 4);
        await rt.repository.saveMapping(project, {
          id: mappingId,
          serviceVersionId: args.serviceVersionId,
          requirementId: args.requirementId,
          coverage: args.coverage,
          origin: 'manual',
          status: 'approved',
          createdAt: at,
        });
        await rt.events.emit(project, 'mapping.created', {
          mappingId,
          requirementId: args.requirementId,
          serviceVersionId: args.serviceVersionId,
        });
        return { success: true, mappingId };
      }
      case 'rt_delete_mapping': {
        const project = requireProject(projectName);
        const mappings = await rt.repository.listMappings(project, {});
        const mapping = mappings.find((entry) => entry.id === args.mappingId);
        if (!mapping) return { error: `Unknown mapping ${args.mappingId}` };
        await rt.repository.updateMapping(project, { ...mapping, status: 'rejected' });
        return { success: true };
      }
      case 'rt_run_automap': {
        const project = requireProject(projectName);
        rt.autoMapping
          .run(project, args.requirementIds)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', {
              pipeline: 'auto-mapping',
              error: error.message,
            }),
          );
        return { started: true };
      }
      case 'rt_confirm_mapping': {
        const project = requireProject(projectName);
        const mappings = await rt.repository.listMappings(project, {});
        const mapping = mappings.find((entry) => entry.id === args.mappingId);
        if (!mapping) return { error: `Unknown mapping ${args.mappingId}` };
        await rt.repository.updateMapping(project, { ...mapping, staleSince: undefined });
        return { success: true };
      }
      case 'rt_get_compliance_matrix': {
        const project = requireProject(projectName);
        const requirements = await rt.repository.listRequirements(project);
        const complianceRecords = await rt.repository.listCompliance(project);
        const complianceByReq = new Map(
          complianceRecords.map((record) => [record.requirementId, record]),
        );
        const mappings = await rt.repository.listMappings(project, {});
        const pendingVerdicts = await rt.repository.listProposals(project, {
          kind: 'compliance',
          status: 'proposed',
        });
        const pendingByReq = new Map(
          pendingVerdicts.map((proposal) => [proposal.payload?.requirement_id, proposal]),
        );
        const pendingMappings = await rt.repository.listProposals(project, {
          kind: 'mapping',
          status: 'proposed',
        });

        const rows: any[] = [];
        for (const requirement of requirements) {
          if (requirement.status === 'retired') continue;
          const versions = await rt.repository.getVersions(project, requirement.id);
          const current = versions[versions.length - 1];
          if (!current) continue;
          rows.push({
            requirementId: requirement.id,
            earsText: current.earsText,
            modality: current.modality,
            category: current.category,
            implementationStatus: requirement.implementationStatus,
            verdict: complianceByReq.get(requirement.id) ?? null,
            pendingVerdictProposal: pendingByReq.get(requirement.id)?.id ?? null,
            mappings: mappings.filter(
              (mapping) =>
                mapping.requirementId === requirement.id && mapping.status === 'approved',
            ),
            pendingMappingProposals: pendingMappings
              .filter((proposal) => proposal.payload?.requirement_id === requirement.id)
              .map((proposal) => proposal.id),
          });
        }
        return { rows };
      }
      case 'rt_run_compliance': {
        const project = requireProject(projectName);
        rt.compliance
          .run(project, args.requirementIds)
          .catch((error) =>
            rt.events.emit(project, 'run.failed', {
              pipeline: 'compliance',
              error: error.message,
            }),
          );
        return { started: true };
      }
      case 'rt_assign_needs_input': {
        const project = requireProject(projectName);
        const records = await rt.repository.listCompliance(project);
        const record = records.find((entry) => entry.requirementId === args.requirementId);
        if (!record) return { error: `No verdict for ${args.requirementId}` };
        await rt.repository.saveCompliance(project, { ...record, assignedTo: args.assignee });
        return { success: true };
      }

      // -----------------------------------------------------------------------
      // Response builder & claims
      // -----------------------------------------------------------------------
      case 'rt_get_response_sections': {
        const project = requireProject(projectName);
        const sections = await rt.response.listSections(project);
        const withBodies = [] as any[];
        for (const section of sections) {
          const body = await rt.response.getSectionBody(project, section.id);
          withBodies.push({
            ...section,
            body,
            missing: [...body.matchAll(/\[MISSING:([^\]]*)\]/g)].map((match) => match[1].trim()),
          });
        }
        return { sections: withBodies };
      }
      case 'rt_create_response_section': {
        const section = await rt.response.createSection(requireProject(projectName), {
          title: args.title,
          instructions: args.instructions,
          allocatedRequirementIds: args.allocatedRequirementIds,
        });
        return { success: true, section };
      }
      case 'rt_draft_section': {
        try {
          const result = await rt.response.draftSection(
            requireProject(projectName),
            args.sectionId,
          );
          return { success: true, ...result };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_save_section': {
        const section = await rt.response.saveSectionBody(
          requireProject(projectName),
          args.sectionId,
          args.markdown,
        );
        return { success: true, section };
      }
      case 'rt_export_response': {
        try {
          const result = await rt.response.export(requireProject(projectName), args.force);
          return result.blocked ? result : { success: true, ...result };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_list_claims': {
        const project = requireProject(projectName);
        const [claims, claimable] = await Promise.all([
          rt.repository.listClaims(project),
          rt.claims.claimableProposals(project),
        ]);
        return { claims, claimable };
      }
      case 'rt_create_claim': {
        const claim = await rt.claims.create(requireProject(projectName), args.title);
        return { success: true, claim };
      }
      case 'rt_add_claim_items': {
        try {
          const claim = await rt.claims.addItems(
            requireProject(projectName),
            args.claimId,
            args.proposalIds,
          );
          return { success: true, claim };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_generate_claim': {
        try {
          const claim = await rt.claims.generate(requireProject(projectName), args.claimId);
          return { success: true, claim };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_set_claim_pricing': {
        const claim = await rt.claims.setPricing(
          requireProject(projectName),
          args.claimId,
          args.pricing,
        );
        return { success: true, claim };
      }
      case 'rt_export_claim': {
        try {
          const path = await rt.claims.exportDocx(requireProject(projectName), args.claimId);
          return { success: true, path };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
      case 'rt_get_agent_runs': {
        return { runs: await rt.runs.list(requireProject(projectName), args.pipeline) };
      }

      // -----------------------------------------------------------------------
      // Agent-facing
      // -----------------------------------------------------------------------
      case 'get_document_section': {
        const section = await rt.ingestion.getSection(
          requireProject(projectName),
          args.sectionId,
        );
        return section ?? { error: `Unknown section ${args.sectionId}` };
      }
      case 'search_requirements': {
        const hits = await rt.projections.searchRequirements(
          requireProject(projectName),
          args.query,
          args.topK ?? 10,
        );
        return { results: hits };
      }
      case 'search_catalog': {
        const hits = await rt.projections.searchServices(
          requireProject(projectName),
          args.query,
          args.topK ?? 10,
        );
        return { results: hits };
      }
      case 'get_service': {
        const project = requireProject(projectName);
        const service = await rt.repository.getService(project, args.serviceId);
        if (!service) return { error: `Unknown service ${args.serviceId}` };
        const versions = await rt.repository.listServiceVersions(project, args.serviceId);
        const published = versions.filter((v) => v.status === 'published');
        const version = args.versionNo
          ? published.find((v) => v.versionNo === args.versionNo)
          : published[published.length - 1];
        if (!version) return { error: `Service ${args.serviceId} has no published version` };
        let body = '';
        try {
          body = await rt.files.readText(project, version.bodyMarkdownPath);
        } catch {
          body = '';
        }
        return { service, version, bodyMarkdown: body };
      }
      case 'search_issues': {
        const hits = await rt.projections.searchIssues(
          requireProject(projectName),
          args.query,
          args.topK ?? 10,
        );
        return { results: hits };
      }
      case 'get_issue': {
        const issue = await rt.repository.getIssue(requireProject(projectName), args.issueKey);
        return issue ?? { error: `Unknown issue ${args.issueKey}` };
      }
      case 'submit_proposal': {
        const project = requireProject(projectName);
        let sourceText: string | undefined;
        if (args.sourceArtifactId) {
          const document = await rt.repository.getDocument(project, args.sourceArtifactId);
          if (document?.parsedPath) {
            try {
              sourceText = await rt.files.readText(project, `${document.parsedPath}document.md`);
            } catch {
              sourceText = undefined;
            }
          } else if (document?.originalPath?.endsWith('.md')) {
            sourceText = await rt.files.readText(project, document.originalPath);
          }
        }
        try {
          const result = await rt.proposals.submit(project, {
            kind: args.kind,
            payload: args.payload,
            evidence: args.evidence ?? null,
            affectedRequirementIds: args.affectedRequirementIds ?? [],
            classification: args.classification,
            decisionStatus: args.decisionStatus,
            scopeAssessment: args.scopeAssessment,
            scopeRationale: args.scopeRationale,
            confidence: args.confidence,
            sourceArtifactId: args.sourceArtifactId,
            sourceText,
            seed: args._seed as SeedOverride | undefined,
          });
          return 'attachedTo' in result
            ? { success: true, attachedTo: result.attachedTo }
            : { success: true, proposalId: result.id };
        } catch (error: any) {
          // return validation errors so the agent can self-correct in-session
          return { success: false, error: error.message };
        }
      }
      case 'ask_user': {
        return {
          error:
            'ask_user is only available inside an active Quick-Capture session. ' +
            'It never blocks non-capture pipelines (spec §3.3).',
        };
      }

      default:
        throw new Error(`Unknown requirements-tracking tool: ${toolName}`);
    }
  }

  function requireProject(project?: string): string {
    if (!project) throw new Error('projectName is required');
    return project;
  }

  return { tools, execute };
}
