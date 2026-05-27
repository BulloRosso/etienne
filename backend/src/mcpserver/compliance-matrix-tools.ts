import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { WikiService } from '../wiki/wiki.service';

/** Resource URI for the Compliance Matrix MCP App UI */
export const COMPLIANCE_MATRIX_RESOURCE_URI = 'ui://compliance-matrix/compliance-matrix.html';
export const COMPLIANCE_MATRIX_RESOURCE_MIME = 'text/html;profile=mcp-app';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

/**
 * Compliance Matrix Tools
 *
 * One MCP tool — `render_compliance_matrix` — that the McpUIPreview opens
 * when a `.compliance.json` sentinel file is previewed. The sentinel
 * carries `coverageRef` (path to the real coverage dashboard) and `teamRef`
 * (path to the team wiki page); the tool reads both, resolves owner
 * initials, and returns a single payload the MCP App renders as a
 * three-pane cockpit (filters | matrix | wiki preview).
 *
 * Companion tools:
 *   - get_planned_response: pull a wiki page by slug (used by the right
 *     pane to render the planned response when the user clicks a row).
 *   - create_planned_response_page: stub a missing planned-response page,
 *     so rows that point at a nonexistent slug get one with a single
 *     click in the cockpit.
 */

const tools: McpTool[] = [
  {
    name: 'render_compliance_matrix',
    description:
      'Render the compliance-matrix cockpit for a requirements-hv project. ' +
      'Reads the coverage dashboard + team wiki page from disk, resolves ' +
      'owner initials, and returns the enriched matrix payload (rows, ' +
      'team, filter facets) for the MCP App UI.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Path of the .compliance.json sentinel being previewed',
        },
        content: {
          type: 'string',
          description: 'Raw JSON content of the .compliance.json sentinel',
        },
        projectName: {
          type: 'string',
          description:
            'Workspace project directory (passed by McpUIPreview host). Used to ' +
            'resolve project-relative paths server-side; takes precedence over any ' +
            'project name parsed from the sentinel content.',
        },
      },
      required: ['content'],
    },
    _meta: {
      ui: {
        resourceUri: COMPLIANCE_MATRIX_RESOURCE_URI,
      },
    },
  } as McpTool & { _meta?: any },
  {
    name: 'get_planned_response',
    description:
      'Read a planned-response wiki page by slug (e.g. ' +
      '"planned-response/req-247") and return its rendered markdown for ' +
      'the cockpit\'s right-pane preview.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        slug: {
          type: 'string',
          description: 'Wiki slug (e.g. "planned-response/req-247")',
        },
      },
      required: ['projectName', 'slug'],
    },
  },
  {
    name: 'create_planned_response_page',
    description:
      'Stub a planned-response wiki page for a requirement that has none. ' +
      'Creates topics/planned-response/<req-id>.md with frontmatter and a ' +
      'placeholder body, then returns the new page so the cockpit can ' +
      'render it.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        requirementId: {
          type: 'string',
          description: 'Requirement id, e.g. "REQ-247"',
        },
        ears: {
          type: 'string',
          description: 'EARS-normalised requirement text to quote in the stub',
        },
        sourceLocation: {
          type: 'string',
          description: 'Source locator, e.g. "Annex C §3.3"',
        },
      },
      required: ['projectName', 'requirementId'],
    },
  },
  {
    name: 'get_text_file',
    description:
      'Read a project-relative text file (any extension) and return its ' +
      'content for in-cockpit markdown rendering. Used by Source / Planned ' +
      'response column clicks. Refuses paths outside the project root.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Workspace project name' },
        path: {
          type: 'string',
          description: 'Project-relative file path (e.g. "documents/foo.md")',
        },
      },
      required: ['projectName', 'path'],
    },
  },
  {
    name: 'set_row_state',
    description:
      'Patch a row in out/coverage/current.coverage.json with a new state ' +
      '(open / drafted / reviewed / committed / deviation / clarify). Used by ' +
      "the cockpit's per-row kebab menu.",
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Workspace project name' },
        requirementId: { type: 'string', description: 'e.g. "REQ-247"' },
        state: {
          type: 'string',
          enum: ['open', 'drafted', 'reviewed', 'committed', 'deviation', 'clarify'],
        },
        coverageRef: {
          type: 'string',
          description: 'Override coverage file path. Defaults to out/coverage/current.coverage.json.',
        },
      },
      required: ['projectName', 'requirementId', 'state'],
    },
  },
  {
    name: 'set_row_review',
    description:
      'Patch a row in out/coverage/current.coverage.json with a new ' +
      'reviewStatus (pending / in-review / approved / rejected). Used by ' +
      "the cockpit's per-row kebab menu.",
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Workspace project name' },
        requirementId: { type: 'string', description: 'e.g. "REQ-247"' },
        reviewStatus: {
          type: 'string',
          enum: ['pending', 'in-review', 'approved', 'rejected'],
        },
        coverageRef: {
          type: 'string',
          description: 'Override coverage file path. Defaults to out/coverage/current.coverage.json.',
        },
      },
      required: ['projectName', 'requirementId', 'reviewStatus'],
    },
  },
  {
    name: 'set_row_notes',
    description:
      'Patch a row in out/coverage/current.coverage.json with new free-text notes. ' +
      "Used by the cockpit's right-pane notes editor.",
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Workspace project name' },
        requirementId: { type: 'string', description: 'e.g. "REQ-247"' },
        notes: {
          type: 'string',
          description: 'New notes value. Pass empty string to clear.',
        },
        coverageRef: {
          type: 'string',
          description: 'Override coverage file path. Defaults to out/coverage/current.coverage.json.',
        },
      },
      required: ['projectName', 'requirementId', 'notes'],
    },
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

