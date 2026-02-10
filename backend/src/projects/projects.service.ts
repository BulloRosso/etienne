import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { CreateProjectDto, CreateProjectResult } from './dto/create-project.dto';
import { SkillsService } from '../skills/skills.service';
import { AgentRoleRegistryService } from '../agent-role-registry/agent-role-registry.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private readonly skillsService: SkillsService,
    private readonly agentRoleRegistryService: AgentRoleRegistryService,
    private readonly a2aSettingsService: A2ASettingsService,
    private readonly mcpServerConfigService: McpServerConfigService,
  ) {}

  /**
   * Create a new project with full configuration
   */
  async createProject(dto: CreateProjectDto): Promise<CreateProjectResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const projectPath = path.join(this.workspaceDir, dto.projectName);

    try {
      // 1. Check if project already exists
      if (await fs.pathExists(projectPath)) {
        return {
          success: false,
          projectName: dto.projectName,
          errors: [`Project '${dto.projectName}' already exists`],
        };
      }

      // 2. Create project directory structure
      await this.createProjectStructure(projectPath);
      this.logger.log(`Created project structure for ${dto.projectName}`);

      // 3. Write mission brief to root CLAUDE.md and agent role to .claude/CLAUDE.md
      await this.writeMissionBrief(projectPath, dto);
      await this.writeAgentRole(projectPath, dto);
      this.logger.log(`Wrote CLAUDE.md files for ${dto.projectName}`);

      // 4. Provision standard skills
      try {
        const standardResults = await this.skillsService.provisionStandardSkills(dto.projectName);
        const failedStandard = standardResults.filter((r) => !r.success);
        if (failedStandard.length > 0) {
          warnings.push(`Failed to provision ${failedStandard.length} standard skills`);
        }
      } catch (error: any) {
        warnings.push(`Failed to provision standard skills: ${error.message}`);
      }

      // 5. Provision optional skills if selected
      if (dto.selectedSkills && dto.selectedSkills.length > 0) {
        try {
          const optionalResults = await this.skillsService.provisionSkillsFromRepository(
            dto.projectName,
            dto.selectedSkills,
            'optional',
          );
          const failedOptional = optionalResults.filter((r) => !r.success);
          if (failedOptional.length > 0) {
            warnings.push(`Failed to provision ${failedOptional.length} optional skills`);
          }
        } catch (error: any) {
          warnings.push(`Failed to provision optional skills: ${error.message}`);
        }
      }

      // 6. Configure MCP servers
      if (dto.mcpServers && Object.keys(dto.mcpServers).length > 0) {
        try {
          await this.mcpServerConfigService.saveMcpConfig(dto.projectName, {
            mcpServers: dto.mcpServers,
          });
          this.logger.log(`Configured MCP servers for ${dto.projectName}`);
        } catch (error: any) {
          warnings.push(`Failed to configure MCP servers: ${error.message}`);
        }
      }

      // 7. Configure A2A agents
      if (dto.a2aAgents && dto.a2aAgents.length > 0) {
        try {
          for (const agent of dto.a2aAgents) {
            await this.a2aSettingsService.addAgent(projectPath, agent);
          }
          this.logger.log(`Configured ${dto.a2aAgents.length} A2A agents for ${dto.projectName}`);
        } catch (error: any) {
          warnings.push(`Failed to configure A2A agents: ${error.message}`);
        }
      }

      // 8. Create or copy UI config with agent name
      try {
        await this.createUIConfig(dto, projectPath);
        this.logger.log(`Created UI config for ${dto.projectName}`);
      } catch (error: any) {
        warnings.push(`Failed to create UI config: ${error.message}`);
      }

      // 9. Collect guidance documents from provisioned skills
      const guidanceDocuments = await this.findGuidanceDocuments(projectPath);

      return {
        success: true,
        projectName: dto.projectName,
        warnings: warnings.length > 0 ? warnings : undefined,
        guidanceDocuments: guidanceDocuments.length > 0 ? guidanceDocuments : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create project ${dto.projectName}:`, error);

      // Clean up on failure
      try {
        await fs.remove(projectPath);
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        projectName: dto.projectName,
        errors: [error.message],
      };
    }
  }

  /**
   * Create the project directory structure
   */
  private async createProjectStructure(projectPath: string): Promise<void> {
    // Create main directories
    await fs.ensureDir(path.join(projectPath, '.claude'));
    await fs.ensureDir(path.join(projectPath, '.claude', 'skills'));
    await fs.ensureDir(path.join(projectPath, '.etienne'));
    await fs.ensureDir(path.join(projectPath, 'data'));
    await fs.ensureDir(path.join(projectPath, 'out'));
    await fs.ensureDir(path.join(projectPath, '.attachments'));

    // Create default settings.json
    const defaultSettings = {
      hooks: {},
      enabledMcpjsonServers: [],
      allowedTools: [],
    };
    await fs.writeJson(
      path.join(projectPath, '.claude', 'settings.json'),
      defaultSettings,
      { spaces: 2 },
    );

    // Create default permissions.json
    const defaultPermissions = {
      allowedTools: [],
    };
    await fs.writeJson(
      path.join(projectPath, 'data', 'permissions.json'),
      defaultPermissions,
      { spaces: 2 },
    );
  }

  /**
   * Write the mission brief to the root CLAUDE.md file
   */
  private async writeMissionBrief(projectPath: string, dto: CreateProjectDto): Promise<void> {
    let content = '# Mission Brief\n\n';
    content += dto.missionBrief;

    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content.trim(), 'utf-8');
  }

  /**
   * Write the agent role to .claude/CLAUDE.md
   */
  private async writeAgentRole(projectPath: string, dto: CreateProjectDto): Promise<void> {
    if (!dto.agentRole) return;

    let content = '';

    if (dto.agentRole.type === 'registry' && dto.agentRole.roleId) {
      const roleContent = await this.agentRoleRegistryService.getRoleContent(dto.agentRole.roleId);
      if (roleContent) {
        content = roleContent;
      }
    } else if (dto.agentRole.type === 'custom' && dto.agentRole.customContent) {
      content = dto.agentRole.customContent;
    }

    if (content) {
      const claudeMdPath = path.join(projectPath, '.claude', 'CLAUDE.md');
      await fs.writeFile(claudeMdPath, content.trim(), 'utf-8');
    }
  }

  /**
   * Create UI configuration for the new project
   * Either copies from another project or creates a new one with the agent name
   */
  private async createUIConfig(dto: CreateProjectDto, projectPath: string): Promise<void> {
    const etienneDir = path.join(projectPath, '.etienne');
    await fs.ensureDir(etienneDir);
    const uiConfigPath = path.join(etienneDir, 'user-interface.json');

    if (dto.copyUIFrom) {
      // Copy from existing project
      const fromPath = path.join(this.workspaceDir, dto.copyUIFrom, '.etienne', 'user-interface.json');
      if (await fs.pathExists(fromPath)) {
        const existingConfig = await fs.readJson(fromPath);
        // Override the title with the new agent name if provided
        if (dto.agentName && existingConfig.appBar) {
          existingConfig.appBar.title = dto.agentName;
        }
        await fs.writeJson(uiConfigPath, existingConfig, { spaces: 2 });
        return;
      }
    }

    // Create a new UI config with the agent name
    const uiConfig = {
      appBar: {
        title: dto.agentName || 'Etienne',
        fontColor: 'white',
        backgroundColor: '#1976d2',
      },
      welcomePage: {
        message: '',
        backgroundColor: '#f5f5f5',
        quickActions: [],
        showWelcomeMessage: true,
      },
      previewDocuments: [],
    };

    await fs.writeJson(uiConfigPath, uiConfig, { spaces: 2 });
  }

  /**
   * Find user-guidance.md files in provisioned skills
   * Returns paths relative to the project root (e.g., ".claude/skills/rag-search/user-guidance.md")
   */
  private async findGuidanceDocuments(projectPath: string): Promise<string[]> {
    const guidanceDocs: string[] = [];

    try {
      const skillsDir = path.join(projectPath, '.claude', 'skills');
      if (!(await fs.pathExists(skillsDir))) {
        return guidanceDocs;
      }

      const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true });
      for (const entry of skillEntries) {
        if (entry.isDirectory()) {
          const guidancePath = path.join(skillsDir, entry.name, 'user-guidance.md');
          if (await fs.pathExists(guidancePath)) {
            // Return path relative to project root
            guidanceDocs.push(`.claude/skills/${entry.name}/user-guidance.md`);
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to scan for guidance documents: ${error.message}`);
    }

    return guidanceDocs;
  }

  /**
   * Generate an agent name from custom role content using Claude
   */
  async generateAgentName(customRoleContent: string): Promise<string> {
    if (!customRoleContent || customRoleContent.trim().length === 0) {
      return 'Etienne';
    }

    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: `Based on the following agent role description, suggest a short, memorable name for this AI assistant. The name should be a single word or short phrase (2-3 words max) that reflects the agent's purpose or personality. Just respond with the name, nothing else.

Role description:
${customRoleContent.substring(0, 1000)}`,
          },
        ],
      });

      const textContent = response.content.find((block: any) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        // Clean up the response - remove quotes, trim, limit length
        let name = textContent.text.trim().replace(/["']/g, '');
        if (name.length > 30) {
          name = name.substring(0, 30);
        }
        return name || 'Etienne';
      }

      return 'Etienne';
    } catch (error: any) {
      this.logger.error(`Failed to generate agent name: ${error.message}`);
      return 'Etienne';
    }
  }

  /**
   * Get list of projects that have UI customization applied
   */
  async getProjectsWithUIConfig(): Promise<string[]> {
    const projectsWithUI: string[] = [];

    try {
      const entries = await fs.readdir(this.workspaceDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const uiConfigPath = path.join(this.workspaceDir, entry.name, '.etienne', 'user-interface.json');
          if (await fs.pathExists(uiConfigPath)) {
            projectsWithUI.push(entry.name);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to list projects with UI config: ${error.message}`);
    }

    return projectsWithUI.sort();
  }
}
