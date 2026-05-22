import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CreateProjectDto, CreateProjectResult } from './dto/create-project.dto';
import { SkillsService } from '../skills/skills.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';
import { LlmService } from '../llm/llm.service';
import { McpRegistryService } from '../mcp-registry/core/mcp-registry.service';
import { PackageMaterializerService } from '../packages/materializer/package-materializer.service';
import { PackageManifest, ManifestMcpServer } from '../packages/dto/manifest.dto';
import { PackageLockfile } from '../packages/dto/lockfile.dto';
import { hashManifest } from '../packages/resolver/lockfile-hash';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';
  private readonly templateRepositoryDir = path.resolve(process.cwd(), '..', 'project-template-repository');

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    de: 'German',
    zh: 'Chinese',
  };

  constructor(
    private readonly skillsService: SkillsService,
    private readonly mcpServerConfigService: McpServerConfigService,
    private readonly codingAgentConfigService: CodingAgentConfigurationService,
    private readonly llmService: LlmService,
    private readonly mcpRegistryService: McpRegistryService,
    private readonly materializer: PackageMaterializerService,
  ) {}

  /**
   * Adapter that converts the existing CreateProjectDto into a PackageManifest.
   * This is the single point of compatibility between the wizard path and the
   * shared materializer — keep it stable or back-compat tests will fail.
   */
  dtoToManifest(dto: CreateProjectDto): PackageManifest {
    const mcpServers: ManifestMcpServer[] = dto.mcpServers
      ? Object.entries(dto.mcpServers).map(([name, config]) => ({
          name,
          config: config as Record<string, unknown>,
        }))
      : [];

    return {
      schemaVersion: 1,
      name: dto.projectName,
      agentName: dto.agentName,
      language: dto.language,
      missionBrief: dto.missionBrief,
      agentRole: dto.agentRole
        ? {
            type: dto.agentRole.type,
            roleId: dto.agentRole.roleId,
            customContent: dto.agentRole.customContent,
          }
        : undefined,
      applicationType: dto.applicationType ? { id: dto.applicationType } : undefined,
      template: dto.templateName ? { name: dto.templateName } : undefined,
      // Wizard only knows "optional" skills today — standard skills are
      // always provisioned regardless of selection.
      skills: (dto.selectedSkills ?? []).map((name) => ({ name, source: 'optional' as const })),
      // Wizard does not surface per-subagent selection separately; subagents
      // come exclusively from standard provisioning + application-type bundle.
      subagents: [],
      mcpServers,
      a2aAgents: dto.a2aAgents,
      copyUIFrom: dto.copyUIFrom,
    };
  }

  /**
   * Create a new project with full configuration.
   *
   * Thin adapter around the shared PackageMaterializerService: builds a
   * manifest from the DTO, materializes into /workspace/<name>/, then runs
   * workspace-only steps (LLM welcome message, session invalidation through
   * saveMcpConfig).
   */
  async createProject(dto: CreateProjectDto): Promise<CreateProjectResult> {
    const projectPath = path.join(this.workspaceDir, dto.projectName);

    if (await fs.pathExists(projectPath)) {
      return {
        success: false,
        projectName: dto.projectName,
        errors: [`Project '${dto.projectName}' already exists`],
      };
    }

    const manifest = this.dtoToManifest(dto);
    // Phase 1: skip the resolver in the wizard path so behavior stays
    // byte-equivalent. A future phase will route through resolve+materialize.
    const lockfile: PackageLockfile = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      manifestHash: hashManifest(manifest),
      items: [],
      conflicts: [],
      warnings: [],
    };

    try {
      const result = await this.materializer.materialize(manifest, lockfile, projectPath, {
        copyIntroVideos: true,
      });
      const warnings: string[] = [...result.warnings];

      // MCP config write — the materializer wrote .mcp.json and
      // .claude/settings.json directly via saveMcpConfigToDir. We additionally
      // call the legacy saveMcpConfig to trigger session invalidation, which
      // only applies to live workspace projects.
      if (dto.mcpServers && Object.keys(dto.mcpServers).length > 0) {
        try {
          await this.mcpServerConfigService.saveMcpConfig(dto.projectName, {
            mcpServers: dto.mcpServers,
          });
        } catch (error: any) {
          warnings.push(`Failed to invalidate MCP session: ${error.message}`);
        }
      }

      // Workspace-only step: LLM-generated welcome message.
      if (dto.missionBrief && dto.missionBrief.trim().length > 0) {
        try {
          const greetingMessage = await this.generateWelcomeMessage(dto, projectPath);
          if (greetingMessage) {
            const assistantPath = path.join(projectPath, 'data', 'assistant.json');
            await fs.writeJson(
              assistantPath,
              { assistant: { greeting: greetingMessage } },
              { spaces: 2 },
            );
            this.logger.log(`Generated chat greeting for ${dto.projectName}`);
          }
        } catch (error: any) {
          this.logger.warn(`Failed to generate chat greeting: ${error.message}`);
          warnings.push(`Chat greeting generation skipped: ${error.message}`);
        }
      }

      return {
        success: true,
        projectName: dto.projectName,
        warnings: warnings.length > 0 ? warnings : undefined,
        guidanceDocuments:
          result.guidanceDocuments.length > 0 ? result.guidanceDocuments : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create project ${dto.projectName}:`, error);
      try {
        await fs.remove(projectPath);
      } catch {
        // ignore cleanup errors
      }
      return {
        success: false,
        projectName: dto.projectName,
        errors: [error.message],
      };
    }
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
   * Get list of available project templates from the template repository
   */
  async getAvailableTemplates(): Promise<string[]> {
    try {
      if (!(await fs.pathExists(this.templateRepositoryDir))) {
        return [];
      }

      const entries = await fs.readdir(this.templateRepositoryDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    } catch (error: any) {
      this.logger.error(`Failed to list project templates: ${error.message}`);
      return [];
    }
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
