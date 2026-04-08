import { ISpanExporterProvider } from './span-exporter-provider.interface';
import {
  ObservabilityProviderName,
  parseProviderName,
} from './observability-provider.types';
import { PhoenixExporterProvider } from './phoenix.exporter';
import { AzureExporterProvider } from './azure.exporter';
import { AwsExporterProvider } from './aws.exporter';

/**
 * Pure factory — called directly from instrumentation.ts at process boot,
 * BEFORE NestJS DI exists. Do not convert this to an @Injectable.
 */
export function getSpanExporterProvider(
  name: string | undefined
): ISpanExporterProvider {
  const providerName: ObservabilityProviderName = parseProviderName(name);
  switch (providerName) {
    case 'azure':
      return new AzureExporterProvider();
    case 'aws':
      return new AwsExporterProvider();
    case 'phoenix':
    default:
      return new PhoenixExporterProvider();
  }
}
