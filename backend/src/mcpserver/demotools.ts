import { ToolService, McpTool } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pet Store Warehouse Management Tool Service
 * 
 * Simulates a warehouse management system for a pet store with
 * categories: cats, dogs, and birds.
 * 
 * This service demonstrates how to create MCP tools that can be
 * easily integrated into the MCP server.
 */

/**
 * Tool definitions for the pet store
 */
const tools: McpTool[] = [
  {
    name: 'get_current_week_promotions',
    description: 'Get the current week\'s promotional pet products from a legitimate pet store inventory system. Returns pet supplies, food, and accessories available for adoption or purchase. Filter by pet category (cats, dogs, birds) and price range to browse current offerings.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Pet product category to browse',
          enum: ['cats', 'dogs', 'birds'],
        },
        max_price: {
          type: 'integer',
          description: 'Maximum price in euros to filter results',
          minimum: 0,
        },
      },
      required: ['category'],
    },
  },
];

/**
 * Load the warehouse data from JSON file
 */
function loadWarehouseData(): any {
  const dataPath = path.join(__dirname, 'demodata', 'category_results.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(rawData);
}

/**
 * Get current week's promotions filtered by category and price
 * 
 * @param category - Pet category (cats, dogs, or birds)
 * @param max_price - Optional maximum price filter in euros
 * @returns Filtered promotional items
 */
async function getCurrentWeekPromotions(
  category: string,
  max_price?: number
): Promise<any> {
  // Load the full warehouse data
  const warehouseData = loadWarehouseData();

  // Find the requested category
  const categoryData = warehouseData.categories.find(
    (cat: any) => cat.name === category
  );

  if (!categoryData) {
    throw new Error(`Category "${category}" not found. Available categories: cats, dogs, birds`);
  }

  // Filter items by max_price if provided
  let filteredItems = categoryData.items;
  if (max_price !== undefined) {
    filteredItems = filteredItems.filter(
      (item: any) => item.price_euro <= max_price
    );
  }

  // Return the filtered results
  return {
    categories: [
      {
        name: categoryData.name,
        items: filteredItems,
      },
    ],
    promotion_period: {
      start: getCurrentMonday(),
      end: getCurrentSunday(),
    },
    total_items: filteredItems.length,
  };
}

/**
 * Get the current week's Monday date
 */
function getCurrentMonday(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/**
 * Get the current week's Sunday date
 */
function getCurrentSunday(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + 7;
  const sunday = new Date(today.setDate(diff));
  return sunday.toISOString().split('T')[0];
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
    case 'get_current_week_promotions':
      return getCurrentWeekPromotions(args.category, args.max_price);
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Export the demo tools service
 * This object conforms to the ToolService interface
 */
export const demoToolsService: ToolService = {
  tools,
  execute,
};