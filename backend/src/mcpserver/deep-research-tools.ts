import { ToolService, McpTool } from './types';
import { DeepResearchService } from '../deep-research/deep-research.service';

/**
 * Deep Research Tool Service
 *
 * Provides MCP tools for conducting deep research using OpenAI's o3-deep-research model.
 * This allows Claude Code to trigger research tasks from within the workspace.
 */

/**
 * Tool definitions for deep research
 */
const tools: McpTool[] = [
  {
    name: 'start_deep_research',
    description: 'Start a deep research task using OpenAI o3-deep-research model. Reads a research brief markdown file from the workspace and generates a comprehensive research report with citations. The research runs asynchronously and results are written to a .research file. NOTE: You must extract the project name from the workspace context (typically the directory name after /workspace/).',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        input_file: {
          type: 'string',
          description: 'Relative path to the research brief markdown file within the workspace (e.g., "research/my-brief.md"). This file should contain the research question or topic to investigate.',
        },
        output_file: {
          type: 'string',
          description: 'Relative path for the output .research file (e.g., "docs/results.research"). If not provided, a default filename will be generated.',
        },
      },
      required: ['project', 'input_file'],
    },
  },
];

/**
 * Create a deep research tool service with injected dependencies
 * @param deepResearchService - The deep research service instance
 * @returns ToolService instance
 */
export function createDeepResearchToolsService(
  deepResearchService: DeepResearchService,
): ToolService {
  /**
   * Start a deep research task
   *
   * @param project - Project name
   * @param input_file - Relative path to research brief file
   * @param output_file - Optional relative path for output file
   * @returns Research session information
   */
  async function startDeepResearch(
    project: string,
    input_file: string,
    output_file?: string,
  ): Promise<any> {
    if (!deepResearchService) {
      throw new Error('Deep research service not initialized. Make sure OPENAI_API_KEY is set.');
    }

    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    try {
      const result = await deepResearchService.startResearch(
        project,
        input_file,
        output_file,
      );

      return {
        success: true,
        message: `Research task started successfully. Results will be written to: ${result.outputFile}`,
        sessionId: result.sessionId,
        inputFile: result.inputFile,
        outputFile: result.outputFile,
        note: 'The research is running asynchronously. Monitor the output file or event stream for progress.',
      };
    } catch (error: any) {
      throw new Error(`Failed to start research: ${error.message}`);
    }
  }

  /**
   * Execute a tool by name with given arguments
   *
   * @param toolName - Name of the tool to execute
   * @param args - Arguments for the tool
   * @returns Tool execution result
   */
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'start_deep_research':
        return startDeepResearch(args.project, args.input_file, args.output_file);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
