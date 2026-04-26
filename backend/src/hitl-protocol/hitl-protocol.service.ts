import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { SessionEventsService } from '../remote-sessions/session-events.service';
import { RemoteSessionsStorageService } from '../remote-sessions/remote-sessions-storage.service';
import { HitlPolicyService } from './hitl-policy.service';
import { HitlTokenService } from './hitl-token.service';
import { HitlRendererService } from './hitl-renderer.service';
import {
  HITLVerificationRequest,
  HITLVerificationResponse,
  HITLFrontendResponse,
  HITLAsyncStatus,
  PendingHITLRequest,
  ProofOfHuman,
  HITLDecision,
} from './interfaces/hitl-protocol.interface';

@Injectable()
export class HitlProtocolService {
  private readonly logger = new Logger(HitlProtocolService.name);
  private readonly pendingRequests = new Map<string, PendingHITLRequest>();

  constructor(
    private readonly interceptorsService: InterceptorsService,
    private readonly sessionEventsService: SessionEventsService,
    private readonly remoteStorage: RemoteSessionsStorageService,
    private readonly policyService: HitlPolicyService,
    private readonly tokenService: HitlTokenService,
    private readonly rendererService: HitlRendererService,
  ) {}

  // -------------------------------------------------------------------------
  // Synchronous verification — blocks until human responds or timeout
  // -------------------------------------------------------------------------

  async verify(
    project: string,
    request: HITLVerificationRequest,
  ): Promise<HITLVerificationResponse> {
    const id = randomUUID();
    const timeoutMs = request.timeout_ms ?? 300_000;

    // Evaluate policy
    const evaluation = await this.policyService.evaluatePolicy(
      project,
      request.action_type,
      request.verification_policy,
    );

    this.logger.log(
      `HITL verify [${id}]: service=${request.service_id}, action=${request.action_type}, ` +
        `policy=${evaluation.effective_policy}, requires_review=${evaluation.requires_human_review}`,
    );

    // If no human review needed, auto-approve with proof
    if (!evaluation.requires_human_review) {
      const proof = this.generateProof('system', 'api_response', evaluation.effective_policy);
      return {
        request_id: id,
        decision: 'approve',
        proof_of_human: proof,
      };
    }

    // Human review required — create pending request and emit via SSE
    return new Promise<HITLVerificationResponse>((resolve, reject) => {
      const pending: PendingHITLRequest = {
        id,
        project,
        request,
        resolve,
        reject,
        createdAt: new Date(),
        status: 'pending',
      };
      this.pendingRequests.set(id, pending);

      // Emit to web frontend via InterceptorsService
      const webPayload = this.rendererService.renderForWeb(id, request);
      this.interceptorsService.emitHITLRequest(project, webPayload);

      // Emit to remote sessions (Telegram, Teams) if available
      this.emitToRemoteSessions(project, id, request);

      // Timeout handling
      setTimeout(() => {
        const req = this.pendingRequests.get(id);
        if (req && req.status === 'pending') {
          this.logger.warn(`HITL request ${id} timed out after ${timeoutMs}ms`);
          req.status = 'expired';
          this.pendingRequests.delete(id);
          req.resolve({
            request_id: id,
            decision: 'deny',
            proof_of_human: this.generateProof(
              'system',
              'api_response',
              evaluation.effective_policy,
            ),
          });
        }
      }, timeoutMs);
    });
  }

  // -------------------------------------------------------------------------
  // Asynchronous verification — returns immediately, delivers via callback
  // -------------------------------------------------------------------------

  async verifyAsync(
    project: string,
    request: HITLVerificationRequest,
  ): Promise<{ request_id: string; status: string }> {
    const id = randomUUID();
    const timeoutMs = request.timeout_ms ?? 300_000;

    const evaluation = await this.policyService.evaluatePolicy(
      project,
      request.action_type,
      request.verification_policy,
    );

    this.logger.log(
      `HITL verifyAsync [${id}]: service=${request.service_id}, action=${request.action_type}`,
    );

    if (!evaluation.requires_human_review) {
      const proof = this.generateProof('system', 'api_response', evaluation.effective_policy);
      const response: HITLVerificationResponse = {
        request_id: id,
        decision: 'approve',
        proof_of_human: proof,
      };
      // Fire-and-forget inline submit
      if (request.submit_url) {
        this.performInlineSubmit(request.submit_url, request.submit_token, response);
      }
      return { request_id: id, status: 'approved' };
    }

    // Create pending request with self-resolving callback for inline submit
    const pending: PendingHITLRequest = {
      id,
      project,
      request,
      resolve: (response) => {
        pending.status = response.decision === 'approve' ? 'approved' : 'denied';
        pending.response = response;
        // Inline submit callback
        if (request.submit_url) {
          this.performInlineSubmit(request.submit_url, request.submit_token, response);
        }
      },
      reject: () => {},
      createdAt: new Date(),
      status: 'pending',
    };
    this.pendingRequests.set(id, pending);

    // Emit to all channels
    const webPayload = this.rendererService.renderForWeb(id, request);
    this.interceptorsService.emitHITLRequest(project, webPayload);
    this.emitToRemoteSessions(project, id, request);

    // Timeout
    setTimeout(() => {
      const req = this.pendingRequests.get(id);
      if (req && req.status === 'pending') {
        req.status = 'expired';
        this.pendingRequests.delete(id);
      }
    }, timeoutMs);

    return { request_id: id, status: 'pending' };
  }

