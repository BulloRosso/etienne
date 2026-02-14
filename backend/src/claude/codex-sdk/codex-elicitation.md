# How Codex's VS Code plugin handles modal dialogs without MCP elicitation

**The Codex VS Code extension bypasses MCP elicitation entirely by using a custom bidirectional JSON-RPC protocol over stdio** to communicate with a locally spawned `codex app-server` process. When the agent needs user input—whether for approving a shell command, confirming a file edit, or asking a clarifying question—the app-server sends a server-initiated JSON-RPC request to the extension, which renders the appropriate UI and returns the user's decision. This architecture emerged because OpenAI found that "maintaining MCP semantics in a way that made sense for VS Code proved difficult," leading them to build an independent protocol with richer interaction primitives than MCP elicitation provides.

## The app-server sits between the extension and the agent loop

The VS Code extension (marketplace ID: `openai.chatgpt`, closed source) bundles a platform-specific Codex binary and spawns it as a child process running `codex app-server`. All communication flows through **JSONL (JSON Lines) over stdin/stdout pipes**, using a "JSON-RPC lite" format—structurally JSON-RPC 2.0 but omitting the `"jsonrpc": "2.0"` header. The extension identifies itself as `clientInfo.name: "codex_vscode"`.

Internally, the app-server (written in Rust, open source at `github.com/openai/codex/codex-rs/app-server/`) contains four components: a **stdio reader** that ingests JSONL from the client, a **message processor** that routes JSON-RPC messages, a **thread manager** that orchestrates conversation sessions, and **core threads** running the actual Codex agent loop from `codex-core`. This architecture means every Codex surface—CLI TUI, VS Code extension, macOS app—shares the identical agent harness. One client request can trigger many streamed event notifications, enabling the extension to build rich, responsive UI on top of a simple pipe transport.

