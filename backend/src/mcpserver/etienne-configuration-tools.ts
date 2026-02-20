import { ToolService, McpTool } from './types';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { promises as fs } from 'fs';
import { join } from 'path';

/** Resource URI for the MCP App dashboard UI */
export const ETIENNE_CONFIG_RESOURCE_URI = 'ui://etienne-config/dashboard.html';
export const ETIENNE_CONFIG_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Etienne Configuration Tool Service
 *
 * Provides MCP tools for managing services via the process manager
 * and backend configuration via the .env file.
 */

const tools: McpTool[] = [
  // ── Process Manager Tools ──────────────────────────────────
  {
    name: 'list_services',
    description: 'List all available services with their configurations and open the interactive dashboard UI for managing services and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    _meta: {
      ui: {
        resourceUri: ETIENNE_CONFIG_RESOURCE_URI,
      },
    },
  } as McpTool & { _meta?: any },
  {
    name: 'get_service_status',
    description: 'Get the running/stopped status of a service by name. Returns status and port information.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'The name of the service to check',
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'start_service',
    description: 'Start a service by name. Returns success status and port information.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'The name of the service to start',
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'stop_service',
    description: 'Stop a running service by name.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'The name of the service to stop',
        },
      },
      required: ['service_name'],
    },
  },

  // ── Configuration Tools ────────────────────────────────────
  {
    name: 'get_configuration',
    description: 'Read all backend .env configuration variables. Returns a key-value object of all configuration settings.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_configuration',
    description: 'Partial update of backend .env configuration variables. Reads current config, merges the provided keys over it, and saves. Only the keys you provide will be changed; all other keys remain untouched.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Key-value pairs to set or update in the .env file. Only provided keys are changed.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['config'],
    },
  },
];

/**
 * Load the pre-built MCP App HTML from mcp-app-etienne-config/dist/mcp-app.html
 */
export async function loadEtienneConfigResourceHtml(): Promise<string | null> {
  // Resolve relative to the backend project root (parent of src/)
  const candidates = [
    join(__dirname, '..', '..', '..', 'mcp-app-etienne-config', 'dist', 'mcp-app.html'),
    join(__dirname, '..', '..', 'mcp-app-etienne-config', 'dist', 'mcp-app.html'),
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
 * Create etienne-configuration tools service with dependencies
 */
export function createEtienneConfigurationToolsService(
  processManagerService: ProcessManagerService,
  configurationService: ConfigurationService,
): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'list_services':
        return processManagerService.listServices();

      case 'get_service_status':
        return processManagerService.getServiceStatus(args.service_name);

      case 'start_service':
        return processManagerService.startService(args.service_name);

      case 'stop_service':
        return processManagerService.stopService(args.service_name);

      case 'get_configuration':
        return configurationService.getConfiguration();

      case 'set_configuration': {
        // Read-merge-write pattern: preserve existing keys
        const current = (await configurationService.getConfiguration()) || {};
        const merged = { ...current, ...args.config };
        await configurationService.saveConfiguration(merged);
        return { success: true, updatedKeys: Object.keys(args.config) };
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
