# Kimi Code Support (`kimi_3_sdk.md`)

Etienne supports **Moonshot AI's Kimi** as a coding agent via the official
**Kimi Agent SDK** ([`@moonshot-ai/kimi-agent-sdk`](https://github.com/MoonshotAI/kimi-agent-sdk)).
Enable it with:

```env
CODING_AGENT=kimi-code
MOONSHOT_API_KEY=sk-...
```

in `backend/.env` (restart the backend to pick up the change).

## How it works

The Kimi Agent SDK is an in-process npm library that spawns the **Kimi CLI**
(a Python tool, installed separately) as its execution engine and speaks a
JSON-RPC wire protocol to it over stdio. The CLI brings its own tools, skills
support, MCP client, and automatic context compaction — the SDK is a thin,
typed client over that.

```
Frontend ──SSE──▶ ClaudeController ──▶ KimiCodeOrchestratorService
                                          │
                                          ├── KimiCodeSdkService ──createSession()──▶ kimi CLI (one process per project)
                                          ├── KimiCodeSessionManagerService   (persists <project>/data/kimi-session.id)
                                          ├── kimi-code-event-adapter         (Kimi StreamEvent → MessageEvent)
                                          └── kimi-mcp-config.provisioner     (project MCP → <project>/.kimi/mcp.json)
```

All backend code lives in [`backend/src/claude/kimi-code-sdk/`](backend/src/claude/kimi-code-sdk/)
(see its [README](backend/src/claude/kimi-code-sdk/README.md) for the adapter-level
detail). The adapter has **full parity with the OpenCode integration** — stream
relay (reload-safe SSE replay), input/output guardrails, budget monitoring &
cache-aware token tracking, memory injection/storage, chat persistence,
interceptor hooks, telemetry, per-project model override — with one deliberate
exception: **permissions**.

### Permissions: yoloMode

Kimi sessions always run with `yoloMode: true` — every tool call is
auto-approved, there is no permission dialog. This was a deliberate scoping
decision for the first iteration. Defensively, a stray `ApprovalRequest` is
auto-approved and an interactive `QuestionRequest` is auto-answered with each
question's first option, so a turn can never stall waiting for input.

### Plan mode

Kimi has **native plan mode** (`session.setPlanMode`). The UI's plan/work toggle
is honored: the orchestrator sets plan mode explicitly before every turn
(`agentMode === 'plan'`), so unlike Codex the toggle stays enabled in the frontend.

### Sessions

- Session id persisted at `<project>/data/kimi-session.id` (separate from
  Anthropic's `session.id`, Codex's `codex-thread.id`, OpenCode's
  `opencode-session.id`).
- One long-lived CLI process per project, reused across turns while idle;
  recreated when the model config changes or the process died. Resume across
  backend restarts works by passing the stored `sessionId` to `createSession`.
- "Clear session" closes the live CLI process, deletes Kimi's on-disk session
  state (best-effort) and removes the id file.
- Manual compaction is **not** available (the CLI compacts automatically and
  the stream surfaces it as a `compaction` event).

### Per-project isolation: shareDir

The Kimi CLI normally reads global state from `~/.kimi` (config.toml, mcp.json,
session storage). Etienne pins `shareDir` to **`<project>/.kimi`**, so every
project gets isolated Kimi config/state and the user's global `~/.kimi` is
never touched. On first use a seed `config.toml` (template:
`backend/src/coding-agent-configuration/templates/kimi-config.toml`) is written
there so the CLI works headless without `kimi login`; it is also editable via
the coding-agent configuration dialog (admin → agent configuration → kimi-code).

### MCP

Kimi reads MCP servers from `<shareDir>/mcp.json` in the **same
`{"mcpServers": {...}}` schema** as the project's `.mcp.json`. Before each turn
the orchestrator translates the project's MCP config (stdio entries copied
as-is, `sse`/`http` entries reshaped to `{url, headers}`) into
`<project>/.kimi/mcp.json` — a near-identity copy, no bridge process.

### Skills

`skillsDir` is pointed at `<project>/.claude/skills` — Kimi consumes the same
skill layout as Claude Code, so existing project skills work without copying.

### Agent instructions

Like the other non-Anthropic agents, kimi-code uses **`AGENTS.md`** (not
`CLAUDE.md`) as the project mission file.

## Event mapping

| Kimi wire event | Etienne SSE `MessageEvent` | Notes |
|---|---|---|
| `ContentPart` text / think | `stdout` / `thinking` | text buffered when output guardrails are on |
| `ToolCall` | `tool_call` + `PreToolUse` hook | tool names normalized to Claude-style (`WriteFile`→`Write`, `Shell`→`Bash`, …) |
| `ToolResult` | `tool_result` (+ `file_added`/`file_changed` per diff block) + `PostToolUse`/file hooks | |
| `StatusUpdate` | `usage` → live `context_state` | cache-aware token buckets, same taxonomy as Anthropic |
| `CompactionBegin` | `compaction` + `PreCompact` hook | |
| `SubagentEvent` | `subagent_start` / `subagent_end` | Kimi's native subagents |
| `TurnEnd` | completion: `usage`, `Stop` hook, `telemetry`, `completed` | |

Hooks are emitted **in-process** from the orchestrator's event loop (the
pi-mono pattern) and tagged `source: 'kimi-code'` for the rule engine's
self-event suppression. `PreToolUse` is notification-time, not veto-time.

