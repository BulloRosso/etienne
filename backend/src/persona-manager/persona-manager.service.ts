import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import AdmZip from 'adm-zip';
import axios from 'axios';
import { ProjectsService } from '../projects/projects.service';
import { SessionsService, ChatMessage } from '../sessions/sessions.service';

export interface ContactChannels {
  email?: string;
  teamsAccount?: string;
  telegramHandle?: string;
  preferredChannel: 'email' | 'teamsAccount' | 'telegramHandle';
}

export interface PersonalityDto {
  personaType: string;
  name: string;
  avatarDescription?: string;
  allowReviewNotificationsBetween?: string;
  communicationStyle?: string;
  contactChannels?: ContactChannels;
  avoidAtAllCosts?: string;
}

export interface PersonaTypeInfo {
  zipFilename: string;
  name: string;
  description?: string;
  version?: string;
}

@Injectable()
export class PersonaManagerService {
  private readonly logger = new Logger(PersonaManagerService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * List available persona ZIP files from workspace/.agent-persona-repository
   */
  async listPersonaTypes(): Promise<PersonaTypeInfo[]> {
    const repoDir = path.join(this.workspaceDir, '.agent-persona-repository');
    const result: PersonaTypeInfo[] = [];

    if (!(await fs.pathExists(repoDir))) {
      this.logger.warn(`Persona repository not found: ${repoDir}`);
      return result;
    }

    const entries = await fs.readdir(repoDir);
    const zipFiles = entries.filter((f) => f.endsWith('.zip'));

    for (const zipFile of zipFiles) {
      const zipPath = path.join(repoDir, zipFile);
      try {
        const zip = new AdmZip(zipPath);
        const manifestEntry = zip.getEntry('MANIFEST.json');
        if (manifestEntry) {
          const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
          result.push({
            zipFilename: zipFile,
            name: manifest.name || zipFile.replace('.zip', ''),
            description: manifest.description,
            version: manifest.version,
          });
        } else {
          result.push({
            zipFilename: zipFile,
            name: zipFile.replace('.zip', ''),
          });
        }
      } catch (error: any) {
        this.logger.warn(`Failed to read persona ZIP ${zipFile}: ${error.message}`);
        result.push({
          zipFilename: zipFile,
          name: zipFile.replace('.zip', ''),
        });
      }
    }

    return result;
  }

  /**
   * Generate avatar using OpenAI images/edits API (new JSON format)
   * with etienne-waving.png as guidance image and gpt-image-1 model
   */
  async generateAvatar(avatarDescription: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Locate the guidance image and convert to base64 data URL
    const guidanceImagePath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'frontend',
      'public',
      'etienne-waving.png',
    );

    if (!(await fs.pathExists(guidanceImagePath))) {
      throw new Error(`Guidance image not found: ${guidanceImagePath}`);
    }

    const imageBuffer = await fs.readFile(guidanceImagePath);
    const guidanceBase64 = imageBuffer.toString('base64');
    const guidanceDataUrl = `data:image/png;base64,${guidanceBase64}`;

    this.logger.log(`Generating avatar with description: "${avatarDescription}"`);

    // Use the new JSON-based images/edits endpoint directly via HTTP
    // The SDK v6.x doesn't support the new format with images array
    const prompt = [
      `IMPORTANT: Transform the character in the reference image to match this description: ${avatarDescription}.`,
      'Change the character appearance (hair, clothing, skin, accessories, expression) to match the description exactly.',
      'Keep the same cartoon/illustration art style and pose from the reference image.',
      'The output must clearly show the described appearance - do NOT keep the original character unchanged.',
    ].join(' ');

    const response = await axios.post(
      'https://api.openai.com/v1/images/edits',
      {
        model: 'gpt-image-1',
        images: [{ image_url: guidanceDataUrl }],
        prompt,
        size: '1024x1024',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      },
    );

    const base64 = response.data?.data?.[0]?.b64_json;
    if (!base64) {
      throw new Error('No image data returned from OpenAI');
    }

    // Save avatar to workspace/.agent/avatar.png
    const agentDir = path.join(this.workspaceDir, '.agent');
    await fs.ensureDir(agentDir);
    const avatarPath = path.join(agentDir, 'avatar.png');
    await fs.writeFile(avatarPath, Buffer.from(base64, 'base64'));
    this.logger.log(`Avatar saved to ${avatarPath}`);

    return base64;
  }

  /**
   * Save an uploaded avatar PNG directly to workspace/.agent/avatar.png
   */
  async uploadAvatar(base64: string): Promise<void> {
    const agentDir = path.join(this.workspaceDir, '.agent');
    await fs.ensureDir(agentDir);
    const avatarPath = path.join(agentDir, 'avatar.png');
    await fs.writeFile(avatarPath, Buffer.from(base64, 'base64'));
    this.logger.log(`Uploaded avatar saved to ${avatarPath}`);
  }

