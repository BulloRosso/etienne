# ADR-009: Messenger Integration -- Teams and Telegram

**Status:** Accepted
**Date:** 2026-05-06

## Context

Business users need mobile and desktop access to the AI agent beyond the web UI. Messenger platforms (Microsoft Teams, Telegram) provide existing user bases, push notification infrastructure, and ubiquitous mobile apps. However, security is paramount: all messenger users must be explicitly approved by an administrator before gaining agent access.

The challenge is bridging asynchronous messenger conversations with the real-time SSE-based backend while maintaining the same security and isolation guarantees as the web frontend.

## Decision

Each messenger is a **standalone provider service** (separate process) that connects to the Etienne backend via two channels:

1. **SSE listener** -- subscribes to `/api/remote-sessions/events/{provider}` for pairing approvals and system events
2. **REST API calls** -- forwards user messages to the backend session manager and receives agent responses

A **pairing protocol** with 6-character alphanumeric codes and mandatory admin approval ensures that no unauthorized user can access the agent.

```mermaid
flowchart TB
    subgraph "Messenger Providers"
        TG["Telegram Bot<br/>(Grammy SDK)"]
        MS["MS Teams Bot<br/>(Bot Framework)"]
    end
    
    subgraph "Backend"
        PS["PairingService"]
        RSM["RemoteSessionsService"]
        RSS["RemoteSessionsStorageService"]
        SE["SessionEventsService<br/>(SSE endpoint)"]
        ORCH["Active Orchestrator"]
    end
    
    subgraph "Frontend"
        MODAL["Pairing Approval<br/>Modal (admin)"]
    end
    
    TG & MS -->|"POST /pairing/request"| PS
    PS -->|"SSE interceptor-global"| MODAL
    MODAL -->|"POST /pairing/respond"| PS
    PS -->|"SSE provider events"| SE
    SE --> TG & MS
    
    TG & MS -->|"POST /message"| RSM
    RSM --> ORCH
    ORCH -->|"SSE interceptor"| RSM
    RSM -->|"response"| TG & MS

    style PS fill:#f9a825,stroke:#f57f17,color:#000
```

## Consequences

**Positive:**
- Users can interact with the agent from mobile devices without installing additional apps
- Push notifications from Telegram/Teams alert users to completed tasks or required input
- Admin approval gate prevents unauthorized access
- Each provider is a standalone optional service -- deploying without messengers requires no code changes
- HITL requests render natively (Telegram inline keyboards, Teams Adaptive Cards)

**Negative:**
- Telegram and Teams inherently depend on remote cloud services (Telegram Bot API, Azure Bot Service)
- Messenger UI limitations constrain rich output (no side-by-side artifact editing, limited markdown support)
- Each provider requires external setup (Telegram BotFather token, Azure Bot Service registration)
- Long agent responses must be split into chunks (Teams: 4KB limit, Telegram: 4096 char limit)

## Implementation Details

### Pairing protocol

```mermaid
sequenceDiagram
    participant User as Messenger User
    participant Bot as Provider Bot
    participant API as Backend API
    participant SSE as SSE Stream
    participant Admin as Admin (Web UI)

    User->>Bot: /start
    Bot->>API: POST /remote-sessions/pairing/request<br/>{provider, chatId, username}
    API->>API: Generate 6-char code<br/>(alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
    API->>SSE: emit pairing_request<br/>(interceptor-global channel)
    SSE->>Admin: Pairing approval modal
    Bot->>User: "Pairing code: X7K3M2<br/>Waiting for admin approval..."
    
    alt Admin approves
        Admin->>API: POST /pairing/respond {approved: true}
        API->>SSE: emit pairing_approved<br/>(provider events)
        SSE->>Bot: pairing approved
        Bot->>User: "Connected! Select a project."
    else Admin denies
        Admin->>API: POST /pairing/respond {approved: false}
        API->>SSE: emit pairing_denied
        SSE->>Bot: pairing denied
        Bot->>User: "Pairing denied by administrator."
    else Timeout (10 minutes)
        API->>Bot: pairing expired
        Bot->>User: "Pairing expired. Try /start again."
    end
```

