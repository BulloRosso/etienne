import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import OpenAI from 'openai';

export interface GuardrailResponse {
  guardrailTriggered: boolean;
  modifiedContent: string;
  runtimeMilliseconds: number;
  violations: string[];
}

export interface OutputGuardrailsConfig {
  enabled: boolean;
  prompt: string;
  violationsEnum: string[];
}

@Injectable()
export class OutputGuardrailsService {
  private readonly workspaceDir = path.resolve(process.cwd(), '../workspace');
  private openaiClient: OpenAI | null = null;

  constructor() {
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openaiClient = new OpenAI({ apiKey });
    }
  }

  /**
   * Get the output guardrails config file path for a project
   */
  private getConfigPath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne', 'output-guardrails.json');
  }

  /**
   * Ensure the .etienne directory exists
   */
  private async ensureEtienneDir(project: string): Promise<void> {
    const etienneDir = path.join(this.workspaceDir, project, '.etienne');
    try {
      await fs.access(etienneDir);
    } catch {
      await fs.mkdir(etienneDir, { recursive: true });
    }
  }

  /**
   * Load output guardrails configuration for a project
   */
  async getConfig(project: string): Promise<OutputGuardrailsConfig> {
    const configPath = this.getConfigPath(project);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Return default config if file doesn't exist
      return {
        enabled: false,
        prompt: this.getDefaultPrompt(),
        violationsEnum: ['Color', 'City']
      };
    }
  }

  /**
   * Save output guardrails configuration for a project
   */
  async saveConfig(project: string, config: OutputGuardrailsConfig): Promise<void> {
    await this.ensureEtienneDir(project);
    const configPath = this.getConfigPath(project);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Update output guardrails configuration for a project
   */
  async updateConfig(project: string, config: Partial<OutputGuardrailsConfig>): Promise<OutputGuardrailsConfig> {
    const currentConfig = await this.getConfig(project);
    const updatedConfig: OutputGuardrailsConfig = {
      ...currentConfig,
      ...config
    };
    await this.saveConfig(project, updatedConfig);
    return updatedConfig;
  }

  /**
   * Get default guardrail prompt
   */
  private getDefaultPrompt(): string {
    return `You are a content moderation guardrail system. Your job is to detect policy violations in text content.

POLICY RULES:
1. Detect any mentions of COLORS (e.g., red, blue, green, yellow, purple, orange, pink, black, white, gray, etc.)
2. Detect any mentions of CITIES (e.g., New York, London, Tokyo, Paris, Berlin, etc.)

INSTRUCTIONS:
- Carefully scan the input text for any color names or city names
- List ALL violations found (each color or city mentioned)
- Create modified content where each violation is replaced with "xxxxxx"
- If no violations found, return the original content unchanged
- Be thorough - catch all variations (e.g., "NYC" is New York City)

Return your analysis as JSON with these fields:
- guardrailTriggered: boolean (true if any violations found)
- violations: array of strings (list each color/city found, e.g., ["red", "Paris"])
- modifiedContent: string (original text with violations replaced by "xxxxxx")`;
  }

  /**
   * Main guardrail function - inspects content for violations
   * @param content - The LLM output to inspect
   * @param project - The project identifier to load custom config
   * @returns GuardrailResponse with violation details and modified content
   */
  async checkGuardrail(content: string, project: string): Promise<GuardrailResponse> {
    const startTime = Date.now();

    if (!this.openaiClient) {
      console.error('OpenAI client not initialized. OPENAI_API_KEY not set.');
      // Fail-safe: return original content if guardrail fails
      return {
        guardrailTriggered: false,
        modifiedContent: content,
        runtimeMilliseconds: Date.now() - startTime,
        violations: [],
      };
    }

    // Load project-specific config
    const config = await this.getConfig(project);

    if (!config.enabled) {
      // Post-processing disabled, return content unchanged
      return {
        guardrailTriggered: false,
        modifiedContent: content,
        runtimeMilliseconds: Date.now() - startTime,
        violations: [],
      };
    }

    const systemPrompt = config.prompt || this.getDefaultPrompt();
    const userPrompt = `Analyze this content for policy violations:\n\n${content}`;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'guardrail_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                guardrailTriggered: {
                  type: 'boolean',
                  description: 'Whether any policy violations were detected',
                },
                violations: {
                  type: 'array',
                  description: 'List of detected violations',
                  items: {
                    type: 'string',
                  },
                },
                modifiedContent: {
                  type: 'string',
                  description: 'Content with violations replaced',
                },
              },
              required: ['guardrailTriggered', 'violations', 'modifiedContent'],
              additionalProperties: false,
            },
          },
        },
      });

      const result = JSON.parse(
        response.choices[0].message.content || '{}'
      );

      const runtimeMilliseconds = Date.now() - startTime;

      return {
        guardrailTriggered: result.guardrailTriggered,
        modifiedContent: result.modifiedContent,
        runtimeMilliseconds,
        violations: result.violations,
      };
    } catch (error) {
      const runtimeMilliseconds = Date.now() - startTime;

      console.error('Guardrail check failed:', error);

      // Fail-safe: return original content if guardrail fails
      return {
        guardrailTriggered: false,
        modifiedContent: content,
        runtimeMilliseconds,
        violations: [],
      };
    }
  }
}
