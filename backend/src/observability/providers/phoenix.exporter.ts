import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ISpanExporterProvider } from './span-exporter-provider.interface';
import { ObservabilityProviderName } from './observability-provider.types';

/**
 * Phoenix Arize — default provider.
 * Sends OTLP-proto traces to ${PHOENIX_COLLECTOR_ENDPOINT}/v1/traces.
 */
export class PhoenixExporterProvider implements ISpanExporterProvider {
  getName(): ObservabilityProviderName {
    return 'phoenix';
  }

  buildExporters(): SpanExporter[] {
    const endpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006';
    const url = `${endpoint.replace(/\/+$/, '')}/v1/traces`;
    return [new OTLPTraceExporter({ url })];
  }
}
