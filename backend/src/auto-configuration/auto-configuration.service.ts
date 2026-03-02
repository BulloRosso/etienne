import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { McpRegistryService } from '../mcp-registry/mcp-registry.service';
import { SkillsService } from '../skills/skills.service';
import { SessionsService } from '../sessions/sessions.service';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';
import {
  AutoConfigSuggestResponse,
  AutoConfigApplyResponse,
  SuggestedMcpServer,
  SuggestedSkill,
  SkillSelection,
} from './dto/auto-configuration.dto';

@Injectable()
export class AutoConfigurationService {
  private readonly logger = new Logger(AutoConfigurationService.name);
  private readonly config = new ClaudeConfig();

  constructor(
    private readonly llmService: LlmService,
    private readonly mcpRegistryService: McpRegistryService,
    private readonly skillsService: SkillsService,
    private readonly sessionsService: SessionsService,
    private readonly mcpServerConfigService: McpServerConfigService,
  ) {}

  async suggest(projectName: string, sessionId: string, language?: string): Promise<AutoConfigSuggestResponse> {
    try {
      const projectRoot = safeRoot(this.config.hostRoot, projectName);

      // Gather all context in parallel
      const [
        registryServers,
        repoSkills,
        currentMcpConfig,
        currentSkills,
        sessionHistory,
      ] = await Promise.all([
        this.mcpRegistryService.loadRegistry(),
        this.skillsService.listRepositorySkills(true),
        this.mcpServerConfigService.getMcpConfig(projectName),
        this.skillsService.listSkills(projectName),
        this.sessionsService.loadSessionHistory(projectRoot, sessionId).catch(() => []),
      ]);

      // Filter out already-configured MCP servers
      const configuredServerNames = Object.keys(currentMcpConfig.mcpServers || {});
      const availableServers = registryServers.filter(
        (s) => !configuredServerNames.includes(s.name),
      );

      // Filter out already-provisioned skills
      const availableSkills = repoSkills.filter(
        (s) => !currentSkills.includes(s.name),
      );

      // If nothing is available, return early
      if (availableServers.length === 0 && availableSkills.length === 0) {
        return {
          success: true,
          suggestedServers: [],
          suggestedSkills: [],
          reasoning: 'All available MCP servers and skills are already configured.',
        };
      }

      // Build LLM prompt
      const prompt = this.buildSuggestPrompt(
        configuredServerNames,
        currentSkills,
        availableServers,
        availableSkills,
        sessionHistory,
        language,
      );

      // Call LLM
      const llmResponse = await this.llmService.generateText({
        tier: 'regular',
        prompt,
        maxOutputTokens: 2048,
      });

      // Parse response
      const parsed = this.parseLlmResponse(llmResponse);

      // Validate suggested names against actual available items
      const validatedServers: SuggestedMcpServer[] = parsed.suggestedServers
        .filter((s: any) => availableServers.some((as) => as.name === s.name))
        .map((s: any) => ({
          name: s.name,
          description: availableServers.find((as) => as.name === s.name)?.description || '',
          reason: s.reason || '',
        }));

      const validatedSkills: SuggestedSkill[] = parsed.suggestedSkills
        .filter((s: any) => availableSkills.some((as) => as.name === s.name))
        .map((s: any) => {
          const repoSkill = availableSkills.find((as) => as.name === s.name);
          return {
            name: s.name,
            source: repoSkill?.source || s.source || 'standard',
            description: repoSkill?.description || '',
            reason: s.reason || '',
          };
        });

      return {
        success: true,
        suggestedServers: validatedServers,
        suggestedSkills: validatedSkills,
        reasoning: parsed.reasoning || '',
      };
    } catch (error: any) {
      this.logger.error(`Auto-configuration suggest failed: ${error.message}`);
      return {
        success: false,
        suggestedServers: [],
        suggestedSkills: [],
        reasoning: `Error: ${error.message}`,
      };
    }
  }

