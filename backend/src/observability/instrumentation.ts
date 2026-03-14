/**
 * OpenTelemetry Instrumentation - MUST be imported FIRST in main.ts
 *
 * This file sets up the OpenTelemetry tracer provider and exporter.
 * When OTEL_ENABLED=true, traces are sent to Phoenix via OTLP HTTP.
 */

// Load .env FIRST before checking environment variables
// This is necessary because this file is imported before dotenv/config in main.ts
import { config } from 'dotenv';
config();

import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Load environment variables (now available after dotenv.config())
const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const PHOENIX_ENDPOINT = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'etienne';

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

  tracerProvider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      'project.name': SERVICE_NAME,
    }),
    spanProcessors: [
      // Use SimpleSpanProcessor for development (immediate flush)
      // For production, consider switching to BatchSpanProcessor
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: `${PHOENIX_ENDPOINT}/v1/traces`,
        })
      ),
    ],
  });

  // Register without propagator - let it use defaults to avoid duplicate registration
  tracerProvider.register();
  console.log(`[Observability] OpenTelemetry initialized - sending traces to ${PHOENIX_ENDPOINT}/v1/traces`);
} else if (!OTEL_ENABLED && !globalAny[OTEL_INIT_KEY]) {
  globalAny[OTEL_INIT_KEY] = true;
  console.log(`[Observability] OpenTelemetry disabled (OTEL_ENABLED=${process.env.OTEL_ENABLED || 'not set'})`);
}

export const tracer = OTEL_ENABLED ? trace.getTracer('etienne') : null;
export const isOtelEnabled = OTEL_ENABLED;