interface TeamEntry {
  initials: string;
  engineerIds: string[]; // one row can claim multiple kg engineer-ids
  name: string;
  role: string;
  areas: string;
}

/**
 * Parse the team page markdown table. Single source of truth for the
 * initials column the cockpit shows in owner cells. Tolerant of
 * formatting drift: extra spaces, missing trailing columns, header
 * variants.
 *
 * The "Engineer id(s)" cell may carry multiple kg engineer-ids separated
 * by commas, semicolons, or whitespace — so a single real person can own
 * the workload of multiple fictional engineers in the seed. Empty Role
 * and Areas cells are tolerated.
 */
function parseTeamMarkdown(md: string): TeamEntry[] {
  const out: TeamEntry[] = [];
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes('|')) continue;
    // Keep empty cells so column positions don't shift when Role/Areas blank.
    const rawCells = line.split('|').map((c) => c.trim());
    // Trim leading/trailing empties from the pipe-edges.
    while (rawCells.length && rawCells[0] === '') rawCells.shift();
    while (rawCells.length && rawCells[rawCells.length - 1] === '') rawCells.pop();
    if (rawCells.length < 2) continue;
    // Locate the engineer-id cell (may contain multiple ids).
    const idCellIdx = rawCells.findIndex((c) => /engineer-/.test(c));
    if (idCellIdx < 0) continue;
    const engineerIds = rawCells[idCellIdx]
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^engineer-/.test(s));
    if (engineerIds.length === 0) continue;
    const initials = rawCells[0] ?? '';
    const name = rawCells[idCellIdx + 1] ?? '';
    const role = rawCells[idCellIdx + 2] ?? '';
    const areas = rawCells[idCellIdx + 3] ?? '';
    if (!initials || initials.toLowerCase() === 'initials') continue;
    out.push({ initials, engineerIds, name, role, areas });
  }
  return out;
}

/**
 * Read and parse `out/coverage/current.coverage.json` from disk. Uses the
 * sentinel's `coverageRef` if provided, otherwise defaults to the
 * canonical path. Returns null on any I/O / parse error so the UI can
 * show a clear "no data" state instead of crashing.
 */
