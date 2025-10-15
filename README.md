# Etienne - Headless Claude Code

<div align="center">
<img src="/docs/images/etienne-logo.png" alt="Etienne Logo" width="200">
</div>

How to use Claude Code 2.0 in non-interactive mode to build an agent engine for **virtual collaborator use cases**.

Contains a node.js/nest.js backend and React/Vite frontend which operate on an existing Claude Code 2.0 Docker devcontainer.
In production deployments all components can be packaged inside a single Container.

## IT Scenario
This template is in the middle between "Buy a complete AI agent solution" and "Build an AI agent framework from scratch".

<div align="center">
<img src="/docs/images/buy-build.jpg" alt="Buy and Build" width="700">
</div>

It proposes to focus your development efforts on the business layer instead on the AI layer.

## Components in Scope
Often home-grown AI systems neglect many of the requirements in regard of observability and usability.

<div align="center">
<img src="/docs/images/agent-components.jpg" alt="Agent Components" width="700">
</div>

This template demonstrates the seamless integration over many base technologies like MCP, git, cron, http proxies and shell scripting.

## Intended Use
An example for learning the internals, integrations and configuration details of Claude Code with the "-p" command line parameter in multi-tenant scenarios.

## Architecture

<div align="center">
<img src="/docs/images/building-blocks.jpg" alt="Architecture Diagram" width="500">
</div>

## Live Demonstrations

### Basic Functionality (Inner Agentic Loop)

