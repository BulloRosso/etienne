import { ToolService, McpTool } from './types';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Diffbot Knowledge Graph Tool Service
 *
 * Provides access to Diffbot's Knowledge Graph API for querying
 * organization data using DQL (Diffbot Query Language).
 *
 * This service demonstrates integration with external APIs
 * through MCP tools.
 */

/**
 * Tool definitions for Diffbot API
 */
const tools: McpTool[] = [
  {
    name: 'get_internet_companies',
    description: 'Query the Diffbot Knowledge Graph for Basic Materials Companies. Returns organization data including company names, employee counts, and locations. Filter by country to find companies in specific regions. Saves results to workspace/<project>/diffbot-data/<country_name>.json',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        country_name: {
          type: 'string',
          description: 'Country name to filter companies by location (e.g., "United States", "Germany", "Japan")',
          default: 'United States',
        },
        limit_to_n_top_entries: {
          type: 'integer',
          description: 'Maximum number of top companies to return, sorted by employee count (descending)',
          default: 10,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['project'],
    },
  },
];

/**
 * Get internet/basic materials companies from Diffbot Knowledge Graph
 *
 * @param project - Project name (workspace directory)
 * @param country_name - Country to filter companies by (defaults to "United States")
 * @param limit_to_n_top_entries - Maximum number of results to return (defaults to 10)
 * @returns Company data with total results count and saved file path
 */
async function getInternetCompanies(
  project: string,
  country_name: string = 'United States',
  limit_to_n_top_entries: number = 10
): Promise<any> {
  if (!project) {
    throw new Error('Project name is required. Extract it from the workspace path.');
  }
  // Get the Diffbot API token from environment
  const token = process.env.DIFFBOT_TOKEN;

  if (!token) {
    throw new Error('DIFFBOT_TOKEN environment variable is not set');
  }

  // Build the DQL query
  const dqlQuery = `type:Organization categories.name:"Basic Materials Companies" location.country.name:"${country_name}" revSortBy:nbEmployees`;

  // Construct the API URL with query parameters
  const apiUrl = 'https://kg.diffbot.com/kg/v3/dql';
  const params = new URLSearchParams({
    token: token,
    query: dqlQuery,
    size: String(limit_to_n_top_entries),
    filter: 'name description homepageUri'
  });

  try {
    // Make the API request
    const response = await axios.get(`${apiUrl}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    // Extract data from response
    const data = response.data;
    const companies = data.data || [];
    const totalResults = data.hits || 0;

    // Prepare the result object to save
    const resultData = {
      companies: companies,
      total_results: totalResults,
      query: {
        country: country_name,
        category: 'Basic Materials Companies',
      },
      metadata: {
        returned_count: companies.length,
        api_version: 'v3',
        fetched_at: new Date().toISOString(),
      },
    };

    // Create the workspace directory structure
    const workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
    const projectDir = path.join(workspaceRoot, project);
    const diffbotDataDir = path.join(projectDir, 'diffbot-data');

    try {
      // Create directories if they don't exist
      await fs.mkdir(diffbotDataDir, { recursive: true });

      // Sanitize country name for filename (replace spaces and special chars)
      const sanitizedCountryName = country_name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      // Create the filename
      const filename = `${sanitizedCountryName}.json`;
      const filePath = path.join(diffbotDataDir, filename);

      // Write the JSON data to file
      await fs.writeFile(filePath, JSON.stringify(resultData, null, 2), 'utf-8');

      // Return the summary with total results and filename
      const relativeFilePath = `workspace/${project}/diffbot-data/${filename}`;

      return {
        success: true,
        total_results: totalResults,
        returned_count: companies.length,
        file_saved_to: relativeFilePath,
        absolute_path: filePath,
        message: `Successfully fetched ${companies.length} companies (${totalResults} total) and saved to ${relativeFilePath}`,
      };
    } catch (fileError: unknown) {
      const errorMsg = fileError instanceof Error ? fileError.message : String(fileError);
      throw new Error(`Failed to write file to workspace: ${errorMsg}. WorkspaceRoot: ${workspaceRoot}, Project: ${project}`);
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.error || error.message;
      throw new Error(`Diffbot API error (${statusCode}): ${errorMessage}`);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch companies: ${errorMessage}`);
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
    case 'get_internet_companies':
      return getInternetCompanies(args.project, args.country_name, args.limit_to_n_top_entries);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Export the Diffbot tools service
 * This object conforms to the ToolService interface
 */
export const diffbotToolsService: ToolService = {
  tools,
  execute,
};
