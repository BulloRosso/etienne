# OpenCode coding agent

Integration of [OpenCode](https://github.com/anomalyco/opencode) (by SST) via the official `@opencode-ai/sdk` TypeScript SDK as a `CODING_AGENT=open-code` option alongside the existing Anthropic, Codex, OpenAI-Agents, and pi-mono orchestrators.

OpenCode is a Go-based terminal AI coding assistant with 75+ model support, LSP integration, and first-class MCP support. It is MIT-licensed and actively maintained by the SST team.

## Status

The orchestrator streams text, thinking, tool-call, tool-result, usage, subagent, and completion events via the OpenCode SDK's SSE event stream. Permission bridge, MCP config translation, skill provisioning, context interceptors, chat persistence, budget tracking, and subagent configuration are wired end-to-end.

## When to pick `open-code` vs `anthropic`

| You want... | Pick |
|---|---|
| Lowest-risk, production-grade harness | `anthropic` |
| Native subagents with shared prompt cache | `anthropic` |
| PreToolUse / PostToolUse hook system | `anthropic` |
| 75+ models without a gateway (Anthropic, OpenAI, Google, Groq, Mistral, Ollama, ...) | `open-code` |
| LSP integration (30+ language servers, code intelligence) | `open-code` |
| Full MCP support (tools + resources + prompts + sampling) without a bridge | `open-code` |
| Richer user elicitations (multi-select, custom text, structured options) | `open-code` |
| Native subagents with hierarchical delegation | `open-code` |
| Auto-compact (automatic context summarization) | `open-code` |
| Custom modes (different tools/models/temperatures) | `open-code` |

## Feature comparison

| Feature | `anthropic` | `open-code` |
|---|:-:|:-:|
| Streaming text | yes | yes |
| Streaming thinking deltas | yes | yes |
| Tool call streaming | yes | yes |
| Token + cost usage | yes | yes |
| Multi-provider models | via gateway | native (75+) |
| Session resume | yes | yes (SQLite) |
| Compaction | yes | yes (auto-compact) |
| Hooks (PreToolUse / PostToolUse / UserPromptSubmit) | yes | permission.asked only |
| Permission prompts | yes (canUseTool) | yes (permission.asked) |
| Elicitations (AskUserQuestion) | yes | yes (question tool, richer) |
| Guardrails (input / output) | yes | yes |
| MCP tools | yes (native) | yes (native) |
| MCP resources / prompts / sampling | yes | yes |
| Subagents (Task tool) | yes (native SDK) | yes (native agent system) |
| TodoWrite / todo tracking | yes | yes |
| Plan mode | yes | yes (custom modes) |
| Skills | yes (agentskills.io) | yes (native skill tool) |
| Memory / RAG (external) | yes | yes |
| LSP / code intelligence | no | yes (30+ languages) |
| Doom loop detection | no | yes |

## Event mapping

OpenCode emits `GlobalEvent` objects via SSE. Each has a `payload: Event` discriminated by `type`. The translation lives in [opencode-event-adapter.ts](./opencode-event-adapter.ts):

| OpenCode event | `MessageEvent.type` | Notes |
|---|---|---|
| `message.part.delta` (text) | `stdout` | `{ chunk }` |
| `message.part.delta` (reasoning) | `thinking` | `{ content }` |
| `message.part.updated` (tool, running) | `tool_call` | `{ callId, toolName, args, status: 'running' }` |
| `message.part.updated` (tool, completed/error) | `tool_result` | `{ callId, result }` |
| `message.updated` (assistant, tokens) | `usage` | `inputTokens`, `outputTokens`, `cost` |
| `session.created` | `session` | `{ session_id }` |
| `session.error` | `error` | `{ message }` |
| `session.updated` (idle) | `completed` | Signals end of turn |
| `file.edited` | `file_changed` | `{ path }` |
| `permission.asked` | (handled by permission service) | Tool approval dialog |
| `question.asked` | (handled by permission service) | User question dialog |

## MCP configuration

OpenCode reads MCP servers from its own `opencode.json` `"mcp"` section. The orchestrator translates the project's shared `.mcp.json` to OpenCode format at session start via [opencode-mcp-config.adapter.ts](./opencode-mcp-config.adapter.ts):

```
.mcp.json:                          opencode.json mcp:
{                                   {
  "mcpServers": {                     "mcp": {
    "github": {                         "github": {
      "command": "npx",                   "type": "local",
      "args": ["-y", "@mcp/github"],      "command": ["npx", "-y", "@mcp/github"],
      "env": { "TOKEN": "..." }           "environment": { "TOKEN": "..." }
    }                                   }
  }                                   }
}                                   }
```

No MCP bridge is needed — OpenCode has full native MCP support.

## Subagent configuration

Subagent definitions from `.claude/agents/*.md` (same files the UI manages) are translated to OpenCode agent format in `opencode.json` at session start:

```
.claude/agents/researcher.md  -->  opencode.json agents[]:
---                                  {
name: researcher                       "id": "researcher",
description: "Web researcher"         "description": "Web researcher",
tools: WebSearch, WebFetch             "mode": "subagent",
model: sonnet                          "model": "anthropic/claude-sonnet-4-5",
---                                    "prompt": "<system prompt>",
<system prompt>                        "permission": { "websearch": "allow", "webfetch": "allow" }
                                     }
```

OpenCode handles delegation natively — no simulation via nested sessions needed (unlike pi-mono).

## Skill provisioning

Skills from `.claude/skills/` are copied to `.opencode/skills/` at session start so OpenCode's native `skill` tool discovers them. OpenCode also falls back to `.claude/skills/` natively, so skills work even without provisioning.

See [opencode-skill-provisioner.ts](./opencode-skill-provisioner.ts).

## Permission & elicitation bridge

[opencode-permission.service.ts](./opencode-permission.service.ts) handles both event types:

- `permission.asked` -> `InterceptorsService.emitPermissionRequest()` -> frontend permission dialog
- `question.asked` -> `InterceptorsService.emitAskUserQuestion()` -> frontend question dialog

Responses flow back via `client.permission.reply(id, 'once' | 'always' | 'reject')` or `client.question.reply(id, answers)`.

Default timeout: 300 seconds (configurable via `OPENCODE_PERMISSION_TIMEOUT_MS`).

## Model configuration

Per-project `.etienne/ai-model.json` (same file the Anthropic orchestrator reads), extended with an optional `provider` field:

```json
{
  "isActive": true,
  "provider": "openai",
  "model": "gpt-5",
  "baseUrl": "https://api.openai.com/v1",
  "token": "sk-..."
}
```

Supported `provider` values: `anthropic`, `openai`, `azure-openai`, `google`, `vertex`, `bedrock`, `mistral`, `groq`, `cerebras`, `xai`, `openrouter`, `openai-compatible`.

## Local development

```bash
# install OpenCode binary
go install github.com/anomalyco/opencode@latest

# install SDK
cd backend
npm install @opencode-ai/sdk

# select harness
echo 'CODING_AGENT=open-code' >> .env

# point at a provider
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...

npm run dev
```

Then send a prompt via the existing `/api/claude/streamPrompt/sdk` SSE endpoint — the controller routes to `OpenCodeOrchestratorService` when `CODING_AGENT=open-code`.

## Known gaps

1. **Hooks** — PreToolUse/PostToolUse hooks are not available; OpenCode uses `permission.asked` events instead.
2. **Shared prompt cache** — Each OpenCode session is independent; no cross-session cache.
3. **SDK maturity** — The `@opencode-ai/sdk` is under active development. Pin the version and upgrade deliberately.

## Operational notes

- OpenCode is actively maintained with frequent releases. Pin the exact version in `package.json`.
- The SDK is ESM-only — we use `new Function('m', 'return import(m)')` for dynamic import (same pattern as pi-mono).
- The SSE event stream is global (all sessions). The orchestrator filters by `sessionID` in event properties.
- Session files: `workspace/<project>/data/opencode-session.id` — separate from Anthropic and Codex.
