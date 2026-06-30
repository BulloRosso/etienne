# pi-mono coding agent

Integration of [earendil-works/pi](https://github.com/earendil-works/pi) (formerly `badlogic/pi-mono`) — specifically `@earendil-works/pi-coding-agent` / `@earendil-works/pi-agent-core` / `@earendil-works/pi-ai` — as a `CODING_AGENT=pi-mono` option alongside the existing Anthropic, Codex, and OpenAI-Agents orchestrators. (The previous `@mariozechner/*` packages are deprecated and frozen near 0.73.1; this integration targets the maintained `@earendil-works` line, currently pinned at 0.80.2 — requires Node ≥ 22.19.0.)

pi-mono is MIT-licensed, TypeScript-native, and supports a very large multi-provider model matrix (Anthropic, OpenAI, Azure, Google, Vertex, Bedrock, Mistral, Groq, xAI, OpenRouter, Ollama / LM Studio / vLLM, OAuth subscriptions for Claude Pro/Max, ChatGPT Plus, Copilot, ...). It's pre-1.0 and ships multiple releases per week — pin your version.

## Status

Targets `@earendil-works/*@0.80.2` (Node ≥ 22.19.0). The orchestrator streams text, thinking, tool-call, tool-result, usage, compaction, and completion events through an in-process pi extension. Permission gating (all tools), MCP→`registerTool` bridge, context interceptors, chat persistence, full cache-token economy in budget tracking, session resume, Etienne event-bus emission (interceptor stream + rule engine), stream replay, and subagent simulation are wired end-to-end. See **Architecture** below.

## When to pick `pi-mono` vs `anthropic`

| You want... | Pick |
|---|---|
| Full MCP servers (tools + resources + prompts + sampling) | `anthropic` |
| Native subagents (automatic SDK discovery) | `anthropic` |
| Built-in `TodoWrite` / plan mode | `anthropic` |
| To run against OpenAI, Google, xAI, Groq, Ollama, ... without switching harness | `pi-mono` |
| To reuse a Claude Pro/Max or ChatGPT Plus subscription (OAuth) | `pi-mono` |
| Session branching / `/fork` | `pi-mono` |
| Lowest-risk, production-grade harness | `anthropic` |

## Feature comparison

| Feature | `anthropic` | `pi-mono` |
|---|:-:|:-:|
| Streaming text | ✅ | ✅ |
| Streaming thinking deltas | ✅ | ✅ |
| Tool call streaming | ✅ | ✅ |
| Token + cost usage | ✅ | ✅ |
| Multi-provider models | ⚠️ via gateway | ✅ native |
| OAuth subscription auth | ❌ | ✅ |
| Session resume | ✅ | ✅ |
| Session branching (`/fork`) | ❌ | ✅ |
| Compaction | ✅ | ✅ |
| Hooks → interceptor stream (PreToolUse / PostToolUse / UserPromptSubmit / PreCompact / Stop) | ✅ | ✅ via pi extension → `SdkHookEmitterService` |
| Rule-engine / automation triggers (file events, prompts) | ✅ | ✅ via `EventRouter` (source `pi-mono`) |
| Stream replay on reload | ✅ | ✅ via `StreamRelay` + `attach` endpoint |
| Permission prompts | ✅ native | ✅ via extension `tool_call` gate (all tools) |
| Guardrails (input / output) | ✅ | ⚠️ via extension `tool_call`/`tool_result` (TODO) |
| Cache-token economy (read / 5m / 1h write) | ✅ | ✅ from pi `Usage` (`cacheRead`/`cacheWrite`/`cacheWrite1h`) |
| MCP tool calls | ✅ | ✅ via MCP→`registerTool` bridge (allowlisted) |
| MCP resources / prompts / sampling | ✅ | ❌ |
| Subagents (`Task` tool) | ✅ | ✅ simulated via `Task` tool |
| `TodoWrite` / todo tracking | ✅ | ❌ |
| Plan mode | ✅ | ❌ |
| Skills (`/skill:name`, agentskills.io) | ✅ | ✅ |
| Slash commands | ✅ | ⚠️ via pi extensions |
| Memory / RAG (external) | ✅ | ✅ (unchanged — external to harness) |

## Architecture (pi-coding-agent 0.80.2)

0.80.2 removed `beforeToolCall`/`afterToolCall` from `createAgentSession`. All host integration now flows through an **in-process pi extension** ([pi-mono.extension.ts](./pi-mono.extension.ts)) registered via `DefaultResourceLoader({ extensionFactories: [...] })`. One extension wires:

- **Permissions** — `pi.on('tool_call')` gates every tool (built-in + custom) through `SdkPermissionService`, returning `{ block, reason }`. Replaces the old `beforeToolCall` bridge.
- **Result filtering + file events** — `pi.on('tool_result')` runs `ContextInterceptorService.filterToolResults` and derives `file_added`/`file_changed` from write/edit results.
- **Custom tools** — `pi.registerTool(...)` for MCP-bridge tools and the subagent `Task` tool (adapted in [pi-tool-adapter.ts](./pi-tool-adapter.ts)).
- **Model/auth** — built-in Claude models via `getModel('anthropic', id)` ([pi-model-resolver.ts](./pi-model-resolver.ts), Opus 4.8 + Fable 5 included); custom `baseUrl` providers via env-var API keys (extension `registerProvider` is a follow-up).
- **Event bus** — extension handlers call the injected `SdkHookEmitterService` (interceptor stream + `EventRouter`, source `pi-mono`) and write SSE through a `StreamRelay` (reload-survivable; `streamPrompt/attach/:processId` covers `pimono_*` ids).

## Event mapping

The extension forwards pi events to our `MessageEvent` union ([../types.ts](../types.ts)); translation lives in [pi-mono-event-adapter.ts](./pi-mono-event-adapter.ts):

| pi 0.80.2 event | `MessageEvent.type` | Notes |
|---|---|---|
| `agent_start` | `session` | `{ process_id }` |
| `message_update` (`assistantMessageEvent.text_delta`) | `stdout` | `{ chunk }` |
| `message_update` (`assistantMessageEvent.thinking_delta`) | `thinking` | `{ content }` |
| `tool_execution_start` | `tool_call` | `{ callId: toolCallId, toolName, args, status: 'running' }` |
| `tool_execution_end` | `tool_result` | `{ callId, result, isError }` |
| `turn_end` (`message.usage`) | `usage` | full cache economy: `input/output/cacheRead/cacheWrite(+1h)` → SSE `Usage` |
| `session_compact` | `compaction` | post-compaction token estimates |
| `agent_end` | (completion) | `relay.complete()` + chat persistence + `trackCosts` (with cache breakdown) |
| `error` | `error` | `{ message }` |

Events not forwarded yet: `turn_start`, `message_start`, `message_end`, `tool_execution_update` (partial-arg streaming). Add mappings in the adapter/extension when the frontend needs them.

## Model configuration

Per-project `.etienne/ai-model.json` (same file the Anthropic orchestrator reads), extended with an optional `provider` field:

```json
{
  "isActive": true,
  "provider": "openai-compatible",
  "model": "llama3.1:70b",
  "baseUrl": "http://localhost:11434/v1",
  "token": "ollama"
}
```

Supported `provider` values mirror pi-mono's matrix: `anthropic`, `openai`, `azure-openai`, `google`, `vertex`, `bedrock`, `mistral`, `groq`, `cerebras`, `xai`, `openrouter`, `openai-compatible`, ...

If `ai-model.json` is missing the orchestrator falls back to pi-mono's defaults (resolved from env vars — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...).

## MCP bridge

pi-mono itself has no MCP client. [mcp-bridge.extension.ts](./mcp-bridge.extension.ts) runs its own `@modelcontextprotocol/sdk` clients against the project's existing `.mcp.json` servers and exposes **a selected subset of MCP tools** as pi `AgentTool`s. Only tools are bridged — resources, prompts, and sampling are out of scope.

**Enable it** by creating `<project>/.etienne/pi-mcp-bridge.json`:

```json
{
  "servers": ["filesystem", "github"],
  "tools": ["filesystem__read_file", "github__create_issue"]
}
```

- `servers` — which MCP servers from `.mcp.json` to connect. Omit to allow all.
- `tools` — optional stricter allowlist in `<server>__<tool>` form. Omit to expose every tool from allowed servers.
- If the file is missing or empty, **no MCP tools are exposed** (opt-in).

Tool naming follows our existing convention: `<server>__<tool>`, with descriptions prefixed `[MCP:<server>]` so the model knows the provenance. Bridged MCP tools are registered via `pi.registerTool` and gated identically to pi's built-ins through the extension `tool_call` handler.

The bridge owns its MCP clients for the lifetime of a session and closes them on `agent_end`, `clearSession`, or stream error.

## Permission gating

[pi-mono.extension.ts](./pi-mono.extension.ts)'s `pi.on('tool_call')` handler wires to the existing [SdkPermissionService](../sdk/sdk-permission.service.ts). Every tool call — pi builtins, MCP-bridge tools, and the `Task` tool — routes through the same service the Anthropic harness uses, emits the same `permission_request` SSE event, and resolves from the same frontend dialog. Blocking returns `{ block: true, reason }`; arg patches are applied by mutating `event.input`. Default mode is `requireAllPermissions: false`, matching the Anthropic harness default. (0.80.2 removed the session-level `beforeToolCall` hook this previously used; the extension `tool_call` event is its replacement and covers built-in tools too.)

## Subagents

pi-mono has no native subagent support. [subagent-tool.extension.ts](./subagent-tool.extension.ts) reads the project's standard Anthropic-format subagent definitions from `.claude/agents/<name>.md` (same files the UI creates via the Subagent Configuration panel) and exposes a single `Task` tool to the main agent.

**How it works:**

1. On session start, reads all `.md` files from `.claude/agents/` via [`SubagentsService.listSubagents`](../../subagents/subagents.service.ts).
2. Builds a `Task` tool whose `subagent_type` parameter enumerates the available subagent names. The tool description includes each subagent's name and description so the model picks the right one.
3. When the model calls `Task(subagent_type="researcher", prompt="...")`:
   - Reads the subagent's `.md` file to get its system prompt and tool allowlist.
   - Spawns a **nested pi session** (`SessionManager.inMemory()`) with a `DefaultResourceLoader` carrying the subagent's `systemPrompt` and a child extension registering the filtered tool set.
   - Emits `subagent_start` / `subagent_end` events on the parent SSE stream.
   - Forwards text/thinking/tool events from the nested session to the frontend.
   - Returns the final assistant text as the tool result.
4. Recursion capped at depth 2 (configurable via `MAX_SUBAGENT_DEPTH`).
5. Each nested session has a 5-minute timeout. Abort propagation kills nested sessions when the parent is aborted.

**Subagent file format** (unchanged from Anthropic):

```yaml
---
name: researcher
description: "Web researcher for factual information"
tools: WebSearch, WebFetch
model: sonnet
---

You are a research subagent...
```

- `tools` — comma-separated; the child session only gets these tools from the parent's tool set. Empty = all parent tools.
- `model` — `sonnet`, `haiku`, `opus`, `inherit`, or a full model ID. `inherit` / empty uses the parent's model.

**Differences from Anthropic's native subagents:**
- **Serial, not parallel** — pi is synchronous; the parent blocks on each `Task` call.
- **No shared prompt cache** — each nested session is independent.
- **Model mapping** — short names (`sonnet`, `opus`) are translated to full IDs; pi-mono handles multi-provider routing from there.

## Known gaps

1. **Guardrails** — input/output guardrails not yet plumbed through the extension `tool_call`/`tool_result` handlers. Prompts and outputs are passed through untouched.
2. **Custom-provider registration** — `.etienne/ai-model.json` entries with a `baseUrl` (e.g. local Ollama) currently rely on env-var API keys; wiring them through the extension's `pi.registerProvider(...)` is a follow-up. Built-in providers (Anthropic, etc.) work via `getModel` + env keys.
3. **Todos / plan mode** — not supported by pi-mono by design. Todo UI will be empty.
4. **MCP resources / prompts / sampling** — bridge only covers tools.

## Local development

```bash
# install
cd backend
npm install @earendil-works/pi-coding-agent @earendil-works/pi-agent-core @earendil-works/pi-ai

# select harness
echo 'CODING_AGENT=pi-mono' >> .env

# point at a provider — pick one
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or use .etienne/ai-model.json per project for provider switching

npm run dev
```

Then send a prompt via the existing `/api/claude/streamPrompt/sdk` SSE endpoint — the controller routes to `PiMonoOrchestratorService` when `CODING_AGENT=pi-mono`.

## Operational notes

- pi-mono is pre-1.0 with a fast release cadence. Pin the exact version in `package.json` and upgrade deliberately.
- Event shapes are assumed from pi's public docs; verify against the installed version before going to production. The adapter is defensive and drops unknown events silently.
- For multi-tenant isolation set `PI_CODING_AGENT_DIR` per project to keep pi's sessions and auth state separated.
