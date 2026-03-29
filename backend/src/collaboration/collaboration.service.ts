import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectsService } from '../projects/projects.service';
import { A2ASettingsService } from '../a2a-settings/a2a-settings.service';
import { SkillsService } from '../skills/skills.service';
import { AgentCardDto } from '../a2a-settings/dto/a2a-settings.dto';
import { randomUUID } from 'crypto';
import {
  CounterpartMetadata,
  ConversationLogEntry,
  FileManifest,
  FileManifestEntry,
  CounterpartProjectSummary,
  PendingPairingRequest,
  PairingRequestDto,
  PairingRequestResponseDto,
  PairingVerifyRequestDto,
  PairingVerifyResponseDto,
} from './dto/collaboration.dto';

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly a2aSettingsService: A2ASettingsService,
    private readonly skillsService: SkillsService,
  ) {}

  /**
   * Slugify a counterpart agent name for use as project name
   */
  slugifyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get the project name for a counterpart agent
   */
  getCounterpartProjectName(counterpartName: string): string {
    return `a2a-${this.slugifyName(counterpartName)}`;
  }

  /**
   * Get the full path to a counterpart project
   */
  private getProjectPath(counterpartName: string): string {
    return path.join(this.workspaceDir, this.getCounterpartProjectName(counterpartName));
  }

  /**
   * Ensure a counterpart project exists. Creates it if not.
   * Returns the project path.
   */
  async ensureCounterpartProject(
    counterpartName: string,
    agentCard: AgentCardDto,
  ): Promise<string> {
    const projectName = this.getCounterpartProjectName(counterpartName);
    const projectPath = path.join(this.workspaceDir, projectName);

    if (await fs.pathExists(projectPath)) {
      this.logger.log(`Counterpart project ${projectName} already exists`);
      return projectPath;
    }

    this.logger.log(`Creating counterpart project ${projectName} for agent: ${counterpartName}`);

    // Create the project using ProjectsService
    const result = await this.projectsService.createProject({
      projectName,
      missionBrief: this.generateMissionBrief(counterpartName, agentCard),
      agentRole: {
        type: 'custom',
        customContent: this.generateAgentRole(counterpartName),
      },
      selectedSkills: ['agent-collaboration'],
      a2aAgents: [{ ...agentCard, enabled: true }],
    });

    if (!result.success) {
      throw new Error(
        `Failed to create counterpart project: ${result.errors?.join(', ')}`,
      );
    }

    // Create additional counterpart-specific directories and files
    await this.createCounterpartStructure(projectPath, counterpartName, agentCard);

    this.logger.log(`Counterpart project ${projectName} created successfully`);
    return projectPath;
  }

  /**
   * Create the counterpart-specific directory structure and metadata files
   */
  private async createCounterpartStructure(
    projectPath: string,
    counterpartName: string,
    agentCard: AgentCardDto,
  ): Promise<void> {
    // Create exchange directories
    await fs.ensureDir(path.join(projectPath, 'exchange', 'outbound'));
    await fs.ensureDir(path.join(projectPath, 'exchange', 'inbound'));

    // Create conversations directory
    await fs.ensureDir(path.join(projectPath, 'conversations'));

    // Write counterpart metadata
    const metadata: CounterpartMetadata = {
      counterpartName,
      counterpartSlug: this.slugifyName(counterpartName),
      counterpartUrl: agentCard.url,
      agentCard,
      channelCreated: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      trustLevel: 'standard',
      conversationCount: 0,
      filesExchanged: {
        sent: 0,
        received: 0,
      },
    };

    await fs.writeJson(
      path.join(projectPath, '.etienne', 'counterpart.json'),
      metadata,
      { spaces: 2 },
    );

    // Initialize conversation log
    const logHeader =
      `# Conversation Log: Etienne \u2194 ${counterpartName}\n\n` +
      `> Diplomatic channel established on ${new Date().toISOString()}\n` +
      `> Agent URL: ${agentCard.url}\n` +
      `> Agent Version: ${agentCard.version || 'unknown'}\n\n---\n`;

    await fs.writeFile(
      path.join(projectPath, 'conversations', 'conversation-log.md'),
      logHeader,
      'utf-8',
    );

    // Initialize file manifest
    const manifest: FileManifest = { exchanges: [] };
    await fs.writeJson(
      path.join(projectPath, 'conversations', 'file-manifest.json'),
      manifest,
      { spaces: 2 },
    );
  }

  /**
   * Generate a mission brief for the counterpart project
   */
  private generateMissionBrief(counterpartName: string, agentCard: AgentCardDto): string {
    let brief = `Diplomatic channel for communication with external agent **${counterpartName}**.\n\n`;
    brief += `This project serves as an auditable record of all interactions between our agent and ${counterpartName}.\n\n`;
    brief += `## Counterpart Agent\n\n`;
    brief += `- **Name:** ${agentCard.name}\n`;
    brief += `- **URL:** ${agentCard.url}\n`;
    brief += `- **Description:** ${agentCard.description || 'No description provided'}\n`;

    if (agentCard.skills && agentCard.skills.length > 0) {
      brief += `\n## Available Skills\n\n`;
      for (const skill of agentCard.skills) {
        brief += `- **${skill.name}**: ${skill.description || 'No description'}\n`;
      }
    }

    brief += `\n## Exchange Rules\n\n`;
    brief += `- Only files in \`exchange/outbound/\` are sent to ${counterpartName}\n`;
    brief += `- Files received from ${counterpartName} are saved to \`exchange/inbound/\`\n`;
    brief += `- All exchanges are logged in \`conversations/conversation-log.md\`\n`;

    return brief;
  }

  /**
   * Generate an agent role for the counterpart project
   */
  private generateAgentRole(counterpartName: string): string {
    return (
      `# Collaboration Liaison\n\n` +
      `You are managing the diplomatic channel with the external agent **${counterpartName}**.\n\n` +
      `Your responsibilities:\n` +
      `- Facilitate clear, structured communication with ${counterpartName}\n` +
      `- Ensure all file exchanges go through the \`exchange/\` folder\n` +
      `- Maintain the conversation log after every interaction\n` +
      `- Report results and artifacts to the user\n` +
      `- Never expose files outside the \`exchange/outbound/\` folder\n`
    );
  }

  /**
   * Log a conversation exchange to the counterpart project
   */
  async logConversation(
    counterpartName: string,
    entry: ConversationLogEntry,
  ): Promise<void> {
    const projectPath = this.getProjectPath(counterpartName);

    if (!(await fs.pathExists(projectPath))) {
      this.logger.warn(`Counterpart project for ${counterpartName} does not exist, skipping log`);
      return;
    }

    // Append to conversation log
    const logPath = path.join(projectPath, 'conversations', 'conversation-log.md');
    const timestamp = new Date(entry.timestamp);
    const timeStr = timestamp.toISOString().substring(11, 16);

    let logEntry = '\n';

    if (entry.direction === 'outbound') {
      logEntry += `### [${timeStr}] Etienne \u2192 ${counterpartName}\n`;
      if (entry.topic) {
        logEntry += `**Topic:** ${entry.topic}\n`;
      }
      logEntry += `**Message:** ${entry.message}\n`;
      if (entry.files && entry.files.length > 0) {
        logEntry += `**Files sent:** ${entry.files.join(', ')}\n`;
      }
    } else {
      logEntry += `### [${timeStr}] ${counterpartName} \u2192 Etienne\n`;
      logEntry += `**Status:** ${entry.status || 'unknown'}\n`;
      logEntry += `**Response:** ${entry.message}\n`;
      if (entry.files && entry.files.length > 0) {
        logEntry += `**Files received:** ${entry.files.join(', ')}\n`;
      }
      if (entry.taskId) {
        logEntry += `**Task ID:** ${entry.taskId}\n`;
      }
    }

    logEntry += '\n';

    await fs.appendFile(logPath, logEntry, 'utf-8');

    // Update file manifest if files were exchanged
    if (entry.files && entry.files.length > 0) {
      await this.updateFileManifest(counterpartName, {
        timestamp: entry.timestamp,
        direction: entry.direction,
        files: entry.files.map(f => ({
          name: path.basename(f),
          path: f,
        })),
        taskId: entry.taskId,
      });
    }

    // Update counterpart metadata
    await this.updateCounterpartMetadata(counterpartName, {
      lastActivity: entry.timestamp,
      incrementConversation: true,
      filesSent: entry.direction === 'outbound' ? (entry.files?.length || 0) : 0,
      filesReceived: entry.direction === 'inbound' ? (entry.files?.length || 0) : 0,
    });
  }

  /**
   * Update the file manifest for a counterpart project
   */
  private async updateFileManifest(
    counterpartName: string,
    entry: FileManifestEntry,
  ): Promise<void> {
    const projectPath = this.getProjectPath(counterpartName);
    const manifestPath = path.join(projectPath, 'conversations', 'file-manifest.json');

    let manifest: FileManifest = { exchanges: [] };
    try {
      if (await fs.pathExists(manifestPath)) {
        manifest = await fs.readJson(manifestPath);
      }
    } catch {
      // Use empty manifest on read error
    }

    manifest.exchanges.push(entry);

    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }

  /**
   * Update counterpart metadata
   */
  async updateCounterpartMetadata(
    counterpartName: string,
    updates: {
      lastActivity?: string;
      incrementConversation?: boolean;
      filesSent?: number;
      filesReceived?: number;
    },
  ): Promise<void> {
    const projectPath = this.getProjectPath(counterpartName);
    const metadataPath = path.join(projectPath, '.etienne', 'counterpart.json');

    if (!(await fs.pathExists(metadataPath))) {
      return;
    }

    try {
      const metadata: CounterpartMetadata = await fs.readJson(metadataPath);

      if (updates.lastActivity) {
        metadata.lastActivity = updates.lastActivity;
      }
      if (updates.incrementConversation) {
        metadata.conversationCount += 1;
      }
      if (updates.filesSent) {
        metadata.filesExchanged.sent += updates.filesSent;
      }
      if (updates.filesReceived) {
        metadata.filesExchanged.received += updates.filesReceived;
      }

      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    } catch (error: any) {
      this.logger.warn(`Failed to update counterpart metadata: ${error.message}`);
    }
  }

  /**
   * List all counterpart projects
   */
  async listCounterpartProjects(): Promise<CounterpartProjectSummary[]> {
    const summaries: CounterpartProjectSummary[] = [];

    try {
      const entries = await fs.readdir(this.workspaceDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('a2a-')) {
          continue;
        }

        const metadataPath = path.join(
          this.workspaceDir,
          entry.name,
          '.etienne',
          'counterpart.json',
        );

        if (await fs.pathExists(metadataPath)) {
          try {
            const metadata: CounterpartMetadata = await fs.readJson(metadataPath);
            summaries.push({
              projectName: entry.name,
              counterpartName: metadata.counterpartName,
              counterpartUrl: metadata.counterpartUrl,
              lastActivity: metadata.lastActivity,
              conversationCount: metadata.conversationCount,
              filesExchanged: metadata.filesExchanged,
            });
          } catch {
            // Skip projects with invalid metadata
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to list counterpart projects: ${error.message}`);
    }

    return summaries;
  }

  /**
   * Get counterpart metadata for a specific agent
   */
  async getCounterpartMetadataByName(counterpartName: string): Promise<CounterpartMetadata | null> {
    const projectPath = this.getProjectPath(counterpartName);
    const metadataPath = path.join(projectPath, '.etienne', 'counterpart.json');

    try {
      if (await fs.pathExists(metadataPath)) {
        return await fs.readJson(metadataPath);
      }
    } catch {
      // Ignore read errors
    }

    return null;
  }

  /**
   * Get the conversation log content for a counterpart
   */
  async getConversationLog(counterpartName: string): Promise<string | null> {
    const projectPath = this.getProjectPath(counterpartName);
    const logPath = path.join(projectPath, 'conversations', 'conversation-log.md');

    try {
      if (await fs.pathExists(logPath)) {
        return await fs.readFile(logPath, 'utf-8');
      }
    } catch {
      // Ignore read errors
    }

    return null;
  }

  /**
   * Get the file manifest for a counterpart
   */
  async getFileManifest(counterpartName: string): Promise<FileManifest | null> {
    const projectPath = this.getProjectPath(counterpartName);
    const manifestPath = path.join(projectPath, 'conversations', 'file-manifest.json');

    try {
      if (await fs.pathExists(manifestPath)) {
        return await fs.readJson(manifestPath);
      }
    } catch {
      // Ignore read errors
    }

    return null;
  }

  /**
   * Get the inbound exchange directory for a counterpart (where received files go)
   */
  getInboundDir(counterpartName: string): string {
    return path.join(this.getProjectPath(counterpartName), 'exchange', 'inbound');
  }

  /**
   * Get the outbound exchange directory for a counterpart
   */
  getOutboundDir(counterpartName: string): string {
    return path.join(this.getProjectPath(counterpartName), 'exchange', 'outbound');
  }

  // =========================================================================
  // Pairing (PIN-based agent enrollment)
  // =========================================================================

  /** In-memory store for pending pairing requests (receiver side) */
  private pendingPairings = new Map<string, PendingPairingRequest>();

  /** Pairing timeout: 10 minutes */
  private readonly PAIRING_TIMEOUT_MS = 10 * 60 * 1000;

  /**
   * Generate an 8-digit numeric PIN
   */
  private generatePin(): string {
    const digits = '0123456789';
    let pin = '';
    for (let i = 0; i < 8; i++) {
      pin += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return pin;
  }

  /**
   * Clean up expired pairings
   */
  private cleanupExpiredPairings(): void {
    const now = Date.now();
    for (const [id, pairing] of this.pendingPairings) {
      if (new Date(pairing.expiresAt).getTime() < now) {
        this.pendingPairings.delete(id);
        this.logger.log(`Expired pairing ${id} cleaned up`);
      }
    }
  }

  /**
   * RECEIVER: Handle incoming pairing request from another agent's backend.
   * Generates and stores a PIN. The PIN must be communicated out-of-band
   * (phone, email) to the initiator's human owner.
   */
  async handlePairingRequest(dto: PairingRequestDto): Promise<PairingRequestResponseDto> {
    this.cleanupExpiredPairings();

    const id = randomUUID();
    const pin = this.generatePin();
    const now = new Date();

    const pending: PendingPairingRequest = {
      id,
      pin,
      initiatorUrl: dto.initiatorUrl,
      initiatorAgentCard: dto.initiatorAgentCard,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.PAIRING_TIMEOUT_MS).toISOString(),
    };

    this.pendingPairings.set(id, pending);
    this.logger.log(`Pairing request created: ${id}, PIN: ${pin} for initiator ${dto.initiatorUrl}`);

    // Build our own agent card to return to the initiator
    const receiverAgentCard = this.getOwnAgentCard();

    return {
      success: true,
      pairingId: id,
      receiverAgentCard,
      message: `Pairing request received. PIN has been generated and must be communicated out-of-band.`,
    };
  }

  /**
   * RECEIVER: Get all pending pairing requests (for the UI to show PINs)
   */
  getPendingPairings(): PendingPairingRequest[] {
    this.cleanupExpiredPairings();
    return Array.from(this.pendingPairings.values());
  }

  /**
   * RECEIVER: Verify a PIN from the initiator and complete the pairing
   */
  async verifyPairing(dto: PairingVerifyRequestDto): Promise<PairingVerifyResponseDto> {
    this.cleanupExpiredPairings();

    const pending = this.pendingPairings.get(dto.pairingId);
    if (!pending) {
      return { success: false, message: 'Pairing request not found or expired' };
    }

    if (pending.pin !== dto.pin) {
      return { success: false, message: 'Invalid PIN' };
    }

    // PIN matches — create the counterpart project on the receiver side
    try {
      await this.ensureCounterpartProject(
        dto.initiatorAgentCard.name,
        dto.initiatorAgentCard,
      );
    } catch (error: any) {
      this.logger.error(`Failed to create counterpart project during pairing: ${error.message}`);
      return { success: false, message: `Failed to create counterpart project: ${error.message}` };
    }

    // Remove the used pairing
    this.pendingPairings.delete(dto.pairingId);
    this.logger.log(`Pairing ${dto.pairingId} verified and completed`);

    const receiverAgentCard = this.getOwnAgentCard();
    return {
      success: true,
      receiverAgentCard,
      message: 'Pairing verified successfully. Counterpart project created.',
    };
  }

  /**
   * INITIATOR: Send a pairing request to a remote agent
   */
  async initiatePairing(agentUrl: string): Promise<{
    success: boolean;
    pairingId?: string;
    receiverAgentCard?: AgentCardDto;
    error?: string;
  }> {
    try {
      // First, fetch the agent card to get agent info
      const agentCard = await this.a2aSettingsService.fetchAgentCard(
        agentUrl.endsWith('/')
          ? `${agentUrl}.well-known/agent-card.json`
          : `${agentUrl}/.well-known/agent-card.json`,
      );

      // Send pairing request to the receiver's collaboration endpoint
      const axios = (await import('axios')).default;
      const pairingUrl = agentUrl.endsWith('/')
        ? `${agentUrl}api/collaboration/pairing/request`
        : `${agentUrl}/api/collaboration/pairing/request`;

      const ownCard = this.getOwnAgentCard();
      const response = await axios.post(pairingUrl, {
        initiatorUrl: this.getOwnBaseUrl(),
        initiatorAgentCard: ownCard,
      } as PairingRequestDto, { timeout: 15000 });

      const data = response.data as PairingRequestResponseDto;

      if (data.success) {
        return {
          success: true,
          pairingId: data.pairingId,
          receiverAgentCard: data.receiverAgentCard,
        };
      }

      return { success: false, error: data.message || 'Pairing request rejected' };
    } catch (error: any) {
      this.logger.error(`Failed to initiate pairing with ${agentUrl}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * INITIATOR: Verify the PIN with the remote agent and complete pairing on both sides
   */
  async completePairing(
    agentUrl: string,
    pairingId: string,
    pin: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const axios = (await import('axios')).default;
      const verifyUrl = agentUrl.endsWith('/')
        ? `${agentUrl}api/collaboration/pairing/verify`
        : `${agentUrl}/api/collaboration/pairing/verify`;

      const ownCard = this.getOwnAgentCard();
      const response = await axios.post(verifyUrl, {
        pairingId,
        pin,
        initiatorAgentCard: ownCard,
      } as PairingVerifyRequestDto, { timeout: 15000 });

      const data = response.data as PairingVerifyResponseDto;

      if (!data.success) {
        return { success: false, error: data.message || 'PIN verification failed' };
      }

      // PIN verified — create the counterpart project on the initiator side
      if (data.receiverAgentCard) {
        await this.ensureCounterpartProject(
          data.receiverAgentCard.name,
          data.receiverAgentCard,
        );
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to complete pairing with ${agentUrl}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build our own agent card for pairing exchanges
   */
  private getOwnAgentCard(): AgentCardDto {
    const baseUrl = this.getOwnBaseUrl();
    return {
      name: process.env.AGENT_NAME || 'Etienne',
      description: process.env.AGENT_DESCRIPTION || 'AI Coworker powered by Claude Code',
      url: baseUrl,
      version: '1.0.0',
    };
  }

  /**
   * Get the base URL of this agent (for the counterpart to reach us)
   */
  private getOwnBaseUrl(): string {
    return process.env.AGENT_BASE_URL || process.env.A2A_SERVER_URL || 'http://localhost:5600';
  }
}
