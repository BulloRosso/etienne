# OpenCode coding agent

Integration of [OpenCode](https://github.com/sst/opencode) (by SST) via the official `@opencode-ai/sdk` TypeScript SDK as a `CODING_AGENT=open-code` option alongside the existing Anthropic, Codex, and pi-mono orchestrators.

OpenCode is a TypeScript-based terminal AI coding assistant with 75+ model support, LSP integration, and first-class MCP support. It is MIT-licensed and actively maintained by the SST team.

> **SDK version:** pinned to `@opencode-ai/sdk` + `opencode-ai` `^1.17.20` (lockstep; no `engines.node` constraint). The v1 event discriminators and `SessionPromptData` are identical between 1.17.13 and 1.17.20 (verified against the published `.d.ts`), and the `./v2` API is a separate opt-in subpath this adapter deliberately doesn't use yet. Upgrades within 1.17.x are safe re-pins.

## Status

The orchestrator streams text, thinking, tool-call, tool-result, usage, subagent, and completion events via the OpenCode SDK's SSE event stream. Permission bridge, MCP config translation, skill provisioning, context interceptors, chat persistence, budget tracking (cache-aware), and subagent configuration are wired end-to-end. Hardened to harness parity: events route through a **`StreamRelay`** (reload-survivable; `streamPrompt/attach/:processId` covers `opencode_*` ids) and bus events are tagged **`source: 'open-code'`** so the rule-engine loop-guard can distinguish OpenCode activity.

## When to pick `open-code` vs `anthropic`

| You want... | Pick |
|---|---|
| Lowest-risk, production-grade harness | `anthropic` |
| Native subagents with shared prompt cache | `anthropic` |
| Elicitations / AskUserQuestion dialogs | `anthropic` |
| 75+ models without a gateway (Anthropic, OpenAI, Google, Groq, Mistral, Ollama, ...) | `open-code` |
| LSP integration (30+ language servers, code intelligence) | `open-code` |
| Full MCP support (tools + resources + prompts + sampling) without a bridge | `open-code` |
| Native subagents with hierarchical delegation | `open-code` |
| Auto-compact (automatic context summarization) | `open-code` |
| Custom modes (different tools/models/temperatures) | `open-code` |

## Feature comparison

| Feature | `anthropic` | `open-code` |
|---|:-:|:-:|
| Streaming text | yes | yes |
| Streaming thinking deltas | yes | yes |
| Tool call streaming | yes | yes |
| Token + cost usage | yes | yes (cache-aware) |
| Multi-provider models | via gateway | native (75+) |
| Stream replay on reload | yes | yes (StreamRelay + attach) |
| Loop-guard event source | yes | yes (`source: open-code`) |
| Session resume | yes | yes (SQLite) |
| Compaction | yes | yes (auto-compact + manual `POST /api/claude/compactSession/:projectDir`) |
| Hooks (PreToolUse / PostToolUse / UserPromptSubmit) | yes | yes (provisioned plugin bridge, event-derived fallback) |
| Permission prompts | yes (canUseTool) | yes (`permission.updated`) |
| Elicitations (AskUserQuestion) | yes | **no** (v1 API has no question surface; v2-only) |
| Guardrails (input / output) | yes | yes |
| MCP tools | yes (native) | yes (native) |
| MCP resources / prompts / sampling | yes | yes |
| Subagents (Task tool) | yes (native SDK) | yes (native agent system) |
| TodoWrite / todo tracking | yes | yes (`todowrite` normalized to `TodoWrite`) |
| Plan mode | yes | yes (built-in `plan` agent, per-prompt `agent` field) |
| Context meter (`context_state`) | yes | yes (derived from usage) |
| Skills | yes (agentskills.io) | yes (native skill tool) |
| Memory / RAG (external) | yes | yes |
| LSP / code intelligence | no | yes (30+ languages) |
| Doom loop detection | no | yes |

## Event mapping

OpenCode emits `Event` objects via SSE, discriminated by `type` with data under `properties` (a `delta` string accompanies streaming part updates). The translation lives in [opencode-event-adapter.ts](./opencode-event-adapter.ts); a few event types are handled directly in the orchestrator loop. Tool names are normalized to Claude Code conventions (`todowrite` → `TodoWrite`, ...) via [opencode-tool-name.util.ts](./opencode-tool-name.util.ts).

| OpenCode event | `MessageEvent.type` | Notes |
|---|---|---|
| `message.part.updated` (text) | `stdout` | `{ chunk }` — prefers `properties.delta` |
| `message.part.updated` (reasoning) | `thinking` | `{ content }` |
| `message.part.updated` (tool, running/pending) | `tool_call` | `{ callId, toolName, args, status: 'running' }` |
| `message.part.updated` (tool, completed/error) | `tool_result` | `{ callId, toolName, result }` |
| `message.part.updated` (tool = `task`) | `subagent_start` / `subagent_end` | Subagent runs surface via the Task tool |
| `message.part.updated` (retry) | `status` | `{ status: 'retrying', attempt, message }` |
| `message.part.updated` (patch) | `file_changed` | One event per file in the patch |
| `message.part.updated` (compaction) | `compaction` | `{ trigger: auto\|manual }` |
| `message.part.updated` (step-start/step-finish) | — | Provider API request boundaries, intentionally ignored (NOT subagents) |
| `message.updated` (assistant, tokens) | `usage` (+ `context_state`) | input/output/cache tokens, cost; context meter derived in orchestrator |
| `session.status` (busy/idle) | `session_state` | `{ state: running\|idle }` |
| `session.status` (retry) | `status` | `{ status: 'retrying' }` |
| `session.compacted` | `compaction` | Deduped against the compaction part (10s window) |
| `session.created` | `session` | `{ session_id }` |
| `session.error` | `error` | `{ message }` |
| `session.idle` | `completed` | Handled in orchestrator — authoritative end of turn |
| `file.edited` | `file_changed` | `{ path }` |
| `permission.updated` | (handled by permission service) | Tool approval dialog + `tool_call` timeline entry |
| `permission.replied` | — | Settles the pending record if answered out-of-band |

Everything else (`lsp.*`, `installation.*`, `pty.*`, `tui.*`, `vcs.branch.updated`, `file.watcher.updated`, ...) is intentionally ignored.

## Hook bridge (PreToolUse / PostToolUse)

A plugin is provisioned into `<project>/.opencode/plugin/etienne-hooks.js` at run start ([opencode-hook-plugin.provisioner.ts](./opencode-hook-plugin.provisioner.ts)). It runs inside the embedded OpenCode server and POSTs `tool.execute.before` / `tool.execute.after` callbacks to `POST /api/opencode/hooks/:project` ([opencode-hooks.controller.ts](./opencode-hooks.controller.ts)), authenticated with a per-boot shared secret. [opencode-hook-bridge.service.ts](./opencode-hook-bridge.service.ts) translates them into the same `PreToolUse`/`PostToolUse` interceptor events the Claude path emits. When the plugin hasn't phoned home recently, the orchestrator falls back to emitting `PostToolUse` from `tool_result` stream events (no PreToolUse in fallback mode).

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

## Permission bridge & plan mode

[opencode-permission.service.ts](./opencode-permission.service.ts) bridges `permission.updated` events -> `InterceptorsService.emitPermissionRequest()` -> frontend permission dialog. Responses flow back via `POST /session/{id}/permissions/{permissionID}` with `'once' | 'always' | 'reject'`. Replies observed on the stream from another client (`permission.replied`) settle the pending record without waiting for the timeout.

Default timeout: 300 seconds, then auto-deny (configurable via `OPENCODE_PERMISSION_TIMEOUT_MS`).

The frontend's plan/work toggle maps onto OpenCode's built-in agents via the per-prompt `agent` field: `plan` (edit/bash default to "ask", surfaced through the permission dialog) or `build` (full access). Agent-level permissions override the global `permission` block in `opencode.json` (seeded from [templates/opencode-config.json](../../coding-agent-configuration/templates/opencode-config.json) on first run).

There is **no question/elicitation surface in the v1 API** — the `question.asked` handling in the permission service is dead code kept for a future `./v2` client migration (v2 adds `question.asked/replied/rejected` events).

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
# install both the binary and SDK (both in package.json)
cd backend
npm install

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

1. **AskUserQuestion / elicitations** — the v1 API has no question surface. Possible future paths: a plugin-registered custom tool calling back to the backend, or the `./v2` SDK client (adds `question.asked` events plus fine-grained `session.next.*` streaming deltas and `permission.v2`).
2. **Shared prompt cache** — Each OpenCode session is independent; no cross-session cache.
3. **SDK maturity** — The `@opencode-ai/sdk` is under active development. Pin the version and upgrade deliberately.
4. **Message-level revert** — `session.revert/unrevert` is intentionally unused; etienne's checkpoints module (git/gitea) owns restore, and the two would fight over the working tree.
5. **Slash commands** — `command.list` / `session.command` exist server-side but etienne has no slash-command surface yet.
6. **Code-mode MCP adapter** — added in opencode 1.17.14 (confined orchestration scripts, `execute` tool); not integrated.

## Operational notes

- OpenCode is actively maintained with frequent releases. Pin the exact version in `package.json`.
- The SDK is ESM-only — we use `new Function('m', 'return import(m)')` for dynamic import (same pattern as pi-mono).
- The SSE event stream is global (all sessions). The orchestrator filters by `sessionID` in event properties.
- Session files: `workspace/<project>/data/opencode-session.id` — separate from Anthropic and Codex.
