import { ToolService, McpTool } from './types';
import { A2AClientService } from '../a2a-client/a2a-client.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
import { CollaborationService } from '../collaboration/collaboration.service';
import { AgentCardDto } from '../a2a-settings/dto/a2a-settings.dto';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * A2A Tools Service Factory
 *
 * Creates MCP tools that wrap A2A agent capabilities.
 * Each enabled external agent's skills are exposed as individual MCP tools.
 *
 * Tool naming convention: a2a_<agent_name>_<skill_id>
 * This allows the AI to see exactly which agent and skill it's invoking.
 *
 * Integrates with CollaborationService to:
 * - Auto-provision counterpart projects on first contact
 * - Route exchanged files through exchange/inbound and exchange/outbound
 * - Log all conversations for auditability
 */
export function createA2AToolsService(
  a2aClient: A2AClientService,
  a2aSettings: A2ASettingsService,
  getProjectRoot: () => string | null,
  collaborationService?: CollaborationService,
): ToolService {
  const tools: McpTool[] = [
    {
      name: 'a2a_send_message',
      description: 'Send a message to an external A2A agent. Use this to delegate tasks to specialized external agents that have been configured in the A2A settings. The agent will process your request and return a response. Files are automatically routed through a counterpart project for auditability.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_url: {
            type: 'string',
            description: 'The base URL of the A2A agent to send the message to (e.g., http://localhost:5600)',
          },
          prompt: {
            type: 'string',
            description: 'The message or instruction to send to the external agent',
          },
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of file paths to send along with the message. Files will be copied to the counterpart exchange/outbound/ folder.',
          },
        },
        required: ['agent_url', 'prompt'],
      },
    },
    {
      name: 'a2a_list_agents',
      description: 'List all configured and enabled A2A agents for the current project. Returns agent information including their capabilities and skills.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];

  /**
   * Execute an A2A tool
   */
  async function execute(toolName: string, args: any): Promise<any> {
    const projectRoot = getProjectRoot();

    if (!projectRoot) {
      throw new Error('No project context available');
    }

    switch (toolName) {
      case 'a2a_send_message':
        return executeA2ASendMessage(args, projectRoot);

      case 'a2a_list_agents':
        return executeA2AListAgents(projectRoot);

      default:
        throw new Error(`Unknown A2A tool: ${toolName}`);
    }
  }

  /**
   * Send a message to an A2A agent with counterpart project integration
   */
  async function executeA2ASendMessage(
    args: { agent_url: string; prompt: string; file_paths?: string[] },
    projectRoot: string,
  ): Promise<any> {
    const { agent_url, prompt, file_paths } = args;

    // Verify the agent is in our enabled list
    const enabledAgents = await a2aSettings.getEnabledAgents(projectRoot);
    const matchedAgent = enabledAgents.find(a => a.url === agent_url);

    if (!matchedAgent) {
      return {
        success: false,
        error: `Agent at ${agent_url} is not enabled. Please enable it in A2A settings first.`,
        available_agents: enabledAgents.map(a => ({ name: a.name, url: a.url })),
      };
    }

    try {
      // Auto-provision counterpart project if collaboration service is available
      let counterpartProjectPath: string | null = null;
      if (collaborationService) {
        try {
          counterpartProjectPath = await collaborationService.ensureCounterpartProject(
            matchedAgent.name,
            matchedAgent,
          );
        } catch (err: any) {
          // Log but don't block the A2A call
          console.warn(`Failed to ensure counterpart project: ${err.message}`);
        }
      }

      // Log the outbound message
      const timestamp = new Date().toISOString();
      if (collaborationService) {
        try {
          await collaborationService.logConversation(matchedAgent.name, {
            timestamp,
            direction: 'outbound',
            message: prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt,
            files: file_paths,
          });
        } catch {
          // Don't block on logging failures
        }
      }

      // Send the message
      const result = await a2aClient.sendMessage(agent_url, prompt, file_paths);

      // Prepare response
      const response: any = {
        success: true,
        agent_url,
        agent_name: matchedAgent.name,
        status: result.status,
      };

      if (result.text) {
        response.response = result.text;
      }

      if (result.taskId) {
        response.task_id = result.taskId;
      }

      // If there are files, save them to the counterpart's exchange/inbound
      if (result.files && result.files.length > 0) {
        let outputDir: string;
        if (counterpartProjectPath) {
          outputDir = path.join(counterpartProjectPath, 'exchange', 'inbound');
        } else {
          // Fallback to original location if no counterpart project
          outputDir = path.join(projectRoot, 'out', 'a2a-responses');
        }
        const savedPaths = await a2aClient.saveExtractedFiles(result, outputDir);
        response.saved_files = savedPaths;

        if (counterpartProjectPath) {
          response.counterpart_project = collaborationService?.getCounterpartProjectName(matchedAgent.name);
        }
      }

      // Log the inbound response
      if (collaborationService) {
        try {
          const savedFiles = response.saved_files as string[] | undefined;
          await collaborationService.logConversation(matchedAgent.name, {
            timestamp: new Date().toISOString(),
            direction: 'inbound',
            message: result.text
              ? (result.text.length > 200 ? result.text.substring(0, 200) + '...' : result.text)
              : `Task ${result.status}`,
            status: result.status,
            taskId: result.taskId,
            files: savedFiles,
          });
        } catch {
          // Don't block on logging failures
        }
      }

      return response;
    } catch (error: any) {
      // Log failed attempts too
      if (collaborationService) {
        try {
          await collaborationService.logConversation(matchedAgent.name, {
            timestamp: new Date().toISOString(),
            direction: 'inbound',
            message: `Error: ${error.message}`,
            status: 'failed',
          });
        } catch {
          // Don't block on logging failures
        }
      }

      return {
        success: false,
        error: error.message,
        agent_url,
      };
    }
  }

  /**
   * List enabled A2A agents
   */
  async function executeA2AListAgents(projectRoot: string): Promise<any> {
    try {
      const enabledAgents = await a2aSettings.getEnabledAgents(projectRoot);

      return {
        success: true,
        count: enabledAgents.length,
        agents: enabledAgents.map(agent => ({
          name: agent.name,
          description: agent.description,
          url: agent.url,
          version: agent.version,
          counterpart_project: collaborationService
            ? collaborationService.getCounterpartProjectName(agent.name)
            : undefined,
          skills: agent.skills?.map(skill => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
          })) || [],
          capabilities: agent.capabilities || {},
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  return {
    tools,
    execute,
  };
}

/**
 * Generate dynamic MCP tools from enabled A2A agents
 *
 * This function creates individual tools for each skill of each enabled agent.
 * This allows the AI to see exactly what capabilities are available.
 */
export async function generateDynamicA2ATools(
  enabledAgents: AgentCardDto[],
): Promise<McpTool[]> {
  const tools: McpTool[] = [];

  for (const agent of enabledAgents) {
    // Sanitize agent name for tool naming
    const agentNameSlug = agent.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // If agent has specific skills, create a tool for each
    if (agent.skills && agent.skills.length > 0) {
      for (const skill of agent.skills) {
        const skillSlug = skill.id || skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

        tools.push({
          name: `a2a_${agentNameSlug}_${skillSlug}`,
          description: `[A2A: ${agent.name}] ${skill.description || skill.name}`,
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The instruction or query to send to this agent skill',
              },
              file_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional array of file paths to include with the request. Files will be routed through the counterpart exchange folder.',
              },
            },
            required: ['prompt'],
          },
        });
      }
    } else {
      // Create a single tool for the agent
      tools.push({
        name: `a2a_${agentNameSlug}`,
        description: `[A2A: ${agent.name}] ${agent.description}`,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The instruction or query to send to this agent',
            },
            file_paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of file paths to include with the request. Files will be routed through the counterpart exchange folder.',
            },
          },
          required: ['prompt'],
        },
      });
    }
  }

  return tools;
}
