---
name: world-model
description: "Use this skill to understand Etienne's system architecture, service dependencies, and data layout. Consult when reasoning about what services are available, what credentials are needed, where project data lives, how skills depend on backend modules and external services, or how the UI viewer system works. Trigger phrases: 'what services are running', 'system architecture', 'what depends on what', 'where is the data stored', 'what credentials do I need', 'how does the viewer work'."
---

# Etienne World Model

Etienne is an **integration harness** around a **coding agent harness** (Claude SDK / Codex SDK). It wraps the agentic coding cycle with business-grade features: role-based access control, knowledge graphs, skill management, budget monitoring, deterministic workflows, and a rich artifact UI. Everything is scoped to **projects** in a mounted workspace volume. This document describes the system in 7 layers — from raw project data up to UI rendering — so you can reason about what exists, what depends on what, and what is available.

---

## Layer 1: Project Data

Each project lives in `workspace/<project-name>/` and contains all data scoped to that mission. Nothing bleeds between projects.

```
workspace/<project-name>/
├── .claude/
│   ├── CLAUDE.md              # System prompt / role definition for the coding agent
│   └── settings.json          # Coding agent settings (MCP servers, permissions, model)
├── .etienne/
│   ├── scrapbook.json         # Default scrapbook canvas state (node positions, viewport)
│   ├── scrapbook.<name>.json  # Named scrapbook canvas state
│   ├── ai-model.json          # Alternative AI model override
│   ├── previewers.json        # Project-level viewer overrides
│   └── agent-logs/            # Agent bus JSONL traces (cms, dss, swe channels)
├── data/
│   └── permissions.json       # Tool permission allowlists
├── out/                       # Output files produced by the agent
├── knowledge-graph/           # Project-scoped knowledge graph data
├── workflows/                 # XState workflow definitions (.workflow.json)
└── scrapbook/                 # Scrapbook images and assets
    └── images/
```

**Key principle:** If you need to find or store project-specific data, it lives under `workspace/<project-name>/`. The project name is the directory name directly under `/workspace/`.

---

## Layer 2: Core Backend Services

These NestJS modules are **always loaded** and form the backbone of every interaction. They run inside the backend process on port 6060.

| Module | Purpose |
|--------|---------|
| **AuthModule** | JWT-based authentication. Role hierarchy: admin > user > guest > token (machine-to-machine). |
| **ClaudeSDK** | Core agent integration: `ClaudeSdkService` (SDK execution), `ClaudeSdkOrchestratorService` (wraps SDK with guardrails, budget, sessions, telemetry), `SdkSessionManagerService` (session lifecycle), `SdkHookEmitterService` (PreToolUse/PostToolUse hooks), `SdkPermissionService` (tool permission management). |
| **CodexSDK** | Alternative agent mode: `CodexSdkService`, `CodexSdkOrchestratorService`, `CodexSessionManagerService`, `CodexPermissionService`. Parallel implementation to ClaudeSDK for Codex-style execution. |
| **SessionsModule** | Chat session management — history persistence, AI-generated session summaries. |
| **ContentManagementModule** | Workspace file CRUD — read, write, list, delete files and directories, attachment handling. |
| **LlmModule** | LLM service abstraction layer — routes to Anthropic or OpenAI based on `CODING_AGENT` env var. |
| **InterceptorsModule** | Hook event interception — bridges coding agent hook events (PreToolUse, PostToolUse) to backend processing. |
| **ConfigurationModule** | Project configuration management — reads/writes `.claude/` and `.etienne/` config files. |
| **ProjectsModule** | Project lifecycle — create, list, delete projects in the workspace. |
| **McpServerModule** | MCP server with tool definitions: a2a-tools, knowledge-graph-tools, scrapbook-tools, deep-research-tools, email-tools, confirmation-tools, etienne-configuration-tools, diffbot-tools, demotools. SSE + HTTP streaming transport. |
| **CodingAgentConfigurationModule** | Agent configuration for coding tasks — builds CLAUDE.md, settings.json, and permissions for each project. |
| **TelemetryModule** | OpenTelemetry integration — traces, spans, metrics. Sends to Phoenix collector when `OTEL_ENABLED=true`. |

---

## Layer 3: Optional Backend Modules

These NestJS modules are **loaded at startup** but their features are activated on demand. Grouped by function:

