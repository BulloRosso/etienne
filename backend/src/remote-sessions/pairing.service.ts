import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { SessionEventsService } from './session-events.service';
import { RemoteSessionsStorageService } from './remote-sessions-storage.service';
import {
  PendingPairing,
  RemoteSessionMapping,
  TelegramSession,
  PairingResult,
} from './interfaces/remote-session.interface';

@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);

  // Timeout for pairing requests (10 minutes)
  private readonly PAIRING_TIMEOUT_MS = 10 * 60 * 1000;

  // Global project for pairing events (since pairing isn't project-specific)
  private readonly PAIRING_PROJECT = '__global__';

  constructor(
    private readonly storage: RemoteSessionsStorageService,
    private readonly interceptorsService: InterceptorsService,
    private readonly sessionEventsService: SessionEventsService,
  ) {}

  /**
   * Generate a 6-character alphanumeric pairing code
   * Avoids ambiguous characters (0, O, I, l, 1)
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Request a new pairing for a Telegram user
   * Emits SSE event to frontend and returns immediately.
   * The approval/denial will be sent via SSE to the Telegram provider.
   */
  async requestPairing(
    provider: 'telegram',
    remoteSession: TelegramSession,
  ): Promise<PairingResult> {
    // Check if user is already paired
    const existingSession = await this.storage.findByChatId(remoteSession.chatId);
    if (existingSession) {
      return {
        success: true,
        sessionId: existingSession.id,
        error: 'Already paired',
      };
    }

    // Check for existing pending pairing for this chatId
    const existingPairing = await this.storage.findPairingByChatId(remoteSession.chatId);
    if (existingPairing) {
      // Already has a pending pairing request
      return {
        success: true,
        sessionId: existingPairing.id,
        error: 'Pairing request already pending',
      };
    }

    // Clean up expired pairings first
    await this.storage.cleanupExpiredPairings();

    const id = randomUUID();
    const code = this.generateCode();
    const now = new Date();

    const pairing: PendingPairing = {
      id,
      code,
      provider,
      remoteSession,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + this.PAIRING_TIMEOUT_MS).toISOString(),
    };

    // Save to storage
    await this.storage.addPendingPairing(pairing);

    this.logger.log(`Created pairing request ${id} with code ${code} for chatId ${remoteSession.chatId}`);

    // Emit to frontend via SSE (non-blocking)
    this.emitPairingRequest(pairing);

    // Return immediately - approval will be sent via SSE to Telegram provider
    return {
      success: true,
      sessionId: id,
    };
  }

  /**
   * Emit pairing request to frontend via SSE
   */
  private emitPairingRequest(pairing: PendingPairing): void {
    // Use the InterceptorsService to emit pairing_request event
    this.interceptorsService.emitPairingRequest(this.PAIRING_PROJECT, {
      id: pairing.id,
      code: pairing.code,
      provider: pairing.provider,
      remoteSession: pairing.remoteSession,
      expires_at: pairing.expires_at,
    });

    this.logger.log(`Emitted pairing_request event for ${pairing.id}`);
  }

  /**
   * Handle response from frontend (approve or deny)
   */
  async handleResponse(id: string, action: 'approve' | 'deny', message?: string): Promise<boolean> {
    // Find pairing in storage
    const pairing = await this.storage.findPairingById(id);
    if (!pairing) {
      this.logger.warn(`No pending pairing request found for id: ${id}`);
      return false;
    }

    this.logger.log(`Processing pairing response for ${id}: ${action}`);

    if (action === 'approve') {
      // Create session mapping
      const mapping = await this.createSessionFromPairing(pairing);

      // Remove from pending pairings
      await this.storage.removePairing(id);

      // Notify Telegram provider via SSE
      this.emitPairingApproved(pairing.remoteSession.chatId, mapping.id);

      this.logger.log(`Pairing approved for chatId ${pairing.remoteSession.chatId}`);
    } else {
      // Remove from pending pairings
      await this.storage.removePairing(id);

      // Notify Telegram provider via SSE
      this.emitPairingDenied(pairing.remoteSession.chatId, message);

      this.logger.log(`Pairing denied for chatId ${pairing.remoteSession.chatId}`);
    }

    return true;
  }

  /**
   * Approve a pairing directly (when request has timed out but pairing still exists)
   */
  private async approvePairingDirect(pairing: PendingPairing): Promise<boolean> {
    const mapping = await this.createSessionFromPairing(pairing);
    await this.storage.removePairing(pairing.id);
    this.emitPairingApproved(pairing.remoteSession.chatId, mapping.id);
    return true;
  }

  /**
   * Create a session mapping from a pairing
   */
  private async createSessionFromPairing(pairing: PendingPairing): Promise<RemoteSessionMapping> {
    const now = new Date().toISOString();
    const mapping: RemoteSessionMapping = {
      id: randomUUID(),
      provider: pairing.provider,
      created_at: now,
      updated_at: now,
      project: {
        name: '', // Will be set when user selects a project
        sessionId: '',
      },
      remoteSession: pairing.remoteSession,
      status: 'active',
    };

    await this.storage.addSession(mapping);
    this.logger.log(`Created session mapping ${mapping.id} for chatId ${pairing.remoteSession.chatId}`);

    return mapping;
  }

  /**
   * Emit pairing approved event to Telegram provider via SessionEventsService
   */
  private emitPairingApproved(chatId: number, sessionId: string): void {
    // Send to Telegram provider via SessionEventsService
    this.sessionEventsService.emitPairingApproved('telegram', chatId, sessionId);
    this.logger.log(`Emitted pairing_approved event for chatId ${chatId}`);
  }

  /**
   * Emit pairing denied event to Telegram provider via SessionEventsService
   */
  private emitPairingDenied(chatId: number, message?: string): void {
    // Send to Telegram provider via SessionEventsService
    this.sessionEventsService.emitPairingDenied('telegram', chatId, message);
    this.logger.log(`Emitted pairing_denied event for chatId ${chatId}`);
  }

  /**
   * Get all pending pairing requests
   */
  async getPendingPairings(): Promise<PendingPairing[]> {
    await this.storage.cleanupExpiredPairings();
    return this.storage.getAllPendingPairings();
  }

  /**
   * Check if a chatId has a pending pairing
   */
  async hasPendingPairing(chatId: number): Promise<boolean> {
    const pairing = await this.storage.findPairingByChatId(chatId);
    return pairing !== null;
  }
}
