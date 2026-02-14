# Codex SDK — Elicitation & Approval Bridge

This module integrates the OpenAI Codex app-server with the existing SSE eventing infrastructure used by the Anthropic Claude SDK. The Codex app-server communicates via a custom JSON-RPC protocol over JSONL (stdin/stdout), while the frontend expects events delivered through SSE streams and responses submitted via HTTP POST endpoints.

The bridge translates between these two worlds without modifying the existing SSE eventing layer (`InterceptorsService`, `SdkPermissionController`, etc.).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Codex App-Server (Rust)                         │
│                   spawned as child process via stdio                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ JSONL over stdin/stdout
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│                         CodexSdkService                                │
│  - Spawns & manages the app-server process                             │
│  - Parses JSONL with three-way routing:                                │
│      id + method  → server request  (AppServerMessage._type='request') │
│      id only      → client response (resolves pending promise)         │
│      method only  → notification    (AppServerMessage._type='notification')│
│  - sendRequest()  → writes client-initiated JSON-RPC requests          │
│  - sendResponse() → writes JSON-RPC responses for server requests      │
│  - streamConversation() → async generator yielding AppServerMessage    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ AsyncGenerator<AppServerMessage>
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    CodexSdkOrchestratorService                          │
│  - Consumes the async generator                                        │
│  - Routes messages by _type:                                           │
│      'request'      → delegates to CodexPermissionService              │
│      'notification' → transforms to SSE MessageEvent (existing flow)   │
│  - Emits "running" tool events for visual feedback during approvals    │
└──────────┬──────────────────────────────────────────────────────────────┘
           │                                           │
           │ fire-and-forget                           │ observer.next()
           ▼                                           ▼
┌──────────────────────────┐              ┌────────────────────────────┐
│  CodexPermissionService  │              │  SSE Stream (Observable)   │
│                          │              │  → frontend via EventSource│
│  - Maps Codex methods    │              └────────────────────────────┘
│    to SSE event types    │
│  - Manages pending       │
│    promises (UUID-keyed) │
│  - Transforms responses  │
│    back to JSON-RPC      │
└──────────┬───────────────┘
           │ emitPermissionRequest() / emitAskUserQuestion()
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      InterceptorsService (UNCHANGED)                    │
│  - Broadcasts SSE events to project-scoped ReplaySubject               │
│  - Frontend receives via GET /api/interceptors/stream/:project         │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼ SSE event received by frontend
           │
           │ User makes decision in UI
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   CodexPermissionController                             │
│  POST /api/codex/permission/respond                                    │
│  { id, action: 'allow'|'deny'|'cancel', updatedInput?, message? }      │
│                          │                                              │
│  → CodexPermissionService.handleResponse()                              │
│  → Resolves pending promise                                             │
│  → Transforms to Codex JSON-RPC response format                        │
│  → CodexSdkService.sendResponse(jsonRpcId, result)                     │
│  → App-server receives response via stdin, continues execution          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Codex Protocol → SSE Event Mapping

### Approval Requests

| Codex Method | SSE Event Type | SSE toolName | Description |
|---|---|---|---|
| `item/commandExecution/requestApproval` | `permission_request` | `Bash` | Shell command needs user approval |
| `item/fileChange/requestApproval` | `permission_request` | `Edit` | File modification needs user approval |

**Codex request example:**
```json
{
  "method": "item/commandExecution/requestApproval",
  "id": 42,
  "params": {
    "itemId": "call_abc123",
    "parsedCmd": { "command": "npm", "args": ["test"], "cwd": "/project" },
    "reason": "Running test suite",
    "risk": "low",
    "commandActions": ["allow_once", "allow_session", "decline"]
  }
}
```

**Mapped SSE event (emitPermissionRequest):**
```json
{
  "type": "permission_request",
  "data": {
    "id": "uuid-generated-by-service",
    "toolName": "Bash",
    "toolInput": {
      "command": "npm test",
      "cwd": "/project",
      "reason": "Running test suite",
      "risk": "low"
    }
  }
}
```

**Frontend response (POST /api/codex/permission/respond):**
```json
{ "id": "uuid-from-sse-event", "action": "allow" }
```

**Translated JSON-RPC response (sent to app-server stdin):**
```json
{ "id": 42, "result": { "decision": "accept", "acceptSettings": { "forSession": false } } }
```

### User Input Requests

| Codex Method | SSE Event Type | Description |
|---|---|---|
| `tool/requestUserInput` | `ask_user_question` | Structured multi-question prompt with predefined options |
| `agent/requestUserInput` | `ask_user_question` | Free-form text input (wrapped as single question) |
| `agent/askUserQuestion` | `ask_user_question` | Constrained-answer questionnaire with multi-choice support |

