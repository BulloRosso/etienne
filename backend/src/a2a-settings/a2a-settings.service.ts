import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { A2ASettingsDto, AgentCardDto, UpdateA2ASettingsDto } from './dto/a2a-settings.dto';

const DEFAULT_REGISTRY_URL = 'https://www.a2aregistry.org/registry.json';

@Injectable()
export class A2ASettingsService {
  private readonly logger = new Logger(A2ASettingsService.name);

  /**
   * Get the settings file path for a project
   */
  private getSettingsPath(projectRoot: string): string {
    return path.join(projectRoot, '.etienne', 'a2a-settings.json');
  }

  /**
   * Load A2A settings for a project
   */
  async getSettings(projectRoot: string): Promise<A2ASettingsDto> {
    const settingsPath = this.getSettingsPath(projectRoot);

    try {
      if (await fs.pathExists(settingsPath)) {
        const content = await fs.readFile(settingsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.warn(`Failed to load A2A settings from ${settingsPath}:`, error);
    }

    // Return default settings
    return {
      registryUrl: DEFAULT_REGISTRY_URL,
      agents: [],
    };
  }

  /**
   * Save A2A settings for a project
   */
  async saveSettings(projectRoot: string, settings: A2ASettingsDto): Promise<void> {
    const settingsPath = this.getSettingsPath(projectRoot);
    const settingsDir = path.dirname(settingsPath);

    // Ensure directory exists
    await fs.ensureDir(settingsDir);

    // Update last modified timestamp
    settings.lastUpdated = new Date().toISOString();

    // Save settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    this.logger.log(`Saved A2A settings to ${settingsPath}`);
  }

  /**
   * Update A2A settings for a project
   */
  async updateSettings(projectRoot: string, updates: UpdateA2ASettingsDto): Promise<A2ASettingsDto> {
    const settings = await this.getSettings(projectRoot);

    if (updates.registryUrl !== undefined) {
      settings.registryUrl = updates.registryUrl;
    }

    if (updates.agents !== undefined) {
      settings.agents = updates.agents;
    }

    await this.saveSettings(projectRoot, settings);
    return settings;
  }

  /**
   * Toggle agent enabled status
   */
  async toggleAgent(projectRoot: string, agentUrl: string, enabled: boolean): Promise<A2ASettingsDto> {
    const settings = await this.getSettings(projectRoot);

    const agent = settings.agents.find(a => a.url === agentUrl);
    if (agent) {
      agent.enabled = enabled;
      await this.saveSettings(projectRoot, settings);
    }

    return settings;
  }

  /**
   * Add an agent to the settings
   */
  async addAgent(projectRoot: string, agent: AgentCardDto): Promise<A2ASettingsDto> {
    const settings = await this.getSettings(projectRoot);

    // Check if agent already exists
    const existingIndex = settings.agents.findIndex(a => a.url === agent.url);
    if (existingIndex >= 0) {
      // Update existing agent
      settings.agents[existingIndex] = { ...agent, enabled: true };
    } else {
      // Add new agent
      settings.agents.push({ ...agent, enabled: true });
    }

    await this.saveSettings(projectRoot, settings);
    return settings;
  }

  /**
   * Remove an agent from the settings
   */
  async removeAgent(projectRoot: string, agentUrl: string): Promise<A2ASettingsDto> {
    const settings = await this.getSettings(projectRoot);

    settings.agents = settings.agents.filter(a => a.url !== agentUrl);

    await this.saveSettings(projectRoot, settings);
    return settings;
  }

  /**
   * Get enabled agents only
   */
  async getEnabledAgents(projectRoot: string): Promise<AgentCardDto[]> {
    const settings = await this.getSettings(projectRoot);
    return settings.agents.filter(a => a.enabled !== false);
  }

  /**
   * Fetch agents from a registry URL
   */
  async fetchRegistry(registryUrl: string): Promise<AgentCardDto[]> {
    try {
      this.logger.log(`Fetching A2A registry from: ${registryUrl}`);
      const response = await axios.get(registryUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });

      // The registry could be an array of agent cards or an object with agents property
      let agents: AgentCardDto[] = [];

      if (Array.isArray(response.data)) {
        agents = response.data;
      } else if (response.data.agents && Array.isArray(response.data.agents)) {
        agents = response.data.agents;
      } else if (response.data.entries && Array.isArray(response.data.entries)) {
        // Some registries use 'entries' instead of 'agents'
        agents = response.data.entries;
      }

      this.logger.log(`Found ${agents.length} agents in registry`);
      return agents;
    } catch (error) {
      this.logger.error(`Failed to fetch registry from ${registryUrl}:`, error);
      throw new Error(`Failed to fetch registry: ${error.message}`);
    }
  }

  /**
   * Fetch a single agent card from its URL
   */
  async fetchAgentCard(agentCardUrl: string): Promise<AgentCardDto> {
    try {
      this.logger.log(`Fetching agent card from: ${agentCardUrl}`);
      const response = await axios.get(agentCardUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });

      const agentCard = response.data as AgentCardDto;
      agentCard.cardUrl = agentCardUrl;
      agentCard.lastConnected = new Date().toISOString();

      return agentCard;
    } catch (error) {
      this.logger.error(`Failed to fetch agent card from ${agentCardUrl}:`, error);
      throw new Error(`Failed to fetch agent card: ${error.message}`);
    }
  }

  /**
   * Test connectivity to an agent
   */
  async testAgentConnection(agentUrl: string): Promise<{ success: boolean; message: string; agentCard?: AgentCardDto }> {
    try {
      // Try to fetch the agent card from the well-known location
      const cardUrl = agentUrl.endsWith('/')
        ? `${agentUrl}.well-known/agent-card.json`
        : `${agentUrl}/.well-known/agent-card.json`;

      const agentCard = await this.fetchAgentCard(cardUrl);

      return {
        success: true,
        message: `Successfully connected to ${agentCard.name}`,
        agentCard,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect: ${error.message}`,
      };
    }
  }
}