## Installation

1. **Install the Kimi CLI** (the SDK spawns it):
   - Windows (PowerShell): `Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression`
   - Linux/macOS: `curl -LsSf https://code.kimi.com/install.sh | bash`
   - With uv: `uv tool install --python 3.13 kimi-cli`
2. **Configure** `backend/.env`:

   ```env
   CODING_AGENT=kimi-code
   MOONSHOT_API_KEY=sk-...
   # optional:
   # KIMI_MODEL=kimi-for-coding     # defaults to the CLI's default_model
   # KIMI_THINKING=false            # thinking mode
   # KIMI_BINARY_PATH=kimi          # if `kimi` is not on the service PATH
   ```

3. **Restart the backend.**

The npm dependency is pinned exactly (`@moonshot-ai/kimi-agent-sdk@0.1.8`) —
the wire protocol is versioned and pre-1.0, so upgrade deliberately.

### Auth notes

The CLI documents `KIMI_API_KEY`; etienne's canonical env var is
`MOONSHOT_API_KEY`. The backend forwards the resolved key into the CLI process
as **both** names, so either works. Per-project keys can be set via
`<project>/.etienne/ai-model.json` (`token` field).

### Per-project model override

Same file and schema as OpenCode/pi-mono — `<project>/.etienne/ai-model.json`:

```json
{
  "isActive": true,
  "model": "kimi-for-coding",
  "baseUrl": "https://api.kimi.com/coding/v1",
  "token": "sk-..."
}
```

`model` → `KIMI_MODEL_NAME`, `baseUrl` → `KIMI_BASE_URL`, `token` → the API key
for this project. A change recreates the live CLI session on the next turn.

## Capability summary

| Feature | kimi-code |
|---|---|
| Streaming text / thinking | Yes / Yes |
| Tool calls & results in timeline | Yes (normalized names) |
| File-change events | Yes (from diff display blocks) |
| Plan mode | **Built-in** (`setPlanMode`) |
| Permission prompts | No — always yoloMode |
| MCP tools | Native (CLI MCP client via per-project `mcp.json`) |
| Agent skills | Yes (`skillsDir` → `.claude/skills`) |
| Subagents | Kimi-native (etienne subagent defs not translated yet) |
| Elicitations (questions) | Auto-answered (HITL wiring is a follow-up) |
| Session resume | Yes (incl. across backend restarts) |
| Stream replay on reload | Yes (StreamRelay) |
| Token/cost tracking | Yes, cache-aware |
| Guardrails in/out, memory, budget, telemetry | Yes |
| Manual compaction | No (auto-compaction only) |
| `maxTurns` | Ignored (CLI-internal max-steps) |

## Testing

- **Isolated SDK smoke test** (no backend needed):

  ```bash
  cd backend && npx tsx test/kimi-code-isolated.ts
  ```

  Creates a temp-dir session, prompts Kimi to write a file, dumps every raw
  stream event as JSON (ground truth for the event adapter), asserts
  `RunResult.status === 'finished'` and the file exists. `--mcp` additionally
  provisions a dummy stdio MCP server into the shareDir.

- **E2E over SSE**: set `CODING_AGENT=kimi-code`, restart the backend, then
  `curl -N "http://localhost:6060/api/claude/streamPrompt/sdk?project_dir=<p>&prompt=Say%20hello&token=<JWT>"` —
  expect `session` (process id `kimi_*`), `stdout`, `usage`, `completed`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Error mentions `CLI_NOT_FOUND` / `SPAWN_FAILED` | The `kimi` binary isn't on the backend's PATH. Install the CLI (see above) or set `KIMI_BINARY_PATH` to the full path (Windows uv installs to `%USERPROFILE%\.local\bin\kimi.exe`). |
| Auth errors despite MOONSHOT_API_KEY | Verify the key works with the CLI directly (`kimi` + `/login` status). Per-project `token` in `.etienne/ai-model.json` overrides the env key. |
| `SESSION_BUSY` errors | A previous turn is still running for that project — abort it first; concurrent prompts to one project are not supported. |
| Stale behavior after model change | The live CLI session is recreated on config change automatically; if in doubt, use "Clear session". |
| MCP server not visible to Kimi | Check `<project>/.kimi/mcp.json` was generated; remote servers need `url` (+ optional `headers`), stdio servers `command`/`args`. |