async function readCoverage(
  projectName: string,
  coverageRef: string,
): Promise<any | null> {
  const path = join(WORKSPACE_ROOT, projectName, coverageRef);
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Read the team wiki page directly off disk (read-only path; faster than
 * shelling out to wiki-search.ts and stable across the cockpit lifetime).
 */
async function readTeamMarkdown(
  projectName: string,
  teamRef: string,
): Promise<string | null> {
  const path = join(WORKSPACE_ROOT, projectName, teamRef);
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Project name comes from the sentinel filename: the McpUIPreview passes
 * the file path (project-relative) — we walk up to find the project
 * directory. As a fallback, parse it from the filename itself.
 */
function inferProjectName(filename?: string): string | null {
  if (!filename) return null;
  // Filename is project-relative ("out/compliance/current.compliance.json")
  // when opened from the file tree. The MCP host attaches the project
  // name elsewhere; we don't have access here, so we expect the caller
  // (the MCP App) to pass projectName via host context. For the
  // initial render path, the sentinel content carries the project.
  return null;
}

// ─── service ─────────────────────────────────────────────────────────────────

export async function loadComplianceMatrixResourceHtml(): Promise<string | null> {
  const candidates = [
    join(__dirname, '..', '..', '..', 'mcp-app-compliance-matrix', 'dist', 'mcp-app.html'),
    join(__dirname, '..', '..', 'mcp-app-compliance-matrix', 'dist', 'mcp-app.html'),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf-8');
    } catch {
      // try next
    }
  }
  return null;
}

export function createComplianceMatrixToolsService(
  wikiService: WikiService,
): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'render_compliance_matrix': {
        // Parse the sentinel content. It carries the project name and the
        // refs the cockpit needs to load (kept in the file rather than
        // hardcoded so the same MCP App can drive other variants later).
        let sentinel: any = {};
        try {
          sentinel = JSON.parse(args.content);
        } catch {
          sentinel = {};
        }
        // Host-passed projectName (from McpUIPreview) wins — it's the
        // workspace directory and the path coverage/team live under.
        // The sentinel's `project.name` is a *display* label (the bid
        // project, e.g. "NU-525-Lot-3"), not the workspace dir.
        const projectName: string | undefined =
          (typeof args.projectName === 'string' && args.projectName) ||
          sentinel?.workspaceProject ||
          inferProjectName(args.filename) ||
          undefined;
        const coverageRef: string =
          sentinel?.coverageRef || 'out/coverage/current.coverage.json';
        const teamRef: string = sentinel?.teamRef || 'wiki/topics/team.md';

        if (!projectName) {
          return {
            error: 'missing-project-name',
            message:
              'McpUIPreview did not pass projectName. Reload the preview tab.',
          };
        }

        const coverage = await readCoverage(projectName, coverageRef);
        const teamMd = await readTeamMarkdown(projectName, teamRef);
        const team = teamMd ? parseTeamMarkdown(teamMd) : [];

        const rows: any[] = Array.isArray(coverage?.rows) ? coverage.rows : [];
        // Probe wiki/topics/<slug>.md for every row that claims a
        // plannedResponseSlug, and tag the row with plannedResponseExists.
        // The cockpit uses this to distinguish "row references a wiki page
        // that's actually on disk" from "slug exists in coverage but no
        // page was ever authored" — the latter is hidden so the user can
        // tell at a glance which items are really prepared.
        const projectRoot = join(WORKSPACE_ROOT, projectName);
        await Promise.all(
          rows.map(async (r) => {
            if (!r?.plannedResponseSlug) {
              r.plannedResponseExists = false;
              return;
            }
            const pagePath = join(projectRoot, 'wiki', 'topics', `${r.plannedResponseSlug}.md`);
            try {
              await fs.access(pagePath);
              r.plannedResponseExists = true;
            } catch {
              r.plannedResponseExists = false;
            }
          }),
        );
        // Filter facets — the cockpit's left rail enumerates these.
        const statuses = unique(rows.map((r) => r.state).filter(Boolean));
        const reviews = unique(rows.map((r) => r.reviewStatus).filter(Boolean));
        const owners = unique(rows.map((r) => r.responsibleEngineer).filter(Boolean));

        return {
          schema: 'compliance-matrix.v1',
          // The MCP App needs the workspace dir name to call follow-up
          // tools (get_text_file, set_row_state, etc). The display label
          // for the header still comes from `project.name` below.
          workspaceProject: projectName,
          project: coverage?.project || sentinel?.project || { name: projectName },
          gates: coverage?.gates,
          generatedAt: coverage?.generatedAt || sentinel?.generatedAt,
          totals: coverage?.totals,
          stateCounts: coverage?.stateCounts,
          chipCounts: coverage?.chipCounts,
          rows,
          team,
          teamMissing: team.length === 0,
          filters: { statuses, reviews, owners },
          // The McpUIPreview host reads this and registers a catalog under
          // `mcp.compliance-matrix`. The cockpit then emits these events via
          // postMessage `{type: 'agentbus-event', eventId, payload}`; events
          // marked `autoSubmit: true` get rendered through `chatTemplate`
          // and dispatched as `viewer-auto-prompt`, which App.jsx routes
          // straight into the chat thread.
          agentbusEventsOut: [
            // Note: the Export button no longer emits an agentbus event —
            // it posts a `compliance-cockpit-action` message that the
            // host (Filesystem.jsx) handles by opening the export
            // dialog. Only chat-bound actions belong in this catalog.
            {
              id: 'create-planned-response',
              description:
                'User asked for a planned-response wiki stub for a requirement that does not yet have one. Call the create_planned_response_page tool (mcpGroup: compliance-matrix) with the supplied requirementId/ears/sourceLocation, then summarise what was created and link the new wiki page.',
              autoSubmit: true,
              chatTemplate:
                'Create a planned-response wiki stub for {{requirementId}} in project {{projectName}}. EARS: "{{ears}}". Source: {{sourceLocation}}. Use the create_planned_response_page tool. After it returns, link the new wiki page with a `[[wiki:{{slug}}]]` citation and remind me that the stub is empty — I still need to draft the response and move the row from drafted → reviewed → committed.',
            },
          ],
        };
      }

      case 'get_planned_response': {
        const { projectName, slug } = args as { projectName: string; slug: string };
        const page = await wikiService.getPage(projectName, slug);
        if (!page) {
          return { found: false, slug };
        }
        return {
          found: true,
          slug: page.slug,
          title: page.title,
          body: page.body,
        };
      }

      case 'create_planned_response_page': {
        const { projectName, requirementId, ears, sourceLocation } = args as {
          projectName: string;
          requirementId: string;
          ears?: string;
          sourceLocation?: string;
        };
        const slug = `planned-response/${requirementId.toLowerCase()}`;
        const now = new Date().toISOString();
        const body =
          `# Planned response — ${requirementId}\n\n` +
          (ears ? `> **Requirement (EARS):** ${ears}\n` : '') +
          (sourceLocation ? `> Source: ${sourceLocation}\n\n` : '\n') +
          `## Response (DE) — STUB\n\n` +
          `_Placeholder. Draft the response here, then commit via the ` +
          `compliance-matrix cockpit._\n\n` +
          `## Reuse provenance\n\n` +
          `_Cite the past spec(s) this response pulls from, with ` +
          `\`[[wiki:reuse-base]]\` chips._\n`;
        const result = await wikiService.putPage(projectName, {
          title: `Planned response — ${requirementId}`,
          slug,
          bucket: 'topics',
          body,
          tags: ['planned-response', requirementId.toLowerCase(), 'stub'],
          status: 'stub',
          confidence: 'low',
          mission_relevance: 0.5,
          sources: [
            { kind: 'conversation', turn: now, note: 'created by compliance-matrix cockpit' },
          ],
          classification: 'private',
          provenance: {
            sourceSessions: [],
            sourceEntries: [],
            createdBy: 'user',
            createdAt: now,
            updatedAt: now,
          },
        });
        return { created: true, slug: result.slug, path: result.path, mode: result.mode };
      }

      case 'get_text_file': {
        const { projectName, path: filePath } = args as {
          projectName: string;
          path: string;
        };
        if (!projectName || !filePath) {
          return { found: false, error: 'projectName and path are required' };
        }
        // Path-traversal guard: project-relative only.
        const normalized = filePath.replace(/\\/g, '/');
        if (
          normalized.startsWith('/') ||
          normalized.startsWith('..') ||
          normalized.includes('/../')
        ) {
          return { found: false, error: 'path must be project-relative' };
        }
        const abs = join(WORKSPACE_ROOT, projectName, normalized);
        try {
          const content = await fs.readFile(abs, 'utf-8');
          return { found: true, path: normalized, content };
        } catch (err: any) {
          return { found: false, path: normalized, error: err?.message ?? 'read failed' };
        }
      }

      case 'set_row_state':
      case 'set_row_review':
      case 'set_row_notes': {
        const {
          projectName,
          requirementId,
          coverageRef,
        } = args as {
          projectName: string;
          requirementId: string;
          coverageRef?: string;
        };
        if (!projectName || !requirementId) {
          throw new Error('projectName and requirementId are required');
        }
        const rel = coverageRef ?? 'out/coverage/current.coverage.json';
        const abs = join(WORKSPACE_ROOT, projectName, rel);
        let coverage: any;
        try {
          coverage = JSON.parse(await fs.readFile(abs, 'utf-8'));
        } catch (err: any) {
          throw new Error(`Cannot read coverage at ${rel}: ${err?.message ?? err}`);
        }
        const rows: any[] = Array.isArray(coverage?.rows) ? coverage.rows : [];
        const row = rows.find((r) => r.requirementId === requirementId);
        if (!row) {
          return { success: false, error: `No row with requirementId=${requirementId}` };
        }
        if (toolName === 'set_row_state') {
          row.state = (args as any).state;
          // Recompute stateCounts so the footer chips stay in sync without
          // requiring a full reseed.
          const counts: Record<string, number> = {};
          for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
          coverage.stateCounts = counts;
        } else if (toolName === 'set_row_review') {
          row.reviewStatus = (args as any).reviewStatus;
        } else {
          const next = String((args as any).notes ?? '').trim();
          if (next) row.notes = next;
          else delete row.notes;
        }
        await fs.writeFile(abs, JSON.stringify(coverage, null, 2), 'utf-8');
        return {
          success: true,
          requirementId,
          state: row.state,
          reviewStatus: row.reviewStatus,
          notes: row.notes ?? '',
          stateCounts: coverage.stateCounts,
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