### Knowledge & Search
| Module | Purpose |
|--------|---------|
| **KnowledgeGraphModule** | RDF/SPARQL knowledge base — entity extraction via LLM, deduplication, RDF triple storage in Quadstore. Requires rdf-store (port 7000). |
| **SearchModule** | Hybrid search combining vector similarity + knowledge graph queries. Requires vector-store (port 7100). |
| **ScrapbookModule** | Semantic mindmap storage — hierarchical nodes (ProjectTheme > Category > Subcategory > Concept > Attribute) with priorities and attention weights. Backed by RDF in Quadstore. Requires rdf-store (port 7000). |
| **MemoriesModule** | Long-term memory with configurable decay (`MEMORY_DECAY_DAYS`). Extraction from conversations, search, persistence. |
| **DeepResearchModule** | Research execution — multi-step research with result compilation. |

### Artifacts & Skills
| Module | Purpose |
|--------|---------|
| **SkillsModule** | Skill catalog — loads skills from `skill-repository/`, manages skill assignment to projects, skill review queue. |
| **PreviewersModule** | File type viewer configuration — maps file extensions to viewer components (see Layer 6). |

### Process & Automation
| Module | Purpose |
|--------|---------|
| **StatefulWorkflowsModule** | XState v5-based deterministic workflows — finite state machines with persistence. |
| **SchedulerModule** | CRON job management — task scheduling, execution history. |
| **CheckpointsModule** | Git/Gitea-based version control — backup, restore, diff. Requires Gitea when using `gitea-project` provider. |
| **ProcessManagerModule** | External service lifecycle — start/stop/status for services defined in `services.json` (see Layer 4). |
| **SubagentsModule** | Sub-agent orchestration — delegate work to child agents. |

### Safety & Compliance
| Module | Purpose |
|--------|---------|
| **GuardrailsModule** | Input validation — security checks, prompt injection prevention. |
| **OutputGuardrailsModule** | Output validation — content filtering, compliance checks. |
| **ComplianceModule** | Audit trails — regulatory compliance tracking. |
| **BudgetMonitoringModule** | Token cost tracking — real-time budget updates, cost limits. |
| **IssuesModule** | System diagnostics — issue tracking, patching, verification. |

### Communication & Events
| Module | Purpose |
|--------|---------|
| **AgentBusModule** | Pub/sub event system — `EventBusService`, `IntentRouterService`, `ContextInjectorService`, `DssQueryAdapterService`. |
| **EventHandlingModule** | Event processing — hooks and general event dispatch. |
| **ExternalEventsModule** | External triggers — MQTT client (`MqttClientService`), email, webhooks. |
| **RemoteSessionsModule** | Remote pairing — session providers for Telegram, Teams. |
| **UserNotificationsModule** | User alerts and notifications. |
| **FeedbackModule** | User feedback collection. |

### Connectivity & Configuration
| Module | Purpose |
|--------|---------|
| **A2ASettingsModule** | Agent-to-Agent settings management. |
| **A2AClientModule** | A2A client — communicates with external agents via a2a-server. |
| **McpRegistryModule** | MCP server registry — tracks available MCP servers. |
| **AgentRoleRegistryModule** | Agent role definitions. |
| **OntologyCoreModule** | Decision support — scenario evaluation, condition-action-outcome graphs built on ontology entities. |
| **TagsModule** | File/content tagging. |
| **ContextsModule** | Content scope definition — filesystem, vector store, and knowledge graph context switching. |
| **AutoConfigurationModule** | Auto-discovery and setup of project configuration. |

---

## Layer 4: External Services (Process Manager)

These run as **separate processes** managed by `ProcessManagerModule`. Defined in `backend/services.json`. Start/stop via `POST /api/process-manager/:serviceName` with `{action: 'start'|'stop'}`.

| Service | Port | Technology | Purpose | Depended on by |
|---------|------|-----------|---------|---------------|
| **rdf-store** | 7000 | Node.js / Quadstore | RDF triple storage for semantic relations | KnowledgeGraphModule, ScrapbookModule |
| **vector-store** | 7100 | Python / ChromaDB | Vector embeddings for semantic search | SearchModule, RAG search skill |
| **a2a-server** | 5600 | Node.js | Agent-to-Agent discovery & sample agents | A2AClientModule |
| **webserver** | 4000 | Python / Flask | Dynamic API endpoint hosting (hot-reload) | public-website skill |
| **web-scraper** | 3480 | Python / Scrapling | Web scraping MCP server (get, fetch, stealthy_fetch) | web-scraping skill |
| **oauth-server** | 5950 | Node.js | Minimal OAuth/JWT authentication & user management | AuthModule (production) |
| **imap-connector** | 4440 | Node.js | Email IDLE listener, publishes email events | ExternalEventsModule, draft-quotes skill |
| **ms-teams** | 3978 | Node.js | Microsoft Teams remote session provider | RemoteSessionsModule |
| **telegram** | — | Node.js | Telegram remote session provider | RemoteSessionsModule |