[![Youtube Video](https://img.youtube.com/vi/zjoiCkf6LhM/0.jpg)](https://www.youtube.com/watch?v=zjoiCkf6LhM)

[Building Etienne: How We Turned Claude Code 2.0 into an AI Agent Platform](https://www.linkedin.com/pulse/building-etienne-how-we-turned-claude-code-20-ai-agent-ralph-g%C3%B6llner-qpw0e/)

### Enhanced Functionality (Outer Agentic Loop)

[![Youtube Video](https://img.youtube.com/vi/o-1VXTT6g3g/0.jpg)](https://www.youtube.com/watch?v=o-1VXTT6g3g)

[Understanding Etienne: Complementing Claude Code's Agentic Loop](https://www.linkedin.com/pulse/understanding-etienne-complementing-claude-codes-agentic-g%C3%B6llner-4ivwe/)

## SETUP

### API Keys
We use **Anthropic Sonnet 4.5** via an console account (default). If you want to switch to OpenAI then you need to add an OpenAI API account and your preferred model as well.

You need to create an .env file inside the backend directory:
```
# Anthropic API Key (used for direct Claude API calls)
ANTHROPIC_API_KEY=sk-ant-api03-...AA

# OpenAI Configuration via our custom proxy (used when aiModel=openai)
# Claude Code calls our proxy at port 6060, which translates to OpenAI API
ANTHROPIC_MODEL=gpt-4.1-mini
ANTHROPIC_BASE_URL=http://host.docker.internal:6060/api/modelproxy
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-...AA

# OpenAI API settings (used by our proxy service to call OpenAI)
OPENAI_API_KEY=sk-proj-...MsA
OPENAI_BASE_URL=https://api.openai.com/v1

# Memory Management Configuration
MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories
MEMORY_DECAY_DAYS=6
WORKSPACE_ROOT=C:/Data/GitHub/claude-multitenant/workspace

# Budget Control Configuration
COSTS_CURRENCY_UNIT=EUR
COSTS_PER_MIO_INPUT_TOKENS=3.0
COSTS_PER_MIO_OUTPUT_TOKENS=15.0
```

### Install Claude Code 2.0 inside a docker container
The name of the container needs to be claude-code (this is the entrypoint for the backend).
You will find a dockerfile with pre-installed python and pip libs in this project - this enables your agents to write and
execute Python 3.x scripts when solving problems.

Of course the container should be running when you start up the services of Etienne.

### Starting up the services
Start the backend on :6060
```
cd backend
npm i
npm run dev
```
Start the frontend on :5000
```
cd frontend
npm i
npm run dev
```
Then **open your browser** with http://localhost:5000

## API Endpoints

### ClaudeController (`/api/claude`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/claude/addFile` | POST | Adds a file to a project's workspace. Creates project directories if they don't exist. |
| `/api/claude/getFile` | GET | Retrieves the content of a specific file from a project. |
| `/api/claude/listFiles` | GET | Lists all files and directories in a project's subdirectory. |
| `/api/claude/listProjects` | GET | Returns a list of all available projects in the workspace. |
| `/api/claude/strategy` | POST | Retrieves the CLAUDE.md strategy/prompt file for a project. |
| `/api/claude/strategy/save` | POST | Saves the CLAUDE.md strategy/prompt file for a project. |
| `/api/claude/filesystem` | POST | Returns the complete filesystem tree structure for a project. |
| `/api/claude/permissions` | POST | Gets the list of allowed tools/permissions for a project. |
| `/api/claude/permissions/save` | POST | Updates the allowed tools/permissions configuration for a project. |
| `/api/claude/assistant` | POST | Retrieves the assistant configuration including greeting message. |
| `/api/claude/chat/history` | POST | Gets the chat history for a project from the persistence layer. |
| `/api/claude/mcp/config` | POST | Retrieves the MCP server configuration from .mcp.json file. |
| `/api/claude/mcp/config/save` | POST | Saves MCP server configuration and updates Claude settings accordingly. |
| `/api/claude/streamPrompt` | GET (SSE) | Streams Claude Code execution with real-time updates via Server-Sent Events. Supports memory-enabled prompts. |

### InterceptorsController (`/api/interceptors`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/interceptors/in` | POST | Receives interceptor events from Claude Code hooks (PreToolUse, PostToolUse, etc.). |
| `/api/interceptors/hooks/:project` | GET | Returns all hook events (PreToolUse, PostToolUse) for a specific project. |
| `/api/interceptors/events/:project` | GET | Returns all general events (Notification, UserPromptSubmit) for a project. |
| `/api/interceptors/stream/:project` | GET (SSE) | Streams interceptor events in real-time via Server-Sent Events for live UI updates. |

### ContentManagementController (`/api/workspace`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/workspace/:project/files/*` | GET | Retrieves file content from the workspace with appropriate MIME type headers. |
| `/api/workspace/:project/files/*` | DELETE | Deletes a file or folder from the project workspace. |
| `/api/workspace/:project/files/move` | POST | Moves a file or folder from source path to destination path. |
| `/api/workspace/:project/files/rename` | PUT | Renames a file or folder to a new name. |
| `/api/workspace/:project/files/upload` | POST | Uploads a file to the specified path in the project workspace. |
| `/api/workspace/:project/files/create-folder` | POST | Creates a new folder at the specified path in the workspace. |

### ModelProxyController (`/api/modelproxy`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/modelproxy/v1/messages` | POST | Proxies Anthropic-formatted requests to OpenAI API with response translation. Enables Claude Code to use OpenAI models. |

### McpServerController (`/`)
| Path | Verb | Description |
|------|------|-------------|
| `/mcp` | ALL | Handles MCP (Model Context Protocol) streamable HTTP transport. Supports GET for SSE connections, POST for messages, DELETE for session termination. |
| `/sse` | ALL | Legacy SSE transport endpoint for MCP connections. Maintained for backwards compatibility with older MCP clients. |

### MemoriesController (`/api/memories`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/memories` | POST | Extracts and stores memories from conversation messages using OpenAI for fact extraction. Returns added/updated/deleted memories. |
| `/api/memories/search` | POST | Searches for relevant memories based on a query string. Returns ranked results using keyword matching. |
| `/api/memories/:user_id` | GET | Retrieves all memories for a user with optional limit. Applies memory decay filter based on configuration. |
| `/api/memories/:memory_id` | DELETE | Deletes a specific memory by ID for a given user. |
| `/api/memories` | DELETE | Deletes all memories for a specific user from the project. |

### BudgetMonitoringController (`/api/budget-monitoring`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/budget-monitoring/:project/current` | GET | Returns current accumulated costs, number of requests, and currency for a project. Used to initialize the budget indicator. |
| `/api/budget-monitoring/:project/all` | GET | Retrieves all cost entries from costs.json, sorted from newest to oldest. Each entry includes timestamp, tokens, request cost, and accumulated costs. |
| `/api/budget-monitoring/:project/settings` | GET | Gets the budget monitoring settings (enabled status and limit) for a project. |
| `/api/budget-monitoring/:project/settings` | POST | Saves budget monitoring settings (enabled/disabled and cost limit). Body: `{ enabled: boolean, limit: number }` |
| `/api/budget-monitoring/:project/stream` | GET (SSE) | Streams real-time budget updates via Server-Sent Events. Emits events whenever costs are tracked after Claude Code responses. |

### SchedulerController (`/api/scheduler`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/scheduler/:project/tasks` | GET | Retrieves all scheduled task definitions for a project. Returns array of tasks with id, name, prompt, cronExpression, and timeZone. |
| `/api/scheduler/:project/history` | GET | Retrieves task execution history for a project, sorted newest to oldest. Includes timestamp, task name, response, error status, duration, and token usage. |
| `/api/scheduler/:project/tasks` | POST | Updates the complete list of task definitions for a project. Body: `{ tasks: TaskDefinition[] }` |
| `/api/scheduler/:project/task/:taskId` | GET | Retrieves a single task definition by its ID. Returns 404 if task not found. |
| `/api/scheduler/:project/task` | POST | Creates a new scheduled task. Body: `{ id, name, prompt, cronExpression, timeZone }`. Task will be immediately registered with the scheduler. |
| `/api/scheduler/:project/task/:taskId` | PUT | Updates an existing task by ID. Body: `{ id, name, prompt, cronExpression, timeZone }`. Cron job will be updated dynamically. |
| `/api/scheduler/:project/task/:taskId` | DELETE | Deletes a task by ID and removes its associated cron job. Returns error if task not found. |

### SessionsController (`/api/sessions`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/sessions/:projectname` | GET | Retrieves all sessions for a project with AI-generated summaries sorted by timestamp (newest first). Returns session metadata including sessionId, timestamp, and summary. Automatically generates missing summaries before returning. |
| `/api/sessions/:projectname/:sessionId/history` | GET | Retrieves the complete message history for a specific session from the `.etienne/chat.history-<sessionId>.jsonl` file. Returns messages array with timestamps and content. |

### SubagentsController (`/api/subagents`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/subagents/:project` | GET | Lists all subagents configured for a project. Reads from `.claude/agents/*.md` files and returns name, description, tools, model, and system prompt for each. |
| `/api/subagents/:project/:name` | GET | Retrieves a specific subagent configuration by name. Returns 404 if the subagent file doesn't exist. |
| `/api/subagents/:project` | POST | Creates a new subagent. Body: `{ name, description, tools?, model?, systemPrompt }`. Creates markdown file with YAML frontmatter in `.claude/agents/` directory. |
| `/api/subagents/:project/:name` | PUT | Updates an existing subagent configuration. Supports renaming by providing new name in config body. Deletes old file if name changed. |
| `/api/subagents/:project/:name` | DELETE | Deletes a subagent by removing its configuration file from `.claude/agents/`. Returns error if subagent not found. |

### GuardrailsController (`/api/guardrails`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/guardrails/:project/input` | GET | Retrieves input guardrails configuration from `.etienne/input-guardrails.json`. Returns array of enabled guardrail types (CreditCard, IPAddress, Email, URL, IBAN). |
| `/api/guardrails/:project/input` | POST | Updates input guardrails configuration. Body: `{ enabled: string[] }`. Enabled array contains guardrail type names to activate for PII detection and redaction. |
| `/api/guardrails/:project/output` | GET | Retrieves output guardrails configuration from `.etienne/output-guardrails.json`. Returns enabled status, custom prompt, and violations enum array. |
| `/api/guardrails/:project/output` | POST | Updates output guardrails configuration. Body: `{ enabled?: boolean, prompt?: string, violationsEnum?: string[] }`. Controls post-processing LLM-based content filtering. |

## Spec-driven Development

This project follows a specification-driven development approach. All features are documented as Product Requirements Documents (PRDs) in the `/requirements-docs` folder. Below is a comprehensive overview of all features, categorized by their role in the system.

### Claude Control (inner agentic cycle)

These features directly control or modify how Claude Code operates internally:

* **Subagents** ([/requirements-docs/prd-subagents.md](requirements-docs/prd-subagents.md))
  Enables creation and management of specialized subagents that Claude can delegate tasks to autonomously. Each subagent is defined with a name, description, custom system prompt, restricted tool access, and model selection. Subagents allow for specialized workflows like code review, testing, and debugging to be triggered automatically based on context.

* **Permissions** ([/requirements-docs/prd-permissions.md](requirements-docs/prd-permissions.md))
  Provides granular control over which tools Claude Code can use through a configurable permissions system. Permissions are stored per-project in `.claude/permissions.json` and define allowed tools with glob patterns (e.g., `Write(./**/*.py)`, `Bash(python3:*)`). This enables sandboxing and safety constraints for different project contexts.

* **MCP Servers** ([/requirements-docs/prd-mcp-servers.md](requirements-docs/prd-mcp-servers.md))
  Enables integration of Model Context Protocol (MCP) servers to extend Claude's capabilities with external tools and data sources. Each project can configure MCP servers in `.mcp.json` with settings for transport type (SSE/HTTP/STDOUT), authentication, and endpoints. MCP servers provide custom tools that become available to Claude during task execution.

* **Interceptors** ([/requirements-docs/prd-interceptors.md](requirements-docs/prd-interceptors.md))
  Implements real-time tracking and tracing of Claude Code's behavior through hooks and events. All tool calls (PreToolUse/PostToolUse) and system events are captured, stored in-memory, and streamed to the frontend via SSE. This provides complete visibility into the agentic cycle for debugging, monitoring, and understanding Claude's decision-making process.

* **Cancel and Limit Agentic Cycle** ([/requirements-docs/prd-cancel-and-limit-agentic-cycle.md](requirements-docs/prd-cancel-and-limit-agentic-cycle.md))
  Provides user control over long-running agentic loops through configurable max-turns limits and a process abortion mechanism. Users can set a maximum number of agentic cycles (default: 5, 0=unlimited) and abort running processes via a stop button. This prevents runaway costs and allows quick iteration during development.

* **Strategy** ([/requirements-docs/prd-strategy.md](requirements-docs/prd-strategy.md))
  Allows per-project customization of Claude's system prompt through a `CLAUDE.md` file in the project root. Users can edit the strategy file directly in a Monaco editor to define the agent's role, behavior, domain knowledge, and task-specific instructions. This enables tailoring Claude's behavior for different project types and workflows.

* **Input Guardrails** ([/requirements-docs/prd-input-guardrails.md](requirements-docs/prd-input-guardrails.md))
  Implements a plugin-based system to detect and redact sensitive information from user input before it reaches the AI model. Built-in plugins detect credit cards (with Luhn validation), IP addresses (IPv4/IPv6), emails, URLs, and IBANs. Each project can configure which guardrails are active via `.etienne/input-guardrails.json`.

* **Output Guardrails** ([/requirements-docs/prd-output-guardrails.md](requirements-docs/prd-output-guardrails.md))
  Provides LLM-based post-processing to inspect and redact policy violations from Claude Code's responses. Uses a customizable prompt with GPT-4o-mini to detect violations, replace them with placeholders, and emit violation events to the frontend. When enabled, response streaming is disabled to allow buffering and content modification before delivery.

### Complementary Features (to the agentic cycle)

These features enhance or support the agentic cycle but don't directly control it:

* **Session Management** ([/requirements-docs/prd-session-management.md](requirements-docs/prd-session-management.md))
  Implements multi-session conversation management with automatic summarization and persistence. Sessions are stored in separate JSONL files (`.etienne/chat.history-<sessionId>.jsonl`) with a session index in `chat.sessions.json`. Users can start new sessions, resume previous conversations, and view AI-generated summaries of past sessions.

* **Scheduling Subsystem** ([/requirements-docs/prd-scheduling-subsystem.md](requirements-docs/prd-scheduling-subsystem.md))
  Provides cron-based task scheduling using NestJS Schedule to automatically invoke Claude Code with predefined prompts. Task definitions include name, prompt, cron expression, and timezone. Execution history tracks timestamp, response, errors, duration, and token usage. Supports daily, weekly, or custom scheduling patterns.

* **Checkpoints** ([/requirements-docs/prd-checkpoints.md](requirements-docs/prd-checkpoints.md))
  Implements Git-based backup and restore functionality for project workspaces. Creates versioned snapshots of project files with descriptive commit messages, stores them in `/workspace/.checkpoints`, and allows rolling back to any previous state. Operates via Docker exec in development and direct Git commands in production.

* **Budget Control** ([/requirements-docs/prd-budget-control.md](requirements-docs/prd-budget-control.md))
  Tracks and visualizes AI inference costs on a per-project basis. Records input/output tokens and calculates costs based on configurable rates in `.env`. Displays real-time budget indicators with percentage-based icons (0-100%) and alerts when limits are exceeded. Stores detailed cost history in `.etienne/costs.json` sorted from newest to oldest.

* **Long-term Memory** ([/requirements-docs/prd-long-term-memory.md](requirements-docs/prd-long-term-memory.md))
  Implements agentic memory extraction and retrieval using GPT-4o-mini for fact extraction from conversations. Stores structured memories in `.etienne/memories.json` with automatic decay based on configurable time windows. Supports memory search, update, and deletion. Extracted facts include personal information, preferences, goals, habits, skills, and context.

* **Chat Persistence** ([/requirements-docs/prd-chat-persistence.md](requirements-docs/prd-chat-persistence.md))
  Provides persistent storage of chat history and initial assistant greetings. Chat messages are stored in `chat.history.json` with timestamps, role indicators (user/agent), message content, and cost data. Assistant greetings are configured per-project in `assistant.json` and displayed as the first message when loading a project.

### Other

UI/UX features, administrative tools, and system utilities:

* **System Diagnosis** ([/requirements-docs/prd-system-diagnosis.md](requirements-docs/prd-system-diagnosis.md))
  Implements health checks for the backend and Claude Code Docker container. Frontend polls `/api/claude/health` every 10 seconds to detect issues like missing Docker, container not running, or unsupported Claude versions. Displays persistent markdown-formatted toast notifications with troubleshooting instructions when errors are detected.

* **Help System** ([/requirements-docs/prd-help-system.md](requirements-docs/prd-help-system.md))
  Provides contextual background information through dismissible toast components. Each component displays markdown-formatted help text with optional icons, stored in `/public/background-info/data.json`. Help toasts appear in key UI sections (strategy, permissions, integrations, interceptors, filesystem) and can be toggled on/off in settings.

* **Filesystem** ([/requirements-docs/prd-filesystem.md](requirements-docs/prd-filesystem.md))
  Displays project file structure in a hierarchical tree view using MUI SimpleTreeView. Shows folders with expand/collapse icons and files with document icons. Provides a refresh button to reload the tree structure. Backend API returns sorted directory listings with all files and folders in the project workspace.

* **Structured Chat Responses** ([/requirements-docs/prd-structured-chat-responses.md](requirements-docs/prd-structured-chat-responses.md))
  Migrates from plain text streaming to structured event-based response handling. Parses Claude Code stdout into specialized components for user messages, tool calls (with running/complete states), permission requests (with approve/deny buttons), errors, and subagent activity. Maintains the existing interceptors system for hooks and events.

* **Live HTML Preview** ([/requirements-docs/prd-live-html-preview.md](requirements-docs/prd-live-html-preview.md))
  Provides real-time preview of HTML files in an iframe with automatic refresh when files are modified. Listens for PostHook events via the interceptors system and reloads the preview when Claude makes changes to HTML files. Uses sandboxed iframes with controlled permissions for security.

* **Refactoring File Explorer** ([/requirements-docs/prd-refactoring-fileexplorer.md](requirements-docs/prd-refactoring-fileexplorer.md))
  Enhances the filesystem component with drag-and-drop file uploads, inline renaming, file/folder deletion, and drag-to-move functionality. Implements Material Design styled tree with folder open/closed states and document icons. Backend API supports DELETE, POST, and PUT operations for file management in `/api/workspace/:project/files/`.

* **Frontend State** ([/requirements-docs/prd-frontend-state.md](requirements-docs/prd-frontend-state.md))
  Manages frontend state persistence using localStorage to remember the currently loaded project. Controls UI element visibility and enabled/disabled states based on whether a project is loaded. Validates that stored projects exist in the workspace on startup and gracefully handles missing projects.