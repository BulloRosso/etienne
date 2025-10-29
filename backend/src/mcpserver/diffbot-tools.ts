import { ToolService, McpTool } from './types';
import axios from 'axios';

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
    description: 'Query the Diffbot Knowledge Graph for Basic Materials Companies. Returns organization data including company names, employee counts, and locations. Filter by country to find companies in specific regions.',
    inputSchema: {
      type: 'object',
      properties: {
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
      required: [],
    },
  },
];

/**
 * Get internet/basic materials companies from Diffbot Knowledge Graph
 *
 * @param country_name - Country to filter companies by (defaults to "United States")
 * @param limit_to_n_top_entries - Maximum number of results to return (defaults to 10)
 * @returns Company data with top N results and total count
 */
async function getInternetCompanies(
  country_name: string = 'United States',
  limit_to_n_top_entries: number = 10
): Promise<any> {
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
    filter: 'name description locations homepageUri'
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

    return {
      companies: companies,
      total_results: totalResults,
      query: {
        country: country_name,
        category: 'Basic Materials Companies',
      },
      metadata: {
        returned_count: companies.length,
        api_version: 'v3',
      },
    };
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
      return getInternetCompanies(args.country_name, args.limit_to_n_top_entries);

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
