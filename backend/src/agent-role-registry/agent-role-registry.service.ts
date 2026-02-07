import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentRole, AgentRoleRegistryData } from './dto/agent-role-registry.dto';

@Injectable()
export class AgentRoleRegistryService {
  private readonly logger = new Logger(AgentRoleRegistryService.name);
  private readonly registryPath: string;

  constructor() {
    this.registryPath =
      process.env.AGENT_ROLE_REGISTRY ||
      path.resolve(process.cwd(), 'agent-role-registry.json');
  }

  /**
   * Check if the agent role registry is available
   */
  async isRegistryAvailable(): Promise<boolean> {
    try {
      await fs.access(this.registryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all agent roles from the registry
   */
  async loadRegistry(): Promise<AgentRole[]> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const data: AgentRoleRegistryData = JSON.parse(content);
      return data.roles || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Registry file doesn't exist, return empty array
        this.logger.warn('Agent role registry file not found, returning empty list');
        return [];
      }
      this.logger.error(`Failed to load agent role registry: ${error.message}`);
      throw new Error(`Failed to load agent role registry: ${error.message}`);
    }
  }

  /**
   * Get a specific agent role by ID
   */
  async getRoleById(roleId: string): Promise<AgentRole | null> {
    const roles = await this.loadRegistry();
    return roles.find((r) => r.id === roleId) || null;
  }

  /**
   * Get a role's content by ID (for writing to CLAUDE.md)
   */
  async getRoleContent(roleId: string): Promise<string | null> {
    const role = await this.getRoleById(roleId);
    return role?.content || null;
  }
}
