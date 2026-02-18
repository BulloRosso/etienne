# API Endpoints

## RBAC Roles

| Role | Level | Description |
|------|-------|-------------|
| `admin` | 3 | Full system access including configuration, service control, compliance releases, and remote session pairing |
| `user` | 2 | Project work including chat, file management, scheduling, knowledge graph, and project-level configuration |
| `guest` | 1 | Read-only access to projects, sessions, files, history, and budget data |
| `token` | - | Machine-to-machine authentication via bearer token (MCP endpoints) |

Access is hierarchical: `admin` inherits all `user` permissions, `user` inherits all `guest` permissions.

---

## ClaudeController (`/api/claude`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/claude/listProjects` | GET | guest, user, admin | Returns a list of all available projects in the workspace. |
| `/api/claude/assistant` | POST | guest, user, admin | Retrieves the assistant configuration including greeting message. |
| `/api/claude/getFile` | GET | guest, user, admin | Retrieves the content of a specific file from a project. |
| `/api/claude/listFiles` | GET | guest, user, admin | Lists all files and directories in a project's subdirectory. |
| `/api/claude/filesystem` | POST | guest, user, admin | Returns the complete filesystem tree structure for a project. |
| `/api/claude/strategy` | POST | guest, user, admin | Retrieves the `.claude/CLAUDE.md` strategy/prompt file for a project. |
| `/api/claude/permissions` | POST | guest, user, admin | Gets the list of allowed tools/permissions for a project. |
| `/api/claude/chat/history` | POST | guest, user, admin | Gets the chat history for a project from the persistence layer. |
| `/api/claude/mcp/config` | POST | guest, user, admin | Retrieves the MCP server configuration from .mcp.json file. |
| `/api/claude/health` | POST | guest, user, admin | Checks backend health and API availability. |
| `/api/claude/health/model` | GET | guest, user, admin | Verifies configured AI model is accessible. |
| `/api/claude/mission` | POST | guest, user, admin | Retrieves the mission/goals configuration for a project. |
| `/api/claude/addFile` | POST | user, admin | Adds a file to a project's workspace. Creates project directories if they don't exist. |
| `/api/claude/strategy/save` | POST | user, admin | Saves the `.claude/CLAUDE.md` strategy/prompt file for a project. |
| `/api/claude/permissions/save` | POST | user, admin | Updates the allowed tools/permissions configuration for a project. |
| `/api/claude/mcp/config/save` | POST | user, admin | Saves MCP server configuration and updates Claude settings accordingly. |
| `/api/claude/mission/save` | POST | user, admin | Saves the mission/goals configuration for a project. |
| `/api/claude/streamPrompt/sdk` | GET (SSE) | user, admin | Streams Claude Code execution with real-time updates via Server-Sent Events. Supports memory-enabled prompts. |
| `/api/claude/abort/:processId` | POST | user, admin | Aborts a running Claude Code process. |
| `/api/claude/clearSession/:project` | POST | user, admin | Creates a new chat session for a project. |
| `/api/claude/permission/respond` | POST | user, admin | Responds to SDK permission requests (approve/deny tool usage). |

## InterceptorsController (`/api/interceptors`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/interceptors/hooks/:project` | GET | guest, user, admin | Returns all hook events (PreToolUse, PostToolUse) for a specific project. |
| `/api/interceptors/events/:project` | GET | guest, user, admin | Returns all general events (Notification, UserPromptSubmit) for a project. |
| `/api/interceptors/stream/:project` | GET (SSE) | guest, user, admin | Streams interceptor events in real-time via Server-Sent Events for live UI updates. |
| `/api/interceptors/chat/:project` | GET | guest, user, admin | Checks if chat needs refresh from scheduled task results. |
| `/api/interceptors/in` | POST | user, admin | Receives interceptor events from Claude Code hooks (PreToolUse, PostToolUse, etc.). |

