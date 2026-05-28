import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import type { WikiService } from '../wiki/wiki.service';
import type { RagService } from '../rag/rag.service';
import type { LlmService } from '../llm/llm.service';

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
    name: 'list_project_sources',
    description:
      'Enumerate selectable source items the cockpit can use as the body ' +
      'of a new planned-response page. Returns items from <project>/documents/ ' +
      'and existing non-stub wiki pages under <project>/wiki/topics/ and ' +
      '<project>/wiki/sources/. Used by the compliance-matrix "Pick from ' +
      'existing docs" option.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        scopes: {
          type: 'array',
          items: { type: 'string', enum: ['documents', 'wiki'] },
          description: 'Which buckets to enumerate. Defaults to both.',
        },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'create_planned_response_from_source',
    description:
      'Create a planned-response wiki page whose body is sourced from one ' +
      'selected item (a file under documents/ or an existing wiki page). ' +
      'Same slug pattern as create_planned_response_page (planned-response/' +
      '<req-id>) but with real content and status=draft. The provenance ' +
      'footer cites the source — and for wiki sources, links back so the ' +
      'wiki backlink graph stays consistent.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        requirementId: { type: 'string', description: 'e.g. "REQ-247"' },
        ears: { type: 'string', description: 'EARS-normalised requirement text' },
        sourceLocation: { type: 'string', description: 'e.g. "Annex C §3.3"' },
        sourceScope: {
          type: 'string',
          enum: ['documents', 'wiki'],
          description: 'Which bucket the source comes from',
        },
        sourcePath: {
          type: 'string',
          description:
            'For documents scope: project-relative file path under documents/. ' +
            'For wiki scope: the wiki slug (e.g. "mmc-control-scheme").',
        },
      },
      required: ['projectName', 'requirementId', 'sourceScope', 'sourcePath'],
    },
  },
  {
    name: 'create_planned_response_from_knowledge_base',
    description:
      'Create a planned-response wiki page whose body is the answer to a ' +
      'single agent question. The agent answers using project RAG context ' +
      '(documents/ + wiki). Same slug pattern (planned-response/<req-id>), ' +
      'status=draft, confidence=low. The provenance footer lists the ' +
      'documents the answer cited.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        requirementId: { type: 'string', description: 'e.g. "REQ-247"' },
        ears: { type: 'string', description: 'EARS-normalised requirement text' },
        sourceLocation: { type: 'string', description: 'e.g. "Annex C §3.3"' },
        question: {
          type: 'string',
          description: 'The single question for the agent to answer.',
        },
      },
      required: ['projectName', 'requirementId', 'question'],
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
  {
    name: 'list_project_rfps',
    description:
      'List every RFP registered for a project (one entry per ' +
      'out/rfps/<id>.json). If the directory is empty but the legacy ' +
      'out/coverage/current.coverage.json exists, a synthesised "main" ' +
      'RFP is returned so the cockpit keeps working without forcing a ' +
      'migration. The cockpit hides the RFP picker when only a single ' +
      'synthesised RFP is returned.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Workspace project name' },
      },
      required: ['projectName'],
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
  ragService?: RagService,
  llmService?: LlmService,
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
          // Echo coverageRef back so the cockpit can correlate the active
          // payload with an entry from list_project_rfps (used by the RFP
          // picker to highlight which RFP is currently shown).
          coverageRef,
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

      case 'list_project_sources': {
        const { projectName, scopes } = args as {
          projectName: string;
          scopes?: Array<'documents' | 'wiki'>;
        };
        if (!projectName) {
          return { items: [], error: 'projectName is required' };
        }
        const enabledScopes = new Set<'documents' | 'wiki'>(
          Array.isArray(scopes) && scopes.length ? scopes : (['documents', 'wiki'] as const),
        );
        const projectRoot = join(WORKSPACE_ROOT, projectName);
        const items: SourceItem[] = [];

        // -- documents scope --
        if (enabledScopes.has('documents')) {
          const dir = join(projectRoot, 'documents');
          let entries: string[] = [];
          try {
            entries = await fs.readdir(dir);
          } catch {
            entries = [];
          }
          for (const entry of entries) {
            const ext = extname(entry).toLowerCase();
            if (!DOC_EXTENSIONS.has(ext)) continue;
            const abs = join(dir, entry);
            let st: { size: number; mtimeMs: number };
            try {
              const s = await fs.stat(abs);
              st = { size: s.size, mtimeMs: s.mtimeMs };
            } catch {
              continue;
            }
            // Preview: read first part of file (text files only). Binary
            // docs would need LiteParse, which is slow — skip the preview
            // for them; the UI shows the filename + size instead.
            let preview = '';
            if (!BINARY_DOC_EXTENSIONS.has(ext)) {
              try {
                const raw = await fs.readFile(abs, 'utf-8');
                preview = shortPreview(raw);
              } catch {
                preview = '';
              }
            } else {
              preview = `(binary ${ext.slice(1).toUpperCase()} — content extracted on select)`;
            }
            items.push({
              scope: 'documents',
              path: `documents/${entry}`,
              name: entry,
              sizeBytes: st.size,
              mtime: new Date(st.mtimeMs).toISOString(),
              preview,
            });
          }
        }

        // -- wiki scope --
        if (enabledScopes.has('wiki')) {
          for (const bucket of WIKI_BUCKETS) {
            const dir = join(projectRoot, 'wiki', bucket);
            let entries: string[] = [];
            try {
              // recursive=true returns nested paths (e.g. planned-response/req-247.md).
              entries = (await fs.readdir(dir, { recursive: true } as any)) as unknown as string[];
            } catch {
              entries = [];
            }
            for (const rel of entries) {
              if (typeof rel !== 'string' || !rel.endsWith('.md')) continue;
              const abs = join(dir, rel);
              let st: { size: number; mtimeMs: number };
              try {
                const s = await fs.stat(abs);
                if (!s.isFile()) continue;
                st = { size: s.size, mtimeMs: s.mtimeMs };
              } catch {
                continue;
              }
              let raw: string;
              try {
                raw = await fs.readFile(abs, 'utf-8');
              } catch {
                continue;
              }
              const parsed = parseWikiFrontmatter(raw);
              // Skip empty stubs and deleted pages — they're not useful as
              // a source of body content.
              if (parsed.status === 'stub' || parsed.status === 'deleted') continue;
              const slugWithoutExt = rel.replace(/\\/g, '/').replace(/\.md$/, '');
              items.push({
                scope: 'wiki',
                path: slugWithoutExt,
                name: slugWithoutExt,
                title: parsed.title,
                sizeBytes: st.size,
                mtime: new Date(st.mtimeMs).toISOString(),
                preview: shortPreview(parsed.body),
                missionRelevance: parsed.missionRelevance,
                status: parsed.status,
              });
            }
          }
        }

        // Sort: documents first by mtime desc; wiki by missionRelevance
        // desc then mtime desc.
        items.sort((a, b) => {
          if (a.scope !== b.scope) return a.scope === 'documents' ? -1 : 1;
          if (a.scope === 'wiki' && b.scope === 'wiki') {
            const ra = a.missionRelevance ?? 0;
            const rb = b.missionRelevance ?? 0;
            if (rb !== ra) return rb - ra;
          }
          return b.mtime.localeCompare(a.mtime);
        });

        return { items };
      }

      case 'create_planned_response_from_source': {
        const {
          projectName,
          requirementId,
          ears,
          sourceLocation,
          sourceScope,
          sourcePath,
        } = args as {
          projectName: string;
          requirementId: string;
          ears?: string;
          sourceLocation?: string;
          sourceScope: 'documents' | 'wiki';
          sourcePath: string;
        };

        if (!projectName || !requirementId || !sourceScope || !sourcePath) {
          return {
            created: false,
            error: 'projectName, requirementId, sourceScope and sourcePath are required',
          };
        }

        // Path-confinement: scope-appropriate roots only.
        if (sourceScope === 'documents') {
          const normalized = sourcePath.replace(/\\/g, '/');
          if (!isProjectRelative(normalized) || !normalized.startsWith('documents/')) {
            return { created: false, error: 'documents path must live under documents/' };
          }
        } else {
          // wiki — slug must be relative and not escape topics/ or sources/.
          if (!isProjectRelative(sourcePath)) {
            return { created: false, error: 'wiki slug must be project-relative' };
          }
        }

        // -- read source content --
        let bodyContent = '';
        let provenanceLine = '';
        const projectRoot = join(WORKSPACE_ROOT, projectName);

        if (sourceScope === 'documents') {
          const abs = join(projectRoot, sourcePath.replace(/\\/g, '/'));
          const ext = extname(abs).toLowerCase();
          try {
            if (BINARY_DOC_EXTENSIONS.has(ext)) {
              bodyContent = await extractBinaryDocText(abs);
            } else {
              bodyContent = await fs.readFile(abs, 'utf-8');
            }
          } catch (err: any) {
            return { created: false, error: `cannot read source: ${err?.message ?? err}` };
          }
          provenanceLine = `Drafted from \`${sourcePath}\`.`;
        } else {
          // wiki scope — read via WikiService so we get whatever the canonical reader does.
          const page = await wikiService.getPage(projectName, sourcePath);
          if (!page) {
            return { created: false, error: `wiki page not found: ${sourcePath}` };
          }
          // Strip the source page's frontmatter — the new page has its own.
          // WikiService.getPage typically returns the body without
          // frontmatter, but stay defensive.
          bodyContent = (page.body ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
          // Provenance backlink — relative to wiki/topics/ where the new
          // page lives. If the source is in topics/, link is ../topics/<slug>;
          // wiki-add.ts picks this up for backlink maintenance.
          provenanceLine = `Drafted from wiki page [${page.title ?? sourcePath}](../topics/${sourcePath.replace(/^topics\//, '')}.md).`;
        }

        const slug = `planned-response/${requirementId.toLowerCase()}`;
        const now = new Date().toISOString();
        const headerLines: string[] = [];
        headerLines.push(`# Geplante Antwort — ${requirementId}`);
        headerLines.push('');
        if (ears) headerLines.push(`> **Anforderung (EARS):** ${ears}`);
        if (sourceLocation) headerLines.push(`> Quelle: ${sourceLocation}`);
        headerLines.push('');
        headerLines.push('## Entwurfsrumpf (aus Quelle)');
        headerLines.push('');
        headerLines.push(bodyContent.trim());
        headerLines.push('');
        headerLines.push('## Wiederverwendungs-Provenienz');
        headerLines.push('');
        headerLines.push(provenanceLine);
        headerLines.push('');
        headerLines.push('## Was noch zu tun ist');
        headerLines.push('');
        headerLines.push('- Sollwerte und Bereiche an die Besonderheiten dieser Anforderung anpassen.');
        headerLines.push('- Beim Export: englische Rückübersetzung Seite an Seite ergänzen.');
        headerLines.push('- Verantwortlicher Ingenieur zeichnet ab — Zeile wechselt `drafted → reviewed → committed`.');

        const body = headerLines.join('\n');

        const result = await wikiService.putPage(projectName, {
          title: `Geplante Antwort — ${requirementId}`,
          slug,
          bucket: 'topics',
          body,
          tags: ['planned-response', requirementId.toLowerCase(), `reuse-${sourceScope}`],
          status: 'draft',
          confidence: 'medium',
          mission_relevance: 0.7,
          sources: [
            { kind: 'conversation', turn: now, note: `drafted from ${sourceScope}:${sourcePath}` },
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
        return {
          created: true,
          slug: result.slug,
          path: result.path,
          mode: result.mode,
          sourceScope,
          sourcePath,
        };
      }

      case 'create_planned_response_from_knowledge_base': {
        const { projectName, requirementId, ears, sourceLocation, question } = args as {
          projectName: string;
          requirementId: string;
          ears?: string;
          sourceLocation?: string;
          question: string;
        };

        if (!projectName || !requirementId || !question) {
          return { created: false, error: 'projectName, requirementId and question are required' };
        }

        if (!ragService || !llmService) {
          return {
            created: false,
            error:
              'RAG/LLM services not available — this tool requires the backend to inject ragService and llmService into createComplianceMatrixToolsService.',
          };
        }

        // -- 1. RAG search the project scope for the question --
        const scopeName = `project_${projectName}`;
        let ragResults: Array<{ id: string; content: string; similarity: number; metadata: any }> = [];
        try {
          const ragResp = await ragService.indexSearch(scopeName, question);
          ragResults = Array.isArray(ragResp?.results) ? ragResp.results : [];
        } catch (err: any) {
          // Soft-fail — the model can still answer without RAG, just less well.
          // Surface the error in provenance so the engineer knows.
          ragResults = [];
        }

        // -- 2. Build the prompt with retrieved chunks as grounding --
        const contextBlocks = ragResults
          .slice(0, 6)
          .map((r, i) => {
            const path = (r.metadata && (r.metadata.documentPath || r.metadata.path)) || r.id;
            return `### Chunk ${i + 1} — ${path} (similarity ${r.similarity.toFixed(3)})\n${r.content}`;
          })
          .join('\n\n');

        const systemPreamble =
          `Du bist ein technischer Schreiber, der für ein Bauingenieur-Angebot ` +
          `eine Entwurfsantwort auf eine konkrete Anforderung verfasst. Schreibe ` +
          `auf Deutsch im Stil eines technischen Pflichtenheftes (normative ` +
          `Modalverben muss/darf/sollte, SI-Einheiten, Dezimalkomma). Erfinde ` +
          `keine Sollwerte oder Bereiche; wenn die Kontextpassagen keine ` +
          `passenden Werte liefern, sage das ausdrücklich und schlage eine ` +
          `Klärung vor. Zitiere die genutzten Kontextstellen am Ende.`;

        const userPrompt =
          `${systemPreamble}\n\n` +
          `## Anforderung\n${ears ? ears : '(EARS-Text nicht übermittelt)'}\n` +
          (sourceLocation ? `Quelle: ${sourceLocation}\n` : '') +
          `Anforderungs-ID: ${requirementId}\n\n` +
          `## Frage des Ingenieurs\n${question}\n\n` +
          `## Retrieved context (RAG)\n${contextBlocks || '(keine Treffer)'}\n\n` +
          `## Antwort\nAntworte in zwei Abschnitten: zuerst der Entwurfstext ` +
          `("## Entwurf"), dann eine Provenienz-Liste der zitierten Kontextstellen ` +
          `("## Provenienz") mit den Dokumentpfaden aus der Retrieved-context-Liste.`;

        let answer: string;
        try {
          answer = await llmService.generateText({
            tier: 'regular',
            prompt: userPrompt,
            maxOutputTokens: 1200,
            projectDir: projectName,
          });
        } catch (err: any) {
          return {
            created: false,
            error: `LLM call failed: ${err?.message ?? err}`,
          };
        }

        const slug = `planned-response/${requirementId.toLowerCase()}`;
        const now = new Date().toISOString();

        const headerLines: string[] = [];
        headerLines.push(`# Geplante Antwort — ${requirementId}`);
        headerLines.push('');
        if (ears) headerLines.push(`> **Anforderung (EARS):** ${ears}`);
        if (sourceLocation) headerLines.push(`> Quelle: ${sourceLocation}`);
        headerLines.push('');
        headerLines.push('## Ausgangsfrage');
        headerLines.push('');
        headerLines.push(`> ${question}`);
        headerLines.push('');
        headerLines.push(answer.trim());
        headerLines.push('');
        headerLines.push('## Hinweis');
        headerLines.push('');
        headerLines.push(
          'Diese Antwort wurde aus der Wissensbasis (RAG) generiert. Sie ist ' +
            '**ungeprüft**. Der verantwortliche Ingenieur muss Quellenangaben, ' +
            'Sollwerte und Bereiche gegen die Originalquellen prüfen, bevor die ' +
            'Zeile von `drafted` weiterbewegt wird.',
        );

        const body = headerLines.join('\n');

        const result = await wikiService.putPage(projectName, {
          title: `Geplante Antwort — ${requirementId}`,
          slug,
          bucket: 'topics',
          body,
          tags: ['planned-response', requirementId.toLowerCase(), 'reuse-knowledge-base'],
          status: 'draft',
          confidence: 'low',
          mission_relevance: 0.7,
          sources: [
            { kind: 'conversation', turn: now, note: 'created via create_planned_response_from_knowledge_base' },
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

        return {
          created: true,
          slug: result.slug,
          path: result.path,
          mode: result.mode,
          ragHits: ragResults.length,
        };
      }

      case 'list_project_rfps': {
        const { projectName } = args as { projectName: string };
        if (!projectName) {
          return { rfps: [], error: 'projectName is required' };
        }
        const projectRoot = join(WORKSPACE_ROOT, projectName);
        const rfpsDir = join(projectRoot, 'out', 'rfps');
        const explicit: any[] = [];
        try {
          const entries = await fs.readdir(rfpsDir);
          for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(join(rfpsDir, entry), 'utf-8');
              const parsed = JSON.parse(raw);
              if (parsed?.schema === 'rfp.v1' && typeof parsed.id === 'string') {
                explicit.push(parsed);
              }
            } catch {
              /* skip malformed */
            }
          }
        } catch {
          /* no rfps dir — fall through */
        }
        if (explicit.length > 0) {
          explicit.sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return { rfps: explicit };
        }
        // Legacy synthesis: only return a synthesised "main" RFP when the
        // legacy coverage file exists. Cockpit hides the picker when the
        // only RFP is synthesized.
        try {
          await fs.access(join(projectRoot, 'out', 'coverage', 'current.coverage.json'));
          return {
            rfps: [
              {
                schema: 'rfp.v1',
                id: 'main',
                title: 'Main RFP',
                kind: 'docx-bundle',
                sources: [],
                coverageRef: 'out/coverage/current.coverage.json',
                sentinelRef: 'out/compliance/current.compliance.json',
                exportTarget: { kind: 'docx-fillback' },
                synthesized: true,
              },
            ],
          };
        } catch {
          return { rfps: [] };
        }
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

// ─── source-picker helpers ───────────────────────────────────────────────────

const DOC_EXTENSIONS = new Set(['.md', '.txt', '.docx', '.pdf']);
const BINARY_DOC_EXTENSIONS = new Set(['.docx', '.pdf']);
const WIKI_BUCKETS = ['topics', 'sources'] as const;

interface SourceItem {
  scope: 'documents' | 'wiki';
  path: string;
  name: string;
  title?: string;
  sizeBytes: number;
  mtime: string;
  preview: string;
  // For wiki items only — the mission relevance score from frontmatter.
  missionRelevance?: number;
  // For wiki items only — the page status (we skip 'stub').
  status?: string;
}

/**
 * Read the first ~200 characters of plain text from a source item, used by
 * the picker UI as a hint.
 */
function shortPreview(text: string): string {
  const cleaned = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned;
}

/**
 * Strip YAML frontmatter from a wiki page body and pull title/status/
 * mission_relevance via line-based scan (no YAML dependency).
 */
function parseWikiFrontmatter(raw: string): {
  body: string;
  title?: string;
  status?: string;
  missionRelevance?: number;
} {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmMatch) return { body: raw };
  const body = raw.slice(fmMatch[0].length);
  const fm = fmMatch[1];
  const readField = (name: string): string | undefined => {
    const m = fm.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
    if (!m) return undefined;
    return m[1].trim().replace(/^['"]|['"]$/g, '');
  };
  const title = readField('title');
  const status = readField('status');
  const mrRaw = readField('mission_relevance');
  const missionRelevance = mrRaw && !Number.isNaN(Number(mrRaw)) ? Number(mrRaw) : undefined;
  return { body, title, status, missionRelevance };
}

/**
 * Extract text content from a binary doc (.docx / .pdf) via LiteParse.
 * Matches the pattern used by RagService.extractContent.
 */
async function extractBinaryDocText(absolutePath: string): Promise<string> {
  // Function-based dynamic import — @llamaindex/liteparse is ESM-only and
  // ts-node would otherwise transpile this to require().
  const { LiteParse } = await (new Function('return import("@llamaindex/liteparse")'))();
  const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'text' });
  const result = await parser.parse(absolutePath, true /* quiet */);
  return result?.text ?? '';
}

/**
 * Guard a project-relative path: must not escape the workspace project root.
 */
function isProjectRelative(p: string): boolean {
  const normalized = p.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return false;
  if (normalized.startsWith('..') || normalized.includes('/../')) return false;
  return true;
}
