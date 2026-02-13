<div align="center">
<img src="/docs/images/etienne-logo.png" alt="Etienne Logo" width="200">
</div>

# Etienne - AI Harness Integration Layer

# What it does in one sentence

<div align="center">
<img src="/docs/images/core-functions.jpg" alt="Core Functions" width="500">
</div> 

Etienne showcases how to attach typical business requirements to an agent harness - with a simple user interface.

# Base Technologies

Demonstrates how to use Anthropic Claude Code 2.0 with the **Claude Agent SDK** to build an agent integration layer for **virtual collaborator use cases**.

<div align="center">
<img src="/docs/images/raw-architecture.jpg" alt="Etienne Logo" width="500">
</div> 

This repo contains a node.js/nest.js **API backend** and a React/Vite **frontend** (the "head") . 

In production deployments all components will be packaged together into a Docker Container which mounts a workspace folder for data.

# Main Components

This repo contains 3 mandatory servers, 6 optional servers and many modules.

Modules can be removed if their functionality is not required (e. g. A2A Client, Observability, SMTP IMAP).

<div align="center">
<img src="/docs/images/servers-modules.jpg" alt="Servers and modules" width="900">
</div>

The following diagram shows the essential internal and external ports of a deployed Etienne instance:

<div align="center">
<img src="/docs/images/system-context.jpg" alt="System Context" width="900">
</div>

While the workbench (React frontend) serves as the primary user interface, messengers can optionally be added as secondary/mobile user interfaces.

# The Agent and the outside World

Etienne is built to maximize what an AI agent can do outwardly in commercial and operational contexts.

Etienne focuses on professional automation protocols in a single deployment, which is what commercial environments actually run on.

<div align="center">
<img src="/docs/images/etienne-outside-world.jpg" alt="Outside world" width="900">
</div>

Etienne extends the system boundary itself by implementing and exposing new interfaces such as MCP servers, API endpoints, or web applications.

Etienne is about turning an agent into infrastructure.


# Value Proposition
Etienne contains all the typical components you would need to recreate the user experience of Claude.ai or the ChatGPT web interface.

<div align="center">
<img src="/docs/images/what-it-does.jpg" alt="Buy and Build" width="800">
</div>

It is called a seed project, because all implementations are functional but minimal. You can start with a working system and tweak/evolve it in any way you want...

## IT Budget Situation
This template is in the middle between "Buy a complete AI agent solution" and "Build an AI agent framework from scratch".

<div align="center">
<img src="/docs/images/buy-build.jpg" alt="Buy and Build" width="700">
</div>

It proposes to focus your development efforts on the business layer instead on the AI layer.

## Components in Scope
Often home-grown AI systems neglect many of the requirements in regard to **observability and usability**.

<div align="center">
<img src="/docs/images/agent-components.jpg" alt="Agent Components" width="700">
</div>

This template demonstrates the seamless integration over many base technologies like MCP, git, cron, http proxies and shell scripting.

## Intended Use
An example for learning the internals, integrations and configuration details of Claude Code combined with the Agent SDK. Best used by
forward-deployed engineers to draft a first solution on-site with the customer.

<div align="center">
<img src="/docs/images/forward-deployed-engineer.jpg" alt="Forward deployed engineer" width="700">
</div>

The engineer uses Claude code to modify the seed projects (frontend and backend) during breakout sessions. Claude Code in this case is 
used to modify a claude-code/agents SDK seed projects.

## Architecture

<div align="center">
<img src="/docs/images/building-blocks.jpg" alt="Architecture Diagram" width="500">
</div>

## Live Demonstrations

### Basic Functionality (Inner Agentic Loop)

