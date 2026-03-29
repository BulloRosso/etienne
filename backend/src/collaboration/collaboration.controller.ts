import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import {
  PairingRequestDto,
  PairingVerifyRequestDto,
} from './dto/collaboration.dto';

@Controller('api/collaboration')
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  // =========================================================================
  // Counterpart project queries
  // =========================================================================

  /**
   * List all counterpart projects
   */
  @Get('projects')
  async listProjects() {
    return this.collaborationService.listCounterpartProjects();
  }

  /**
   * Get counterpart project details
   */
  @Get('projects/:name')
  async getProject(@Param('name') name: string) {
    const metadata = await this.collaborationService.getCounterpartMetadataByName(name);

    if (!metadata) {
      throw new HttpException(
        `Counterpart project for '${name}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return metadata;
  }

  /**
   * Get conversation log for a counterpart
   */
  @Get('projects/:name/conversations')
  async getConversations(@Param('name') name: string) {
    const log = await this.collaborationService.getConversationLog(name);

    if (log === null) {
      throw new HttpException(
        `Conversation log for '${name}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return { counterpart: name, log };
  }

  /**
   * Get file manifest for a counterpart
   */
  @Get('projects/:name/files')
  async getFiles(@Param('name') name: string) {
    const manifest = await this.collaborationService.getFileManifest(name);

    if (manifest === null) {
      throw new HttpException(
        `File manifest for '${name}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return { counterpart: name, manifest };
  }

  // =========================================================================
  // Pairing (PIN-based agent enrollment)
  // =========================================================================

  /**
   * INITIATOR frontend calls this:
   * Step 1 — Send pairing request to the remote agent
   */
  @Post('pairing/initiate')
  async initiatePairing(@Body() body: { agentUrl: string }) {
    if (!body.agentUrl) {
      throw new HttpException('agentUrl is required', HttpStatus.BAD_REQUEST);
    }

    const result = await this.collaborationService.initiatePairing(body.agentUrl);

    if (!result.success) {
      throw new HttpException(
        result.error || 'Failed to initiate pairing',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return result;
  }

  /**
   * INITIATOR frontend calls this:
   * Step 2 — Verify the PIN with the remote agent and complete pairing
   */
  @Post('pairing/complete')
  async completePairing(@Body() body: { agentUrl: string; pairingId: string; pin: string }) {
    if (!body.agentUrl || !body.pairingId || !body.pin) {
      throw new HttpException(
        'agentUrl, pairingId, and pin are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.collaborationService.completePairing(
      body.agentUrl,
      body.pairingId,
      body.pin,
    );

    if (!result.success) {
      throw new HttpException(
        result.error || 'Pairing verification failed',
        HttpStatus.FORBIDDEN,
      );
    }

    return { success: true, message: 'Agents paired successfully' };
  }

  /**
   * RECEIVER: Incoming pairing request from another agent's backend
   */
  @Post('pairing/request')
  async handlePairingRequest(@Body() dto: PairingRequestDto) {
    if (!dto.initiatorUrl || !dto.initiatorAgentCard) {
      throw new HttpException(
        'initiatorUrl and initiatorAgentCard are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.collaborationService.handlePairingRequest(dto);
  }

  /**
   * RECEIVER: PIN verification from the initiator's backend
   */
  @Post('pairing/verify')
  async verifyPairing(@Body() dto: PairingVerifyRequestDto) {
    if (!dto.pairingId || !dto.pin || !dto.initiatorAgentCard) {
      throw new HttpException(
        'pairingId, pin, and initiatorAgentCard are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.collaborationService.verifyPairing(dto);
  }

  /**
   * RECEIVER: Get pending pairing requests (to show PINs in the UI)
   */
  @Get('pairing/pending')
  async getPendingPairings() {
    return this.collaborationService.getPendingPairings();
  }
}
