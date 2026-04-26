import { Injectable, Logger } from '@nestjs/common';
import { HITLVerificationRequest } from './interfaces/hitl-protocol.interface';

/**
 * Generates platform-specific rendering payloads for HITL verification requests.
 *
 * Each render method produces a self-contained data structure that the
 * respective platform adapter can send without further transformation.
 */
@Injectable()
export class HitlRendererService {
  private readonly logger = new Logger(HitlRendererService.name);

  /**
   * Render for the web frontend (HITLApprovalModal).
   */
  renderForWeb(
    requestId: string,
    request: HITLVerificationRequest,
  ): {
    id: string;
    service_id: string;
    action_type: string;
    action_description: string;
    verification_policy: string;
    payload: any;
    timeout_ms: number;
    metadata?: Record<string, any>;
  } {
    return {
      id: requestId,
      service_id: request.service_id,
      action_type: request.action_type,
      action_description: request.action_description,
      verification_policy: request.verification_policy,
      payload: request.payload,
      timeout_ms: request.timeout_ms ?? 300_000,
      metadata: request.metadata,
    };
  }

  /**
   * Render for Telegram — inline keyboard markup.
   *
   * The Telegram bot handler should send this as the `reply_markup` parameter
   * of a sendMessage call.
   */
  renderForTelegram(
    requestId: string,
    request: HITLVerificationRequest,
  ): { text: string; reply_markup: any } {
    const text = [
      `🔐 *HITL Verification Request*`,
      ``,
      `*Service:* ${this.escapeMarkdown(request.service_id)}`,
      `*Action:* ${this.escapeMarkdown(request.action_type)}`,
      `*Policy:* ${request.verification_policy}`,
      ``,
      `${this.escapeMarkdown(request.action_description)}`,
    ].join('\n');

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Approve',
              callback_data: `hitl_approve:${requestId}`,
            },
            {
              text: '❌ Deny',
              callback_data: `hitl_deny:${requestId}`,
            },
          ],
        ],
      },
    };
  }

  /**
   * Render for Microsoft Teams — Adaptive Card JSON.
   */
  renderForTeams(
    requestId: string,
    request: HITLVerificationRequest,
  ): Record<string, any> {
    return {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'HITL Verification Request',
          weight: 'Bolder',
          size: 'Medium',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Service', value: request.service_id },
            { title: 'Action', value: request.action_type },
            { title: 'Policy', value: request.verification_policy },
          ],
        },
        {
          type: 'TextBlock',
          text: request.action_description,
          wrap: true,
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Approve',
          style: 'positive',
          data: { hitl_action: 'approve', request_id: requestId },
        },
        {
          type: 'Action.Submit',
          title: 'Deny',
          style: 'destructive',
          data: { hitl_action: 'deny', request_id: requestId },
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }
}
