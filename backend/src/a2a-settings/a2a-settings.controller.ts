import { Controller, Get, Post, Delete, Param, Body, Query, Logger } from '@nestjs/common';
import { A2ASettingsService } from './a2a-settings.service';
import { UpdateA2ASettingsDto, ToggleAgentDto, AgentCardDto } from './dto/a2a-settings.dto';
import { safeRoot } from '../claude/utils/path.utils';

@Controller('api/a2a-settings')
export class A2ASettingsController {
  private readonly logger = new Logger(A2ASettingsController.name);
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(private readonly service: A2ASettingsService) {}

  /**
   * Get A2A settings for a project
   */
  @Get(':project')
  async getSettings(@Param('project') projectName: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.service.getSettings(projectRoot);
    } catch (error) {
      this.logger.error(`Failed to get A2A settings for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Update A2A settings for a project
   */
  @Post(':project')
  async updateSettings(
    @Param('project') projectName: string,
    @Body() updates: UpdateA2ASettingsDto,
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.service.updateSettings(projectRoot, updates);
    } catch (error) {
      this.logger.error(`Failed to update A2A settings for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Toggle agent enabled status
   */
  @Post(':project/toggle')
  async toggleAgent(
    @Param('project') projectName: string,
    @Body() toggleDto: ToggleAgentDto,
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.service.toggleAgent(projectRoot, toggleDto.agentUrl, toggleDto.enabled);
    } catch (error) {
      this.logger.error(`Failed to toggle agent for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Add an agent to the settings
   */
  @Post(':project/agents')
  async addAgent(
    @Param('project') projectName: string,
    @Body() agent: AgentCardDto,
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.service.addAgent(projectRoot, agent);
    } catch (error) {
      this.logger.error(`Failed to add agent for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Remove an agent from the settings
   */
  @Delete(':project/agents')
  async removeAgent(
    @Param('project') projectName: string,
    @Body() body: { agentUrl: string },
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      return await this.service.removeAgent(projectRoot, body.agentUrl);
    } catch (error) {
      this.logger.error(`Failed to remove agent for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Get enabled agents for a project
   */
  @Get(':project/enabled')
  async getEnabledAgents(@Param('project') projectName: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectName);
      const agents = await this.service.getEnabledAgents(projectRoot);
      return { agents };
    } catch (error) {
      this.logger.error(`Failed to get enabled agents for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Get agents from the local registry file
   */
  @Get('registry/local')
  async getLocalRegistry() {
    try {
      const agents = await this.service.loadLocalRegistry();
      const isAvailable = await this.service.isLocalRegistryAvailable();
      return {
        success: true,
        available: isAvailable,
        agents,
      };
    } catch (error) {
      this.logger.error('Failed to load local A2A registry:', error);
      throw error;
    }
  }

  /**
   * Fetch agents from a registry
   */
  @Get('registry/fetch')
  async fetchRegistry(@Query('url') registryUrl: string) {
    try {
      const agents = await this.service.fetchRegistry(registryUrl);
      return { agents };
    } catch (error) {
      this.logger.error(`Failed to fetch registry from ${registryUrl}:`, error);
      throw error;
    }
  }

  /**
   * Fetch a single agent card
   */
  @Get('agent-card/fetch')
  async fetchAgentCard(@Query('url') agentCardUrl: string) {
    try {
      const agentCard = await this.service.fetchAgentCard(agentCardUrl);
      return { agentCard };
    } catch (error) {
      this.logger.error(`Failed to fetch agent card from ${agentCardUrl}:`, error);
      throw error;
    }
  }

  /**
   * Test connectivity to an agent
   */
  @Post('test-connection')
  async testConnection(@Body() body: { agentUrl: string }) {
    try {
      return await this.service.testAgentConnection(body.agentUrl);
    } catch (error) {
      this.logger.error(`Failed to test connection to ${body.agentUrl}:`, error);
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }
}
