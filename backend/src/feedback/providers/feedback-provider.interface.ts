/**
 * Contract for provider-specific feedback submission.
 *
 * Phoenix supports first-class span annotations via REST. Azure Application
 * Insights and AWS X-Ray have no annotation API, so for those providers we
 * emit a new `user.feedback` span linked to the target span via OpenTelemetry
 * span Links. See `OtelFeedbackProvider` for details.
 */
export const FEEDBACK_PROVIDER = Symbol('FEEDBACK_PROVIDER');

export interface IFeedbackProvider {
  submit(
    spanId: string,
    traceId: string | undefined,
    feedback: 'up' | 'down'
  ): Promise<void>;
}
