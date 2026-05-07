[← back to README](../README.md)

# Observability

The backend supports OpenTelemetry-based observability for monitoring LLM conversations and tool usage. When enabled, traces are sent to an OTLP-compatible collector like [Arize Phoenix](https://phoenix.arize.com/).

## Configuration

Set these environment variables in `backend/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_ENABLED` | Set to `"true"` to enable telemetry | (disabled) |
| `PHOENIX_COLLECTOR_ENDPOINT` | Base URL of the OTLP collector | `http://localhost:6006` |
| `OTEL_SERVICE_NAME` | Service name in traces | `etienne` |

## Starting Phoenix Locally

```bash
docker run -d --name phoenix -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
```

Then enable telemetry:

```bash
# Add to backend/.env
OTEL_ENABLED=true
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006
```

## Traced Information

The implementation follows [OpenInference Semantic Conventions](https://github.com/Arize-ai/openinference) for LLM-specific attributes.

**Conversation Spans (Agent):**
- `llm.model_name`, `llm.provider`, `llm.system`
- `llm.token_count.prompt`, `llm.token_count.completion`, `llm.token_count.total`
- `input.value`, `output.value` (prompt and response)
- `session.id`, `project.name`, `user.id`
- `agent.tools_used`, `agent.tool_call_count`

**Tool Spans (nested under conversation):**
- `tool.name`, `tool.parameters`, `tool.output`
- `tool.status` (success/error), `tool.duration_ms`
- `tool.error_message` (if applicable)

### Viewing Traces

1. Open Phoenix UI at `http://localhost:6006`
2. Navigate to the Traces view
3. Filter by `project.name` or `session.id` to find specific conversations
4. Click on a trace to see the conversation span with nested tool spans
