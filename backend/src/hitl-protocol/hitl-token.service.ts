import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/**
 * Manages single-use JWT submit tokens for HITL Protocol inline submit.
 *
 * When an external service provides a submit_url, the platform generates a
 * scoped token that authorises exactly one callback POST to that URL.
 */
@Injectable()
export class HitlTokenService {
  private readonly logger = new Logger(HitlTokenService.name);
  private readonly jwtSecret: string;

  /** Track consumed tokens to enforce single-use */
  private readonly consumedTokens = new Set<string>();

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret';
  }

  /**
   * Generate a submit token scoped to a single HITL request.
   */
  generateSubmitToken(
    requestId: string,
    serviceId: string,
    expiresInSeconds = 600,
  ): string {
    const token = jwt.sign(
      {
        type: 'hitl_submit',
        request_id: requestId,
        service_id: serviceId,
      },
      this.jwtSecret,
      { expiresIn: expiresInSeconds },
    );
    this.logger.debug(`Generated submit token for request ${requestId}`);
    return token;
  }

  /**
   * Validate and consume a submit token. Returns the payload or throws.
   * Tokens are single-use: a second call with the same token will fail.
   */
  validateSubmitToken(token: string): { request_id: string; service_id: string } {
    if (this.consumedTokens.has(token)) {
      throw new Error('Submit token has already been used');
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;

      if (payload.type !== 'hitl_submit') {
        throw new Error('Invalid token type');
      }

      // Mark as consumed
      this.consumedTokens.add(token);

      // Clean up old consumed tokens periodically (keep last 10 000)
      if (this.consumedTokens.size > 10_000) {
        const entries = Array.from(this.consumedTokens);
        entries.slice(0, entries.length - 5_000).forEach((t) =>
          this.consumedTokens.delete(t),
        );
      }

      return {
        request_id: payload.request_id,
        service_id: payload.service_id,
      };
    } catch (error: any) {
      if (error.message === 'Submit token has already been used') throw error;
      this.logger.warn(`Invalid submit token: ${error.message}`);
      throw new Error(`Invalid submit token: ${error.message}`);
    }
  }
}
