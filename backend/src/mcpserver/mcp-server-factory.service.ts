import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import {
  ToolService,
  ToolGroupConfig,
  McpGroupInstance,
  McpSession,
  ElicitationCallback,
  ElicitationResult,
  ElicitationSchema,
  PendingElicitation,
  ElicitationEvent,
  ElicitationResponse,
} from './types';
import { demoToolsService } from './demotools';
import { diffbotToolsService } from './diffbot-tools';
import { createDeepResearchToolsService } from './deep-research-tools';
import { createKnowledgeGraphToolsService } from './knowledge-graph-tools';
import { createEmailToolsService } from './email-tools';
import { createScrapbookToolsService } from './scrapbook-tools';
import { createA2AToolsService, generateDynamicA2ATools } from './a2a-tools';
import { confirmationToolsService } from './confirmation-tools';
import { DeepResearchService } from '../deep-research/deep-research.service';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { SmtpService } from '../smtp-imap/smtp.service';
import { ImapService } from '../smtp-imap/imap.service';
import { ScrapbookService } from '../scrapbook/scrapbook.service';
import { A2AClientService } from '../a2a-client/a2a-client.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { ProjectToolsService } from './project-tools/project-tools.service';
import { StatefulWorkflowsService } from '../stateful-workflows/stateful-workflows.service';
import { createWorkflowToolsService } from '../stateful-workflows/workflow-tools';
import { RuleEngineService } from '../event-handling/core/rule-engine.service';
import {
  createEtienneConfigurationToolsService,
  loadEtienneConfigResourceHtml,
  ETIENNE_CONFIG_RESOURCE_URI,
  ETIENNE_CONFIG_RESOURCE_MIME,
} from './etienne-configuration-tools';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { SSEPublisherService } from '../event-handling/publishers/sse-publisher.service';

@Injectable()
export class McpServerFactoryService implements OnModuleInit {
  private readonly logger = new Logger(McpServerFactoryService.name);
  private readonly groups = new Map<string, McpGroupInstance>();
  private readonly groupConfigs: Record<string, ToolGroupConfig>;

  // Current project context for dynamic tools
  private currentProjectRoot: string | null = null;

