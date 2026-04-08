import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FEEDBACK_PROVIDER,
  IFeedbackProvider,
} from './providers/feedback-provider.interface';

/**
 * Thin facade over the active IFeedbackProvider. The concrete provider is
 * selected at module init based on OBSERVABILITY_PROVIDER — see
 * feedback.module.ts.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @Inject(FEEDBACK_PROVIDER) private readonly provider: IFeedbackProvider
  ) {}

  async submitFeedback(
    spanId: string,
    traceId: string | undefined,
    feedback: 'up' | 'down'
  ): Promise<void> {
    return this.provider.submit(spanId, traceId, feedback);
  }
}