**Codex structured input example:**
```json
{
  "method": "tool/requestUserInput",
  "id": 44,
  "params": {
    "questions": [
      { "text": "Which framework?", "options": ["Express", "Fastify"], "isOther": true }
    ]
  }
}
```

**Mapped SSE event (emitAskUserQuestion):**
```json
{
  "type": "ask_user_question",
  "data": {
    "id": "uuid-generated-by-service",
    "questions": [{
      "question": "Which framework?",
      "header": "Which frame",
      "options": [
        { "label": "Express", "description": "Express" },
        { "label": "Fastify", "description": "Fastify" }
      ],
      "multiSelect": false
    }]
  }
}
```

**Frontend response:**
```json
{ "id": "uuid-from-sse-event", "action": "allow", "updatedInput": { "answers": { "q0": "Express" } } }
```

**Translated JSON-RPC response:**
```json
{ "id": 44, "result": { "answers": [{ "questionIndex": 0, "selected": "Express" }] } }
```

### Response Transformation Summary

| Frontend Action | Approval Requests | User Input Requests |
|---|---|---|
| `action: 'allow'` | `{ decision: 'accept', acceptSettings: { forSession: false } }` | `{ answers: [...] }` or `{ userInput: "..." }` |
| `action: 'deny'` | `{ decision: 'decline' }` | JSON-RPC error `{ code: -32000, message: 'User cancelled' }` |
| Timeout | `{ decision: 'decline' }` | JSON-RPC error `{ code: -32000, message: 'User input timed out' }` |

## JSONL Three-Way Routing

The app-server sends three types of messages over stdout, all as JSON Lines:

| Message Type | Has `id`? | Has `method`? | Handling |
|---|---|---|---|
| Client response | Yes | No | Resolves the pending `sendRequest()` promise |
| Server notification | No | Yes | Pushed to AsyncQueue as `_type: 'notification'` |
| Server request | Yes | Yes | Pushed to AsyncQueue as `_type: 'request'` |

The `_type` discriminator field is added by `CodexSdkService` during parsing and is used by the orchestrator to route messages to either the notification switch statement (existing behavior) or the permission service (new behavior).

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CODEX_APPROVAL_POLICY` | `on-failure` | Approval policy sent to the app-server. Options: `never`, `on-failure`, `on-request`, `untrusted` |
| `CODEX_PERMISSION_TIMEOUT_MS` | `300000` (5 min) | How long to wait for a frontend response before auto-declining |

Setting `CODEX_APPROVAL_POLICY=never` disables all approval requests — the app-server will never send `requestApproval` messages, and the new code paths are never triggered. This is the previous default behavior.

## File Overview

| File | Purpose |
|---|---|
| `codex.config.ts` | Configuration: approval policy, timeout, model, paths |
| `codex-sdk.service.ts` | App-server process lifecycle, JSONL parsing, three-way routing, `sendResponse()` |
| `codex-sdk-orchestrator.service.ts` | Consumes message stream, routes requests vs notifications, integrates guardrails/memory/telemetry |
| `codex-permission.service.ts` | Maps Codex approval/elicitation methods to SSE events, manages pending promises, transforms responses |
| `codex-permission.controller.ts` | HTTP endpoint `POST /api/codex/permission/respond` for frontend responses |
| `codex-message-transformer.ts` | Static helpers for transforming notifications to SSE `MessageEvent` format |
| `codex-session-manager.service.ts` | Thread persistence and session tracking |

## Comparison with Anthropic SDK Permission Flow

| Aspect | Anthropic SDK | Codex SDK |
|---|---|---|
| Permission service | `SdkPermissionService` | `CodexPermissionService` |
| Controller | `SdkPermissionController` at `/api/claude/permission/respond` | `CodexPermissionController` at `/api/codex/permission/respond` |
| Trigger mechanism | `canUseTool` callback from Agent SDK | Server-initiated JSON-RPC requests from app-server |
| Response delivery | Returned as `PermissionResult` to SDK callback | Written as JSON-RPC response to app-server stdin |
| SSE events used | `emitPermissionRequest`, `emitAskUserQuestion`, `emitPlanApproval` | `emitPermissionRequest`, `emitAskUserQuestion` |
| Timeout | 60 seconds (SDK constraint) | 5 minutes (configurable) |

Both flows reuse the same `InterceptorsService` for SSE delivery and the same frontend UI components for rendering dialogs.

## Endpoint Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/codex/permission/respond` | Submit approval/question response from frontend |
| `GET` | `/api/codex/permission/pending` | List pending approval requests (debugging) |
