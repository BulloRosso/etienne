# OpenAI Codex Support (Experimental)

This project supports **OpenAI Codex** as an alternative coding agent alongside the default **Anthropic Claude Code SDK**. Codex support is experimental and must be explicitly enabled via environment configuration.

## Enabling Codex

Set the following in `backend/.env`:

```env
CODING_AGENT=openai
OPENAI_API_KEY=sk-...
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CODING_AGENT` | No | `anthropic` | Set to `openai` to activate Codex |
| `OPENAI_API_KEY` | Yes (when Codex) | — | Your OpenAI API key |
| `CODEX_MODEL` | No | `gpt-5.2-codex` | Model identifier for Codex |
| `CODEX_BINARY_PATH` | No | `node_modules/.bin/codex` | Override path to the codex binary |

When `CODING_AGENT` is not set or set to `anthropic`, the default Claude Code SDK is used and no OpenAI key is needed.

## Architecture: Codex App-Server Integration

The integration uses the **Codex app-server** stdio protocol — the same protocol used by the official VSCode Codex extension. This is a more stable integration path than direct SDK library calls.

### How It Works

1. On the first request, the backend spawns a `codex app-server` child process
2. Communication happens via **JSON-RPC 2.0 over stdio** (JSONL format, one JSON object per line)
3. The process is **long-lived** and reused across turns within a session
4. Text streaming uses **true deltas** (`item/agentMessage/delta`), not accumulated text

### Protocol Lifecycle

```
spawn codex app-server
  -> initialize (handshake)
  -> initialized (client notification)
  -> account/login/start (API key auth)
  -> thread/start or thread/resume
  -> turn/start (send user prompt)
  <- notification stream (text deltas, tool calls, file changes, ...)
  <- turn/completed
```

### Abort / Cancel

Running turns can be interrupted via a `turn/interrupt` JSON-RPC request, triggered when the user clicks cancel in the UI.

## What Works

- Real-time text streaming (true deltas)
- Tool call timeline with running and completion states
- File change notifications (create, edit)
- Shell/command execution
- Web search
- MCP tool calls
- Token usage tracking and budget monitoring
- Session resume (thread persistence across prompts)
- Input and output guardrails
- Memory injection and context scoping
- Chat history persistence
- Telemetry and observability

## What's Different from Claude Code

- **No Plan/Work mode** — the mode toggle is hidden; Codex always executes directly
- **No AskUserQuestion** — Codex cannot prompt the user for clarification mid-turn
- **No tool-level permission prompts** — sandbox mode is always `danger-full-access` (required on Windows for file writes)
- **Reasoning** is surfaced via dedicated reasoning events instead of inline text

## Per-Project Model Override

Individual projects can override the AI model by placing an `.etienne/ai-model.json` file in the project root:

```json
{
  "isActive": true,
  "model": "gpt-5.2-codex",
  "baseUrl": "https://api.openai.com/v1",
  "token": "sk-..."
}
```

When `isActive` is `true` and all fields are present, this configuration takes precedence over the global `OPENAI_API_KEY` and `CODEX_MODEL` settings.

## Switching Between Agents

Switching between `anthropic` and `openai` is safe. Each agent maintains its own session state:

- Anthropic sessions: `workspace/<project>/data/session.id`
- Codex threads: `workspace/<project>/data/codex-thread.id`

Change `CODING_AGENT` in `backend/.env` and restart the backend. The frontend reads the active agent from `/api/configuration` on startup and adjusts the UI accordingly.