  // Shared elicitation state (across all groups)
  private pendingElicitations = new Map<string, PendingElicitation>();
  private elicitationEventEmitter: ((event: ElicitationEvent) => void) | null = null;

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
    private readonly interceptorsService: InterceptorsService,
    private readonly projectToolsService: ProjectToolsService,
    private readonly workflowsService: StatefulWorkflowsService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly processManagerService: ProcessManagerService,
    private readonly configurationService: ConfigurationService,
    private readonly ssePublisherService: SSEPublisherService,
  ) {
    this.groupConfigs = {
      'demo': {
        toolServices: [demoToolsService],
      },
      'diffbot': {
        toolServices: [diffbotToolsService],
      },
      'deep-research': {
        toolServices: [createDeepResearchToolsService(deepResearchService)],
      },
      'knowledge-graph': {
        toolServices: [createKnowledgeGraphToolsService(vectorStoreService, openAiService, knowledgeGraphService)],
      },
      'email': {
        toolServices: [createEmailToolsService(smtpService, imapService)],
      },
      'scrapbook': {
        toolServices: [createScrapbookToolsService(scrapbookService, ssePublisherService)],
      },
      'a2a': {
        toolServices: [createA2AToolsService(a2aClientService, a2aSettingsService, () => this.currentProjectRoot)],
        dynamicToolsLoader: async (projectRoot: string) => {
          const enabledAgents = await this.a2aSettingsService.getEnabledAgents(projectRoot);
          if (enabledAgents.length > 0) {
            return generateDynamicA2ATools(enabledAgents);
          }
          return [];
        },
        dynamicToolExecutor: async (toolName: string, args: Record<string, any>, projectRoot: string) => {
          return this.executeDynamicA2ATool(toolName, args, projectRoot);
        },
      },
      'project-tools': {
        toolServices: [],
        dynamicToolsLoader: async (projectRoot: string) => {
          return this.projectToolsService.getTools(projectRoot);
        },
        dynamicToolExecutor: async (toolName: string, args: Record<string, any>, projectRoot: string) => {
          return this.executeProjectTool(toolName, args, projectRoot);
        },
      },
      'confirmation': {
        toolServices: [confirmationToolsService],
      },
      'workflows': {
        toolServices: [createWorkflowToolsService(workflowsService, ruleEngineService)],
      },
      'etienne-configuration': {
        toolServices: [createEtienneConfigurationToolsService(processManagerService, configurationService)],
        resources: [
          {
            uri: ETIENNE_CONFIG_RESOURCE_URI,
            name: 'Etienne Configuration Dashboard',
            description: 'Interactive dashboard for managing platform services and backend configuration',
            mimeType: ETIENNE_CONFIG_RESOURCE_MIME,
            loadContent: loadEtienneConfigResourceHtml,
          },
        ],
      },
    };
  }

  onModuleInit() {
    const groupNames = Object.keys(this.groupConfigs);
    this.logger.log(`MCP Server Factory initialized with ${groupNames.length} groups: ${groupNames.join(', ')}`);
  }

  /**
   * Get all available group names
   */
  getAvailableGroups(): string[] {
    return Object.keys(this.groupConfigs);
  }

  /**
   * Get tool metadata for all groups — returns tools that have _meta.ui.resourceUri
   * Used by the frontend to know which tool calls should render as MCP Apps.
   * Returns both the raw tool name and the MCP-prefixed name (mcp__<group>__<tool>)
   * since Claude SDK uses the prefixed form in tool events.
   */
  getToolAppMeta(): Array<{ toolName: string; mcpToolName: string; group: string; resourceUri: string }> {
    const result: Array<{ toolName: string; mcpToolName: string; group: string; resourceUri: string }> = [];
    for (const [groupName, config] of Object.entries(this.groupConfigs)) {
      for (const service of config.toolServices) {
        for (const tool of service.tools) {
          const meta = (tool as any)._meta;
          if (meta?.ui?.resourceUri) {
            result.push({
              toolName: tool.name,
              mcpToolName: `mcp__${groupName}__${tool.name}`,
              group: groupName,
              resourceUri: meta.ui.resourceUri,
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * Get or lazily create the MCP server instance for a tool group
   */
  getGroupInstance(groupName: string): McpGroupInstance | null {
    if (!this.groupConfigs[groupName]) {
      return null;
    }

    if (!this.groups.has(groupName)) {
      const instance = this.createGroupInstance(groupName, this.groupConfigs[groupName]);
      this.groups.set(groupName, instance);
      this.logger.log(`Created MCP group instance for: ${groupName}`);
    }

    return this.groups.get(groupName)!;
  }

  /**
   * Set the current project context for dynamic tools
   */
  setProjectContext(projectRoot: string | null) {
    this.currentProjectRoot = projectRoot;
  }

  // ============================================
  // Elicitation (shared across all groups)
  // ============================================

  setElicitationEventEmitter(emitter: ((event: ElicitationEvent) => void) | null) {
    this.elicitationEventEmitter = emitter;
    this.logger.log(`Elicitation event emitter ${emitter ? 'set' : 'cleared'}`);
  }

  createElicitationCallback(toolName: string, sessionId?: string): ElicitationCallback {
    return async (message: string, requestedSchema: ElicitationSchema): Promise<ElicitationResult> => {
      const projectName = this.currentProjectRoot
        ? this.currentProjectRoot.split('/').pop() || this.currentProjectRoot.split('\\').pop()
        : null;

      if (!projectName) {
        this.logger.warn(`Elicitation requested but no project context - auto-declining`);
        return { action: 'decline' };
      }

      const id = randomUUID();
      this.logger.log(`Elicitation requested: ${id} for tool ${toolName} in project ${projectName}`);

      return new Promise<ElicitationResult>((resolve, reject) => {
        const pending: PendingElicitation = {
          id,
          message,
          requestedSchema,
          resolve,
          reject,
          createdAt: new Date(),
          toolName,
          sessionId,
        };
        this.pendingElicitations.set(id, pending);

        this.interceptorsService.emitElicitationRequest(projectName, {
          id,
          message,
          requestedSchema,
          toolName,
        });
        this.logger.log(`Elicitation event emitted via interceptors: ${id}`);

        if (this.elicitationEventEmitter) {
          const event: ElicitationEvent = {
            type: 'elicitation_request',
            id,
            message,
            requestedSchema,
            toolName,
          };
          this.elicitationEventEmitter(event);
        }

        setTimeout(() => {
          if (this.pendingElicitations.has(id)) {
            this.logger.warn(`Elicitation ${id} timed out`);
            this.pendingElicitations.delete(id);
            resolve({ action: 'cancel' });
          }
        }, 5 * 60 * 1000);
      });
    };
  }

  handleElicitationResponse(response: ElicitationResponse): boolean {
    const pending = this.pendingElicitations.get(response.id);
    if (!pending) {
      this.logger.warn(`No pending elicitation found for id: ${response.id}`);
      return false;
    }

    this.logger.log(`Elicitation response received: ${response.id} - action: ${response.action}`);
    this.pendingElicitations.delete(response.id);

    const result: ElicitationResult = {
      action: response.action,
      content: response.content,
    };
    pending.resolve(result);
    return true;
  }

  getPendingElicitations(): PendingElicitation[] {
    return Array.from(this.pendingElicitations.values());
  }

  // ============================================
  // Private: Server creation per group
  // ============================================

  private createGroupInstance(groupName: string, config: ToolGroupConfig): McpGroupInstance {
    const hasResources = config.resources && config.resources.length > 0;

    // Build static tool map (shared across all sessions)
    const toolMap = new Map<string, ToolService>();
    for (const service of config.toolServices) {
      for (const tool of service.tools) {
        if (toolMap.has(tool.name)) {
          this.logger.warn(`Duplicate tool name in group ${groupName}: ${tool.name}. Overwriting...`);
        }
        toolMap.set(tool.name, service);
        this.logger.log(`[${groupName}] Registered tool: ${tool.name}`);
      }
    }

    // Factory: create a fresh Server instance with all handlers registered.
    // The MCP SDK Server only supports one transport at a time, so each
    // concurrent session (Claude SDK, AppRenderer, etc.) needs its own Server.
    const createServer = (): Server => {
      const server = new Server(
        { name: `mcp-${groupName}`, version: '1.0.0' },
        { capabilities: { tools: {}, elicitation: {}, ...(hasResources ? { resources: {} } : {}) } },
      );

      // ListTools handler
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        this.logger.log(`[${groupName}] tools/list called, projectRoot = ${this.currentProjectRoot || 'NULL'}`);
        const allTools = [];

        for (const service of config.toolServices) {
          allTools.push(...service.tools);
        }

        // Load dynamic tools if configured and project context exists
        if (config.dynamicToolsLoader && this.currentProjectRoot) {
          try {
            const dynamicTools = await config.dynamicToolsLoader(this.currentProjectRoot);
            allTools.push(...dynamicTools);
            if (dynamicTools.length > 0) {
              this.logger.log(`[${groupName}] Added ${dynamicTools.length} dynamic tools`);
            }
          } catch (error) {
            this.logger.warn(`[${groupName}] Failed to load dynamic tools: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        return { tools: allTools };
      });

      // CallTool handler
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (!name) {
          throw new Error('Invalid params: missing tool name');
        }

        // Try dynamic tool executor first (for tools not in static map)
        if (!toolMap.has(name) && config.dynamicToolExecutor && this.currentProjectRoot) {
          return config.dynamicToolExecutor(name, args || {}, this.currentProjectRoot);
        }

        // Find the static tool service
        const service = toolMap.get(name);
        if (!service) {
          throw new Error(`Unknown tool: ${name}`);
        }

        try {
          this.logger.log(`[${groupName}] Executing tool: ${name} with args: ${JSON.stringify(args || {}).substring(0, 200)}`);
          const elicitCallback = this.createElicitationCallback(name);
          const result = await service.execute(name, args || {}, elicitCallback);
          this.logger.log(`[${groupName}] Tool ${name} executed successfully`);

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`[${groupName}] Error executing tool ${name}: ${err.message}`, err.stack);

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: true,
              tool: name,
              message: err.message,
              details: err.stack || 'No stack trace available',
            }, null, 2) }],
            isError: true,
          };
        }
      });

      // Resource handlers (for MCP App HTML serving)
      if (hasResources) {
        server.setRequestHandler(ListResourcesRequestSchema, async () => {
          const resources = (config.resources || []).map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          }));
          this.logger.log(`[${groupName}] resources/list: returning ${resources.length} resources`);
          return { resources };
        });

        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
          const { uri } = request.params;
          const resource = (config.resources || []).find((r) => r.uri === uri);
          if (!resource) {
            throw new Error(`Resource not found: ${uri}`);
          }
          const content = await resource.loadContent();
          if (content === null) {
            throw new Error(`Failed to load resource content: ${uri}`);
          }
          this.logger.log(`[${groupName}] resources/read: serving ${uri} (${content.length} bytes)`);
          return {
            contents: [{ uri, mimeType: resource.mimeType, text: content }],
          };
        });
      }

      return server;
    };

    return { createServer, toolMap, sessions: new Map(), config };
  }

  // ============================================
  // Private: Dynamic tool executors
  // ============================================

  private async executeDynamicA2ATool(toolName: string, args: { prompt?: string; file_paths?: string[] }, projectRoot: string) {
    try {
      this.logger.log(`Executing dynamic A2A tool: ${toolName}`);

      const enabledAgents = await this.a2aSettingsService.getEnabledAgents(projectRoot);
      const toolNameWithoutPrefix = toolName.substring(4); // Remove 'a2a_'

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

      if (result.files && result.files.length > 0) {
        const path = await import('path');
        const outputDir = path.join(projectRoot, 'out', 'a2a-responses');
        const savedPaths = await this.a2aClientService.saveExtractedFiles(result, outputDir);
        response.saved_files = savedPaths;
      }

      this.logger.log(`Dynamic A2A tool ${toolName} executed successfully`);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error executing dynamic A2A tool ${toolName}: ${err.message}`, err.stack);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, tool: toolName, message: err.message }) }],
        isError: true,
      };
    }
  }

  private async executeProjectTool(toolName: string, args: Record<string, any>, projectRoot: string) {
    try {
      this.logger.log(`Executing Python tool: ${toolName}`);

      const result = await this.projectToolsService.executeTool(toolName, args, projectRoot);

      if (result.success) {
        this.logger.log(`Python tool ${toolName} executed successfully in ${result.executionTimeMs}ms`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result.result, null, 2) }],
        };
      } else {
        this.logger.error(`Python tool ${toolName} failed: ${result.error?.message}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: true,
            tool: toolName,
            errorType: result.error?.type,
            message: result.error?.message,
            stderr: result.error?.stderr,
            executionTimeMs: result.executionTimeMs,
          }, null, 2) }],
          isError: true,
        };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error executing Python tool ${toolName}: ${err.message}`, err.stack);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, tool: toolName, message: err.message }) }],
        isError: true,
      };
    }
  }
}