The protocol organizes work into three nested primitives: **threads** (conversations), **turns** (a single user request plus the agent's response), and **items** (atomic I/O units like messages, command executions, file changes, or approval requests). Clients can generate TypeScript or JSON Schema bindings from the app-server itself, ensuring type safety across the boundary.

## Server-initiated requests drive all approval and dialog flows

The core mechanism for modal dialogs is **server-initiated JSON-RPC requests flowing from the app-server to the VS Code extension**. Unlike MCP elicitation's single `elicitation/create` method, the Codex protocol defines multiple specialized request types, each carrying rich metadata tailored to its use case.

### Command execution approval

When the agent wants to run a shell command that falls outside the current approval policy, the app-server emits a `item/commandExecution/requestApproval` request. The structure includes:

```json
{
  "method": "item/commandExecution/requestApproval",
  "id": 42,
  "params": {
    "itemId": "call_abc123",
    "threadId": "thr_xyz",
    "turnId": "turn_456",
    "parsedCmd": {
      "command": "npm",
      "args": ["test"],
      "cwd": "/Users/me/project"
    },
    "reason": "Running test suite to verify changes",
    "risk": "low",
    "commandActions": ["allow_once", "allow_session", "decline"]
  }
}
```

The extension renders this as a modal dialog showing the proposed command, its risk level, and action buttons. The user responds with:

```json
{
  "id": 42,
  "result": {
    "decision": "accept",
    "acceptSettings": {
      "forSession": false
    }
  }
}
```

Or to decline:

```json
{
  "id": 42,
  "result": {
    "decision": "decline"
  }
}
```

The `acceptSettings.forSession` field allows users to approve commands for the duration of the session without repeated prompts. Once the response is received, the server either executes the command or aborts, then emits `item/completed` with the final status.

### File change approval

File modifications follow an identical pattern via `item/fileChange/requestApproval`, which includes diff chunk summaries:

```json
{
  "method": "item/fileChange/requestApproval",
  "id": 43,
  "params": {
    "itemId": "file_edit_789",
    "threadId": "thr_xyz",
    "turnId": "turn_456",
    "changes": [
      {
        "path": "src/app.ts",
        "type": "update",
        "summary": "Add error handling to main function"
      }
    ],
    "reason": "Implementing requested error handling"
  }
}
```

The client responds with the same `{ "decision": "accept" | "decline" }` structure. After approval, the server applies the patch and returns `item/completed` with status `completed`, `failed`, or `declined`.

### Structured user input (experimental)

For clarifying questions during tool execution, the experimental `tool/requestUserInput` method prompts the user with 1–3 short questions:

```json
{
  "method": "tool/requestUserInput",
  "id": 44,
  "params": {
    "questions": [
      {
        "text": "Which backend framework?",
        "options": ["Express", "Fastify", "Koa"],
        "isOther": true
      },
      {
        "text": "Database preference?",
        "options": ["PostgreSQL", "MongoDB", "SQLite"],
        "isOther": false
      }
    ],
    "toolCallId": "tool_call_123"
  }
}
```

The `isOther` flag allows a free-form text input if none of the predefined options fit. The client responds with selected answers:

```json
{
  "id": 44,
  "result": {
    "answers": [
      { "questionIndex": 0, "selected": "Express" },
      { "questionIndex": 1, "selected": "PostgreSQL" }
    ]
  }
}
```

Or if the user cancels:

```json
{
  "id": 44,
  "error": {
    "code": -32000,
    "message": "User cancelled input"
  }
}
```

The tool call completes with an error if the user declines. A session-scoped "Allow and remember" option was added for repeated tool approvals.

### Free-form user input

The `request_user_input` core agent tool (distinct from the structured variant above) is available only in Plan and Pair collaboration modes. When invoked, it sends a server request that the extension renders as an open-ended text prompt:

```json
{
  "method": "agent/requestUserInput",
  "id": 45,
  "params": {
    "prompt": "What is the target deployment platform?",
    "toolCallId": "tool_call_456"
  }
}
```

Response:

```json
{
  "id": 45,
  "result": {
    "userInput": "AWS Lambda with Node.js 20 runtime"
  }
}
```

In non-interactive `codex exec` mode, this tool is removed from the toolset entirely to prevent blocking.

### Constrained-answer questionnaires

A newer `ask_user_question` tool (tracked in GitHub Issue #9926) adds tabbed questionnaire UI for single-choice and multiple-choice questions. Each question can include an `isOther` option for custom input. In the CLI TUI, this renders as tabs with keyboard navigation. The protocol event structure (still experimental) would look like:

```json
{
  "method": "agent/askUserQuestion",
  "id": 46,
  "params": {
    "questions": [
      {
        "type": "single_choice",
        "text": "Select deployment target",
        "options": ["AWS", "Azure", "GCP"],
        "allowOther": true
      },
      {
        "type": "multi_choice",
        "text": "Select features to include",
        "options": ["Auth", "Logging", "Metrics", "Alerts"]
      }
    ]
  }
}
```

The user navigates through tabs, makes selections, and submits. Cancel aborts the tool call; Submit returns only the selected answers.

## Event sequence for a complete approval flow

Here's the complete wire sequence for a command execution approval:

1. **User sends input**: Client calls `turn/start` with `{ "input": [{ "type": "text", "text": "Run tests" }] }`
2. **Turn begins**: Server responds with turn object and emits `turn/started` notification
3. **Agent plans command**: Server emits `item/started` notification with `commandExecution` item containing command details, cwd, status `inProgress`
4. **Approval requested**: Server sends `item/commandExecution/requestApproval` JSON-RPC request (has `id` field, requires response)
5. **User decides**: Extension renders modal, user clicks "Allow", extension sends response `{ "decision": "accept" }`
6. **Command executes**: Server runs command, streams output via `item/commandExecution/outputDelta` notifications
7. **Command completes**: Server emits `item/completed` with final `commandExecution` item including `status: "completed"`, `exitCode: 0`, `aggregatedOutput`, `durationMs`
8. **Turn finishes**: Server emits `turn/completed` with token usage and final status

## Why MCP elicitation was set aside—and what replaced it

OpenAI explicitly attempted to expose Codex as an MCP server first but abandoned the approach for the VS Code integration. The **custom app-server protocol** replaced MCP elicitation because it offers:

- **Multiple specialized request types** rather than a single generic form mode
- **Richer metadata per request**: parsed commands, risk levels, diff views, structured question schemas
- **Bidirectional streaming** for real-time progress updates
- **Tighter control over interaction lifecycle**: session-scoped approvals, cancellation semantics, timeout handling
- **Type-safe code generation**: clients can generate TypeScript or JSON Schema bindings directly from the Rust protocol definitions

The relationship between Codex and MCP elicitation is nuanced:

- **When Codex acts as an MCP server** (`codex mcp-server`), it does use MCP elicitation to request exec and patch approvals from external MCP clients, correlating responses via a `HashMap<RequestId, oneshot::Sender<r>>`
- **When Codex acts as an MCP client** connecting to external MCP servers, it advertises `"capabilities": {"elicitation": {}}` during handshake but historically **auto-declined all incoming elicitation requests**—a bug tracked as `CODEX-3571` and GitHub Issue #6992
- The issue has since been closed, suggesting client-side elicitation support was eventually implemented, though the changelog doesn't explicitly confirm full support

Beyond protocol-level mechanisms, Codex employs complementary strategies to reduce runtime user interaction:

- **Approval policies** (untrusted, on-failure, on-request, never) control which actions need explicit confirmation
- **AGENTS.md files** provide persistent configuration and constraints
- **Rules files** (`.rules`) define per-command approval policies
- **Mid-turn steering** lets users inject instructions while the agent works without a formal dialog

For cloud tasks running in sandboxed containers, the system is fundamentally asynchronous—users review results after completion rather than approving actions in real time.

## TypeScript protocol bindings

All protocol types are defined in `codex-rs/app-server-protocol/src/protocol/v2.rs` and `common.rs`. Experimental features are gated behind `#[experimental("method/name")]` annotations that clients opt into via `capabilities.experimentalApi`. Fields use camelCase on the wire via Serde renaming.

Clients can auto-generate TypeScript bindings:

```bash
codex app-server generate-ts --out ./schemas
```

Or JSON Schema:

```bash
codex app-server generate-json-schema --out ./schemas
```

Client SDKs exist in **Go, Python, TypeScript, Swift, and Kotlin**, all built from these generated schemas to ensure version compatibility.

## Conclusion

The Codex VS Code extension solves the user-interaction problem through architectural separation rather than protocol conformance. By spawning a local app-server process and communicating over a purpose-built JSON-RPC protocol, OpenAI gained fine-grained control over approval flows, structured questions, and free-form input collection—capabilities that MCP elicitation's single generic form mode could not adequately express. The key insight is that **the app-server protocol is not a workaround for missing MCP elicitation but a deliberate replacement** designed for richer IDE interactions. MCP elicitation remains relevant only at the boundaries: when Codex exposes itself as an MCP server to external clients, or when Codex's own MCP client handles elicitation from external servers.