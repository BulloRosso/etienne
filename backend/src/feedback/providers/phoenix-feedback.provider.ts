import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IFeedbackProvider } from './feedback-provider.interface';

/**
 * Phoenix Arize feedback provider — posts span annotations directly to
 * Phoenix's REST API at `/v1/span_annotations`. This is the original
 * (pre-pluggable-providers) behavior.
 */
@Injectable()
export class PhoenixFeedbackProvider implements IFeedbackProvider {
  private readonly logger = new Logger(PhoenixFeedbackProvider.name);

  async submit(
    spanId: string,
    _traceId: string | undefined,
    feedback: 'up' | 'down'
  ): Promise<void> {
    const phoenixEndpoint =
      process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006';
    const endpoint = `${phoenixEndpoint.replace(/\/+$/, '')}/v1/span_annotations`;

    const payload = {
      data: [
        {
          span_id: spanId,
          name: 'user_feedback',
          annotator_kind: 'HUMAN',
          result: {
            label: feedback === 'up' ? 'thumbs_up' : 'thumbs_down',
            score: feedback === 'up' ? 1.0 : 0.0,
            explanation:
              feedback === 'up'
                ? 'User rated response positively'
                : 'User rated response negatively',
          },
        },
      ],
    };

    this.logger.log(
      `Sending feedback annotation to Phoenix: spanId=${spanId}, feedback=${feedback}`
    );

    try {
      await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      this.logger.log(`Successfully sent feedback annotation for spanId=${spanId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send feedback annotation: ${error?.message}`,
        error?.stack
      );
      throw error;
    }
  }
}
