import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join, normalize, sep } from 'path';

/**
 * Application-Simulator MCP tools
 *
 * Use case (Lumitec onboarding context, generalises to anyone): the expert
 * wants the trainee to *practice* a few clicks in a small mock of an
 * external app (SAP MD04, a CRM, an ERP). We don't reimplement these apps;
 * we render an agent-generated mini-version — 1-3 screens, hot-spots, an
 * expected click sequence — and stream every click back to the agent so it
 * can coach in real time.
 *
 * Authoring path:
 *   - Expert (or the agent on the expert's behalf) writes a self-contained
 *     MUI/React HTML file to out/simulators/<app>.simulator.html in the
 *     project workspace. The HTML emits `viewer-state-update` postMessage
 *     events every click; the host (McpUIPreview) forwards those into the
 *     model's viewerState — same channel the budget app already uses.
 *
 * Render path:
 *   - The trainee opens out/simulators/<app>.simulator.html (or the agent
 *     calls `render_simulator` with the file path / content).
 *   - We surface a fixed MCP UI resource URI ui://simulator/runner.html.
 *     The resource loader returns whatever HTML was most recently requested
 *     via the tool call — scoped per-session by the MCP server's
 *     session-id-keyed cache below.
 *
 * Authoring helper:
 *   - The `simulator-author` skill (project-local, see
 *     scripts/seed-knowledge-transfer/skill-templates/simulator-author/SKILL.md)
 *     tells the agent the contract for the HTML payload — what postMessage
 *     shape to use, what hot-spot pattern to follow, what coaching text to
 *     wrap each step with.
 */

export const SIMULATOR_RESOURCE_URI = 'ui://simulator/runner.html';
export const SIMULATOR_RESOURCE_MIME = 'text/html;profile=mcp-app';

// Per-process cache: most-recently-requested simulator HTML, keyed by
// project. Frontend always calls the tool first, then ReadResource — this
// race is safe within a single process. We don't try to be clever about
// concurrent users of the same project; whoever clicked most recently wins
// the next ReadResource, and the frontend already gates by tool result.
interface SimulatorCacheEntry {
  html: string;
  appId: string;
  loadedAt: number;
  filePath: string;
}
const simulatorCache = new Map<string, SimulatorCacheEntry>();

function cacheKey(projectRoot: string | undefined): string {
  return projectRoot || '__default__';
}

const tools: McpTool[] = [
  {
    name: 'render_simulator',
    description:
      'Render an application simulator (e.g. SAP MD04, a CRM screen, an ERP form) as an interactive mini-app in the preview pane. The simulator HTML must already exist under out/simulators/<app>.simulator.html in the project workspace — author it via the simulator-author skill if it does not. The trainee\'s clicks are streamed back to the agent via viewerState so the agent can coach step by step.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description:
            'Project-relative path to the simulator HTML, e.g. "out/simulators/sap-md04.simulator.html". Required.',
        },
        content: {
          type: 'string',
          description:
            'Optional inline HTML. If provided, this is used directly and the file is not read from disk — useful when the agent is generating a one-shot simulator without persisting it. When omitted, the HTML is loaded from `filename`.',
        },
        projectName: {
          type: 'string',
          description: 'Active project name. Filled in automatically by the host (McpUIPreview).',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'highlight_simulator_step',
    description:
      'Tell the currently-displayed simulator to highlight or advance to a specific step. Use this to coach the trainee — e.g. "now find the customer field" — without rerendering the whole simulator. The simulator HTML must implement the viewer-command handler (the simulator-author skill includes the boilerplate).',
    inputSchema: {
      type: 'object',
      properties: {
        stepId: {
          type: 'string',
          description: 'Identifier of the step to highlight, as defined in the simulator HTML\'s step list.',
        },
        hint: {
          type: 'string',
          description: 'Optional short coaching hint to display alongside the highlight.',
        },
      },
      required: ['stepId'],
    },
  },
];

function safeResolve(workspaceRoot: string, projectName: string, relPath: string): string {
  // Reject anything that escapes the project directory.
  const projectRoot = normalize(join(workspaceRoot, projectName));
  const candidate = normalize(join(projectRoot, relPath));
  if (!candidate.startsWith(projectRoot + sep) && candidate !== projectRoot) {
    throw new Error(`Refusing to read outside the project: ${relPath}`);
  }
  return candidate;
}

/**
 * Reads the HTML the last render_simulator call asked for. Bound by the
 * factory at registration time so the workspace root is closed over.
 */
export function makeSimulatorResourceLoader(workspaceRoot: string) {
  return async (): Promise<string | null> => {
    // We cannot reach per-request context from the MCP resource loader; this
    // is invoked by the SDK directly. We always return the most-recently
    // cached HTML across any project. The frontend always pairs ReadResource
    // with a fresh tool call to render_simulator that populated the cache,
    // so this is the right HTML by construction.
    const entries = [...simulatorCache.values()];
    if (entries.length === 0) return null;
    entries.sort((a, b) => b.loadedAt - a.loadedAt);
    return entries[0].html;
  };
}

export function createSimulatorToolsService(workspaceRoot: string): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'render_simulator': {
        const { filename, content, projectName } = args ?? {};
        if (!filename || typeof filename !== 'string') {
          throw new Error('render_simulator: `filename` is required');
        }

        let html: string;
        if (typeof content === 'string' && content.length > 0) {
          html = content;
        } else {
          if (!projectName) {
            throw new Error(
              'render_simulator: either `content` must be inlined, or `projectName` must be provided so the file can be loaded.',
            );
          }
          const abs = safeResolve(workspaceRoot, projectName, filename);
          html = await fs.readFile(abs, 'utf-8');
        }

        const filePath = filename;
        // crude appId derivation from filename — purely for the chat result
        const appId =
          filename
            .split(/[/\\]/)
            .pop()
            ?.replace(/\.simulator\.html?$/i, '') ?? 'unknown';

        simulatorCache.set(cacheKey(projectName), {
          html,
          appId,
          loadedAt: Date.now(),
          filePath,
        });

        // The chat-side return value is small structured metadata so the
        // model can reason about which simulator is now open. The actual
        // HTML is delivered to the frontend via the MCP UI resource fetch.
        return {
          appId,
          filename: filePath,
          renderedAt: new Date().toISOString(),
          note:
            'Simulator is now open in the preview pane. The trainee\'s clicks will arrive via viewerState updates — coach them through the expected sequence.',
        };
      }

      case 'highlight_simulator_step': {
        const { stepId, hint } = args ?? {};
        if (!stepId) throw new Error('highlight_simulator_step: `stepId` is required');
        return {
          _action: 'highlight-step',
          stepId,
          hint: hint ?? null,
        };
      }

      default:
        throw new Error(`Unknown simulator tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
