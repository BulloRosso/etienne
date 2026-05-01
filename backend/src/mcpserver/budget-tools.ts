import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join } from 'path';

/** Resource URI for the Budget Donut Chart MCP App UI */
export const BUDGET_RESOURCE_URI = 'ui://budget/donut-chart.html';
export const BUDGET_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Budget Tools Service
 *
 * Provides an MCP tool that receives .budget.json file content
 * and renders it as an interactive donut chart via an MCP App UI.
 */

const tools: McpTool[] = [
  {
    name: 'render_budget',
    description: 'Render a .budget.json file as an interactive donut chart. The file content is passed as a string and visualized in the MCP App UI.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The name of the budget file being rendered',
        },
        content: {
          type: 'string',
          description: 'The raw JSON content of the .budget.json file',
        },
      },
      required: ['content'],
    },
    _meta: {
      ui: {
        resourceUri: BUDGET_RESOURCE_URI,
      },
    },
  } as McpTool & { _meta?: any },
];

/**
 * Load the pre-built Budget MCP App HTML from mcp-app-budget/dist/mcp-app.html
 */
export async function loadBudgetResourceHtml(): Promise<string | null> {
  const candidates = [
    join(__dirname, '..', '..', '..', 'mcp-app-budget', 'dist', 'mcp-app.html'),
    join(__dirname, '..', '..', 'mcp-app-budget', 'dist', 'mcp-app.html'),
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
 * Create budget tools service
 */
export function createBudgetToolsService(): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'render_budget': {
        // Parse and validate the budget JSON, then pass it through
        // so the MCP App UI can render the donut chart.
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