  /**
   * Install persona: store personality.json, deflate ZIP, create onboarding project
   */
  async install(
    personality: PersonalityDto,
    zipFilename: string,
  ): Promise<{ success: boolean; projectName: string; warnings?: string[] }> {
    const warnings: string[] = [];
    const agentDir = path.join(this.workspaceDir, '.agent');

    // 1. Create .agent directory
    await fs.ensureDir(agentDir);

    // 2. Write personality.json
    const personalityPath = path.join(agentDir, 'personality.json');
    await fs.writeJson(personalityPath, personality, { spaces: 2 });
    this.logger.log(`Wrote personality.json to ${personalityPath}`);

    // 3. Extract ZIP from .agent-persona-repository into .agent
    const zipPath = path.join(this.workspaceDir, '.agent-persona-repository', zipFilename);
    if (!(await fs.pathExists(zipPath))) {
      throw new Error(`Persona ZIP not found: ${zipPath}`);
    }

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(agentDir, true);
    this.logger.log(`Extracted ${zipFilename} into ${agentDir}`);

    // 4. Template injection: replace placeholders in .md files
    await this.injectTemplateValues(agentDir, personality);

    // 5. Create "onboarding" project
    let installContent = '';
    const installMdPath = path.join(agentDir, 'install.md');
    if (await fs.pathExists(installMdPath)) {
      installContent = await fs.readFile(installMdPath, 'utf-8');
    }

    const missionBrief = this.buildOnboardingMission(personality, installContent);

    try {
      const projectResult = await this.projectsService.createProject({
        projectName: 'onboarding',
        agentName: personality.name,
        missionBrief,
      } as any);

      if (!projectResult.success) {
        warnings.push(`Project creation issues: ${projectResult.errors?.join(', ')}`);
      }
      if (projectResult.warnings) {
        warnings.push(...projectResult.warnings);
      }
    } catch (error: any) {
      warnings.push(`Failed to create onboarding project: ${error.message}`);
    }

    // 6. Copy install.md as onboarding-to-dos.md into the project
    const onboardingProjectPath = path.join(this.workspaceDir, 'onboarding');
    if (installContent && (await fs.pathExists(onboardingProjectPath))) {
      await fs.writeFile(
        path.join(onboardingProjectPath, 'onboarding-to-dos.md'),
        installContent,
        'utf-8',
      );
      this.logger.log('Wrote onboarding-to-dos.md');
    }

    // 7. Seed first session with auto-start greeting
    if (await fs.pathExists(onboardingProjectPath)) {
      try {
        const sessionId = `onboarding-${Date.now()}`;
        const greeting = this.buildOnboardingGreeting(personality);
        const firstMessage: ChatMessage = {
          timestamp: new Date().toISOString(),
          isAgent: true,
          message: greeting,
        };
        await this.sessionsService.appendMessages(onboardingProjectPath, sessionId, [
          firstMessage,
        ]);
        this.logger.log(`Seeded first onboarding session: ${sessionId}`);
      } catch (error: any) {
        warnings.push(`Failed to seed onboarding session: ${error.message}`);
      }
    }

    return {
      success: true,
      projectName: 'onboarding',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Walk all .md files in the extracted persona and replace known template placeholders
   */
  private async injectTemplateValues(
    dir: string,
    personality: PersonalityDto,
  ): Promise<void> {
    const replacements: Record<string, string> = {};

    if (personality.name) {
      replacements['{AGENT_NAME}'] = personality.name;
    }
    if (personality.communicationStyle) {
      replacements['{TONE}'] = personality.communicationStyle;
    }

    if (Object.keys(replacements).length === 0) return;

    await this.walkAndReplace(dir, replacements);
  }

  private async walkAndReplace(
    dir: string,
    replacements: Record<string, string>,
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkAndReplace(fullPath, replacements);
      } else if (entry.name.endsWith('.md')) {
        let content = await fs.readFile(fullPath, 'utf-8');
        let modified = false;

        for (const [placeholder, value] of Object.entries(replacements)) {
          if (content.includes(placeholder)) {
            content = content.replaceAll(placeholder, value);
            modified = true;
          }
        }

        if (modified) {
          await fs.writeFile(fullPath, content, 'utf-8');
          this.logger.debug(`Injected template values into ${fullPath}`);
        }
      }
    }
  }

  private buildOnboardingMission(personality: PersonalityDto, installContent: string): string {
    let mission = `# Onboarding: ${personality.name}\n\n`;
    mission += `You are setting up the agent "${personality.name}" (persona type: ${personality.personaType}).\n\n`;

    if (personality.communicationStyle) {
      mission += `Communication style: ${personality.communicationStyle}\n\n`;
    }

    if (personality.avoidAtAllCosts) {
      mission += `Important restriction: ${personality.avoidAtAllCosts}\n\n`;
    }

    if (installContent) {
      mission += `## Installation Guide\n\n${installContent}\n`;
    }

    return mission;
  }

  private buildOnboardingGreeting(personality: PersonalityDto): string {
    return (
      `Hello! I'm ${personality.name}, your new assistant. I'm excited to get started!\n\n` +
      `Let's begin the onboarding process so I can learn about your business and start being useful. ` +
      `First, I need some basic information:\n\n` +
      `What's your company name, and what's your name and role?`
    );
  }
}
