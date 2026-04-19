# OpenCode Support (Experimental)

This project supports **OpenCode** (by SST) as an alternative coding agent alongside the default **Anthropic Claude Code SDK**. OpenCode support is experimental and must be explicitly enabled via environment configuration.

## Enabling OpenCode

Set the following in `backend/.env`:

```env
CODING_AGENT=open-code
```

OpenCode supports 75+ AI models across many providers. Configure the desired provider and model:

```env
OPENCODE_PROVIDER=anthropic
OPENCODE_MODEL=claude-sonnet-4-5-20250514
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CODING_AGENT` | No | `anthropic` | Set to `open-code` to activate OpenCode |
| `ANTHROPIC_API_KEY` | Depends | — | Required when using Anthropic models |
| `OPENAI_API_KEY` | Depends | — | Required when using OpenAI models |
| `OPENCODE_PROVIDER` | No | `anthropic` | AI provider (`anthropic`, `openai`, `google`, `groq`, `mistral`, etc.) |
| `OPENCODE_MODEL` | No | `claude-sonnet-4-5-20250514` | Model identifier |
| `OPENCODE_PERMISSION_TIMEOUT_MS` | No | `300000` | Timeout for permission/question dialogs (ms) |
| `OPENCODE_SERVER_PORT` | No | `0` (auto) | Port for OpenCode background server |
| `OPENCODE_BINARY_PATH` | No | `opencode` | Path to the OpenCode binary |

When `CODING_AGENT` is not set or set to `anthropic`, the default Claude Code SDK is used.

## Prerequisites

OpenCode requires the Go binary to be installed:

```bash
# Install via go
go install github.com/opencode-ai/opencode@latest

# Or download from https://opencode.ai/docs/installation
```

The TypeScript SDK must also be installed:

```bash
cd backend
npm install @opencode-ai/sdk
```

## Architecture: SDK-Based Integration

The integration uses the official **OpenCode TypeScript SDK** (`@opencode-ai/sdk`) with a managed background server. This is a more feature-rich integration than subprocess-based approaches.

### How It Works

1. On first request, the backend starts an OpenCode background server via `createOpencodeServer()`
2. Communication happens via **HTTP + SSE** (Server-Sent Events) through the SDK client
3. The server is **persistent** and reused across all sessions (SQLite-backed)
4. Text streaming uses true deltas via `message.part.delta` events
5. Subagents, MCP servers, skills, and elicitations are handled natively by OpenCode

### Integration Architecture

```
Frontend <--SSE--> NestJS Backend <--SDK--> OpenCode Server (Go)
                       |                         |
                  Orchestrator              SQLite Sessions
                  Guardrails                MCP Servers
                  Memory/RAG               LSP Servers
                  Budget Tracking          Agent System
                  Chat Persistence         Skill System
```

## Focus Features

### Subagents

OpenCode has a native agent system with hierarchical delegation. Subagent definitions from `.claude/agents/*.md` are automatically translated to OpenCode agent format in `opencode.json` on session start.

- Native Task tool for agent delegation (no simulation needed)
- Subagent-to-subagent delegation with configurable depth limits
- Per-agent model and permission overrides

### MCP Support

OpenCode provides first-class MCP support covering **tools, resources, prompts, and sampling** — the full MCP specification. Project MCP servers from `.mcp.json` are automatically translated to OpenCode's format.

- Supported transports: stdio, SSE, streamable HTTP
- OAuth authentication via Dynamic Client Registration
- Per-agent tool enablement via glob patterns
- No custom bridge needed (unlike pi-mono which requires `mcp-bridge.extension.ts`)

### Agent Skills

OpenCode's native `skill` tool loads skills on-demand from `.opencode/skills/<name>/SKILL.md`. The SKILL.md format is compatible with Etienne's Skills Store format, so existing skills work without modification.

- Skills from `.claude/skills/` are provisioned to `.opencode/skills/` at session start
- On-demand loading reduces context window consumption
- Compatible with the agentskills.io specification

### Elicitations (User Questions)

OpenCode's `question` tool provides richer elicitation capabilities than Anthropic's `AskUserQuestion`:

- Multi-select options
- Custom text input
- Structured option lists with descriptions

Both `question.asked` and `permission.asked` events map to the existing frontend dialogs via `InterceptorsService`.

### Filesystem

The File Explorer UI works unchanged — it uses agent-agnostic REST endpoints (`/api/claude/listFiles`, `/api/claude/filesystem`) that operate directly on the workspace filesystem.

## What Works

- Real-time text streaming (true deltas)
- Tool call timeline with running and completion states
- File change notifications
- Shell/command execution
- Web search and fetch
- MCP tool calls (native)
- Subagent orchestration (native)
- Agent skills (native skill tool)
- Elicitations / user questions (richer than Claude Code)
- Token usage tracking and budget monitoring
- Session persistence (SQLite-backed, survives disconnects)
- Input and output guardrails
- Memory injection and context scoping
- Chat history persistence
- Telemetry and observability
- Plan mode (via custom modes)
- LSP integration (30+ language servers)

## What's Different from Claude Code

- **LSP integration** — OpenCode provides real-time code intelligence from 30+ language servers (diagnostics, hover, go-to-definition)
- **Multi-provider** — 75+ models natively (Anthropic, OpenAI, Google, AWS, Groq, Mistral, Ollama, etc.) without a gateway
- **Custom modes** — Different tool sets, models, and temperatures per mode
- **Auto-compact** — Automatic context summarization when approaching limits
- **Doom loop detection** — Detects repeated identical tool calls
- **No PreToolUse/PostToolUse hooks** — OpenCode's permission system provides equivalent functionality via `permission.asked` events

## Per-Project Model Override

Individual projects can override the AI model by placing an `.etienne/ai-model.json` file in the project root:

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

## Switching Between Agents

Switching between agents is safe. Each agent maintains its own session state:

- Anthropic sessions: `workspace/<project>/data/session.id`
- Codex threads: `workspace/<project>/data/codex-thread.id`
- OpenCode sessions: `workspace/<project>/data/opencode-session.id`

Change `CODING_AGENT` in `backend/.env` and restart the backend. The frontend reads the active agent from `/api/configuration` on startup and adjusts the UI accordingly.
