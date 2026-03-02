import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CreateProjectDto, CreateProjectResult } from './dto/create-project.dto';
import { SkillsService } from '../skills/skills.service';
import { AgentRoleRegistryService } from '../agent-role-registry/agent-role-registry.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';
import { LlmService } from '../llm/llm.service';
import { McpRegistryService } from '../mcp-registry/mcp-registry.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    de: 'German',
    zh: 'Chinese',
  };

  constructor(
    private readonly skillsService: SkillsService,
    private readonly agentRoleRegistryService: AgentRoleRegistryService,
    private readonly a2aSettingsService: A2ASettingsService,
    private readonly mcpServerConfigService: McpServerConfigService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
    private readonly llmService: LlmService,
    private readonly mcpRegistryService: McpRegistryService,
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

      // 3. Write mission brief and agent role using agent-appropriate filenames
      const missionFileName = this.codingAgentConfigService.getMissionFileName();
      await this.writeMissionBrief(projectPath, dto);
      await this.writeAgentRole(projectPath, dto);
      this.logger.log(`Wrote ${missionFileName} files for ${dto.projectName}`);

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

      // 9. Generate chat greeting message from mission brief
      if (dto.missionBrief && dto.missionBrief.trim().length > 0) {
        try {
          const greetingMessage = await this.generateWelcomeMessage(dto, projectPath);
          if (greetingMessage) {
            const assistantPath = path.join(projectPath, 'data', 'assistant.json');
            const assistantConfig = { assistant: { greeting: greetingMessage } };
            await fs.writeJson(assistantPath, assistantConfig, { spaces: 2 });
            this.logger.log(`Generated chat greeting for ${dto.projectName}`);
          }
        } catch (error: any) {
          this.logger.warn(`Failed to generate chat greeting: ${error.message}`);
          warnings.push(`Chat greeting generation skipped: ${error.message}`);
        }
      }

      // 10. Collect guidance documents from provisioned skills
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

    // Write coding agent configuration from custom override or default template
    const activeAgent = this.codingAgentConfigService.getActiveAgentType();
    try {
      if (activeAgent === 'openai') {
        // For Codex: write .codex/config.toml with project trust path replaced
        let codexConfig = await this.codingAgentConfigService.getConfigForProject('openai');
        codexConfig = codexConfig.replaceAll('{{PROJECT_PATH}}', projectPath.replace(/\\/g, '/'));
        await fs.ensureDir(path.join(projectPath, '.codex'));
        await fs.writeFile(path.join(projectPath, '.codex', 'config.toml'), codexConfig, 'utf-8');
        // Also create a minimal .claude/settings.json for structure compatibility
        await fs.writeJson(
          path.join(projectPath, '.claude', 'settings.json'),
          { hooks: {}, enabledMcpjsonServers: [], allowedTools: [] },
          { spaces: 2 },
        );
      } else {
        // For Claude: write .claude/settings.json from template/custom
        const claudeConfig = await this.codingAgentConfigService.getConfigForProject('anthropic');
        await fs.writeFile(path.join(projectPath, '.claude', 'settings.json'), claudeConfig, 'utf-8');
      }
    } catch (error: any) {
      this.logger.warn(`Failed to write coding agent config: ${error.message}`);
      // Fallback to minimal defaults
      await fs.writeJson(
        path.join(projectPath, '.claude', 'settings.json'),
        { hooks: {}, enabledMcpjsonServers: [], allowedTools: [] },
        { spaces: 2 },
      );
    }

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
   * Write the mission brief to the root mission file (CLAUDE.md or AGENTS.md)
   */
  private async writeMissionBrief(projectPath: string, dto: CreateProjectDto): Promise<void> {
    let content = '# Mission Brief\n\n';
    content += dto.missionBrief;

    const missionFileName = this.codingAgentConfigService.getMissionFileName();
    const missionPath = path.join(projectPath, missionFileName);
    await fs.writeFile(missionPath, content.trim(), 'utf-8');
  }

  /**
   * Write the agent role to the agent config directory
   * (.claude/CLAUDE.md for anthropic, .codex/AGENTS.md for openai/others)
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
      const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
      const missionFileName = this.codingAgentConfigService.getMissionFileName();
      const rolePath = path.join(projectPath, agentConfigDir, missionFileName);
      await fs.ensureDir(path.join(projectPath, agentConfigDir));
      await fs.writeFile(rolePath, content.trim(), 'utf-8');
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
        if (dto.autoFilePreviewExtensions && dto.autoFilePreviewExtensions.length > 0) {
          existingConfig.autoFilePreviewExtensions = dto.autoFilePreviewExtensions;
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
      autoFilePreviewExtensions: dto.autoFilePreviewExtensions || [],
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
      const text = await this.llmService.generateText({
        tier: 'regular',
        prompt: `Based on the following agent role description, suggest a short, memorable name for this AI assistant. The name should be a single word or short phrase (2-3 words max) that reflects the agent's purpose or personality. Just respond with the name, nothing else.\n\nRole description:\n${customRoleContent.substring(0, 1000)}`,
        maxOutputTokens: 50,
      });

      let name = text.trim().replace(/["']/g, '');
      if (name.length > 30) {
        name = name.substring(0, 30);
      }
      return name || 'Etienne';
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

  /**
   * Extract description from SKILL.md content (YAML frontmatter)
   */
  private extractSkillDescription(content: string): string | undefined {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') return undefined;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') break;
      const match = lines[i].match(/^description:\s*(.+)/);
      if (match) {
        return match[1].trim().substring(0, 200);
      }
    }
    return undefined;
  }

  /**
   * Gather skill names and descriptions from provisioned skills
   */
  private async gatherSkillDescriptions(projectName: string): Promise<string[]> {
    const descriptions: string[] = [];
    try {
      const skillNames = await this.skillsService.listSkills(projectName);
      for (const name of skillNames) {
        try {
          const skill = await this.skillsService.getSkill(projectName, name);
          const desc = this.extractSkillDescription(skill.content);
          descriptions.push(desc ? `${name}: ${desc}` : name);
        } catch {
          descriptions.push(name);
        }
      }
    } catch {
      // Non-critical — return empty
    }
    return descriptions;
  }

  /**
   * Gather MCP server descriptions from the registry for selected servers
   */
  private async gatherMcpServerDescriptions(mcpServerKeys: string[]): Promise<string[]> {
    const descriptions: string[] = [];
    try {
      const registry = await this.mcpRegistryService.loadRegistry();
      const registryMap = new Map(registry.map((s) => [s.name, s.description]));
      for (const key of mcpServerKeys) {
        const desc = registryMap.get(key);
        descriptions.push(desc ? `${key}: ${desc}` : key);
      }
    } catch {
      descriptions.push(...mcpServerKeys);
    }
    return descriptions;
  }

  /**
   * Read the agent role content from the file written at step 3
   */
  private async getAgentRoleContent(projectPath: string): Promise<string | null> {
    try {
      const agentConfigDir = this.codingAgentConfigService.getAgentConfigDir();
      const missionFileName = this.codingAgentConfigService.getMissionFileName();
      const rolePath = path.join(projectPath, agentConfigDir, missionFileName);
      if (await fs.pathExists(rolePath)) {
        const content = await fs.readFile(rolePath, 'utf-8');
        return content.substring(0, 1500);
      }
    } catch {
      // Non-critical
    }
    return null;
  }

  /**
   * Generate a welcome message using LLM based on mission, role, skills, and MCP servers
   */
  private async generateWelcomeMessage(
    dto: CreateProjectDto,
    projectPath: string,
  ): Promise<string | null> {
    if (!dto.missionBrief || dto.missionBrief.trim().length === 0) {
      return null;
    }

    const skillDescriptions = await this.gatherSkillDescriptions(dto.projectName);
    const mcpServerKeys = dto.mcpServers ? Object.keys(dto.mcpServers) : [];
    const mcpDescriptions = await this.gatherMcpServerDescriptions(mcpServerKeys);
    const roleContent = await this.getAgentRoleContent(projectPath);

    let prompt = `You are writing a welcome message for an AI assistant project. Based on the mission, the assistant's role and strengths, and available capabilities, write a friendly welcome message (maximum 3 sentences) that greets the user and suggests concrete first steps.

Mission:
${dto.missionBrief.substring(0, 3000)}
`;

    if (roleContent) {
      prompt += `\nAssistant role and strengths:\n${roleContent}\n`;
    }

    if (skillDescriptions.length > 0) {
      prompt += `\nAvailable skills:\n${skillDescriptions.map((s) => `- ${s}`).join('\n')}\n`;
    }

    if (mcpDescriptions.length > 0) {
      prompt += `\nAvailable tools/integrations:\n${mcpDescriptions.map((s) => `- ${s}`).join('\n')}\n`;
    }

    prompt += `\nWrite ONLY the welcome message text. No headings, labels, or markdown formatting. Maximum 3 sentences. Be specific about first steps based on the mission and available capabilities. Mention any information or files the user should provide to get started.`;

    if (dto.language && dto.language !== 'en') {
      const languageName = ProjectsService.LANGUAGE_NAMES[dto.language] || dto.language;
      prompt += `\n\nIMPORTANT: Write the welcome message in ${languageName} language.`;
    }

    const text = await this.llmService.generateText({
      tier: 'regular',
      prompt,
      maxOutputTokens: 512,
    });

    const message = text.trim().replace(/^["']|["']$/g, '');

    return message || null;
  }
}
