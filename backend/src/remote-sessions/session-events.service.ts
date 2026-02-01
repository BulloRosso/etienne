import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { ProviderEvent } from './interfaces/remote-session.interface';

/**
 * Service to manage SSE events for remote session providers (e.g., Telegram)
 * This is separate from InterceptorsService as it handles provider-specific events
 */
@Injectable()
export class SessionEventsService {
  private readonly logger = new Logger(SessionEventsService.name);

  // SSE subjects per provider
  private readonly subjects = new Map<string, Subject<ProviderEvent>>();

  /**
   * Get event stream for a provider
   */
  getEventStream(provider: string): Observable<ProviderEvent> {
    if (!this.subjects.has(provider)) {
      this.subjects.set(provider, new Subject<ProviderEvent>());
    }
    return this.subjects.get(provider)!.asObservable();
  }

  /**
   * Emit a Claude response to be forwarded to the remote session
   */
  emitClaudeResponse(
    provider: string,
    chatId: number,
    response: string,
    success: boolean,
    tokenUsage?: { input_tokens: number; output_tokens: number },
  ): void {
    const subject = this.subjects.get(provider);
    if (!subject) {
      this.logger.warn(`No subscribers for provider: ${provider}`);
      return;
    }

    const event: ProviderEvent = {
      type: 'etienne_response',
      data: {
        chatId,
        response,
        success,
        tokenUsage,
      },
      timestamp: new Date().toISOString(),
    };

    subject.next(event);
    this.logger.log(`Emitted etienne_response for chatId ${chatId}`);
  }

  /**
   * Emit pairing approved event to provider
   */
  emitPairingApproved(provider: string, chatId: number, sessionId: string): void {
    const subject = this.subjects.get(provider);
    if (!subject) {
      this.logger.warn(`No subscribers for provider: ${provider}`);
      return;
    }

    const event: ProviderEvent = {
      type: 'pairing_approved',
      data: {
        chatId,
        sessionId,
      },
      timestamp: new Date().toISOString(),
    };

    subject.next(event);
    this.logger.log(`Emitted pairing_approved for chatId ${chatId}`);
  }

  /**
   * Emit pairing denied event to provider
   */
  emitPairingDenied(provider: string, chatId: number, message?: string): void {
    const subject = this.subjects.get(provider);
    if (!subject) {
      this.logger.warn(`No subscribers for provider: ${provider}`);
      return;
    }

    const event: ProviderEvent = {
      type: 'pairing_denied',
      data: {
        chatId,
        message: message || 'Pairing denied',
      },
      timestamp: new Date().toISOString(),
    };

    subject.next(event);
    this.logger.log(`Emitted pairing_denied for chatId ${chatId}`);
  }

  /**
   * Emit error event to provider
   */
  emitError(provider: string, chatId: number, error: string): void {
    const subject = this.subjects.get(provider);
    if (!subject) {
      this.logger.warn(`No subscribers for provider: ${provider}`);
      return;
    }

    const event: ProviderEvent = {
      type: 'error',
      data: {
        chatId,
        error,
      },
      timestamp: new Date().toISOString(),
    };

    subject.next(event);
    this.logger.log(`Emitted error for chatId ${chatId}: ${error}`);
  }

  /**
   * Check if a provider has active subscribers
   */
  hasSubscribers(provider: string): boolean {
    const subject = this.subjects.get(provider);
    return subject ? subject.observed : false;
  }
}
