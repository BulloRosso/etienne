import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ObservabilityProviderName } from './observability-provider.types';

/**
 * Contract for an observability provider that supplies one or more
 * OpenTelemetry SpanExporters. Implementations are instantiated at process
 * boot by `exporter-factory.ts` — BEFORE NestJS DI exists — so they must
 * be plain classes that read from process.env directly.
 */
export interface ISpanExporterProvider {
  getName(): ObservabilityProviderName;
  buildExporters(): SpanExporter[];
}
