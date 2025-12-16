# Observability via OpenTelemetry Protocol

We need to make our system observable based on standards and on a local level (we don't want to send data to cloud servers when we develop locally).

Because our monitoring demands might be very specific we don't want to rely on ready made integrations but to invest in customizing the logging. This way we can later control whether prompts will be logged or not - which might be an issue in productive environments.

Create a new backend/src/.env variable to enable or disable monitoring via OTel.

## What information do we want log?

Dieses Dokument beschreibt die wichtigsten Informationskategorien, die für die Observability von LLM-Anwendungen und AI-Agents geloggt werden sollten.

**Important** Implement only those attributes we have currently values/information on. Ignore the ones we don't have.

### 1. LLM Request/Response Daten

Grundlegende Informationen über den LLM-Aufruf selbst.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `llm.model_name` | Verwendetes Modell | `"claude-sonnet-4-5-20250929"` |
| `llm.provider` | LLM-Provider | `"anthropic"`, `"openai"` |
| `llm.request.type` | Art der Anfrage | `"chat"`, `"completion"`, `"embedding"` |
| `llm.system` | System-Identifier | `"claude"`, `"gpt"` |
| `input.value` | Der vollständige Prompt/Input | `"Erkläre mir Quantencomputing"` |
| `input.mime_type` | MIME-Type des Inputs | `"text/plain"`, `"application/json"` |
| `output.value` | Die vollständige Response/Output | `"Quantencomputing nutzt..."` |
| `output.mime_type` | MIME-Type des Outputs | `"text/plain"` |
| `llm.invocation_parameters` | Modell-Parameter | `{"temperature": 0.7, "max_tokens": 1024}` |
| `llm.system_prompt` | System-Prompt (falls verwendet) | `"Du bist ein hilfreicher Assistent"` |

---

### 2. Token Usage & Kosten

Informationen über den Token-Verbrauch und die damit verbundenen Kosten.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `llm.token_count.prompt` | Anzahl der Input-Tokens | `150` |
| `llm.token_count.completion` | Anzahl der Output-Tokens | `523` |
| `llm.token_count.total` | Gesamte Token-Anzahl | `673` |
| `llm.token_count.cache_read` | Aus dem Cache gelesene Tokens | `100` |
| `llm.token_count.cache_creation` | Neu in den Cache geschriebene Tokens | `50` |
| `llm.cost.prompt` | Kosten für Input-Tokens | `0.00045` |
| `llm.cost.completion` | Kosten für Output-Tokens | `0.00261` |
| `llm.cost.total` | Gesamtkosten des Requests | `0.00306` |
| `llm.cost.currency` | Währung | `"USD"` |

---

### 3. Tool/Function Calls

Informationen über Tool- und Function-Aufrufe innerhalb von Agent-Workflows.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `tool.name` | Name des Tools | `"Bash"`, `"FileRead"`, `"WebSearch"` |
| `tool.description` | Beschreibung des Tools | `"Führt Shell-Befehle aus"` |
| `tool.parameters` | Input-Parameter als JSON | `{"command": "ls -la"}` |
| `tool.output` | Ergebnis des Tool-Aufrufs | `"file1.txt\nfile2.txt"` |
| `tool.status` | Status des Aufrufs | `"success"`, `"error"`, `"timeout"` |
| `tool.duration_ms` | Ausführungsdauer in ms | `1523` |
| `tool.error_message` | Fehlermeldung (falls vorhanden) | `"Permission denied"` |
| `tool.approval_status` | Genehmigungsstatus | `"approved"`, `"denied"`, `"pending"` |

---

### 4. Latenz & Performance

Performance-Metriken für die Analyse und Optimierung.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `span.duration` | Gesamtdauer des Spans (automatisch) | `2341` (ms) |
| `llm.latency.total_ms` | Gesamte LLM-Latenz | `2100` |
| `llm.latency.time_to_first_token` | Zeit bis zum ersten Token (TTFT) | `450` (ms) |
| `llm.latency.time_per_output_token` | Durchschnittliche Zeit pro Token | `3.2` (ms) |
| `llm.latency.queue_time` | Wartezeit in der Queue | `50` (ms) |
| `llm.latency.processing_time` | Reine Verarbeitungszeit | `2000` (ms) |
| `http.latency` | HTTP Round-Trip Zeit | `2150` (ms) |
| `llm.streaming` | Ob Streaming verwendet wurde | `true`, `false` |

---

### 5. Agent-spezifische Daten

Spezielle Attribute für AI-Agents und Multi-Step-Workflows.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `agent.name` | Name des Agents | `"code-assistant"` |
| `agent.type` | Typ des Agents | `"conversational"`, `"task-oriented"` |
| `agent.step` | Aktueller Schritt im Workflow | `3` |
| `agent.total_steps` | Gesamtanzahl der Schritte | `5` |
| `agent.iteration` | Iterations-Nummer (bei Loops) | `2` |
| `agent.max_iterations` | Maximale Iterationen | `10` |
| `session.id` | Session-ID für Multi-Turn | `"sess_abc123"` |
| `conversation.id` | Konversations-ID | `"conv_xyz789"` |
| `agent.decision` | Entscheidung des Agents | `"use_tool"`, `"respond"`, `"ask_clarification"` |
| `agent.reasoning` | Reasoning/Chain-of-Thought | `"Der User fragt nach..."` |
| `agent.plan` | Geplante nächste Schritte | `["search", "analyze", "respond"]` |
| `agent.tools_available` | Verfügbare Tools | `["Bash", "FileRead", "WebSearch"]` |
| `agent.tools_used` | Verwendete Tools | `["FileRead", "Bash"]` |
| `agent.tool_call_count` | Anzahl der Tool-Aufrufe | `3` |
| `agent.context_window_usage` | Nutzung des Context Windows | `0.75` (75%) |

---

### 6. Fehler & Exceptions

Informationen für Debugging und Fehleranalyse.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `error.type` | Kategorie des Fehlers | `"rate_limit"`, `"auth"`, `"timeout"`, `"validation"` |
| `error.message` | Fehlermeldung | `"Rate limit exceeded"` |
| `error.code` | Fehlercode | `"429"`, `"RATE_LIMIT_EXCEEDED"` |
| `exception.type` | Exception-Typ | `"RateLimitError"` |
| `exception.message` | Exception-Nachricht | `"Too many requests"` |
| `exception.stacktrace` | Stack Trace | `"at processRequest (/app/index.js:42)..."` |
| `http.status_code` | HTTP Status Code | `429`, `500`, `401` |
| `http.response_body` | HTTP Response Body (bei Fehlern) | `{"error": "rate_limited"}` |
| `retry.count` | Anzahl der Retry-Versuche | `3` |
| `retry.after_ms` | Wartezeit vor Retry | `5000` |
| `error.recoverable` | Ob der Fehler behebbar ist | `true`, `false` |

---

### 7. Kontext & Metadata

Kontextuelle Informationen für Filtering, Gruppierung und Analyse.

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `user.id` | Benutzer-ID | `"user_12345"` |
| `user.name` | Benutzername (optional) | `"john.doe"` |
| `user.email` | E-Mail (optional, DSGVO beachten) | `"john@example.com"` |
| `user.tier` | Benutzer-Tier | `"free"`, `"pro"`, `"enterprise"` |
| `project.name` | Projektname | `"my-ai-assistant"` |
| `project.id` | Projekt-ID | `"proj_abc123"` |
| `environment` | Umgebung | `"production"`, `"staging"`, `"development"` |
| `version` | App-Version | `"1.2.3"` |
| `deployment.id` | Deployment-ID | `"deploy_xyz789"` |
| `service.name` | Service-Name | `"chat-service"` |
| `service.namespace` | Service-Namespace | `"ai-platform"` |
| `tags` | Custom Tags | `["experiment-a", "feature-flag-new-model"]` |
| `metadata` | Zusätzliche Metadaten | `{"source": "web", "client": "mobile"}` |
| `trace.id` | Trace-ID (automatisch) | `"abc123def456"` |
| `span.id` | Span-ID (automatisch) | `"span_789xyz"` |
| `parent.span.id` | Parent-Span-ID | `"span_456abc"` |
| `request.id` | Request-ID | `"req_unique123"` |
| `correlation.id` | Korrelations-ID (systemübergreifend) | `"corr_abc789"` |

---

### Verwendung mit OpenInference Semantic Conventions

Die offiziellen [OpenInference Semantic Conventions](https://github.com/Arize-ai/openinference) definieren standardisierte Attributnamen:

```typescript
import {
  SemanticConventions,
  OpenInferenceSpanKind,
} from "@arizeai/openinference-semantic-conventions";

// Beispiele für Attributnamen:
SemanticConventions.LLM_MODEL_NAME           // "llm.model_name"
SemanticConventions.LLM_INVOCATION_PARAMETERS // "llm.invocation_parameters"
SemanticConventions.LLM_TOKEN_COUNT_PROMPT    // "llm.token_count.prompt"
SemanticConventions.LLM_TOKEN_COUNT_COMPLETION // "llm.token_count.completion"
SemanticConventions.INPUT_VALUE               // "input.value"
SemanticConventions.OUTPUT_VALUE              // "output.value"
SemanticConventions.TOOL_NAME                 // "tool.name"
SemanticConventions.TOOL_PARAMETERS           // "tool.parameters"

// Span-Typen für LLM-Anwendungen:
OpenInferenceSpanKind.LLM       // LLM-Aufruf
OpenInferenceSpanKind.CHAIN     // Chain/Workflow
OpenInferenceSpanKind.TOOL      // Tool-Aufruf
OpenInferenceSpanKind.AGENT     // Agent-Schritt
OpenInferenceSpanKind.RETRIEVER // RAG Retrieval
OpenInferenceSpanKind.EMBEDDING // Embedding-Generierung
OpenInferenceSpanKind.RERANKER  // Reranking
OpenInferenceSpanKind.GUARDRAIL // Guardrail/Safety Check
```

---

## Best Practices for Logging Information

1. **Sensitive Daten maskieren**: Passwörter, API-Keys und persönliche Daten sollten nicht geloggt werden
2. **Payload-Größe begrenzen**: Große Inputs/Outputs sollten gekürzt werden (z.B. max 5000 Zeichen)
3. **Sampling verwenden**: In Produktion nicht jeden Request tracen
4. **Konsistente Namensgebung**: OpenInference Conventions verwenden
5. **Korrelation sicherstellen**: Trace-IDs über Service-Grenzen hinweg propagieren
6. **Kosten tracken**: Token-Counts und Kosten für Budget-Monitoring erfassen
7. **Fehler kategorisieren**: Fehlertypen für bessere Analyse klassifizieren

## Arize Phoenix

The user has a Docker based instance running side by side with our solution. You can assume this.

Phoenix akzeptiert Traces in OpenTelemetry OTLP Format (Protobuf) auf folgenden Ports: Arize

Port 6006: Web UI und OTLP HTTP Collector (/v1/traces)
Port 4317: OTLP gRPC Collector

We want to send our telemetry data actively to port 6006.

## Install Packages

Check whether we have these packages and add and install new ones.

```
npm install @anthropic-ai/claude-agent-sdk \
  @arizeai/openinference-semantic-conventions \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api \
  @opentelemetry/instrumentation \
  @opentelemetry/resources \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-proto
```

## Configure OpenTelemetry

We must keep the configuration for the observability separate in backend/src/observability.

```
// instrumentation.ts
import { diag, DiagConsoleLogger, DiagLogLevel, trace, context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";

// Debug logging (optional)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const PHOENIX_ENDPOINT = process.env.PHOENIX_COLLECTOR_ENDPOINT || "http://localhost:6006";

const tracerProvider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "claude-agent-app",
    [SEMRESATTRS_PROJECT_NAME]: "claude-agent-app",
  }),
  spanProcessors: [
    // Use SimpleSpanProcessor for development (instant flush)
    // Use BatchSpanProcessor for production
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: `${PHOENIX_ENDPOINT}/v1/traces`,
      })
    ),
  ],
});

tracerProvider.register();

export const tracer = trace.getTracer("claude-agent-sdk");

console.log(`👀 OpenTelemetry initialized - sending traces to ${PHOENIX_ENDPOINT}`);
```

## Implement Manual Tracking in our Claude Service

This is an example - adapt it to our existing backend Claude service. Do not change existing flows - just extend carefully.

Especially only extend our existing Claude Code hooks and events system. Do not change the flow structure.

```
// agent.ts
import "./instrumentation"; // Muss zuerst importiert werden!
import { query } from "@anthropic-ai/claude-agent-sdk";
import { tracer } from "./instrumentation";
import { SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

async function runAgent(prompt: string) {
  // Erstelle einen Parent-Span für die gesamte Agent-Ausführung
  return tracer.startActiveSpan(
    "claude-agent.query",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "llm.system": "claude",
        "llm.request.type": "agent",
        "input.value": prompt,
      },
    },
    async (parentSpan) => {
      try {
        const messages: any[] = [];
        
        const result = query({
          prompt,
          options: {
            // Optional: Hooks für detaillierteres Tracing
            hooks: {
              PreToolUse: async (input, toolUseID) => {
                // Erstelle einen Child-Span für jeden Tool-Call
                const toolSpan = tracer.startSpan("tool.pre_use", {
                  kind: SpanKind.INTERNAL,
                  attributes: {
                    "tool.name": input.toolName,
                    "tool.input": JSON.stringify(input.toolInput),
                  },
                });
                toolSpan.end();
                return { decision: "approve" };
              },
              PostToolUse: async (input, toolUseID) => {
                const toolSpan = tracer.startSpan("tool.post_use", {
                  kind: SpanKind.INTERNAL,
                  attributes: {
                    "tool.name": input.toolName,
                    "tool.output": JSON.stringify(input.toolResult).slice(0, 1000),
                  },
                });
                toolSpan.end();
                return {};
              },
            },
          },
        });

        // Sammle alle Messages
        for await (const message of result) {
          messages.push(message);

          // Optional: Span für jede Message
          if (message.type === "assistant") {
            const msgSpan = tracer.startSpan("assistant.message", {
              attributes: {
                "message.type": message.type,
              },
            });
            msgSpan.end();
          }
        }

        parentSpan.setAttribute("output.value", JSON.stringify(messages.slice(-1)));
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        
        return messages;
      } catch (error) {
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        parentSpan.recordException(error as Error);
        throw error;
      } finally {
        parentSpan.end();
      }
    }
  );
}

// Main
async function main() {
  console.log("Starting Claude Agent...");
  
  const result = await runAgent(
    "List all files in the current directory and summarize what you find."
  );
  
  console.log("Agent completed. Check Phoenix UI at http://localhost:6006");
}

main().catch(console.error);
```

## Add information to the readme.md

Add a summary of the implemented stuff and standards our implementation follows to the root readme.md file under the Main section "Observability". This should be inserted before the last existing section in the document.