  // -------------------------------------------------------------------------
  // Handle human response (from frontend, Telegram, Teams, or inline submit)
  // -------------------------------------------------------------------------

  handleResponse(response: HITLFrontendResponse): boolean {
    const pending = this.pendingRequests.get(response.request_id);
    if (!pending) {
      this.logger.warn(`No pending HITL request for id: ${response.request_id}`);
      return false;
    }

    if (pending.status !== 'pending') {
      this.logger.warn(`HITL request ${response.request_id} already ${pending.status}`);
      return false;
    }

    this.pendingRequests.delete(response.request_id);
    this.logger.log(
      `HITL response for ${response.request_id}: decision=${response.decision}`,
    );

    const proof = this.generateProof(
      response.user_id || 'anonymous',
      'modal_click',
      pending.request.verification_policy,
    );

    const verificationResponse: HITLVerificationResponse = {
      request_id: response.request_id,
      decision: response.decision,
      proof_of_human: proof,
      modified_payload: response.modified_payload,
    };

    pending.status = response.decision === 'approve' ? 'approved' : 'denied';
    pending.response = verificationResponse;
    pending.resolve(verificationResponse);

    return true;
  }

  /**
   * Handle inline submit from an external agent (authenticated via submit token).
   */
  handleInlineSubmit(
    requestId: string,
    decision: HITLDecision,
    proof: ProofOfHuman,
  ): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.status !== 'pending') {
      return false;
    }

    this.pendingRequests.delete(requestId);
    const response: HITLVerificationResponse = {
      request_id: requestId,
      decision,
      proof_of_human: proof,
    };
    pending.status = decision === 'approve' ? 'approved' : 'denied';
    pending.response = response;
    pending.resolve(response);
    return true;
  }

  // -------------------------------------------------------------------------
  // Status / admin
  // -------------------------------------------------------------------------

  getRequestStatus(requestId: string): HITLAsyncStatus | null {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return null;
    return {
      request_id: pending.id,
      status: pending.status,
      decision: pending.response?.decision,
      proof_of_human: pending.response?.proof_of_human,
    };
  }

  getPendingRequests(): Array<{
    id: string;
    project: string;
    service_id: string;
    action_type: string;
    status: string;
    createdAt: Date;
  }> {
    return Array.from(this.pendingRequests.values()).map((req) => ({
      id: req.id,
      project: req.project,
      service_id: req.request.service_id,
      action_type: req.request.action_type,
      status: req.status,
      createdAt: req.createdAt,
    }));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private generateProof(
    userId: string,
    method: ProofOfHuman['decision_method'],
    policy: ProofOfHuman['verification_policy_applied'],
  ): ProofOfHuman {
    return {
      timestamp: new Date().toISOString(),
      user_id: userId,
      decision_method: method,
      platform: 'etienne',
      verification_policy_applied: policy,
    };
  }

  private async emitToRemoteSessions(
    project: string,
    requestId: string,
    request: HITLVerificationRequest,
  ): Promise<void> {
    try {
      const sessions = await this.remoteStorage.findByProject(project);
      if (!sessions || sessions.length === 0) return;

      for (const session of sessions) {
        const provider = session.provider || 'telegram';
        if (
          provider === 'telegram' &&
          this.sessionEventsService.hasSubscribers(provider)
        ) {
          const rendered = this.rendererService.renderForTelegram(requestId, request);
          this.sessionEventsService.emitHITLVerification(
            provider,
            session.remoteSession.chatId as number,
            rendered,
          );
        }
        // Teams support follows the same pattern when a Teams provider is active
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to emit HITL to remote sessions: ${error.message}`,
      );
    }
  }

  private async performInlineSubmit(
    submitUrl: string,
    submitToken: string | undefined,
    response: HITLVerificationResponse,
  ): Promise<void> {
    try {
      // Basic SSRF protection: only allow HTTPS in production
      if (
        process.env.NODE_ENV === 'production' &&
        !submitUrl.startsWith('https://')
      ) {
        this.logger.warn(
          `Rejecting inline submit to non-HTTPS URL: ${submitUrl}`,
        );
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (submitToken) {
        headers['Authorization'] = `Bearer ${submitToken}`;
      }

      await axios.post(submitUrl, response, { headers, timeout: 10_000 });
      this.logger.log(
        `Inline submit to ${submitUrl} for request ${response.request_id} succeeded`,
      );
    } catch (error: any) {
      this.logger.error(
        `Inline submit to ${submitUrl} failed: ${error.message}`,
      );
    }
  }
}
