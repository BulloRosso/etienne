/**
 * OpenTelemetry Instrumentation - MUST be imported FIRST in main.ts
 *
 * This file sets up the OpenTelemetry tracer provider and exporter.
 * When OTEL_ENABLED=true, traces are sent to the backend selected via
 * OBSERVABILITY_PROVIDER (phoenix | azure | aws). See providers/README.md.
 */

// Load .env FIRST before checking environment variables
// This is necessary because this file is imported before dotenv/config in main.ts
import { config } from 'dotenv';
config();

import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { getSpanExporterProvider } from './providers/exporter-factory';
import { parseProviderName } from './providers/observability-provider.types';

// Load environment variables (now available after dotenv.config())
const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const PROVIDER_NAME = parseProviderName(process.env.OBSERVABILITY_PROVIDER);
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'etienne';
const SPAN_PROCESSOR_KIND =
  (process.env.OTEL_SPAN_PROCESSOR || 'batch').toLowerCase() === 'simple'
    ? 'simple'
    : 'batch';

// Use global symbol to prevent duplicate initialization across module loads
const OTEL_INIT_KEY = Symbol.for('etienne.otel.initialized');
const globalAny = global as any;

let tracerProvider: NodeTracerProvider | null = null;

if (OTEL_ENABLED && !globalAny[OTEL_INIT_KEY]) {
  globalAny[OTEL_INIT_KEY] = true;

  // Enable debug logging in development
  if (process.env.NODE_ENV === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  try {
    const provider = getSpanExporterProvider(PROVIDER_NAME);
    const exporters = provider.buildExporters();

    const spanProcessors: SpanProcessor[] = exporters.map((exporter) =>
      SPAN_PROCESSOR_KIND === 'simple'
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter)
    );

    tracerProvider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        'project.name': SERVICE_NAME,
      }),
      spanProcessors,
    });

    // Register without propagator - let it use defaults to avoid duplicate registration
    tracerProvider.register();
    console.log(
      `[Observability] OpenTelemetry initialized — provider=${provider.getName()}, ` +
        `exporters=${exporters.length}, processor=${SPAN_PROCESSOR_KIND}`
    );
  } catch (err: any) {
    // Do not crash the app on misconfigured observability. Log loudly and
    // continue booting with OTel effectively disabled.
    console.error(
      `[Observability] Failed to initialize provider=${PROVIDER_NAME}: ${err?.message || err}. ` +
        `The application will continue to run without telemetry export.`
    );
    tracerProvider = null;
  }
} else if (!OTEL_ENABLED && !globalAny[OTEL_INIT_KEY]) {
  globalAny[OTEL_INIT_KEY] = true;
  console.log(
    `[Observability] OpenTelemetry disabled (OTEL_ENABLED=${process.env.OTEL_ENABLED || 'not set'})`
  );
}

export const tracer = OTEL_ENABLED && tracerProvider ? trace.getTracer('etienne') : null;
export const isOtelEnabled = OTEL_ENABLED && tracerProvider !== null;
export const activeObservabilityProvider = PROVIDER_NAME;