## ContentManagementController (`/api/workspace`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/workspace/:project/files/*` | GET | guest, user, admin | Retrieves file content from the workspace with appropriate MIME type headers. |
| `/api/workspace/:project/search-files` | GET | guest, user, admin | Searches files by query string (used for @-mention autocomplete). |
| `/api/workspace/:project/tags` | GET | guest, user, admin | Lists all tags in the project. |
| `/api/workspace/:project/contexts` | GET | guest, user, admin | Lists all contexts for a project. |
| `/api/workspace/:project/contexts/:contextId/scope` | GET | guest, user, admin | Returns the filtered file paths for a context scope. |
| `/api/workspace/:project/user-interface` | GET | guest, user, admin | Loads custom UI configuration for a project. |
| `/api/workspace/:project/workbench` | GET | guest, user, admin | Loads saved open tabs configuration. |
| `/api/workspace/:project/project-history` | POST | guest, user, admin | Loads project history/creation info. |
| `/api/workspace/projects-with-ui` | GET | guest, user, admin | Lists all projects with UI configuration. |
| `/api/workspace/:project/files/upload` | POST | user, admin | Uploads a file to the specified path in the project workspace. |
| `/api/workspace/:project/files/create-folder` | POST | user, admin | Creates a new folder at the specified path in the workspace. |
| `/api/workspace/:project/files/move` | POST | user, admin | Moves a file or folder from source path to destination path. |
| `/api/workspace/:project/files/save/*` | POST | user, admin | Saves edited file content. |
| `/api/workspace/:project/files/rename` | PUT | user, admin | Renames a file or folder to a new name. |
| `/api/workspace/:project/files/*` | DELETE | user, admin | Deletes a file or folder from the project workspace. |
| `/api/workspace/:project/attachments/upload` | POST | user, admin | Uploads an attachment for chat input. |
| `/api/workspace/:project/tags/file` | POST | user, admin | Adds a tag to a file. |
| `/api/workspace/:project/tags/file` | DELETE | user, admin | Removes a tag from a file. |
| `/api/workspace/:project/contexts` | POST | user, admin | Creates a new context. |
| `/api/workspace/:project/contexts/:contextId` | PUT | user, admin | Updates an existing context. |
| `/api/workspace/:project/contexts/:contextId` | DELETE | user, admin | Deletes a context. |
| `/api/workspace/:project/user-interface` | POST | user, admin | Saves custom UI configuration. |
| `/api/workspace/:project/workbench` | POST | user, admin | Saves open tabs configuration. |

## McpServerController (`/`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/mcp` | ALL | token | Handles MCP (Model Context Protocol) streamable HTTP transport. Supports GET for SSE connections, POST for messages, DELETE for session termination. |
| `/sse` | ALL | token | Legacy SSE transport endpoint for MCP connections. Maintained for backwards compatibility with older MCP clients. |

## SessionsController (`/api/sessions`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/sessions/:projectname` | GET | guest, user, admin | Retrieves all sessions for a project with AI-generated summaries sorted by timestamp (newest first). |
| `/api/sessions/:projectname/:sessionId/history` | GET | guest, user, admin | Retrieves the complete message history for a specific session. |
| `/api/sessions/:projectname/:sessionId/context` | GET | guest, user, admin | Retrieves the active context for a session. |
| `/api/sessions/:projectname/:sessionId/context` | POST | user, admin | Sets the active context for a session. |

## MemoriesController (`/api/memories`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/memories/:user_id` | GET | guest, user, admin | Retrieves all memories for a user with optional limit. Applies memory decay filter. |
| `/api/memories/extraction-prompt` | GET | guest, user, admin | Retrieves the memory extraction prompt. |
| `/api/memories/settings` | GET | guest, user, admin | Retrieves memory settings. |
| `/api/memories/search` | POST | user, admin | Searches for relevant memories based on a query string. |
| `/api/memories` | POST | user, admin | Extracts and stores memories from conversation messages. |
| `/api/memories/extraction-prompt` | POST | user, admin | Updates the memory extraction prompt. |
| `/api/memories/settings` | POST | user, admin | Saves memory settings. |
| `/api/memories/:memory_id` | DELETE | user, admin | Deletes a specific memory by ID. |
| `/api/memories` | DELETE | admin | Deletes all memories for a specific user from the project. |

