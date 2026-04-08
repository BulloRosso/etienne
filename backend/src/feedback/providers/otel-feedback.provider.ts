import { Injectable, Logger } from '@nestjs/common';
import { SpanKind, TraceFlags, trace } from '@opentelemetry/api';
import { IFeedbackProvider } from './feedback-provider.interface';
import { TelemetryService } from '../../observability/telemetry.service';

/**
 * Generic OpenTelemetry feedback provider — used for Azure App Insights and
 * AWS X-Ray, neither of which has a span-annotation REST API.
 *
 * Emits a short-lived `user.feedback` span tagged with the rating and linked
 * to the original target span via an OTel span Link. Azure Monitor renders
 * links as related items; X-Ray renders them under "Links".
 *
 * We use a Link rather than a parent-child relationship because the target
 * span has already ended by the time the user clicks thumbs up/down.
 */
@Injectable()
export class OtelFeedbackProvider implements IFeedbackProvider {
  private readonly logger = new Logger(OtelFeedbackProvider.name);

  constructor(private readonly telemetry: TelemetryService) {}

  async submit(
    spanId: string,
    traceId: string | undefined,
    feedback: 'up' | 'down'
  ): Promise<void> {
    if (!this.telemetry.isEnabled()) {
      this.logger.warn(
        `Telemetry disabled; dropping feedback spanId=${spanId}, feedback=${feedback}`
      );
      return;
    }

    const tracer = trace.getTracer('etienne');
    const links =
      traceId && spanId
        ? [
            {
              context: {
                traceId,
                spanId,
                traceFlags: TraceFlags.SAMPLED,
                isRemote: true,
              },
            },
          ]
        : undefined;

    const span = tracer.startSpan('user.feedback', {
      kind: SpanKind.INTERNAL,
      links,
      attributes: {
        'feedback.target_span_id': spanId,
        'feedback.target_trace_id': traceId || '',
        'feedback.rating': feedback,
        'feedback.score': feedback === 'up' ? 1 : 0,
        'openinference.span.kind': 'EVALUATOR',
      },
    });
    span.end();

    this.logger.log(
      `Emitted user.feedback span linked to spanId=${spanId}, feedback=${feedback}`
    );
  }
}
