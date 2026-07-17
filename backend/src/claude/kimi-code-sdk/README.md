# Kimi Code SDK Adapter

Coding-agent adapter for **Moonshot's Kimi Agent SDK** (`@moonshot-ai/kimi-agent-sdk`).
Activated with `CODING_AGENT=kimi-code`. See the repo-root [`kimi_3_sdk.md`](../../../../kimi_3_sdk.md)
for the full integration guide (installation, env vars, capability matrix, troubleshooting).

## Architecture

The SDK is an in-process npm library, but it spawns the **Kimi CLI** (a separately
installed Python tool) as its execution engine — one CLI process per live session.

```
Frontend ── SSE ── ClaudeController ── KimiCodeOrchestratorService
                                          │  streamPrompt / attach / abort / clearSession
                                          ├─ KimiCodeSdkService ── createSession() ─→ kimi CLI (subprocess)
                                          ├─ KimiCodeSessionManagerService (data/kimi-session.id)
                                          ├─ kimi-code-event-adapter (StreamEvent → MessageEvent)
                                          └─ kimi-mcp-config.provisioner (<project>/.kimi/mcp.json)
```

- **One live session per project**, cached in `KimiCodeSdkService` and reused across
  turns while `state === 'idle'`; recreated when the resolved model config changes
  (signature mismatch) or the CLI process died.
- **shareDir is pinned to `<project>/.kimi`** — config.toml, mcp.json and Kimi's
  session storage are per-project; the user's global `~/.kimi` is never touched.
- **skillsDir points at `<project>/.claude/skills`** — Kimi consumes the same skill
  layout as Claude Code, so no copy provisioning is needed.
- **Always `yoloMode: true`** — permission bridging is intentionally not wired.
  Stray `ApprovalRequest`s are auto-approved; `QuestionRequest`s auto-answered with
  the first option (proper HITL question wiring is a follow-up).
- **Native plan mode**: the UI's plan/work toggle maps to `session.setPlanMode(...)`,
  set explicitly before every turn.

## Event mapping

| Kimi `StreamEvent` | `MessageEvent` |
|---|---|
| `ContentPart` (text) | `stdout` (buffered when output guardrails are enabled) |
| `ContentPart` (think) | `thinking` |
| `ToolCall` | `tool_call` (name normalized via `kimi-tool-name.util`, args JSON-parsed) + `PreToolUse` hook |
| `ToolResult` | `tool_result` + one `file_added`/`file_changed` per `diff` display block + `PostToolUse`/file hooks |
| `StatusUpdate` (token_usage) | `usage` (accumulated; live `context_state` derived in orchestrator) |
| `CompactionBegin` | `compaction` + `PreCompact` hook |
| `SubagentEvent` | `subagent_start` (first per parent tool call) / `subagent_end` (inner `TurnEnd`) |
| `ApprovalRequest` | auto-approved (`status: auto_approved` event) — should not occur under yoloMode |
| `QuestionRequest` | auto-answered with first options (warn-logged) |
| `TurnEnd` | completion sequence: guardrail flush → `usage` → `Stop` hook → `telemetry` → `completed` |
| `TurnBegin`/`StepBegin`/`ToolCallPart`/`CompactionEnd`/`ParseError`/media parts | ignored (ParseError warn-logged) |

Token accounting: Kimi's `token_usage` buckets (`input_other`, `output`,
`input_cache_read`, `input_cache_creation`) map 1:1 onto the shared `Usage`
shape (same taxonomy as Anthropic), so budget tracking is cache-aware.

## Hooks

In-process emission from the orchestrator's event loop via `SdkHookEmitterService`
(the pi-mono pattern — no plugin bridge like OpenCode needs): `UserPromptSubmit`,
`SessionStart` (first turn), `PreToolUse`/`PostToolUse`, `file_added`/`file_changed`,
`PreCompact`, `Stop`. Events are tagged `source: 'kimi-code'` for the rule engine's
self-event suppression. Note `PreToolUse` is notification-time, not veto-time —
under yoloMode the tool has already been approved.

## Model configuration

Precedence: `<project>/.etienne/ai-model.json` (`model`/`baseUrl`/`token`, when
`isActive`) → env `KIMI_MODEL`/`KIMI_THINKING` → the CLI's own `default_model`.
The resolved API key is forwarded into the CLI process as **both** `KIMI_API_KEY`
and `MOONSHOT_API_KEY`; a base URL becomes `KIMI_BASE_URL`, the model
`KIMI_MODEL_NAME`. A seed `config.toml` (from
`coding-agent-configuration/templates/kimi-config.toml`) is written to
`<project>/.kimi/config.toml` on first use so the CLI works without `kimi login`.

## Known gaps (v1)

- **Manual compaction**: the SDK exposes no trigger; the CLI compacts automatically
  (`CompactionBegin/End` are surfaced). `compactSession` returns `success: false`.
- **`maxTurns` is ignored** — no per-turn step cap parameter in the SDK; the CLI
  enforces its own max-steps (`RunResult.status === 'max_steps_reached'`).
- **Subagents**: Kimi's own subagent system runs natively; etienne's
  `.claude/agents/*.md` definitions are not translated (follow-up).
- **QuestionRequest HITL**: auto-answered instead of surfaced as a dialog.
- Media content parts (image/audio/video) are not rendered.