**Additional infrastructure** (not in services.json):
- **Frontend** — port 5000 (React/Vite)
- **Backend** — port 6060 (NestJS)
- **Gitea** — port 3000 (checkpoint version control, when `CHECKPOINT_PROVIDER=gitea-project`)
- **Phoenix** — port 6006 (OpenTelemetry trace viewer, when `OTEL_ENABLED=true`)
- **LiteLLM Proxy** — port 4000 on Docker host (model routing when `CODING_AGENT=openai`)

---

## Layer 5: Credentials & API Keys

Configured in `backend/.env`. Each credential maps to specific components:

| Credential | Required? | Used by |
|-----------|-----------|---------|
| **ANTHROPIC_API_KEY** | Yes (when `CODING_AGENT=anthropic`) | ClaudeSdkService, LlmModule, a2a-server |
| **OPENAI_API_KEY** | Optional | Embeddings (scrapbook, KG), LLM routing via LiteLLM when `CODING_AGENT=openai` |
| **JWT_SECRET** | Yes | AuthModule (jwt-auth.guard), oauth-server — **must match** between backend and oauth-server |
| **DIFFBOT_TOKEN** | Optional | MCP diffbot-tools (Diffbot Knowledge Graph API at `kg.diffbot.com`) |
| **VAPI_TOKEN** | Optional | VAPI voice agent integration |
| **SMTP_CONNECTION** | Optional | Email sending — format: `host\|port\|secure\|user\|password` |
| **IMAP_CONNECTION** | Optional | imap-connector — format: `host\|port\|secure\|user\|password` |
| **GITEA_URL / GITEA_USERNAME / GITEA_PASSWORD** | Optional | CheckpointsModule (when `CHECKPOINT_PROVIDER=gitea-project`) |
| **TELEGRAM_BOT_TOKEN** | Optional | Telegram remote session provider (in `telegram/.env`) |

**Configuration env vars** (not secrets but important):
- `CODING_AGENT` — `anthropic` or `openai` — selects the LLM provider
- `WORKSPACE_ROOT` — host path to workspace volume
- `OTEL_ENABLED` — enable OpenTelemetry tracing
- `MEMORY_DECAY_DAYS` — memory decay window (default 6 days)
- `COSTS_CURRENCY_UNIT` / `COSTS_PER_MIO_INPUT_TOKENS` / `COSTS_PER_MIO_OUTPUT_TOKENS` — budget tracking config

---

## Layer 6: UI Viewer System

The viewer system renders project files as rich artifacts in the frontend.

**How it works:**
1. **Backend** — `PreviewersService` provides a mapping of file extensions to viewer names via `GET /api/previewers/configuration`
2. **Frontend** — `viewerRegistry.jsx` maps viewer names to React components. `buildExtensionMap()` merges system defaults with project overrides from `.etienne/previewers.json`. `getViewerForFile()` resolves a file path to the correct viewer (longest extension match wins, so `.workflow.json` matches before `.json`).

**Default viewers:**

| Viewer | Extensions | Component |
|--------|-----------|-----------|
| **html** | .html, .htm | LiveHTMLPreview |
| **json** | .json | JSONViewer |
| **jsonl** | .jsonl | JSONViewer (line-delimited) |
| **markdown** | .md | MarkdownViewer |
| **mermaid** | .mermaid | MermaidViewer |
| **research** | .research | ResearchDocument |
| **image** | .jpg, .jpeg, .png, .gif | ImageViewer |
| **excel** | .xls, .xlsx | ExcelViewer |
| **prompt** | .prompt | PromptEditor |
| **workflow** | .workflow.json | WorkflowVisualizer |
| **scrapbook** | .scbk | ScrapbookViewer |

**To add a new viewer:** Register it in `PreviewersService.getDefaults()` (backend) and add the component mapping in `VIEWER_COMPONENTS` (frontend `viewerRegistry.jsx`).

