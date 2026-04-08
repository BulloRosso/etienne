import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FEEDBACK_PROVIDER } from './providers/feedback-provider.interface';
import { PhoenixFeedbackProvider } from './providers/phoenix-feedback.provider';
import { OtelFeedbackProvider } from './providers/otel-feedback.provider';
import { parseProviderName } from '../observability/providers/observability-provider.types';

@Module({
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    PhoenixFeedbackProvider,
    OtelFeedbackProvider,
    {
      provide: FEEDBACK_PROVIDER,
      useFactory: (phoenix: PhoenixFeedbackProvider, otel: OtelFeedbackProvider) => {
        const provider = parseProviderName(process.env.OBSERVABILITY_PROVIDER);
        return provider === 'phoenix' ? phoenix : otel;
      },
      inject: [PhoenixFeedbackProvider, OtelFeedbackProvider],
    },
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
