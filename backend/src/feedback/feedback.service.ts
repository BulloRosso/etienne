import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly phoenixEndpoint: string;

  constructor() {
    this.phoenixEndpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006';
  }

  async sendAnnotationToPhoenix(spanId: string, feedback: 'up' | 'down'): Promise<void> {
    const endpoint = `${this.phoenixEndpoint}/v1/span_annotations`;

    const payload = {
      data: [{
        span_id: spanId,
        name: 'user_feedback',
        annotator_kind: 'HUMAN',
        result: {
          label: feedback === 'up' ? 'thumbs_up' : 'thumbs_down',
          score: feedback === 'up' ? 1.0 : 0.0,
          explanation: feedback === 'up'
            ? 'User rated response positively'
            : 'User rated response negatively',
        },
      }],
    };

    this.logger.log(`Sending feedback annotation to Phoenix: spanId=${spanId}, feedback=${feedback}`);

    try {
      await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      this.logger.log(`Successfully sent feedback annotation for spanId=${spanId}`);
    } catch (error: any) {
      this.logger.error(`Failed to send feedback annotation: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