## BudgetMonitoringController (`/api/budget-monitoring`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/budget-monitoring/:project/current` | GET | guest, user, admin | Returns current accumulated costs, number of requests, and currency for a project. |
| `/api/budget-monitoring/:project/all` | GET | guest, user, admin | Retrieves all cost entries from costs.json, sorted from newest to oldest. |
| `/api/budget-monitoring/:project/settings` | GET | guest, user, admin | Gets the budget monitoring settings (enabled status and limit) for a project. |
| `/api/budget-monitoring/:project/stream` | GET (SSE) | guest, user, admin | Streams real-time budget updates via Server-Sent Events. |
| `/api/budget-monitoring/:project/settings` | POST | admin | Saves budget monitoring settings (enabled/disabled and cost limit). Body: `{ enabled: boolean, limit: number }` |

## SchedulerController (`/api/scheduler`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/scheduler/:project/tasks` | GET | guest, user, admin | Retrieves all scheduled task definitions for a project. |
| `/api/scheduler/:project/history` | GET | guest, user, admin | Retrieves task execution history for a project, sorted newest to oldest. |
| `/api/scheduler/:project/task/:taskId` | GET | guest, user, admin | Retrieves a single task definition by its ID. |
| `/api/scheduler/:project/tasks` | POST | user, admin | Updates the complete list of task definitions for a project. Body: `{ tasks: TaskDefinition[] }` |
| `/api/scheduler/:project/task` | POST | user, admin | Creates a new scheduled task. Body: `{ id, name, prompt, cronExpression, timeZone }`. |
| `/api/scheduler/:project/task/:taskId` | PUT | user, admin | Updates an existing task by ID. Body: `{ id, name, prompt, cronExpression, timeZone }`. |
| `/api/scheduler/:project/task/:taskId` | DELETE | user, admin | Deletes a task by ID and removes its associated cron job. |

## SubagentsController (`/api/subagents`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/subagents/:project` | GET | guest, user, admin | Lists all subagents configured for a project. |
| `/api/subagents/:project/:name` | GET | guest, user, admin | Retrieves a specific subagent configuration by name. |
| `/api/subagents/:project` | POST | user, admin | Creates a new subagent. Body: `{ name, description, tools?, model?, systemPrompt }`. |
| `/api/subagents/:project/:name` | PUT | user, admin | Updates an existing subagent configuration. Supports renaming. |
| `/api/subagents/:project/:name` | DELETE | user, admin | Deletes a subagent by removing its configuration file. |

## GuardrailsController (`/api/guardrails`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/guardrails/:project/input` | GET | guest, user, admin | Retrieves input guardrails configuration. |
| `/api/guardrails/:project/output` | GET | guest, user, admin | Retrieves output guardrails configuration. |
| `/api/guardrails/:project/input` | POST | user, admin | Updates input guardrails configuration. Body: `{ enabled: string[] }`. |
| `/api/guardrails/:project/output` | POST | user, admin | Updates output guardrails configuration. Body: `{ enabled?: boolean, prompt?: string, violationsEnum?: string[] }`. |

