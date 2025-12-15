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
import { createEmailToolsService } from './email-tools';
import { createScrapbookToolsService } from './scrapbook-tools';
import { createA2AToolsService, generateDynamicA2ATools } from './a2a-tools';
import { DeepResearchService } from '../deep-research/deep-research.service';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { SmtpService } from '../smtp-imap/smtp.service';
import { ImapService } from '../smtp-imap/imap.service';
import { ScrapbookService } from '../scrapbook/scrapbook.service';
import { A2AClientService } from '../a2a-client/a2a-client.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';

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

  // Current project context for A2A tools
  private currentProjectRoot: string | null = null;

  constructor(
    private readonly deepResearchService: DeepResearchService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly openAiService: OpenAiService,
    private readonly knowledgeGraphService: KnowledgeGraphService,
    private readonly smtpService: SmtpService,
    private readonly imapService: ImapService,
    private readonly scrapbookService: ScrapbookService,
    private readonly a2aClientService: A2AClientService,
    private readonly a2aSettingsService: A2ASettingsService,
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
      createKnowledgeGraphToolsService(vectorStoreService, openAiService, knowledgeGraphService),
      createEmailToolsService(smtpService, imapService),
      createScrapbookToolsService(scrapbookService),
      createA2AToolsService(a2aClientService, a2aSettingsService, () => this.currentProjectRoot),
    ];

    // Set up SDK request handlers
    this.setupRequestHandlers();
  }

  /**
   * Set the current project context for A2A tools
   */
  setProjectContext(projectRoot: string | null) {
    this.currentProjectRoot = projectRoot;
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
      this.logger.log(`tools/list called, currentProjectRoot = ${this.currentProjectRoot || 'NULL'}`);
      const allTools = [];

      for (const service of this.toolServices) {
        allTools.push(...service.tools);
      }

      // Add dynamic A2A tools based on enabled agents
      if (this.currentProjectRoot) {
        try {
          const enabledAgents = await this.a2aSettingsService.getEnabledAgents(this.currentProjectRoot);
          if (enabledAgents.length > 0) {
            const dynamicA2ATools = await generateDynamicA2ATools(enabledAgents);
            allTools.push(...dynamicA2ATools);
            this.logger.log(`Added ${dynamicA2ATools.length} dynamic A2A tools for ${enabledAgents.length} agents`);
          }
        } catch (error) {
          this.logger.warn(`Failed to load dynamic A2A tools: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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

      // Check if this is a dynamic A2A tool (starts with a2a_ but not the static ones)
      const staticA2ATools = ['a2a_send_message', 'a2a_list_agents'];
      const isDynamicA2ATool = name.startsWith('a2a_') && !staticA2ATools.includes(name);

      if (isDynamicA2ATool) {
        // Handle dynamic A2A tool execution
        return this.executeDynamicA2ATool(name, args || {});
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
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`❌ Error executing tool ${name}: ${err.message}`, err.stack);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                tool: name,
                message: err.message,
                details: err.stack || 'No stack trace available'
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

  /**
   * Execute a dynamic A2A tool
   * Dynamic tools are named: a2a_<agent_name>_<skill_id> or a2a_<agent_name>
   */
  private async executeDynamicA2ATool(toolName: string, args: { prompt?: string; file_paths?: string[] }) {
    if (!this.currentProjectRoot) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'No project context available' }) }],
        isError: true,
      };
    }

    try {
      this.logger.log(`🔧 Executing dynamic A2A tool: ${toolName}`);

      // Get enabled agents to find the matching one
      const enabledAgents = await this.a2aSettingsService.getEnabledAgents(this.currentProjectRoot);

      // Parse tool name to find agent - format: a2a_<agent_name> or a2a_<agent_name>_<skill_id>
      const toolNameWithoutPrefix = toolName.substring(4); // Remove 'a2a_'

      // Find the agent whose slugified name matches the beginning of the tool name
      let matchedAgent = null;
      for (const agent of enabledAgents) {
        const agentSlug = agent.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

        if (toolNameWithoutPrefix === agentSlug || toolNameWithoutPrefix.startsWith(agentSlug + '_')) {
          matchedAgent = agent;
          break;
        }
      }

      if (!matchedAgent) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `No matching agent found for tool: ${toolName}` }) }],
          isError: true,
        };
      }

      // Send message to the agent
      const result = await this.a2aClientService.sendMessage(
        matchedAgent.url,
        args.prompt || '',
        args.file_paths,
      );

      const response: Record<string, unknown> = {
        success: true,
        agent: matchedAgent.name,
        agent_url: matchedAgent.url,
        status: result.status,
      };

      if (result.text) {
        response.response = result.text;
      }

      if (result.taskId) {
        response.task_id = result.taskId;
      }

      // If there are files, save them
      if (result.files && result.files.length > 0) {
        const path = await import('path');
        const outputDir = path.join(this.currentProjectRoot, 'out', 'a2a-responses');
        const savedPaths = await this.a2aClientService.saveExtractedFiles(result, outputDir);
        response.saved_files = savedPaths;
      }

      this.logger.log(`✅ Dynamic A2A tool ${toolName} executed successfully`);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ Error executing dynamic A2A tool ${toolName}: ${err.message}`, err.stack);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, tool: toolName, message: err.message }) }],
        isError: true,
      };
    }
  }
}
