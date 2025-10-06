# Etienne - Headless Claude Code

<img src="/docs/images/etienne-logo.png" alt="Etienne Logo" width="200">

How to use Claude Code 2.0 in non-interactive mode to build a agent engine for virtual collaborator use cases.

Contains a node.js/nest.js backend and React/Vite frontend which operate on an existing Claude Code 2.0 Docker devcontainer.

An example for learning the internals, integrations and configuration details of Claude Code with the "-p" command line parameter in multi-tenant scenarios.

## Architecture
<img src="/docs/images/building-blocks.jpg" alt="Architecture Diagram" width="500">

## Demo
[![Youtube Video](https://img.youtube.com/vi/zjoiCkf6LhM/0.jpg)](https://www.youtube.com/watch?v=zjoiCkf6LhM)

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