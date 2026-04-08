# Observability Providers

The backend emits OpenTelemetry traces using [OpenInference](https://github.com/Arize-ai/openinference) semantic conventions (conversation spans, tool spans, token-usage attributes, and user-feedback spans). The backend that receives those traces is selected at process boot via a single environment variable — `OBSERVABILITY_PROVIDER` — and the rest of this document explains how to enable telemetry and configure each provider.

## 1. Enabling telemetry

Two master flags control whether any telemetry is emitted at all:

| Env var | Default | Purpose |
|---|---|---|
| `OTEL_ENABLED` | `false` | Master switch. When `false`, no spans are exported regardless of provider. |
| `OTEL_SERVICE_NAME` | `etienne` | Service name attached to every span — shows up as the service identifier in every backend dashboard. |
| `OTEL_SPAN_PROCESSOR` | `batch` | `batch` (production, buffered) or `simple` (immediate flush — dev/test only, hot on the CPU). |
| `OBSERVABILITY_PROVIDER` | `phoenix` | Backend that receives traces. One of `phoenix`, `azure`, `aws`. |

You can set these via `backend/.env` **or** via the Admin UI → Service Settings → Observability. Changing any of them requires a backend restart; the UI handles the restart automatically when the backend process is running under the process manager.

## 2. Choosing a provider

| Provider | `OBSERVABILITY_PROVIDER` | Where traces land | Best for |
|---|---|---|---|
| Phoenix Arize (default) | `phoenix` | Phoenix web UI at `PHOENIX_COLLECTOR_ENDPOINT` | Local development, LLM-specific observability, human feedback annotations |
| Azure Application Insights | `azure` | Azure portal → Application Insights | Teams already on Azure, unified APM with other Azure services |
| AWS CloudWatch / X-Ray | `aws` | AWS console → CloudWatch Application Signals / X-Ray | Teams on AWS, IAM-based auth, integration with Bedrock workloads |

## 3. Provider-specific configuration

### 3.1 Phoenix Arize (default)

```bash
# .env
OTEL_ENABLED=true
OBSERVABILITY_PROVIDER=phoenix
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006
OTEL_SERVICE_NAME=etienne
```

Run Phoenix locally via Docker:

```bash
docker run --rm -it -p 6006:6006 arizephoenix/phoenix:latest
```

Then open `http://localhost:6006/projects/etienne` to view traces. User feedback (thumbs up/down) is posted directly to Phoenix's `/v1/span_annotations` REST endpoint and appears on the original span as a first-class annotation.

### 3.2 Azure Application Insights

```bash
# .env
OTEL_ENABLED=true
OBSERVABILITY_PROVIDER=azure
AZURE_MONITOR_CONNECTION_STRING=InstrumentationKey=...;IngestionEndpoint=https://...in.applicationinsights.azure.com/;LiveEndpoint=...
OTEL_SERVICE_NAME=etienne
```

Get the connection string from: Azure Portal → your Application Insights resource → **Overview** → **Connection String**. The free tier is sufficient for development. Microsoft docs: <https://learn.microsoft.com/azure/azure-monitor/app/sdk-connection-string>.

Implementation note: we use the lightweight [`@azure/monitor-opentelemetry-exporter`](https://www.npmjs.com/package/@azure/monitor-opentelemetry-exporter) package, which provides only a `SpanExporter` and plugs into our existing `NodeTracerProvider`. We deliberately do **not** use `@azure/monitor-opentelemetry` or `applicationinsights` — both bring their own tracer provider and would conflict.

Feedback behaviour: Azure has no span-annotation REST API, so user feedback is emitted as a new `user.feedback` span linked to the target span via an OTel span link. In the Azure portal the link appears in the span's "Related items" section.

### 3.3 AWS CloudWatch / X-Ray

```bash
# .env
OTEL_ENABLED=true
OBSERVABILITY_PROVIDER=aws
AWS_OTEL_REGION=us-east-1
# AWS_OTEL_ENDPOINT is optional; defaults to https://xray.<region>.amazonaws.com/v1/traces
OTEL_SERVICE_NAME=etienne
```

Requirements:

- **IAM permissions** — the process's identity needs `xray:PutTraceSegments` (plus any CloudWatch Application Signals permissions if you use that view).
- **Credentials** — resolved via the standard AWS credential chain:
  1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars
  2. Shared credentials file (`~/.aws/credentials`) / AWS profile (`AWS_PROFILE`)
  3. ECS container role / EC2 instance role
- **Region** — required. Used both to build the default endpoint and to sign requests with SigV4.

Each OTLP batch is SigV4-signed for the `xray` service using `@smithy/signature-v4` before being POSTed to the CloudWatch/X-Ray OTLP endpoint. Traces appear in the AWS Console → CloudWatch → Application Signals → Traces, or in the X-Ray console, filtered by service name `etienne`.

Feedback behaviour: same as Azure — emitted as a `user.feedback` span with a span link back to the target span (rendered under "Links" in the X-Ray trace view).

## 4. What gets traced

Instrumentation is defined in `backend/src/observability/telemetry.service.ts` and is provider-agnostic. Every provider sees:

- **Conversation spans** (`claude-agent.conversation`) — top-level span for each chat turn, tagged with OpenInference attributes (`llm.system`, `llm.provider`, `llm.model_name`, prompt, session id, user id, project, token counts).
- **Tool spans** (`tool.<name>`) — child spans for each tool call, with `tool.name`, `tool.parameters`, `tool.output`, `tool.status`, `tool.duration_ms`.
- **Token usage** — `llm.token_count.prompt/completion/total/cache_read/cache_creation` attributes on the conversation span.
- **User feedback spans** (`user.feedback`) — only on `azure` and `aws`; Phoenix uses the REST annotation API instead.

## 5. Extending: adding a fourth provider

1. Create `<name>.exporter.ts` in this folder implementing `ISpanExporterProvider` (see `phoenix.exporter.ts` for the simplest example).
2. Add a case for it in `exporter-factory.ts`.
3. Add the name to the union in `observability-provider.types.ts` and to `parseProviderName()`.
4. Add any new env keys to `backend/src/configuration/configuration.service.ts` (`ConfigurationDto` and `ENV_SECTIONS`).
5. Add fields with appropriate `showWhen` to `frontend/src/components/ServiceSettings.jsx` and the i18n locale files.
6. If feedback should behave differently for your provider, implement a new `IFeedbackProvider` under `backend/src/feedback/providers/` and wire it in `feedback.module.ts`.

## 6. Troubleshooting

**No spans appear anywhere**
- Check `OTEL_ENABLED=true` in the active `.env`.
- Check the backend startup log for the line `[Observability] OpenTelemetry initialized — provider=<name>, exporters=<n>, processor=<batch|simple>`. If you see `OpenTelemetry disabled` or `Failed to initialize provider=...`, telemetry is off.
- Set `NODE_ENV=development` to enable OTel diag logs at `INFO` level — the SDK will print export failures to the console.

**Azure: traces missing, no error**
- Double-check the connection string. It should contain both `InstrumentationKey=` and `IngestionEndpoint=`.
- App Insights ingestion has a short delay (seconds to a minute) — refresh Transaction search.

**AWS: HTTP 403 in diag logs**
- IAM policy is missing `xray:PutTraceSegments`, or the process's credential chain resolved to a principal that doesn't have it.
- Wrong region — the region in `AWS_OTEL_REGION` must match the region the credentials are scoped to.
- System clock drift > 5 minutes breaks SigV4.

**I changed the provider in the UI but nothing happened**
- The OTel pipeline is built once at process start. Save settings via **Apply & Restart**, or restart the backend manually after editing `.env`.