[![Youtube Video](https://img.youtube.com/vi/ljInSy96zkY/0.jpg)](https://youtu.be/ljInSy96zkY)

[Building Etienne: How We Turned Claude Code 2.0 into an AI Agent Platform](https://www.linkedin.com/pulse/building-etienne-how-we-turned-claude-code-20-ai-agent-ralph-g%C3%B6llner-qpw0e/)

### Enhanced Functionality (Outer Agentic Loop)

[![Youtube Video](https://img.youtube.com/vi/o-1VXTT6g3g/0.jpg)](https://youtu.be/o-1VXTT6g3g)

[Understanding Etienne: Complementing Claude Code's Agentic Loop](https://www.linkedin.com/pulse/understanding-etienne-complementing-claude-codes-agentic-g%C3%B6llner-4ivwe/)

## Articles
<table>
<tr>
  <td width="220">
    <img src="/docs/images/article1.jpg" width="220"/>
  </td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/building-etienne-how-we-turned-claude-code-20-ai-agent-ralph-g%C3%B6llner-qpw0e/" target="_blank">Building Etienne: How We Turned Claude Code 2.0 into an AI Agent Platform</a></b>
    <p style="color:#999"><small>
    Anthropic wants to build something that sounds like science fiction: a virtual colleague that actually works like a real teammate - thinking through complex problems, remembering bad ideas to avoid them in the future, making decisions based on your private data, and getting things done over hours or days, not seconds.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article2.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/understanding-etienne-complementing-claude-codes-agentic-g%C3%B6llner-4ivwe/" target="_blank">Understanding Etienne: Complementing Claude Agent SDK's Agentic Loop</a></b>
    <p style="color:#999"><small>
    In my previous article, I illustrated how you can leverage Claude Code's agentic loop by attaching it to your own user interface and business logic. Basically: "Here's how to get the engine running." But here's the thing nobody tells you about AI agents: Getting them to work is easy. Getting them to work in production requires solving a dozen unsexy problems that have nothing to do with AI.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article3.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/feeding-etienne-condition-monitoring-ai-agents-ralph-navasardyan-usdef/" target="_blank">Feeding Etienne: Condition Monitoring with AI Agents</a></b>
    <p style="color:#999"><small>
    Picture this: It's Monday morning, and somewhere in Hamburg, a businessman named Thomas is still in his bathrobe, sipping coffee while his AI agent named Etienne is already hard at work. Not because Thomas programmed it to start at 6 AM, but because the world started talking to it - and Etienne was hungry.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article4.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/etiennes-scrapbook-how-transform-human-intent-agentic-navasardyan-jjtpe/" target="_blank">Etienne's Scrapbook: How to transform Human Intent into Agentic Attention</a></b>
    <p style="color:#999"><small>
    This article describes how to move beyond single prompts to orchestrate complex, multi-faceted projects with AI agents.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article5.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/etienne-getting-picky-why-90-production-ai-agent-ralph-navasardyan-i2fee/" target="_blank">Etienne is getting picky: Why 90% of Production AI Agent Systems Are Basically Expensive Random Number Generators</a></b>
    <p style="color:#999"><small>
    Context failures have overtaken model failures as the primary cause of AI agent breakdowns. After analyzing production systems from Anthropic, Google, and leading AI engineering teams, one pattern emerges: the quality of your context management directly determines agent reliability.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article6.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/etiennes-memories-how-claude-code-based-ai-agents-over-navasardyan-sryie/" target="_blank">Etienne's Memories: How Claude Agent SDK AI Agents Build Knowledge Over Time</a></b>
    <p style="color:#999"><small>
    Anthropic didn't call it "Agentic Learning"—but they built something arguably more sophisticated. In October 2025, the company unveiled a distributed, file-based learning system that enables Claude to accumulate expertise across sessions, projects, and entire organizations. This architecture combines hierarchical memory files, on-demand skill loading, persistent task tracking, and iterative error correction into what may be the most practical approach to AI agent learning yet developed.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article7.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/how-etienne-solves-ais-last-mile-problem-bringing-ai-data-ralph-a97ue/" target="_blank">How Etienne Solves AI's Last Mile Problem: Bringing AI to Where the Data Lives</a></b>
    <p style="color:#999"><small>
    The world's most valuable data - patient records, proprietary algorithms, classified research, industrial secrets - sits locked behind security perimeters where cloud AI can never reach. Even when data access isn't restricted, professional workflows demand AI that understands specialized artifacts like DICOM scans, financial models, and CAD drawings—not generic file processors that treat domain expertise like raw text. </small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article8.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/etienne-after-dark-how-a2a-accidentally-started-ai-rave-navasardyan-4ufmf/" target="_blank">Etienne after Dark: How A2A accidentally started an AI Rave</a></b>
    <p style="color:#999"><small>
    As a general AI agent, Etienne could reason, plan, decompose tasks, and orchestrate workflows all day long. But the real world doesn’t run on reasoning alone. It runs on invoices, shipping quotes, compliance checks, pricing engines, calendars, databases, and services with very specific opinions about how things should be done. So Etienne did what any competent orchestrator would do: it stopped pretending to be everything and started calling specialists. </small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article9.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/dressing-up-etienne-how-integrate-ai-agents-your-ralph-navasardyan-g3bte/" target="_blank">Dressing Up Etienne: How to integrate AI Agents with your Customer's Business Workflows</a></b>
    <p style="color:#999"><small>
    Many AI agent projects crash and burn when they meet the harsh reality of real-world implementation. What looked brilliant in an isolated demo gets rejected faster than a soggy sandwich – either by employees frustrated with poor usability or IT teams pulling their hair out over integration nightmares. This article walks you through a step-by-step approach to successfully weaving AI agents into your customer's existing technical and organizational fabric - based on my 20 years experience in enterprise consulting.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article10.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/swipe-right-smart-agents-etiennes-guide-digital-data-navasardyan-ofmhe/" target="_blank">Swipe Right on Smart Agents: Etienne's Guide to Digital Romance with Real-World Data</a></b>
    <p style="color:#999"><small>
    Meet Etienne - not your typical bachelor, but an open-source AI agent build with Anthropic's Agent SDK who's about to get hitched to the real world! Unlike those chatbots that live in isolation, Etienne knows how to mingle at the party, check his calendar, and even remember where he put his keys. So join the wild data party with Etienne and his hangover buddy Claude!</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article11.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/fearing-etienne-how-forward-deployed-genai-engineers-navasardyan-v9wje/" target="_blank">Fearing Etienne: How Forward-Deployed GenAI Engineers Will Replace Consulting and Software Development Teams</a></b>
    <p style="color:#999"><small>
   The traditional consulting-to-development pipeline is dead. One forward-deployed engineer with the right AI toolbox can deliver production systems in a few days. This article explores the forward-deployed engineer's secret weapon: exploiting AI systems' ability to self-reproduce while adapting to any business domain.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article12.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/etienne-everywhere-using-telegram-microsoft-teams-ui-navasardyan-ut0ae/" target="_blank">Etienne Everywhere: Using Telegram and Microsoft Teams as an Alternative UI</a></b>
    <p style="color:#999"><small>
    That’s why Etienne supports messengers as an alternative UI - specifically Telegram and Microsoft Teams. Etienne is represented by a bot in both messengers.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article13.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/onboarding-etienne-next-best-thing-pip-boy-until-drop-navasardyan-vcuee/" target="_blank">Onboarding Etienne: The Next Best Thing to a Pip-Boy until the Nukes drop!</a></b>
    <p style="color:#999"><small>
    This article introduces the first steps with Etienne: an open-source seed project built on the Anthropic Agent SDK. Etienne is a personal, fully customizable agentic system that runs close to your data and depends only on an AI model exposing an Anthropic-compatible message API. No platform lock-in. No mandatory cloud brain. Just an agent you can actually own.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article14.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/diagnosing-etienne-inside-black-box-ai-agent-behavior-navasardyan-hqf7e/" target="_blank">Diagnosing Etienne: Inside the Black Box of AI Agent Behavior</a></b>
    <p style="color:#999"><small>
   AI agents no longer solve problems along a single, inspectable path. Each day adds new options: generate and execute code on the fly, delegate subtasks to MCP-backed tools, contract external specialists via A2A, chain services that themselves invoke other services. The agent’s action space is no longer a tree. It is a graph that keeps expanding while the agent is already moving through it. What used to be a prompt-and-response system now behaves like a distributed system assembled at runtime.</small>
    </p>
  </td>
</tr>
<tr>
  <td><img src="/docs/images/article15.jpg" style="min-width:220px" width="220"/></td>
  <td>
    <b><a href="https://www.linkedin.com/pulse/beyond-mes-how-general-ai-agents-deliver-custom-ralph-navasardyan-p1mtf/" target="_blank">Beyond MES: How General AI Agents Deliver Custom Manufacturing Solutions On Demand</a></b>
    <p style="color:#999"><small>
   Manufacturing professionals often find themselves caught between two unsatisfying options: expensive, rigid MES implementations or cobbling together spreadsheets and manual processes. But there's a third path emerging - one that combines the sophistication of custom software with the accessibility of a conversation.</small>
    </p>
  </td>
</tr>
</table>

## SETUP

### API Keys
We use **Anthropic Sonnet 4.5** via console account (default). To use OpenAI models (GPT-5-Codex, GPT-5-mini), configure the LiteLLM proxy.

You need to create an .env file inside the backend directory:
```
# Anthropic API Key (used for direct Claude API calls when aiModel=claude)
ANTHROPIC_API_KEY=sk-ant-api03-...AA

# Local data directory root for all projects
WORKSPACE_ROOT=C:/Data/GitHub/claude-multitenant/workspace

# Only used for deep research module (optional), enter any string but don't remove(!)
OPENAI_API_KEY=34343434343434

# Memory Management Configuration
MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories
MEMORY_DECAY_DAYS=6

# Budget Control Configuration
COSTS_CURRENCY_UNIT=EUR
COSTS_PER_MIO_INPUT_TOKENS=3.0
COSTS_PER_MIO_OUTPUT_TOKENS=15.0

# Checkpoint Provider Configuration
CHECKPOINT_PROVIDER=gitea
GITEA_URL=http://localhost:3000
GITEA_USERNAME=your.user@gitea.local
GITEA_PASSWORD=****
GITEA_REPO=workspace-checkpoints
```

### Checkpoints

The checkpoint feature requires **Gitea** to be installed and running on `localhost:3000`. Checkpoints create versioned backups of your project workspace and store them in a Gitea repository.

**Prerequisites:**
- Gitea server running on port 3000
- Valid Gitea user account (configured in `.env`)

**Configuration:**
The checkpoint system uses environment variables in `.env`:
- `CHECKPOINT_PROVIDER` - Provider type: `gitea` (default) or `git` (fallback)
- `GITEA_URL` - Gitea server URL (default: `http://localhost:3000`)
- `GITEA_USERNAME` - Gitea user email for authentication
- `GITEA_PASSWORD` - Gitea user password
- `GITEA_REPO` - Repository name for checkpoints (default: `workspace-checkpoints`)

**Provider Options:**

1. **Gitea Provider** (default, recommended)
   - Stores checkpoints in a Gitea repository at `localhost:3000`
   - Creates one repository with project folders (e.g., `workspace-checkpoints/project1/`, `workspace-checkpoints/project2/`)
   - Uses Gitea REST API for all operations
   - Works on Windows/Linux without Docker
   - Handles large files (>1MB) via raw download endpoint

2. **Git Provider** (fallback)
   - Stores checkpoints in a local git repository inside the Docker container
   - Located at `/workspace/.checkpoints` in the container
   - Uses git commands via Docker exec (development) or direct shell (production)
   - Requires `claude-code` Docker container to be running
   - Legacy option maintained for backwards compatibility

**How it works:**
- Each checkpoint is a tarball (`.tar.gz`) of the project directory
- Checkpoints are tracked in `.etienne/checkpoints.json` manifest file
- The manifest stores checkpoint metadata: timestamp, commit message, and git commit hash
- Restore operations extract the tarball and overwrite project files (except `checkpoints.json`)

To switch to the Git provider, set `CHECKPOINT_PROVIDER=git` in your `.env` file.

### OAuth Server (Authentication)

The frontend requires authentication via a lightweight OAuth/JWT server running on port 5950.

**Starting the OAuth server:**
```bash
cd oauth-server
npm install
npm run dev
```

**Default credentials:**
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| user | user123 | user |
| guest | guest123 | guest |

**User management:**

Users are configured in `oauth-server/config/users.json`. To add or change a password, generate a bcrypt hash:
```bash
cd oauth-server
npm run hash-password YourNewPassword123
```

Copy the output hash into the `passwordHash` field in `users.json`.

**Token behavior:**
- Access tokens expire after 15 minutes (configurable in `users.json`)
- Refresh tokens expire after 7 days
- "Remember me" stores tokens in localStorage; otherwise sessionStorage

### Starting up the services

Start the OAuth server on :5950
```
cd oauth-server
npm i
npm run dev
```
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

## User Authentication

The frontend requires authentication before use. You must start the OAuth server manually before accessing the application.

**Quick Start:**
1. Start the OAuth server (see "Starting up the services" above)
2. Open http://localhost:5000 in your browser
3. Login with username `user` and password `user123`

**Managing Users:**

Users and credentials are configured in [`oauth-server/config/users.json`](oauth-server/config/users.json). Each user has a username, bcrypt-hashed password, role, and display name.

**Available Roles:**
- `guest` - Read-only access
- `user` - Full chat and project access
- `admin` - All permissions including user management

**Creating Password Hashes:**

To add a new user or change a password, generate a bcrypt hash using the provided script:

```bash
cd oauth-server
npm run hash-password MyNewPassword123
```

This outputs a hash like `$2b$10$...` which you copy into the `passwordHash` field in [`users.json`](oauth-server/config/users.json).

**Example users.json entry:**
```json
{
  "id": "u4",
  "username": "newuser",
  "passwordHash": "$2b$10$your-generated-hash-here",
  "role": "user",
  "displayName": "New User",
  "enabled": true
}
```

## API Endpoints

### ClaudeController (`/api/claude`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/claude/addFile` | POST | Adds a file to a project's workspace. Creates project directories if they don't exist. |
| `/api/claude/getFile` | GET | Retrieves the content of a specific file from a project. |
| `/api/claude/listFiles` | GET | Lists all files and directories in a project's subdirectory. |
| `/api/claude/listProjects` | GET | Returns a list of all available projects in the workspace. |
| `/api/claude/strategy` | POST | Retrieves the `.claude/CLAUDE.md` strategy/prompt file for a project. |
| `/api/claude/strategy/save` | POST | Saves the `.claude/CLAUDE.md` strategy/prompt file for a project. |
| `/api/claude/filesystem` | POST | Returns the complete filesystem tree structure for a project. |
| `/api/claude/permissions` | POST | Gets the list of allowed tools/permissions for a project. |
| `/api/claude/permissions/save` | POST | Updates the allowed tools/permissions configuration for a project. |
| `/api/claude/assistant` | POST | Retrieves the assistant configuration including greeting message. |
| `/api/claude/chat/history` | POST | Gets the chat history for a project from the persistence layer. |
| `/api/claude/mcp/config` | POST | Retrieves the MCP server configuration from .mcp.json file. |
| `/api/claude/mcp/config/save` | POST | Saves MCP server configuration and updates Claude settings accordingly. |
| `/api/claude/streamPrompt/sdk` | GET (SSE) | Streams Claude Code execution with real-time updates via Server-Sent Events. Supports memory-enabled prompts. |

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

### Knowledge Graph & Vector Store (`/api/knowledge-graph/:project`)
| Path | Verb | Description |
|------|------|-------------|
| `/api/knowledge-graph/:project/documents` | GET | Lists all documents in vector store with metadata (ID, content, embeddings, uploadedAt, graph layer status). |
| `/api/knowledge-graph/:project/documents` | POST | Stores document in vector database with embedding and metadata. |
| `/api/knowledge-graph/:project/documents/:id` | GET | Retrieves document by ID from vector store. |
| `/api/knowledge-graph/:project/documents/:id` | DELETE | Deletes document from vector store by ID. Returns success status and remaining count. |
| `/api/knowledge-graph/:project/entities` | POST | Creates entity in RDF knowledge graph. |
| `/api/knowledge-graph/:project/entities/:id` | GET | Retrieves entity by ID from knowledge graph. |
| `/api/knowledge-graph/:project/entities` | GET | Retrieves entities by type (query param: `type`). |
| `/api/knowledge-graph/:project/entities/:id` | DELETE | Deletes entity and related vector documents. |
| `/api/knowledge-graph/:project/entities/:id/relationships` | GET | Retrieves all relationships for a specific entity. |
| `/api/knowledge-graph/:project/relationships` | POST | Creates relationship between entities in knowledge graph. |
| `/api/knowledge-graph/:project/search/hybrid` | POST | Performs hybrid search combining vector similarity and SPARQL graph queries. |
| `/api/knowledge-graph/:project/search/vector` | POST | Vector similarity search using OpenAI embeddings. |
| `/api/knowledge-graph/:project/search/sparql` | POST | Executes SPARQL query against knowledge graph. |
| `/api/knowledge-graph/:project/translate/sparql` | POST | Translates natural language to SPARQL using GPT-4. |
| `/api/knowledge-graph/:project/stats` | GET | Returns statistics (document count, entity count, triple count). |
| `/api/knowledge-graph/:project/parse-markdown` | POST | Extracts entities from markdown using AI and stores in both vector store and knowledge graph. |
| `/api/knowledge-graph/:project/entity-schema` | GET | Retrieves custom RDF ontology schema for entity extraction. |
| `/api/knowledge-graph/:project/entity-schema` | POST | Saves custom RDF ontology schema. Body: `{ schema: string }` |
| `/api/knowledge-graph/:project/extraction-prompt` | GET | Retrieves custom entity extraction prompt. |
| `/api/knowledge-graph/:project/extraction-prompt` | POST | Saves custom entity extraction prompt. Body: `{ prompt: string }` |

## Knowledge Base

The Knowledge Base feature provides a hybrid semantic search system combining **RDF knowledge graphs** and **vector stores** for intelligent information retrieval. It enables storing, querying, and visualizing structured knowledge extracted from documents.

### Architecture

The system consists of three microservices:

1. **Backend API** (`/backend` - NestJS on port 6060)
   - Coordinates between vector store and RDF store services
   - Handles entity extraction using OpenAI GPT-4.1-mini
   - Generates embeddings using OpenAI text-embedding-3-small
   - Provides unified REST API for knowledge graph operations

2. **Vector Store Service** (`/vector-store` - Python FastAPI on port 7100)
   - Multi-tenant ChromaDB server with project isolation
   - Each project gets dedicated ChromaDB instance: `workspace/<project>/knowledge-graph/chroma.sqlite3`
   - Uses cosine similarity for semantic search (configured via `hnsw:space: cosine`)
   - Persistent storage with HNSW indexing for fast retrieval
   - RESTful API: `/api/v1/{project}/collections/{collection}/...`

3. **RDF Store Service** (`/rdf-store` - Node.js Quadstore on port 7000)
   - Multi-tenant RDF triple store with LevelDB backend
   - Stores entities and relationships as RDF triples
   - Supports SPARQL 1.1 queries for graph traversal
   - Persistent storage: `workspace/<project>/knowledge-graph/` (LevelDB files)
   - RESTful API with SPARQL endpoint

### Entity Extraction & Storage Flow

Documents uploaded to the Knowledge Base are automatically processed:

1. **Upload** → Backend API receives markdown content
2. **Embedding Generation** → OpenAI creates vector embeddings (text-embedding-3-small)
3. **Vector Storage** → Document + embedding stored in ChromaDB via HTTP API
4. **Entity Extraction** (optional, if "Use Graph Layer" enabled):
   - OpenAI GPT-4.1-mini extracts entities using custom or default schema
   - Entities parsed from structured JSON response
5. **RDF Storage** → Entities and relationships stored as triples via Quadstore HTTP API
6. **Deduplication** → Entities deduplicated by type and ID before RDF insertion

### Customizable Schema & Prompts

Each project can customize entity extraction behavior:

**Entity Schema** (`.etienne-entity-schema.json`):
- Define entity types (e.g., Company, Employee, Technology, Product)
- Specify JSON schema for structured extraction
- Configure relationships between entity types
- Stored as RDF ontology definitions

**Extraction Prompt** (`.etienne-extraction-prompt.md`):
- Custom instructions for the AI extraction model
- Define extraction rules and guidelines
- Specify output format and entity criteria
- Fallback to default if not configured

Configuration files location:
```
workspace/<project>/knowledge-graph/
├── .etienne-entity-schema.json      # RDF ontology schema
└── .etienne-extraction-prompt.md    # Entity extraction prompt
```

### Query Capabilities

The Knowledge Base supports multiple query interfaces:

1. **Similarity Search** (Primary Interface)
   - Semantic search using ChromaDB cosine similarity
   - OpenAI embeddings for query vectorization
   - Configurable threshold filter (default: 20% minimum similarity)
   - Results sorted by similarity descending
   - Displays: Document ID, content preview, similarity score, graph layer status

2. **Natural Language Search** (Graph Layer)
   - Translates natural language to SPARQL automatically
   - Uses GPT-4 for query translation
   - Example: "Who works at which company?"

3. **SPARQL Queries** (Graph Layer)
   - Direct SPARQL query execution against Quadstore
   - Full SPARQL 1.1 specification support
   - Graph pattern matching and filtering

4. **Hybrid Search**
   - Combines vector similarity (70% weight) and graph queries (30% weight)
   - Provides comprehensive results from both systems
   - Merged and ranked by relevance score

### Data Visualization

The frontend provides an interactive graph visualization:

- **Graph Viewer**: Renders entities and relationships as interactive nodes/edges
- **Node Click**: Displays source documents containing clicked entities
- **Statistics Dashboard**: Shows entity counts, document counts, and RDF triple counts
- **Monaco Editor**: Inline SPARQL query editor with syntax highlighting

### Storage Requirements & Setup

**Services Required**:

1. **ChromaDB Vector Store** (port 7100):
   ```bash
   cd vector-store
   pip install -r requirements.txt
   python multi-tenant-chromadb.py
   ```
   - Uses ChromaDB 1.3.4+ with HNSW indexing
   - Persistent storage: `workspace/<project>/knowledge-graph/chroma.sqlite3`
   - Automatically configures cosine similarity for all collections

2. **Quadstore RDF Store** (port 7000):
   ```bash
   cd rdf-store
   npm install
   node server.js
   ```
   - Uses Quadstore with LevelDB backend
   - Persistent storage: `workspace/<project>/knowledge-graph/` (LevelDB)
   - SPARQL 1.1 query support

**External API Dependencies**:
- OpenAI API: Required for embeddings (`text-embedding-3-small`) and entity extraction (`gpt-4.1-mini`)
- Configured via `OPENAI_API_KEY` in backend `.env`

**Data Location**:
```
workspace/<project>/knowledge-graph/
├── chroma.sqlite3              # ChromaDB vector embeddings
├── CURRENT                     # LevelDB descriptor files
├── LOCK                        # LevelDB lock
├── LOG                         # LevelDB transaction log
├── MANIFEST-*                  # LevelDB manifest
└── *.ldb, *.log               # LevelDB SSTable files (RDF triples)
```

### Use Cases

- **Document Knowledge Extraction**: Upload research documents, extract entities automatically
- **Relationship Mapping**: Discover connections between people, companies, and technologies
- **Semantic Search**: Find documents by meaning, not just keywords
- **Graph Queries**: Answer complex questions requiring multi-hop reasoning
- **Custom Ontologies**: Define domain-specific entity types and relationships

## Dynamic Python MCP Tools

The Dynamic Python MCP Tools feature enables hot-reloadable Python tools that can be created by users or AI agents directly in project directories. These tools are automatically discovered and served through the existing MCP server at `localhost:6060/mcp` without requiring a server restart.

### Overview

This feature follows the same dynamic discovery pattern as the A2A tools: tools are generated per-request based on project context rather than being pre-registered at startup. This enables true hot-reload capability where changes are reflected immediately.

### Directory Structure

Python tools are placed in the `.etienne/tools/` directory within each project:

```
workspace/<project-name>/
├── .etienne/
│   └── tools/                    # Python MCP tools directory
│       ├── calculator.py         # Example tool
│       ├── hello_world.py        # Another tool
│       ├── requirements.txt      # Shared dependencies (auto-installed)
│       └── .packages/            # Auto-installed pip packages
└── ...
```

### Python Tool Format

Each Python tool is a self-contained file with metadata defined in the module docstring:

```python
#!/usr/bin/env python3
"""
MCP Tool: calculator
Description: Performs basic arithmetic operations (add, subtract, multiply, divide)
Input Schema:
    operation:
        type: string
        enum: [add, subtract, multiply, divide]
        description: The arithmetic operation to perform
        required: true
    a:
        type: number
        description: First operand
        required: true
    b:
        type: number
        description: Second operand
        required: true
"""

import json
import sys


def execute(args: dict) -> dict:
    """Execute the tool with the given arguments."""
    operation = args.get("operation")
    a = float(args.get("a", 0))
    b = float(args.get("b", 0))

    if operation == "add":
        result = a + b
    elif operation == "subtract":
        result = a - b
    elif operation == "multiply":
        result = a * b
    elif operation == "divide":
        if b == 0:
            return {"error": "Division by zero"}
        result = a / b
    else:
        return {"error": f"Unknown operation: {operation}"}

    return {"operation": operation, "a": a, "b": b, "result": result}


if __name__ == "__main__":
    # Read JSON input from stdin, execute, output JSON to stdout
    input_data = json.loads(sys.stdin.read())
    result = execute(input_data)
    print(json.dumps(result))
```

### Tool Naming Convention

Tools are automatically prefixed with `py_` to avoid conflicts with other MCP tools:
- File: `calculator.py` → MCP Tool: `py_calculator`
- File: `hello_world.py` → MCP Tool: `py_hello_world`

### Docstring Metadata Format

| Field | Description | Required |
|-------|-------------|----------|
| `MCP Tool:` | Tool name (used with `py_` prefix) | Yes |
| `Description:` | Human-readable description | No (defaults to "Python tool: {name}") |
| `Input Schema:` | YAML-like parameter definitions | No (defaults to empty object) |

**Input Schema Properties:**
- `type`: string, number, integer, boolean, array, object
- `description`: Parameter description
- `enum`: Allowed values array
- `default`: Default value
- `required`: Set to `true` to make parameter required

### Dependency Management

Dependencies are managed via a project-level `requirements.txt` file:

```
workspace/<project-name>/.etienne/tools/
├── requirements.txt    # pip requirements file
└── .packages/          # Auto-installed packages
```

**Auto-Installation:**
1. File watcher detects changes to `requirements.txt`
2. Backend automatically runs: `pip install -r requirements.txt --target .etienne/tools/.packages`
3. `PYTHONPATH` is set during tool execution to include `.packages` directory

### Discovery & Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. TOOL CREATION                                               │
│  Agent/user writes: .etienne/tools/mytool.py                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. FILE DETECTION                                              │
│  Chokidar watcher detects .py file → invalidates cache          │
│  If requirements.txt changed → runs pip install                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. TOOL DISCOVERY (on MCP tools/list request)                  │
│  - Glob .etienne/tools/*.py files                               │
│  - Parse docstring metadata from each file                      │
│  - Return tools with py_ prefix                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. TOOL EXECUTION (on MCP tools/call request)                  │
│  - Spawn subprocess: python3 mytool.py                          │
│  - Send args via stdin as JSON                                  │
│  - Collect stdout as JSON result                                │
│  - 30s timeout (configurable)                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Hot-Reload Behavior

| Event | Action |
|-------|--------|
| `.py` file created | Cache invalidated, tool available on next `tools/list` |
| `.py` file modified | Cache invalidated, changes reflected on next `tools/list` |
| `.py` file deleted | Cache invalidated, tool removed from next `tools/list` |
| `requirements.txt` changed | Auto pip install, then cache invalidated |

### Environment Variables

Tools receive these environment variables during execution:

| Variable | Description |
|----------|-------------|
| `PROJECT_ROOT` | Absolute path to the project directory |
| `PYTHONPATH` | Includes `.etienne/tools/.packages` for imports |

### Example: Creating a Tool

1. **Create the tool file:**
   ```bash
   # In workspace/pet-store/.etienne/tools/weather.py
   ```

2. **Write the tool code** with docstring metadata

3. **Add dependencies** (optional):
   ```bash
   echo "requests>=2.28.0" >> .etienne/tools/requirements.txt
   ```

4. **Test via MCP:**
   ```bash
   curl -X POST http://localhost:6060/mcp \
     -H "Content-Type: application/json" \
     -H "X-Project-Name: pet-store" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

5. **Call the tool:**
   ```bash
   curl -X POST http://localhost:6060/mcp \
     -H "Content-Type: application/json" \
     -H "X-Project-Name: pet-store" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"py_weather","arguments":{"city":"Berlin"}}}'
   ```

### Security Considerations

- Tools execute as subprocess on the backend host
- 30-second default timeout prevents runaway processes
- Tools can only access files within the project directory via `PROJECT_ROOT`
- Consider network restrictions for production deployments

### Agent Skill: create-mcp-tool

A skill is available to help Claude Code create MCP tools correctly. The skill is pre-installed in the `onboarding` project and can be copied to any project.

**Skill location**: `.claude/skills/create-mcp-tool/SKILL.md`

The skill provides:
- Complete Python tool template
- Docstring metadata format reference
- Dependency management instructions
- Error handling patterns
- Testing guidance

To use the skill, ask Claude Code to "create an MCP tool" and it will follow the conventions defined in the skill.

## Context Management / Metadata Layer

The Context Management system provides fine-grained control over which data sources Claude Code can access during task execution. By applying tags to files, vector documents, and knowledge graph entities, you can create named contexts that scope the agent's view to only relevant information.

### Why Use Context Management?

- **Reduce Token Costs**: Limit Claude's filesystem and knowledge base access to only relevant files/data
- **Improve Response Quality**: Focus the agent on specific domains or project areas
- **Multi-tenant Isolation**: Separate customer data, departments, or project phases
- **Privacy & Security**: Exclude sensitive files or documents from specific sessions

### Filesystem Context

**a) Why to use?**

When working on large projects with hundreds of files, filesystem contexts allow you to tag files by domain (e.g., `frontend`, `backend`, `docs`) and create contexts that include/exclude specific tags. This prevents Claude from reading irrelevant files and reduces token consumption.

**b) How to apply in the UI**

1. Navigate to the **Filesystem** panel
2. Right-click any file or folder to open the context menu
3. Select **"Manage Tags"** to add tags like `api`, `frontend`, `tests`, etc.
4. Open **Project Menu → Context/Tagging** (or click the tag icon in the app bar)
5. Create a new context with:
   - **Include files with tags**: Select tags like `frontend`, `ui`
   - **Exclude files with tags**: Select tags like `tests`, `legacy`
6. Switch to the created context using the **Context Switcher** in the app bar

**c) How it affects the agent's data access internally**

When a context is active for a session, the backend filters the filesystem tree returned to Claude Code based on tag rules:
- Files with matching include tags are shown
- Files with exclude tags are hidden, even if they match include tags
- The agent can only read, edit, or reference files within the scoped view
- API endpoint: `GET /api/workspace/:project/contexts/:contextId/scope` returns filtered file paths

### Vector Store Context

**a) Why to use?**

Vector stores contain embedded documents for semantic search. By tagging documents (e.g., `product-docs`, `customer-feedback`, `internal-wiki`), you can create contexts that limit which document collections Claude can search through, improving search relevance and reducing API costs.

**b) How to apply in the UI**

1. When uploading documents to the **Knowledge Graph Browser**, add tags during upload
2. Alternatively, tag existing documents via the document management interface
3. Open **Project Menu → Context/Tagging**
4. Create a new context and configure:
   - **Vector document tags**: Select tags like `product-docs`, `api-specs`
5. Activate the context using the **Context Switcher**

**c) How it affects the agent's data access internally**

When a context with vector tag filters is active:
- Semantic search queries are restricted to documents matching the specified tags
- The vector store filters results by metadata tags before computing similarity scores
- Only matching documents contribute to the agent's knowledge retrieval
- ChromaDB metadata filter: `where: { "tags": { "$in": ["selected-tag"] } }`

### Knowledge Graph Context

**a) Why to use?**

Knowledge graphs store structured entities (People, Companies, Products) and relationships extracted from documents. Contexts allow you to scope queries to specific entity types or tagged subgraphs, enabling domain-specific reasoning while excluding unrelated data.

**b) How to apply in the UI**

1. Ensure entities are tagged during ingestion (e.g., `project-alpha`, `Q4-2024`)
2. Open **Project Menu → Context/Tagging**
3. Create a new context and configure:
   - **Entity tags**: Select tags like `project-alpha`, `customer-facing`
   - **Entity types**: Select types like `Person`, `Company`, `Product`
4. Activate the context via the **Context Switcher**

**c) How it affects the agent's data access internally**

When a knowledge graph context is active:
- SPARQL queries are automatically filtered by entity type and tag predicates
- Only entities matching the context's type/tag filters are returned
- Relationship traversal is limited to entities within scope
- Example SPARQL filter: `?entity rdf:type <Company> . ?entity etienne:hasTag "project-alpha"`
- Natural language to SPARQL translation includes context filters automatically

### Session-Level Context Switching

Each chat session maintains its own active context independently. This enables:
- **Multi-user scenarios**: Different users working on the same project with different data scopes
- **Task isolation**: Switch contexts mid-conversation without affecting other sessions
- **Context comparison**: Run the same query in different contexts to compare results

The active context is stored in session metadata (`GET /api/sessions/:project/:sessionId/context`) and applied automatically to all data access operations during that session.

## Observability

The backend supports OpenTelemetry-based observability for monitoring LLM conversations and tool usage. When enabled, traces are sent to an OTLP-compatible collector like [Arize Phoenix](https://phoenix.arize.com/).

### Configuration

Set these environment variables in `backend/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_ENABLED` | Set to `"true"` to enable telemetry | (disabled) |
| `PHOENIX_COLLECTOR_ENDPOINT` | Base URL of the OTLP collector | `http://localhost:6006` |
| `OTEL_SERVICE_NAME` | Service name in traces | `etienne` |

### Starting Phoenix Locally

```bash
docker run -d --name phoenix -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
```

Then enable telemetry:

```bash
# Add to backend/.env
OTEL_ENABLED=true
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006
```

### Traced Information

The implementation follows [OpenInference Semantic Conventions](https://github.com/Arize-ai/openinference) for LLM-specific attributes.

**Conversation Spans (Agent):**
- `llm.model_name`, `llm.provider`, `llm.system`
- `llm.token_count.prompt`, `llm.token_count.completion`, `llm.token_count.total`
- `input.value`, `output.value` (prompt and response)
- `session.id`, `project.name`, `user.id`
- `agent.tools_used`, `agent.tool_call_count`

**Tool Spans (nested under conversation):**
- `tool.name`, `tool.parameters`, `tool.output`
- `tool.status` (success/error), `tool.duration_ms`
- `tool.error_message` (if applicable)

### Viewing Traces

1. Open Phoenix UI at `http://localhost:6006`
2. Navigate to the Traces view
3. Filter by `project.name` or `session.id` to find specific conversations
4. Click on a trace to see the conversation span with nested tool spans

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

* **Dynamic Python MCP Tools** (Hot-Reloadable)
  Enables users and agents to create Python-based MCP tools directly in project directories that are automatically discovered and served by the existing MCP server without restart. Tools placed in `.etienne/tools/*.py` are detected via file watcher, parsed for metadata, and exposed as `py_<toolname>` tools. Supports automatic pip dependency installation from `requirements.txt`. See [Dynamic Python MCP Tools](#dynamic-python-mcp-tools) section below for details.

* **Interceptors** ([/requirements-docs/prd-interceptors.md](requirements-docs/prd-interceptors.md))
  Implements real-time tracking and tracing of Claude Code's behavior through hooks and events. All tool calls (PreToolUse/PostToolUse) and system events are captured, stored in-memory, and streamed to the frontend via SSE. This provides complete visibility into the agentic cycle for debugging, monitoring, and understanding Claude's decision-making process.

* **Cancel and Limit Agentic Cycle** ([/requirements-docs/prd-cancel-and-limit-agentic-cycle.md](requirements-docs/prd-cancel-and-limit-agentic-cycle.md))
  Provides user control over long-running agentic loops through configurable max-turns limits and a process abortion mechanism. Users can set a maximum number of agentic cycles (default: 5, 0=unlimited) and abort running processes via a stop button. This prevents runaway costs and allows quick iteration during development.

* **Strategy** ([/requirements-docs/prd-strategy.md](requirements-docs/prd-strategy.md))
  Allows per-project customization of Claude's system prompt through a `.claude/CLAUDE.md` file. Users can edit the strategy file directly in a Monaco editor to define the agent's role, behavior, domain knowledge, and task-specific instructions. This enables tailoring Claude's behavior for different project types and workflows.

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

## File Type Previewers

The frontend includes specialized preview components for various file types through the [FilePreviewHandler](frontend/src/services/FilePreviewHandler.js) service. When files are selected in the filesystem browser, they are automatically opened in the appropriate viewer component within the Artifacts pane.

### Supported File Types

| File Extension | Viewer Component | Description |
|----------------|------------------|-------------|
| `.html`, `.htm` | [LiveHTMLPreview](frontend/src/components/LiveHTMLPreview.jsx) | Renders HTML files in a sandboxed iframe with automatic refresh on file changes |
| `.json` | [JSONViewer](frontend/src/components/JSONViewer.jsx) | Displays JSON data with syntax highlighting and formatting |
| `.md` | [MarkdownViewer](frontend/src/components/MarkdownViewer.jsx) | Renders Markdown files with full formatting support |
| `.mermaid` | [MermaidViewer](frontend/src/components/MermaidViewer.jsx) | Renders Mermaid diagrams (flowcharts, sequence diagrams, etc.) |
| `.research` | [ResearchDocument](frontend/src/components/ResearchDocument.jsx) | Specialized viewer for research documents with structured content |
| `.jpg`, `.jpeg`, `.png`, `.gif` | [ImageViewer](frontend/src/components/ImageViewer.jsx) | Displays images at original size with extracted header metadata (dimensions, bit depth, color type, compression) |
| `.xls`, `.xlsx` | [ExcelViewer](frontend/src/components/ExcelViewer.jsx) | Interactive Excel spreadsheet viewer using SheetJS and wolf-table with multi-sheet support, scrollable/resizable cells, Roboto font, and read-only mode |

### How It Works

1. **FilePreviewHandler** detects file extensions and publishes `FILE_PREVIEW_REQUEST` events to the event bus
2. **ArtifactsPane** listens for these events, closes the filesystem drawer, and switches to the "Artifacts" tab
3. **FilesPanel** renders the appropriate viewer component based on the file extension
4. For unsupported file types, content is displayed as plain text with monospace formatting

The preview system is integrated with the [Interceptors](requirements-docs/prd-interceptors.md) feature to automatically refresh previews when files are modified by Claude Code.

## Messenger Integration

Etienne supports external messaging platform integration, allowing users to interact with projects directly from messaging apps like Telegram. The system uses a secure pairing mechanism where all users are blocked by default until explicitly approved by an admin.

### Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Telegram User  │     │  Telegram Provider   │     │    Backend      │
│                 │     │    (port 6350)       │     │  (port 6060)    │
└────────┬────────┘     └──────────┬───────────┘     └────────┬────────┘
         │                         │                          │
         │  1. Send message        │                          │
         │ ───────────────────────>│                          │
         │                         │  2. Check session        │
         │                         │ ────────────────────────>│
         │                         │                          │
         │                         │  3. Forward to Etienne   │
         │                         │ ────────────────────────>│
         │                         │                          │
         │                         │  4. Etienne response     │
         │                         │ <────────────────────────│
         │  5. Reply to user       │                          │
         │ <───────────────────────│                          │
```

**Components:**
- **Telegram Provider** (`/telegram`) - Grammy-based bot using long polling, handles messages and media uploads
- **Remote Sessions Module** (`/backend/src/remote-sessions`) - Manages session mappings and pairing requests
- **Frontend Pairing Modal** - Admin approval interface for new user pairing requests

### Configuration

Create a `.env` file in the `/telegram` directory:

```env
# Required: Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your-bot-token-here

# Optional: Backend URL (default: http://localhost:6060)
BACKEND_URL=http://localhost:6060
```

To create a Telegram bot:
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token provided by BotFather

### Usage Guide

**Starting the Provider:**
```bash
cd telegram
npm install
npm run dev   # Development mode
```

**Pairing Flow:**
1. User sends `/start` to the Telegram bot
2. A pairing request appears in the Etienne web UI
3. Admin clicks **Approve** or **Deny** in the modal dialog
4. Once approved, user can select a project and start chatting

**Available Commands:**
| Command | Description |
|---------|-------------|
| `/start` | Begin pairing or show current status |
| `/status` | Show current session status |
| `/projects` | List available projects |
| `/disconnect` | Disconnect from Etienne |
| `/help` | Show available commands |

**Project Selection:**
```
project 'project-name'
```

**Sending Files:**
Users can send photos, documents, videos, and audio files which are automatically uploaded to the project's `.attachments` folder.

**More information:** See [telegram/README.md](telegram/README.md) for complete documentation including troubleshooting and development guides.

# Maintainer
Brought to you by **[e-ntegration GmbH](https://e-ntegration.de)**, Nürnberg, Germany.

<div align="center">
<img src="/docs/images/etienne-in-action.jpg" alt="Etienne in action" width="900">
</div>

**Happy building!**