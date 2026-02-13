# What Works and What's Lost in Codex Mode

This document compares the features available when using `CODING_AGENT=anthropic` (Claude Code SDK) versus `CODING_AGENT=openai` (OpenAI Codex SDK).

## Configuration

Set the `CODING_AGENT` environment variable in `backend/.env`:

```env
# Use Anthropic Claude Code SDK (default)
CODING_AGENT=anthropic

# Use OpenAI Codex SDK
CODING_AGENT=openai
```

When `CODING_AGENT=openai`, you must also set `OPENAI_API_KEY` in `.env`.

Optional Codex-specific settings:
```env
CODEX_MODEL=gpt-5.2-codex        # Model to use (default: gpt-5.2-codex)
```

Note: Sandbox mode is always `danger-full-access` (hardcoded). The `workspace-write` mode is read-only on Windows, so full access is required for the agent to create and modify files.

## Feature Comparison

### Core Agent Capabilities

| Feature | Anthropic (Claude Code) | OpenAI (Codex) | Status |
|---------|------------------------|----------------|--------|
| File read/write/edit | Built-in Read, Write, Edit, MultiEdit tools | Built-in (file_change events) | **Works** |
| Shell/command execution | Built-in Bash tool with pattern restrictions | Built-in (command_execution events) | **Works** |
| Web search | Built-in WebSearch tool | Built-in (web_search events) | **Works** |
| File search (Glob/Grep) | Built-in Glob and Grep tools | Agent uses shell commands (rg, find) | **Works** (different mechanism) |
| Jupyter notebook editing | Built-in NotebookEdit tool | Via file_change patches | **Works** (different mechanism) |
| Todo/task tracking | Built-in TodoWrite tool | Built-in (todo_list events) | **Works** |
| Code reasoning | Inline reasoning in responses | Dedicated reasoning events | **Works** |

### Streaming & UI

| Feature | Anthropic (Claude Code) | OpenAI (Codex) | Status |
|---------|------------------------|----------------|--------|
| Real-time text streaming | `content_block_delta` events | `item/agentMessage/delta` (true deltas) | **Works** |
| Tool call timeline | PreToolUse + PostToolUse events (start+complete) | `item/started` + `item/completed` events | **Works** — running + complete |
| File change notifications | PostToolUse hook detects Write/Edit | `item/completed` (fileChange) events | **Works** |
| Token usage tracking | Result message usage | `thread/tokenUsage/updated` notification | **Works** |
| Session/conversation resume | `resume: sessionId` | `thread/resume` JSON-RPC request | **Works** |
| Stream abort/cancel | AbortController on SDK query | `turn/interrupt` JSON-RPC request | **Works** |

### Interactive Features

| Feature | Anthropic (Claude Code) | OpenAI (Codex) | Status |
|---------|------------------------|----------------|--------|
| Plan/Work mode toggle | Built-in `permissionMode` + UI toggle | **Not available** — toggle hidden | **Lost** |
| AskUserQuestion | Built-in tool + `canUseTool` callback | **Not available** | **Lost** |
| ExitPlanMode (plan approval) | Built-in tool + approval dialog | **Not available** | **Lost** |
| Tool-level permission prompts | `canUseTool` callback per tool | **Not available** | **Lost** |

### Security & Permissions

| Feature | Anthropic (Claude Code) | OpenAI (Codex) | Status |
|---------|------------------------|----------------|--------|
| Tool allowlist | `permissions.json` with patterns like `Bash(python3:*)` | Codex sandbox mode (read-only/workspace-write/full) | **Simplified** |
| Sandbox isolation | Docker container with firewall rules | Codex built-in sandbox | **Different** mechanism |
| MCP server tools | Auto-discovered from `.claude/settings.json` | Codex built-in MCP support | **Works** |

### Orchestrator Features (SDK-agnostic, work in both modes)

| Feature | Status |
|---------|--------|
| Input guardrails (PII, secret detection) | **Works** |
| Output guardrails (content moderation) | **Works** |
| Memory injection (conversation context) | **Works** |
| Context scope injection | **Works** |
| Budget monitoring & cost tracking | **Works** |
| Chat history persistence | **Works** |
| Telemetry & observability | **Works** |
| Datetime awareness injection | **Works** |
| Hook event emission (PostToolUse, file events) | **Works** |

## UI Behavior Changes

When `CODING_AGENT=openai`:
- The **Plan/Work mode toggle** is hidden from the chat pane header
- Mode is forced to **"work"** (Codex always executes directly)
- The **PlanApprovalModal** and **AskUserQuestionModal** will never trigger
- The **PermissionModal** for tool approval will never trigger
- Tool calls in the **StreamingTimeline** show both running and completion states
- Everything else (text streaming, file previews, session management, artifacts) works identically

## Architecture Notes

- The `CODING_AGENT` env var controls routing at the controller level
- Both SDK backends share the same `/api/claude/streamPrompt/sdk` endpoint
- Session files are stored separately: `data/session.id` (Anthropic) vs `data/codex-thread.id` (Codex)
- Switching between agents is safe — each maintains its own session state
- The frontend reads `CODING_AGENT` from `/api/configuration` on startup

### Codex App-Server Protocol

The Codex integration uses the **app-server** stdio protocol (same protocol as the VSCode extension):
- The backend spawns a `codex app-server` child process on first request
- Communication is via **JSON-RPC 2.0 over stdio** (JSONL — one JSON object per line)
- The process is long-lived and reused across turns within a session
- Lifecycle: `initialize` → `initialized` → `account/login/start` → `thread/start`/`thread/resume` → `turn/start` → notification stream → `turn/completed`
- Text streaming uses true deltas (`item/agentMessage/delta`) not accumulated text
- Abort is via `turn/interrupt` JSON-RPC request
- TypeScript bindings can be generated via `codex app-server generate-ts --out <dir>`
