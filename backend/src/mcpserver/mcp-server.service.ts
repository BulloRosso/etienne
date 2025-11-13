import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ToolService } from './types';
import { demoToolsService } from './demotools';
import { diffbotToolsService } from './diffbot-tools';
import { createDeepResearchToolsService } from './deep-research-tools';
import { createKnowledgeGraphToolsService } from './knowledge-graph-tools';
import { DeepResearchService } from '../deep-research/deep-research.service';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';

/**
 * MCP Server Service
 *
 * Core service implementing the Model Context Protocol using the official SDK.
 * Manages tool registration and request handling through the SDK's Server.
 *
 * To add new tools:
 * 1. Create a new file like demotools.ts with a ToolService export
 * 2. Import it and add to the toolServices array in constructor
 */
@Injectable()
export class McpServerService implements OnModuleInit {
  private readonly logger = new Logger(McpServerService.name);
  private toolServices: ToolService[] = [];
  private toolMap = new Map<string, ToolService>();
  public readonly server: Server;

  constructor(
    private readonly deepResearchService: DeepResearchService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly openAiService: OpenAiService,
  ) {
    // Initialize the MCP SDK Server
    this.server = new Server(
      {
        name: 'petstore-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all tool services here
    this.toolServices = [
      demoToolsService,
      diffbotToolsService,
      createDeepResearchToolsService(deepResearchService),
      createKnowledgeGraphToolsService(vectorStoreService, openAiService),
    ];

    // Set up SDK request handlers
    this.setupRequestHandlers();
  }

  /**
   * Initialize the service and register all tools
   */
  onModuleInit() {
    this.registerTools();
    this.logger.log(`MCP Server initialized with ${this.toolMap.size} tools`);
  }

  /**
   * Set up SDK request handlers for tools
   */
  private setupRequestHandlers() {
    // Handle tools/list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = [];

      for (const service of this.toolServices) {
        allTools.push(...service.tools);
      }

      return {
        tools: allTools,
      };
    });

    // Handle tools/call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Validate tool name
      if (!name) {
        throw new Error('Invalid params: missing tool name');
      }

      // Find the service that provides this tool
      const service = this.toolMap.get(name);
      if (!service) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        // Execute the tool
        this.logger.log(`🔧 Executing tool: ${name} with args: ${JSON.stringify(args || {}).substring(0, 200)}`);
        const result = await service.execute(name, args || {});
        this.logger.log(`✅ Tool ${name} executed successfully`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Log the error but return it as content instead of throwing
        // This prevents the error from terminating the stream
        this.logger.error(`❌ Error executing tool ${name}: ${error.message}`, error.stack);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                tool: name,
                message: error.message,
                details: error.stack || 'No stack trace available'
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Register all tools from the registered tool services
   */
  private registerTools() {
    for (const service of this.toolServices) {
      for (const tool of service.tools) {
        if (this.toolMap.has(tool.name)) {
          this.logger.warn(`Duplicate tool name: ${tool.name}. Overwriting...`);
        }
        this.toolMap.set(tool.name, service);
        this.logger.log(`Registered tool: ${tool.name}`);
      }
    }
  }
}
