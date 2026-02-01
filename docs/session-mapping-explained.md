# Session Mapping Architecture

This document explains how Claude internal sessions map to external provider sessions (Telegram, Teams, etc.) in the Etienne multi-tenant system.

## Overview

The system uses a multi-level session mapping architecture to bridge external messaging platforms with Claude's internal session management.

```
External Provider (Telegram/Teams)
         ↓
    chatId (provider-specific identifier)
         ↓
RemoteSessionMapping (bridge entity)
         ↓
Claude Internal Session (per-project)
```

## 1. Claude Internal Sessions

Internal sessions are **per-project** and stored in the project's `.etienne/` directory.

### Storage Structure

```
workspace/<project-name>/
└── .etienne/
    ├── chat.sessions.json              # Session metadata (all sessions)
    ├── chat.history-{sessionId}.jsonl  # Chat messages (one file per session)
    └── [other project files]
```

### Session Metadata

Located in `chat.sessions.json`:

```typescript
interface SessionMetadata {
  timestamp: string;              // Last activity timestamp
  sessionId: string;              // UUID - unique session identifier
  summary?: string;               // Auto-generated summary
  activeContextId?: string | null;
}
```

### Chat Messages

Stored in JSONL format (one JSON object per line) in `chat.history-{sessionId}.jsonl`:

```typescript
interface ChatMessage {
  timestamp: string;
  isAgent: boolean;              // true = assistant, false = user
  message: string;
  costs?: {
    input_tokens: number;
    output_tokens: number;
  };
  source?: 'web' | 'remote' | 'scheduled' | 'automated';
  sourceMetadata?: {
    provider?: string;           // 'telegram', 'teams', etc.
    username?: string;
    firstName?: string;
  };
}
```

## 2. Remote Session Mapping

Remote sessions bridge external providers to Claude internal sessions.

### Storage Location

Global storage at `backend/.etienne/remote-sessions.json`:

```json
{
  "remote-sessions": [...],
  "pending-pairings": [...]
}
```

### Pending Pairing (Pre-Authorization)

When a user initiates pairing from an external provider:

```typescript
interface PendingPairing {
  id: string;                    // UUID
  code: string;                  // 6-char alphanumeric code (e.g., "ABC123")
  provider: 'telegram' | 'teams';
  remoteSession: {
    chatId: number | string;     // Numeric for Telegram, string for Teams
    userId?: number | string;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
  created_at: string;
  expires_at: string;            // 10-minute timeout
}
```

### Active Session Mapping

After pairing approval:

```typescript
interface RemoteSessionMapping {
  id: string;                    // UUID - mapping identifier
  provider: 'telegram' | 'teams';
  created_at: string;
  updated_at: string;
  project: {
    name: string;                // Claude project name
    sessionId: string;           // Claude internal session ID
  };
  remoteSession: {
    chatId: number | string;
    userId?: number | string;
    username?: string;
    firstName?: string;
  };
  status: 'active' | 'paused' | 'disconnected';
}
```

## 3. ID Mapping Chain

The system uses multiple levels of identifiers:

```
┌─────────────────────────────────────────────────────────────────┐
│ External Provider (Telegram/Teams)                              │
│   chatId: 8587702736                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PendingPairing (temporary, until approved)                      │
│   id: "a1b2c3d4-..."                                            │
│   code: "ABC123"                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓ [User approval]
┌─────────────────────────────────────────────────────────────────┐
│ RemoteSessionMapping (persistent bridge)                        │
│   id: "e1d99930-6f55-482e-a957-cdd8b67ca1df"                   │
│   project.name: "telegram"                                      │
│   project.sessionId: "3f3a7895-62e1-474b-a668-5d568f555873"    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Claude Internal Session                                         │
│   sessionId: "3f3a7895-62e1-474b-a668-5d568f555873"            │
│   Stored in: workspace/telegram/.etienne/                       │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Pairing Flow

```
1. User sends /start to Telegram bot
   → Bot calls: POST /api/remote-sessions/pairing/request
   → Backend creates PendingPairing with 6-char code
   → Backend emits SSE 'pairing_request' to frontend

2. Admin sees pairing modal in frontend
   → Admin clicks Approve/Deny
   → Frontend calls: POST /api/remote-sessions/pairing/respond

3. On approval:
   → Backend converts PendingPairing → RemoteSessionMapping
   → Backend emits SSE 'pairing_approved' to Telegram bot
   → User receives confirmation in Telegram

4. User selects project: /project myproject
   → Bot calls: POST /api/remote-sessions/project
   → Backend links mapping to Claude project session
```

## 5. Message Flow

When a remote user sends a message:

```
Telegram User: "What files are here?"
         ↓
POST /api/remote-sessions/message
    { chatId: 8587702736, message: "What files are here?" }
         ↓
RemoteSessionsService.forwardMessage()
    1. Lookup RemoteSessionMapping by chatId
    2. Get project name and sessionId
    3. Emit SSE 'chat_message' (user) to frontend
         ↓
POST /api/claude/unattended/{project}
    { prompt: "What files are here?", source: "Remote: Evnw", ... }
         ↓
Claude processes request
         ↓
Response returned
    1. Emit SSE 'chat_message' (assistant) to frontend
    2. Persist to chat.history-{sessionId}.jsonl
    3. Return response via HTTP to Telegram bot
         ↓
Telegram bot sends response to user
```

## 6. SSE Event System

### InterceptorsService (Project-based SSE)

Frontend connects to: `GET /api/interceptors/stream/{project}`

Events:
- `pairing_request` - New pairing needs approval
- `chat_message` - Message from/to remote provider
- `permission_request` - Tool usage approval needed
- `elicitation_request` - User input needed

### SessionEventsService (Provider-based SSE)

Providers connect to: `GET /api/remote-sessions/events/{provider}`

Events:
- `pairing_approved` - Pairing succeeded
- `pairing_denied` - Pairing rejected
- `etienne_response` - Claude response (for async scenarios)
- `error` - Processing error

## 7. Lookup Examples

### Find Claude session from Telegram chatId

```typescript
// 1. Find remote session mapping
const mapping = await storage.findByChatId(8587702736);
// mapping.project.sessionId = "3f3a7895-..."

// 2. Load chat history
const history = await sessionsService.loadSessionHistory(
  'workspace/telegram',
  mapping.project.sessionId
);
```

### Get all sessions for a project

```typescript
const sessions = await sessionsService.getSessionsMetadata('workspace/telegram');
// Returns array of SessionMetadata
```

## 8. Key Services

| Service | Responsibility |
|---------|---------------|
| `RemoteSessionsService` | Orchestrates remote session operations |
| `RemoteSessionsStorageService` | CRUD for remote-sessions.json |
| `PairingService` | Manages pairing workflow |
| `SessionEventsService` | SSE events to providers |
| `SessionsService` | Claude internal session management |
| `InterceptorsService` | SSE events to frontend |

## 9. File Reference

| File | Purpose |
|------|---------|
| `backend/.etienne/remote-sessions.json` | Global remote session state |
| `workspace/<project>/.etienne/chat.sessions.json` | Project session metadata |
| `workspace/<project>/.etienne/chat.history-{id}.jsonl` | Chat messages |
| `backend/src/remote-sessions/interfaces/` | Type definitions |
| `backend/src/remote-sessions/*.service.ts` | Remote session services |
| `backend/src/sessions/sessions.service.ts` | Internal session service |
