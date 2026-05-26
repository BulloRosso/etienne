import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join } from 'path';

/** Resource URI for the Fleet Alignment MCP App UI */
export const ALIGNMENT_RESOURCE_URI = 'ui://alignment/fleet-alignment.html';
export const ALIGNMENT_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Alignment Tools Service
 *
 * Provides an MCP tool that receives a `.alignment.json` file's content
 * (the nightly fleet-alignment report produced by the tanker-long-horizon
 * curator cron) and renders it as an interactive dashboard via an MCP App UI.
 */

const tools: McpTool[] = [
  {
    name: 'render_alignment',
    description:
      'Render a .alignment.json fleet-alignment report as an interactive dashboard ' +
      '(fleet summary, per-vessel scoring with axis drill-down, hard-rule compliance grid).',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The name of the alignment file being rendered',
        },
        content: {
          type: 'string',
          description: 'The raw JSON content of the .alignment.json file',
        },
      },
      required: ['content'],
    },
    _meta: {
      ui: {
        resourceUri: ALIGNMENT_RESOURCE_URI,
      },
    },
  } as McpTool & { _meta?: any },
];

/**
 * Load the pre-built Alignment MCP App HTML from mcp-app-alignment/dist/mcp-app.html
 */
export async function loadAlignmentResourceHtml(): Promise<string | null> {
  const candidates = [
    join(__dirname, '..', '..', '..', 'mcp-app-alignment', 'dist', 'mcp-app.html'),
    join(__dirname, '..', '..', 'mcp-app-alignment', 'dist', 'mcp-app.html'),
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

/**
 * Create alignment tools service
 */
export function createAlignmentToolsService(): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'render_alignment': {
        // Parse and validate the alignment JSON, then pass it through
        // so the MCP App UI can render the dashboard.
        const parsed = JSON.parse(args.content);
        return parsed;
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
