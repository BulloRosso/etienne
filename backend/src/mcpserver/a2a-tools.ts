import { ToolService, McpTool } from './types';
import { A2AClientService } from '../a2a-client/a2a-client.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
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
 */
export function createA2AToolsService(
  a2aClient: A2AClientService,
  a2aSettings: A2ASettingsService,
  getProjectRoot: () => string | null,
): ToolService {
  // We need to dynamically generate tools based on enabled agents
  // For now, we create a single generic tool that routes to the appropriate agent

  const tools: McpTool[] = [
    {
      name: 'a2a_send_message',
      description: 'Send a message to an external A2A agent. Use this to delegate tasks to specialized external agents that have been configured in the A2A settings. The agent will process your request and return a response.',
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
            description: 'Optional array of file paths to send along with the message',
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
   * Send a message to an A2A agent
   */
  async function executeA2ASendMessage(
    args: { agent_url: string; prompt: string; file_paths?: string[] },
    projectRoot: string,
  ): Promise<any> {
    const { agent_url, prompt, file_paths } = args;

    // Verify the agent is in our enabled list
    const enabledAgents = await a2aSettings.getEnabledAgents(projectRoot);
    const isEnabled = enabledAgents.some(a => a.url === agent_url);

    if (!isEnabled) {
      return {
        success: false,
        error: `Agent at ${agent_url} is not enabled. Please enable it in A2A settings first.`,
        available_agents: enabledAgents.map(a => ({ name: a.name, url: a.url })),
      };
    }

    try {
      // Send the message
      const result = await a2aClient.sendMessage(agent_url, prompt, file_paths);

      // Prepare response
      const response: any = {
        success: true,
        agent_url,
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
        const outputDir = path.join(projectRoot, 'out', 'a2a-responses');
        const savedPaths = await a2aClient.saveExtractedFiles(result, outputDir);
        response.saved_files = savedPaths;
      }

      return response;
    } catch (error) {
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
          skills: agent.skills?.map(skill => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
          })) || [],
          capabilities: agent.capabilities || {},
        })),
      };
    } catch (error) {
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
                description: 'Optional array of file paths to include with the request',
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
              description: 'Optional array of file paths to include with the request',
            },
          },
          required: ['prompt'],
        },
      });
    }
  }

  return tools;
}