  async apply(
    projectName: string,
    serverNames: string[],
    skillSelections: SkillSelection[],
  ): Promise<AutoConfigApplyResponse> {
    const configuredServers: string[] = [];
    const provisionedSkills: { name: string; success: boolean; error?: string }[] = [];

    // 1. Configure MCP servers
    if (serverNames.length > 0) {
      try {
        const currentConfig = await this.mcpServerConfigService.getMcpConfig(projectName);
        const mergedServers = { ...(currentConfig.mcpServers || {}) };

        for (const name of serverNames) {
          const registryEntry = await this.mcpRegistryService.getServerByName(name);
          if (registryEntry) {
            mergedServers[name] = {
              type: registryEntry.transport as any,
              url: registryEntry.url,
              ...(registryEntry.headers ? { headers: registryEntry.headers } : {}),
            };
            configuredServers.push(name);
          }
        }

        await this.mcpServerConfigService.saveMcpConfig(projectName, {
          mcpServers: mergedServers,
        });
      } catch (error: any) {
        this.logger.error(`Failed to configure MCP servers: ${error.message}`);
      }
    }

    // 2. Provision skills
    if (skillSelections.length > 0) {
      // Group by source
      const standardSkills = skillSelections.filter((s) => s.source === 'standard').map((s) => s.name);
      const optionalSkills = skillSelections.filter((s) => s.source === 'optional').map((s) => s.name);

      for (const { names, source } of [
        { names: standardSkills, source: 'standard' as const },
        { names: optionalSkills, source: 'optional' as const },
      ]) {
        if (names.length > 0) {
          try {
            const results = await this.skillsService.provisionSkillsFromRepository(
              projectName,
              names,
              source,
            );
            for (const result of results) {
              provisionedSkills.push({
                name: result.skillName,
                success: result.success,
                error: result.error,
              });
            }
          } catch (error: any) {
            for (const name of names) {
              provisionedSkills.push({ name, success: false, error: error.message });
            }
          }
        }
      }
    }

    return {
      success: true,
      configuredServers,
      provisionedSkills,
    };
  }

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    de: 'German',
    zh: 'Chinese',
  };

  private buildSuggestPrompt(
    configuredServerNames: string[],
    currentSkills: string[],
    availableServers: any[],
    availableSkills: any[],
    sessionHistory: any[],
    language?: string,
  ): string {
    const serversSection = availableServers
      .map((s) => `- ${s.name}: ${s.description || 'No description'}`)
      .join('\n');

    const skillsSection = availableSkills
      .map((s) => `- ${s.name} [${s.source}]: ${s.description || 'No description'}`)
      .join('\n');

    // Take last 20 messages, truncate each to 500 chars
    const recentMessages = sessionHistory
      .slice(-20)
      .map((m: any) => {
        const role = m.isAgent ? 'Agent' : 'User';
        const text = (m.message || '').substring(0, 500);
        return `${role}: ${text}`;
      })
      .join('\n\n');

    return `You are Don Clippo, a configuration advisor for an AI agent platform.
Analyze the user's conversation and recommend which MCP tool servers and skills would best serve their needs.

## Already Configured
### MCP Servers in use:
${configuredServerNames.length > 0 ? configuredServerNames.join(', ') : 'None'}

### Skills already provisioned:
${currentSkills.length > 0 ? currentSkills.join(', ') : 'None'}

## Available MCP Servers (not yet configured):
${serversSection || 'None available'}

## Available Skills (not yet provisioned):
${skillsSection || 'None available'}

## Recent Conversation:
${recentMessages || 'No conversation yet'}

## Instructions
Based on the conversation above, suggest MCP servers and skills that would help the user.
Only suggest items that are NOT already configured/provisioned.
Be selective — only recommend items that are clearly relevant to what the user is working on.
If the conversation is empty or unclear, suggest items that are generally useful for getting started.

Respond with ONLY a JSON object in this exact format:
{
  "reasoning": "Brief analysis of what the user needs",
  "suggestedServers": [
    { "name": "exact-server-name", "reason": "Why this server helps" }
  ],
  "suggestedSkills": [
    { "name": "exact-skill-name", "source": "standard|optional", "reason": "Why this skill helps" }
  ]
}

If nothing additional is needed, return empty arrays.${language && language !== 'en' ? `\n\nIMPORTANT: Write the "reasoning" and all "reason" values in ${AutoConfigurationService.LANGUAGE_NAMES[language] || language} language.` : ''}`;
  }

  private parseLlmResponse(response: string): any {
    // Try to extract JSON from markdown code fences
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        reasoning: parsed.reasoning || '',
        suggestedServers: Array.isArray(parsed.suggestedServers) ? parsed.suggestedServers : [],
        suggestedSkills: Array.isArray(parsed.suggestedSkills) ? parsed.suggestedSkills : [],
      };
    } catch (error: any) {
      this.logger.warn(`Failed to parse LLM response as JSON: ${error.message}`);
      return {
        reasoning: 'Could not parse advisor response.',
        suggestedServers: [],
        suggestedSkills: [],
      };
    }
  }
}
