/**
 * OpenTelemetry Instrumentation for A2A Server
 *
 * This file sets up the OpenTelemetry tracer provider and exporter.
 * When OTEL_ENABLED=true, traces are sent to Phoenix via OTLP HTTP.
 *
 * Traces from this server appear as child spans of the parent trace
 * when trace context is passed via the A2A metadata field.
 */

import { config } from 'dotenv';
config();

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  Context,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const PHOENIX_ENDPOINT = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'a2a-server';

let tracerProvider: NodeTracerProvider | null = null;

if (OTEL_ENABLED) {
  if (process.env.NODE_ENV === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  tracerProvider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      'project.name': SERVICE_NAME,
    }),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: `${PHOENIX_ENDPOINT}/v1/traces`,
        })
      ),
    ],
  });

  // Register with W3C Trace Context propagator for extracting trace context
  // Pass the propagator to register() to avoid duplicate registration error
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });
  console.log(`[A2A Observability] OpenTelemetry initialized - sending traces to ${PHOENIX_ENDPOINT}/v1/traces`);
} else {
  console.log(`[A2A Observability] OpenTelemetry disabled (OTEL_ENABLED=${process.env.OTEL_ENABLED || 'not set'})`);
}

export const tracer = OTEL_ENABLED ? trace.getTracer('a2a-server') : null;
export const isOtelEnabled = OTEL_ENABLED;

/**
 * Extract trace context from A2A metadata (W3C Trace Context format)
 * This allows spans created in this server to be children of the parent trace
 */
export function extractTraceContext(metadata?: { traceparent?: string; tracestate?: string }): Context {
  if (!isOtelEnabled || !metadata?.traceparent) {
    return context.active();
  }

  // Create a carrier object with the W3C trace context headers
  const carrier: Record<string, string> = {
    traceparent: metadata.traceparent,
  };
  if (metadata.tracestate) {
    carrier.tracestate = metadata.tracestate;
  }

  // Extract the context using the W3C propagator
  return propagation.extract(context.active(), carrier);
}

/**
 * Create a span for an agent request, linking to parent trace if available
 */
export function startAgentSpan(
  agentName: string,
  operationName: string,
  parentContext: Context
) {
  if (!isOtelEnabled || !tracer) return null;

  return tracer.startSpan(
    `a2a.${agentName}.${operationName}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'a2a.agent.name': agentName,
        'a2a.operation': operationName,
        'service.name': SERVICE_NAME,
      },
    },
    parentContext
  );
}

export { SpanStatusCode, context };