**Code generation:** 30-character alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes ambiguous characters: `0`, `O`, `I`, `l`, `1`). Codes expire after 10 minutes.

### Provider comparison

| Feature | Telegram | MS Teams |
|---------|----------|----------|
| **SDK** | Grammy | Bot Framework (botbuilder) |
| **Transport** | Long polling | Azure Bot Service webhook |
| **Port** | 6350 | 6200 |
| **Rich UI** | Inline keyboards | Adaptive Cards |
| **File support** | Photos, documents, video, audio | Attachments via Bot connector |
| **Message limit** | 4096 characters | ~4KB |
| **Commands** | `/start`, `/status`, `/projects`, `/disconnect`, `/help` | Same set |
| **External setup** | BotFather token | Azure App Registration + Bot Service |
| **HITL rendering** | Inline keyboard buttons | Adaptive Card with action buttons |

### Message flow (after pairing)

```mermaid
sequenceDiagram
    participant User as Messenger User
    participant Bot as Provider Bot
    participant SMC as SessionManagerClient
    participant Backend as Etienne Backend
    participant SSE as SSE Events

    User->>Bot: "Analyze this quarter's sales data"
    Bot->>Bot: Show typing indicator
    Bot->>SMC: POST /remote-sessions/message<br/>{provider, chatId, text}
    SMC->>Backend: Forward to active orchestrator
    Backend->>SSE: Streaming response events
    SSE->>SMC: Collect response chunks
    SMC->>Bot: Complete response
    Bot->>Bot: Split if > message limit
    Bot->>User: Response message(s)
    Bot->>User: Token usage summary
```

### Natural language commands

Beyond slash commands, users can use natural language patterns:
- `project 'project-name'` -- select a project
- `show me <filename>` -- request a file download
- `download <filename>` -- request a file download
- `get <filename>` -- request a file download

### Key source files

- `backend/src/remote-sessions/pairing.service.ts` -- pairing protocol and code generation
- `backend/src/remote-sessions/remote-sessions.service.ts` -- session management
- `backend/src/remote-sessions/session-events.service.ts` -- SSE events for providers
- `backend/src/remote-sessions/remote-sessions-storage.service.ts` -- persistent session storage
- `telegram/src/bot.ts` -- Telegram bot implementation
- `telegram/src/services/session-manager-client.service.ts` -- REST client to backend
- `telegram/src/services/sse-listener.service.ts` -- SSE subscription
- `ms-teams/src/bot.ts` -- Teams bot implementation (TeamsBot extends ActivityHandler)
- `ms-teams/src/services/session-manager-client.service.ts` -- REST client to backend
- `ms-teams/src/services/sse-listener.service.ts` -- SSE subscription

## Base Value Alignment

| Base Value | Alignment |
|-----------|-----------|
| **1. Data Isolation** | Pairing data and session mappings stored locally in the backend. No project data transits through cloud messenger APIs beyond message text. |
| **2. Exchangeable Inner Harness** | Messenger integration is agent-agnostic -- it uses the shared SSE pipeline regardless of which orchestrator is active |
| **3. Rich Configuration** | Each provider has its own `.env` configuration. Pairing is admin-managed. |
| **4. Composable Services** | Each messenger is an optional standalone service, managed via the process manager |
| **5. Agentic Engineering** | The messenger bot code was itself developed with agentic engineering |

**Violations:** Telegram and Teams inherently involve remote service dependencies (Telegram Bot API servers, Azure Bot Service). This is an accepted trade-off: reaching users on their preferred platforms requires using those platforms' APIs. Mitigated by: messenger services are optional, project data beyond message text is not transmitted to messenger APIs, and pairing requires explicit admin approval.