## Knowledge Graph & Vector Store (`/api/knowledge-graph/:project`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/knowledge-graph/:project/documents` | GET | guest, user, admin | Lists all documents in vector store with metadata. |
| `/api/knowledge-graph/:project/documents/:id` | GET | guest, user, admin | Retrieves document by ID from vector store. |
| `/api/knowledge-graph/:project/entities/:id` | GET | guest, user, admin | Retrieves entity by ID from knowledge graph. |
| `/api/knowledge-graph/:project/entities` | GET | guest, user, admin | Retrieves entities by type (query param: `type`). |
| `/api/knowledge-graph/:project/entities/:id/relationships` | GET | guest, user, admin | Retrieves all relationships for a specific entity. |
| `/api/knowledge-graph/:project/stats` | GET | guest, user, admin | Returns statistics (document count, entity count, triple count). |
| `/api/knowledge-graph/:project/entity-schema` | GET | guest, user, admin | Retrieves custom RDF ontology schema for entity extraction. |
| `/api/knowledge-graph/:project/extraction-prompt` | GET | guest, user, admin | Retrieves custom entity extraction prompt. |
| `/api/knowledge-graph/:project/search/hybrid` | POST | guest, user, admin | Performs hybrid search combining vector similarity and SPARQL graph queries. |
| `/api/knowledge-graph/:project/search/vector` | POST | guest, user, admin | Vector similarity search using OpenAI embeddings. |
| `/api/knowledge-graph/:project/search/sparql` | POST | guest, user, admin | Executes SPARQL query against knowledge graph. |
| `/api/knowledge-graph/:project/translate/sparql` | POST | guest, user, admin | Translates natural language to SPARQL using GPT-4. |
| `/api/knowledge-graph/:project/documents` | POST | user, admin | Stores document in vector database with embedding and metadata. |
| `/api/knowledge-graph/:project/entities` | POST | user, admin | Creates entity in RDF knowledge graph. |
| `/api/knowledge-graph/:project/relationships` | POST | user, admin | Creates relationship between entities in knowledge graph. |
| `/api/knowledge-graph/:project/parse-markdown` | POST | user, admin | Extracts entities from markdown using AI and stores in both vector store and knowledge graph. |
| `/api/knowledge-graph/:project/entity-schema` | POST | user, admin | Saves custom RDF ontology schema. Body: `{ schema: string }` |
| `/api/knowledge-graph/:project/extraction-prompt` | POST | user, admin | Saves custom entity extraction prompt. Body: `{ prompt: string }` |
| `/api/knowledge-graph/:project/documents/:id` | DELETE | user, admin | Deletes document from vector store by ID. |
| `/api/knowledge-graph/:project/entities/:id` | DELETE | user, admin | Deletes entity and related vector documents. |

## ProjectsController (`/api/projects`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/projects/with-ui-config` | GET | guest, user, admin | Lists all projects with UI configuration. |
| `/api/projects/generate-agent-name` | POST | user, admin | AI-generates a project name suggestion. |
| `/api/projects/create` | POST | user, admin | Creates a new project in the workspace. |

## CheckpointsController (`/api/checkpoints`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/checkpoints/connection-check` | GET | guest, user, admin | Checks Git/version control connection status. |
| `/api/checkpoints/:project/list` | GET | guest, user, admin | Lists all checkpoints for a project. |
| `/api/checkpoints/:project/changes` | GET | guest, user, admin | Lists uncommitted changes in a project. |
| `/api/checkpoints/:project/:gitId` | GET | guest, user, admin | Retrieves specific checkpoint details. |
| `/api/checkpoints/:project/commit-files/:gitId` | GET | guest, user, admin | Lists files in a specific commit. |
| `/api/checkpoints/:project/create` | POST | user, admin | Creates a new checkpoint/commit. |
| `/api/checkpoints/:project/restore` | POST | user, admin | Restores project to a previous checkpoint. |
| `/api/checkpoints/:project/discard` | POST | user, admin | Discards uncommitted changes. |