---

## Layer 7: Skill-Service Dependency Map

Each skill may depend on external services, credentials, and/or backend modules. This table is the cross-reference:

| Skill | External Services | Credentials | MCP Tools Provided | Backend Module |
|-------|------------------|-------------|-------------------|----------------|
| **scrapbook** | rdf-store (7000) | — | scrapbook_create_root_node, scrapbook_describe_node, scrapbook_add_node, scrapbook_update_node, scrapbook_get_focus_items | ScrapbookModule |
| **rag-search** | vector-store (7100) | OPENAI_API_KEY | kg_learn_document, kg_search | KnowledgeGraphModule, SearchModule |
| **browser-use** | agent-browser | — | browser automation tools | — |
| **web-scraping** | web-scraper (3480) | — | get, bulk_get, fetch, bulk_fetch, stealthy_fetch, bulk_stealthy_fetch | — |
| **decision-support** | — | — | ontology tools | OntologyCoreModule |
| **stateful-workflows** | — | — | workflow_create, workflow_send_event, workflow_list, workflow_get | StatefulWorkflowsModule |
| **schedule-task** | — | — | scheduler tools | SchedulerModule |
| **public-website** | webserver (4000) | — | website publishing tools | — |
| **brainstorming** | rdf-store (7000) | — | (uses scrapbook tools) | ScrapbookModule |
| **vapi** | — | VAPI_TOKEN | voice agent tools | — |
| **draft-quotes** | imap-connector (4440) | SMTP_CONNECTION | quote drafting tools | ExternalEventsModule |
| **self-healing** | — | — | issue reporting | IssuesModule |

---

## Agent Event Architecture

Etienne uses a layered event system:

**Internal hook events** (emitted by the coding agent via `SdkHookEmitterService`):
- `UserPromptSubmit` — user sends a message
- `PreToolUse` — before a tool executes (can be intercepted/blocked)
- `PostToolUse` — after a tool executes (results can be inspected)
- `Notification` — agent status updates
- `Stop` — agent session ends
- `PreCompact` — before context compression
- `SessionStart` — new session begins

**Agent Bus** (`AgentBusModule`):
- `EventBusService` — pub/sub for internal event routing
- `IntentRouterService` — dispatches events to the right handler based on intent
- `ContextInjectorService` — enriches events with project context
- `DssQueryAdapterService` — bridges events to decision support queries

**External triggers** (`ExternalEventsModule`):
- MQTT — subscribe to topics via `MqttClientService`
- Email — incoming emails via imap-connector
- Webhooks — HTTP-based event ingestion

---

## Context Engineering

Etienne uses three context dimensions to scope what the agent sees:

1. **Filesystem context** — Tags on files/directories define which files are "in scope" for the current conversation. Managed by `ContextsModule` and `TagsModule`.

2. **Vector store context** — Semantic scoping via embeddings. The agent can search documents by meaning, filtered to the current project's collection in ChromaDB.

3. **Knowledge graph context** — Entity-level scoping. The knowledge graph stores structured relationships (Person, Company, Product, Document) as RDF triples. Queries via SPARQL.

4. **Session-level context switching** — Each session can switch between context scopes, allowing the same project to serve different conversational threads without cross-contamination.

---

## Quick Reference: What to Check

| If you need to... | Check / Use |
|-------------------|-------------|
| Read or write project files | ContentManagementModule + `workspace/<project>/` |
| Semantic search over documents | vector-store (7100) + SearchModule + KnowledgeGraphModule |
| Structured entity relationships | rdf-store (7000) + KnowledgeGraphModule |
| Display rich artifacts in UI | Viewer system (PreviewersModule + viewerRegistry) |
| Schedule recurring tasks | SchedulerModule |
| Run deterministic workflows | StatefulWorkflowsModule |
| Fetch external web data | web-scraper (3480) or Diffbot (DIFFBOT_TOKEN) |
| Send/receive emails | SMTP_CONNECTION + imap-connector (4440) |
| Version control / backup | CheckpointsModule + Gitea |
| Talk to external agents | a2a-server (5600) + A2AClientModule |
| Track costs | BudgetMonitoringModule |
| Capture structured notes | ScrapbookModule + rdf-store (7000) |
| Make ontology-based decisions | OntologyCoreModule |
| Start/stop external services | ProcessManagerModule → `POST /api/process-manager/:name` |
