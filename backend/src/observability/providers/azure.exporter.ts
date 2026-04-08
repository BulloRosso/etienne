import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ISpanExporterProvider } from './span-exporter-provider.interface';
import { ObservabilityProviderName } from './observability-provider.types';

/**
 * Azure Application Insights provider.
 *
 * Uses the AzureMonitorTraceExporter, which is a plain SpanExporter and plugs
 * into our existing NodeTracerProvider. We deliberately do NOT use
 * `@azure/monitor-opentelemetry` or `applicationinsights` — both of those
 * bring their own tracer provider and would conflict with our setup.
 */
export class AzureExporterProvider implements ISpanExporterProvider {
  getName(): ObservabilityProviderName {
    return 'azure';
  }

  buildExporters(): SpanExporter[] {
    const connectionString = process.env.AZURE_MONITOR_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        'AZURE_MONITOR_CONNECTION_STRING is required when OBSERVABILITY_PROVIDER=azure'
      );
    }

    // Lazy require so the package isn't loaded unless this provider is actually selected.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
    const exporter = new AzureMonitorTraceExporter({ connectionString });
    return [exporter as SpanExporter];
  }
}