## SkillsController (`/api/skills`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/skills/:project` | GET | guest, user, admin | Lists all skills for a project. |
| `/api/skills/:project/all-skills` | GET | guest, user, admin | Lists all available skills across the system. |
| `/api/skills/:project/:skillName` | GET | guest, user, admin | Retrieves a specific skill's configuration. |
| `/api/skills/:project/:skillName/files` | GET | guest, user, admin | Lists files belonging to a skill. |
| `/api/skills/:project/:skillName/files/:fileName` | GET | guest, user, admin | Retrieves a specific skill file's content. |
| `/api/skills/repository/list` | GET | guest, user, admin | Lists skills available in the skill repository. |
| `/api/skills/:project` | POST | user, admin | Creates a new skill. |
| `/api/skills/:project/:skillName` | POST | user, admin | Updates a skill's configuration. |
| `/api/skills/:project/:skillName/files` | POST | user, admin | Uploads a file to a skill. |
| `/api/skills/:project/copy` | POST | user, admin | Copies a skill to another project. |

## ScrapbookController (`/api/workspace/:projectName/scrapbook`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/workspace/:project/scrapbook/canvas` | GET | guest, user, admin | Loads scrapbook canvas state. |
| `/api/workspace/:project/scrapbook/tree` | GET | guest, user, admin | Loads scrapbook tree/hierarchy. |
| `/api/workspace/:project/scrapbook/nodes-with-groups` | GET | guest, user, admin | Loads all scrapbook nodes with group assignments. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId` | GET | guest, user, admin | Loads a specific node's details. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId/images` | GET | guest, user, admin | Lists images attached to a node. |
| `/api/workspace/:project/scrapbook/images/:filename` | GET | guest, user, admin | Retrieves a scrapbook image file. |
| `/api/workspace/:project/scrapbook/groups` | GET | guest, user, admin | Lists scrapbook groups. |
| `/api/workspace/:project/scrapbook/describe/:label` | GET | guest, user, admin | Generates AI description for a node. |
| `/api/workspace/:project/scrapbook/example-data` | POST | guest, user, admin | Loads example scrapbook data. |
| `/api/workspace/:project/scrapbook/canvas` | POST | user, admin | Saves scrapbook canvas state. |
| `/api/workspace/:project/scrapbook/nodes` | POST | user, admin | Creates a new scrapbook node. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId` | POST | user, admin | Updates a scrapbook node. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId` | DELETE | user, admin | Deletes a scrapbook node. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId/parent` | POST | user, admin | Sets parent node (hierarchy). |
| `/api/workspace/:project/scrapbook/nodes/:nodeId/group` | POST | user, admin | Sets node group assignment. |
| `/api/workspace/:project/scrapbook/nodes/:nodeId/images/:filename` | POST | user, admin | Uploads an image to a node. |
| `/api/workspace/:project/scrapbook/groups` | POST | user, admin | Creates or updates groups. |
| `/api/workspace/:project/scrapbook/create-from-text` | POST | user, admin | Creates scrapbook nodes from text. |

## EventsController (`/api/events`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/events/:project/stream` | GET (SSE) | guest, user, admin | Streams event execution updates in real-time. |
| `/api/events/:project/webhook` | POST | token | Receives external webhook events for a project. |

## ExternalEventsController (`/api/external-events`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/external-events/:project/status` | GET | guest, user, admin | Loads MQTT broker connection status. |
| `/api/external-events/:project/broker-setup` | GET | guest, user, admin | Loads MQTT broker configuration. |
| `/api/external-events/:project/subscriptions` | GET | guest, user, admin | Lists MQTT topic subscriptions. |
| `/api/external-events/:project/broker-setup` | POST | user, admin | Saves MQTT broker configuration. |
| `/api/external-events/:project/connect` | POST | user, admin | Connects to MQTT broker. |
| `/api/external-events/:project/subscriptions/:topic` | DELETE | user, admin | Unsubscribes from an MQTT topic. |

