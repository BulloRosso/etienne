# pi-mono coding agent

Integration of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) — specifically `@mariozechner/pi-coding-agent` / `@mariozechner/pi-agent-core` — as a `CODING_AGENT=pi-mono` option alongside the existing Anthropic, Codex, and OpenAI-Agents orchestrators.

pi-mono is MIT-licensed, TypeScript-native, and supports a very large multi-provider model matrix (Anthropic, OpenAI, Azure, Google, Vertex, Bedrock, Mistral, Groq, xAI, OpenRouter, Ollama / LM Studio / vLLM, OAuth subscriptions for Claude Pro/Max, ChatGPT Plus, Copilot, ...). It's pre-1.0 and ships multiple releases per week — pin your version.

## Status

The orchestrator streams text, thinking, tool-call, tool-result, usage, and completion events via the pi-agent-core SDK. Permission bridge, MCP→AgentTool bridge, context interceptors, chat persistence, budget tracking, and subagent simulation are wired end-to-end.

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
| Hooks (PreToolUse / PostToolUse / UserPromptSubmit / PreCompact) | ✅ | ⚠️ `beforeToolCall` / `afterToolCall` only |
| Permission prompts | ✅ native | ✅ via `beforeToolCall` bridge |
| Guardrails (input / output) | ✅ | ⚠️ via `beforeToolCall` bridge (TODO) |
| MCP tool calls | ✅ | ✅ via MCP→AgentTool bridge (allowlisted) |
| MCP resources / prompts / sampling | ✅ | ❌ |
| Subagents (`Task` tool) | ✅ | ✅ simulated via `Task` tool |
| `TodoWrite` / todo tracking | ✅ | ❌ |
| Plan mode | ✅ | ❌ |
| Skills (`/skill:name`, agentskills.io) | ✅ | ✅ |
| Slash commands | ✅ | ⚠️ via pi extensions |
| Memory / RAG (external) | ✅ | ✅ (unchanged — external to harness) |

## Event mapping

`pi-agent-core` emits a structured event stream that maps cleanly onto our `MessageEvent` union in [../types.ts](../types.ts). The translation lives in [pi-mono-event-adapter.ts](./pi-mono-event-adapter.ts):

| pi-agent-core event | `MessageEvent.type` | Notes |
|---|---|---|
| `agent_start` | `session` | Carries `process_id` + optional `session_id` |
| `text_delta` | `stdout` | `{ chunk }` |
| `thinking_delta` | `thinking` | `{ content }` |
| `tool_execution_start` | `tool_call` | `{ callId, toolName, args, status: 'running' }` |
| `tool_execution_end` | `tool_result` | `{ callId, result }`; error is surfaced as result text |
| `turn_end` / `agent_end` | `usage` | `inputTokens`, `outputTokens`, `cost.total` → `total_cost_usd` |
| `agent_end` | `completed` | Followed by `observer.complete()` |
| `error` | `error` | `{ message }` |

Events we don't forward yet: `turn_start`, `message_start`, `message_end`, `tool_execution_update` (partial-arg streaming). Add mappings in `pi-mono-event-adapter.ts` when the frontend needs them.

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

Tool naming follows our existing convention: `<server>__<tool>`, with descriptions prefixed `[MCP:<server>]` so the model knows the provenance. Every bridged tool call still flows through the `beforeToolCall` permission hook, so MCP tools are gated identically to pi's built-ins.

The bridge owns its MCP clients for the lifetime of a session and closes them on `agent_end`, `clearSession`, or stream error.

## Permission bridge

[pi-mono-permission.bridge.ts](./pi-mono-permission.bridge.ts) wires pi's `beforeToolCall` hook to the existing [SdkPermissionService](../sdk/sdk-permission.service.ts). Every tool call — pi builtins and bridged MCP tools — routes through the same service the Anthropic harness uses, emits the same `permission_request` SSE event, and resolves from the same frontend dialog. Default mode is `requireAllPermissions: false`, matching the Anthropic harness default.

## Subagents

pi-mono has no native subagent support. [subagent-tool.extension.ts](./subagent-tool.extension.ts) reads the project's standard Anthropic-format subagent definitions from `.claude/agents/<name>.md` (same files the UI creates via the Subagent Configuration panel) and exposes a single `Task` tool to the main agent.

**How it works:**

1. On session start, reads all `.md` files from `.claude/agents/` via [`SubagentsService.listSubagents`](../../subagents/subagents.service.ts).
2. Builds a `Task` tool whose `subagent_type` parameter enumerates the available subagent names. The tool description includes each subagent's name and description so the model picks the right one.
3. When the model calls `Task(subagent_type="researcher", prompt="...")`:
   - Reads the subagent's `.md` file to get its system prompt and tool allowlist.
   - Spawns a **nested pi session** (`SessionManager.inMemory()`) with the subagent's system prompt and a filtered tool set.
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

1. **Guardrails** — input/output guardrails not yet plumbed. Prompts and outputs are passed through untouched.
2. **Todos / plan mode** — not supported by pi-mono by design. Todo UI will be empty.
3. **MCP resources / prompts / sampling** — bridge only covers tools.

## Local development

```bash
# install
cd backend
npm install @mariozechner/pi-coding-agent @mariozechner/pi-agent-core

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