## A2ASettingsController (`/api/a2a-settings`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/a2a-settings/:project/enabled` | GET | guest, user, admin | Checks if A2A is enabled for a project. |
| `/api/a2a-settings/:project` | GET | guest, user, admin | Loads A2A settings for a project. |
| `/api/a2a-settings/registry/fetch` | GET | guest, user, admin | Fetches A2A agent registry from URL. |
| `/api/a2a-settings/registry/local` | GET | guest, user, admin | Loads local A2A agent registry. |
| `/api/a2a-settings/test-connection` | POST | guest, user, admin | Tests connection to an A2A agent. |
| `/api/a2a-settings/:project` | POST | user, admin | Saves A2A settings. |
| `/api/a2a-settings/:project/toggle` | POST | user, admin | Toggles A2A enabled/disabled. |
| `/api/a2a-settings/:project/agents` | POST | user, admin | Adds an A2A agent. |
| `/api/a2a-settings/:project/agents` | DELETE | user, admin | Removes an A2A agent. |

## ComplianceController (`/api/compliance`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/compliance/:project/status` | GET | guest, user, admin | Loads compliance status for a project. |
| `/api/compliance/:project/release-comments` | GET | guest, user, admin | Loads compliance release comments. |
| `/api/compliance/:project/release-comments` | POST | user, admin | Adds a compliance release comment. |
| `/api/compliance/:project/release-comments` | DELETE | user, admin | Deletes a compliance release comment. |
| `/api/compliance/:project/release` | POST | admin | Submits a compliance release. |

## FeedbackController (`/api/feedback`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/feedback` | POST | guest, user, admin | Submits feedback (thumbs up/down) on an AI response. |

## DeepResearchController (`/api/deep-research`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/deep-research/:project/stream` | GET (SSE) | guest, user, admin | Streams research progress events in real-time. |
| `/api/deep-research/:project/file-exists/:output` | GET | guest, user, admin | Checks if a research output file exists. |

## ConfigurationController (`/api/configuration`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/configuration` | GET | guest, user, admin | Checks if the system is configured. |
| `/api/configuration` | POST | admin | Saves global system configuration (API keys, workspace root, providers). |

## CodingAgentConfigurationController (`/api/coding-agent-configuration`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/coding-agent-configuration/:agentType` | GET | admin | Loads coding agent configuration (anthropic/openai). |
| `/api/coding-agent-configuration/:agentType` | POST | admin | Saves coding agent configuration. |
| `/api/coding-agent-configuration/:agentType` | DELETE | admin | Deletes coding agent configuration. |

## ProcessManagerController (`/api/process-manager`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/process-manager` | GET | guest, user, admin | Lists all services and their status. |
| `/api/process-manager/:serviceName` | GET | guest, user, admin | Checks a specific service's status. |
| `/api/process-manager/webserver` | GET | guest, user, admin | Checks if the public webserver is running. |
| `/api/process-manager/:serviceName` | POST | admin | Starts or stops a service. |

## RemoteSessionsController (`/api/remote-sessions`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/remote-sessions/pairing/pending` | GET | admin | Lists pending Telegram/Teams pairing requests. |
| `/api/remote-sessions/pairing/respond` | POST | admin | Approves or rejects a remote session pairing request. |

## PreviewersController (`/api/previewers`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/previewers/configuration` | GET | guest, user, admin | Loads previewer plugins configuration. |

## McpRegistryController (`/api/mcp-registry`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/mcp-registry` | GET | guest, user, admin | Lists MCP server registry entries. |
| `/api/mcp-registry/list-tools` | POST | guest, user, admin | Lists available tools from an MCP server. |

## AgentRoleRegistryController (`/api/agent-role-registry`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/agent-role-registry` | GET | guest, user, admin | Lists available agent role templates. |

## WorkflowsController (`/api/workspace/:projectName/workflows`)
| Path | Verb | RBAC | Description |
|------|------|------|-------------|
| `/api/workspace/:project/workflows` | GET | guest, user, admin | Lists project workflows. |
| `/api/workspace/:project/workflows/:workflowId` | GET | guest, user, admin | Retrieves a specific workflow's details. |
