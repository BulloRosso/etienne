<div align="center">
<img src="/docs/images/etienne-logo.png" alt="Etienne Logo" width="200">
</div>

# Etienne - AI Coworker

Meet Etienne — a proactive AI coworker built to work alongside you on your local data and navigate even the most complex IT systems on your behalf.

<div align="center">
<img src="/docs/images/core-workflow.jpg" alt="Core Workflow" style="marginBottom: 24px" width="900">
</div> 

## Sample Projects

Technologies are easier to understand when you can follow a storyline that shows how they work together.

To get you started, we've included [4 project templates](/scripts/readme.md) preloaded with ready-to-go sample data. Each one comes with a storyline explained in its own LinkedIn article.


<div align="center">
<img src="/docs/images/time-horizons.jpg" alt="Project Templates" style="marginBottom: 24px" width="900">
</div> 

These projects showcase how to setup and maintain agentic memory for real-life projects - and how to solve all the UI related integration problems you will face on the way.

## Mission

Etienne is all about one thing: turning a general-purpose generative agent into a specialist that can handle the everyday tsunami of business information for you.


<div align="center">
<img src="/docs/images/tsunami.jpg" alt="Tsunami of information" style="marginBottom: 24px" width="800">
</div> 

As a forward deployed engineer (FDE) this would be my job together with you and your team. But this repository gives you the basic tooling to tackle complex tasks in harness engineering.

## Enterprise Perspective

This project is a starting point to address **integration challenges** in typical enterprise environments:

* Identity and Access Management (e. g. AWS Cognito or Microsoft EntraID)
* Compliance with Standards and how to build bridges between them (e. g. MCP, MCP UI, A2A, AG-UI)
* Deployments (e. g. Azure App Service and Foundry Hosted Agents)
* Data Governance (e. g. local files vs. cloud, Microsoft OneDrive, Sharepoint)
* Secrets Management (e. g. Azure KeyVault)
* Budget Monitoring and Limiting
* Security Considerations (e. g. RBAC role based access)

Because of all these adapters/integrations this project is large and it IS NOT for you if you want to get started with harness engineering for hobby projects.

## Quick Install (Developer Setup)

One-line bootstrap that installs the **developer** (non-Docker) version of Etienne. It will:

- Install **Node 22** (via `winget` / `brew` / NodeSource) if not already present
- Install **uv** and then **Python 3.14** (falls back to 3.13) if not already present
- Clone this repo to a directory you choose
- Prompt you for your **Anthropic API key** and write it into `backend/.env`
- `npm install` / `uv sync` all seven services (backend, frontend, oauth-server, vector-store, knowledge-graph, webserver, rdf-store)
- Start every service in its own terminal window and open http://localhost:5000

You will need: **an Anthropic API key**, plus `git` already installed.

### Windows (PowerShell)

```powershell
iwr https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.ps1 -OutFile install.ps1; .\install.ps1
```

### macOS / Linux (bash)

```bash
curl -fsSL https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.sh | bash -s -- ~/etienne
```

Sources: [scripts/install.ps1](scripts/install.ps1), [scripts/install.sh](scripts/install.sh). For manual setup, see [Starting up the services](#starting-up-the-services) below.

## How it technically composed in one sentence

Etienne is an **integration harness** around a **coding harness** to build user friendly agent interactions:

<div align="center">
<img src="/docs/images/core-functions.jpg" alt="Core Functions" style="marginBottom: 24px" width="500">
</div> 

<br>

> Etienne showcases how to attach typical business requirements to a 
> **coding agent harness** in order to enable a non-technical user 
> to interact with the agent using a refined UI.

<br>
There are two user experiences available:
<br>

### Classic UX 

<div align="center">
<img src="/docs/images/ui-example.jpg" style="marginTop: 24px;marginBottom: 24px" alt="UI example" width="900">
</div> 

### Minimalistic UX 

<div align="center">
<img src="/docs/images/minimal-ux.jpg" style="marginTop: 24px;marginBottom: 24px" alt="UI example" width="900">
</div> 

<br>

This setup addresses the use case **business collaborator agent** working on local data.

The user interface is available for these languages:
* English (US)
* German (DE)
* Chinese (mandarin)

Etienne's UI is build around **role based access control** with these basic roles (can be enhanced):

<div align="center">
<img src="/docs/images/rbac.jpg" alt="Role based access control" width="900">
</div> 

Etienne uses different **roles to have clear responsibilities defined** - it is usually NOT deployed as a personal AI assistant where the admin and the user role would be the same person.

# Why Etienne

Etienne exists because most AI agent products treat the LLM as the centerpiece. Etienne treats the LLM as a component inside an engineered system. Three threads make up that argument: the manifesto (what we believe), context engineering (how we keep the model focused), and a comparison with OpenClaw (how we differ from messenger-style agents).

## The Etienne Manifesto: It's all about Engineering, not LLM magic!

<div align="center">
<img src="/docs/images/etienne-manifesto.jpg" style="marginTop: 24px" alt="Etienne Manifesto" width="700">
</div> 

**Focused on usability and simplicity.** I build it because I like to use it myself. And one day, I might build an entirely different business on top of it. If the builder doesn't enjoy the tool, nobody will.

**Aware of its place in a bigger world.** Etienne doesn't try to be everything. It's designed to run inside an agentic OS — something like OpenAI Frontier — which handles all the infrastructure burdens I don't want to reinvent: prompt injection detection and prevention, data access policies, audit trails for compliance. Etienne is the agent experience layer. The platform handles the plumbing.

**Deterministic where it counts.** Here's the quiet revolution: Etienne introduces traditional control mechanisms into the agentic world. CRON jobs for scheduling. Finite state machines for workflows. Ontology graphs for knowledge acquisition. Decision graphs built on top of those ontologies. An internal agent event bus combined with external triggers — email, MQTT, webhooks. 

**Isolated by design.** Every task lives inside a project. Knowledge graphs, decision graphs, workflows, data — all of it is scoped to a defined mission statement. No bleed. No confusion. No agent accidentally applying restaurant marketing logic to your medical practice.

**Composable everywhere.** Use standard agent skills to enhance process knowledge. Use MCP tools to enhance data access. Use file previewers and editors to let users manipulate complex results directly — modifying a CAD object, controlling a robot, reviewing a financial model. The agent doesn't just produce output. It produces editable output.

**Built for continuous improvement.** Project-level knowledge graphs and decision graphs can be promoted to the company level — managed as Microsoft Fabric IQ objects and rules. Agent skills developed in one project can be submitted to an administrator for review, then published to a local skill store, making them available to every other user. The system learns. Not in the fuzzy, hand-wavy way that LLMs "learn." In the structured, auditable, improvable way that actual organizations need.

**Respectful of security.** Etienne provides a role-based access control core around APIs and UI, adaptable to any existing identity management system — EntraID, Okta, whatever your company already runs. It supports Git-controlled versioning, backup and restore, and defined releases aligned to basic compliance rules. Event logs and settings live in defined, inspectable, auditable places. Your IT department won't love it on day one. But they won't block it either.

## Context Engineering

Etienne guides the business user to do proper context engineering. In the background it carefully balances the main context components to avoid context window overflow:

<div align="center">
<img src="/docs/images/context-engineering.jpg" style="marginTop: 24px" alt="Context Engineering" width="900">
</div> 

One of the most important strategies is to think in **isolated and scoped projects** — this allows to adjust for example the selected skills to the current user problem and makes it easy to "forget" (just delete the folder).

An agent is more "intelligent" if it has a notion of its own environment. For this reason there's a **world model skill** which is required for scenarios like self-healing or coding projects. In the first scenario this skill prevents the agent from endless codebase analysis and guides it directly to the closest location, in the second scenario this skill prevents the agent from recreating already existing infrastructure like the RDF store.

## Holy Crab! Is it like...???

The following comparison illustrates the conceptual differences between Etienne and OpenClaw as of early 2026:

<div align="center">
<img src="/docs/images/comparison.jpg" style="marginTop: 24px" alt="Comparison" width="600">
</div> 

# Table of Contents

- [Why Etienne](#why-etienne)
- [Core Concepts](#core-concepts) — artifacts, skills, connectivity, multi-agent, memory, web, prompt-injection security
- [What's in the Box](#whats-in-the-box) — components, ports, data model, supported coding models
- [Setup & Running](#setup--running)
- [Operations & Deployment](#operations--deployment)
- [Extended Capabilities](#extended-capabilities)
- [Demo Videos & Use Cases](#demo-videos--use-cases)
- [Articles & Maintainer](#articles--maintainer)

# Core Concepts

## Built for Artifacts

Of of the most valuable UI features is to work side by side with the agent on **complex results** (=artifact).

<div align="center">
<img src="/docs/images/general-assistant-scrapbook.jpg" alt="Artifact editing" width="900">
</div>

Many configurator or data exploration use cases greatly benefit from this kind of workflow:

1. **Describe** your problem in the chat pane
2. **AI agent generates first draft** and presents it in the artifacts pane
3. **User refines draft** either by clicking directly on a detail in the artifacts pane OR by asking the agent to make the change

This main **collaboration feature** sets Etienne apart from other agents like OpenClaw, which is focused on a command/execution pattern via a simple messenger user interface.

## Built around Skills

<div align="center">
<img src="/docs/images/skills-1.jpg" alt="Skills are cute" width="700">
</div>

This isn't science fiction. This is skill-based AI agent development, and it's about to change how your organization works with AI. What's even better: Agent Skills work across vendors. So if you later switch from an OpenAI-based solution to an Anthropic-based one — or any other provider — your investment in skills is preserved. No lock-in. No starting over.

### A Skill Is Simpler Than You Think (And That's the Point)

<div align="center">
<img src="/docs/images/skills-2.jpg" alt="Business & Tech" width="500">
</div>

At its core, an agent skill is just two things working together:

* **A markdown file** written by a business expert — describing what to do, when to do it, and why it matters, in plain language anyone can read and understand.
* **Code snippets** (Python, JavaScript, or any language) contributed by an IT engineer — providing the technical muscle to execute that expertise.

That's it. Business knowledge meets technical capability in a single, portable folder.

<div align="center">
<img src="/docs/images/skills-3.jpg" alt="What Skills do" width="800">
</div>

When a user describes their task, the agent doesn't just process words — it recognizes which skill matches the situation, loads the relevant business expertise, and seamlessly translates the user's intent into the right technical execution. The business expert's judgment guides the engineer's code. The result? AI that doesn't just respond — it understands your business.

For the full lifecycle (admin curation → user pick → agent use → in-project refinement → submit-back), the five guarantees this lifecycle delivers, and the enterprise-grade Skills Store with technical-dependency and environment-variable metadata, see [Skills: Lifecycle, Guarantees, and the Skills Store](docs/skills.md).

Skills can also grow autonomously: Etienne's offline **dreaming** process reflects nightly on recent sessions and proposes new strategy SKILL.md cards for human review. See [Dreaming: How an Agent Learns From Itself While You Sleep](docs/dreaming.md) for the full pipeline, the wiki dual-store layout, and the human-in-the-loop feedback model.

## Application Types — Domain UI Layered on a Project

Where skills give an agent capabilities, **application types** give a project a custom UI affordance. Attaching `research-project` to a project, for example, surfaces a coloured sidebar section above the regular Projects list with one click each for: a *Running workflows* modal, an *Executive Briefing* report, an *Engineering FAQ*, an *Onboarding Study Guide* and a *Decision Register*. The report links trigger preregistered subagents through the Task tool.

Application types are version-controlled drop-in folders under `application-types-repository/`. Modal UIs are MCP UI resources rendered in a sandboxed iframe — framework-agnostic, decoupled from the host's React/MUI versions, no shared-package constraints.

See [Application Types: Domain UI Layered on a Project](docs/application-types.md) for the config schema, the four menu-item types (`url`, `document`, `modal`, `subagent`), the MCP UI resource model, and how to author a new type.

## Built for Connectivity

See [Event Bus Components — Integrated AI Agent Architecture](event-bus-architecture.md).

## Multi-agent Orchestration

Multi-agent orchestration is supported with `CODING_AGENT=anthropic` and `CODING_AGENT=open-code`. You can define subagents in the project menu:

<div align="center">
<img src="/docs/images/multi-agent-orchestration.jpg" alt="Managed Etienne" width="700">
</div>

With **Anthropic**, the Claude Agent SDK picks up subagents and runs them in parallel or in sequence whenever it detects tasks might benefit from doing so. Your subagents will be used additionally to the built-in Claude agents.

With **OpenCode**, subagent definitions from `.claude/agents/*.md` are automatically translated to OpenCode's native agent format. OpenCode supports hierarchical agent delegation with configurable depth limits and call budgets.

**Codex AppServer** does not support orchestration though it can use and understand a subagent definition. **pi-mono** simulates subagents via a custom Task tool that spawns nested sessions.

## Memory

Etienne provides an exchangable endpoint to extract memories from a user prompt and store them inside the project.

Memory extraction is activated per default and can be accessed via the green memory card icon below the app bar.

<div align="center">
<img src="/docs/images/memory.jpg" alt="Memory pane" width="400">
</div>

Memories are stored per project and not globally in the default configuration. The extraction prompt is adjustable to sharpen the focus to certain business domain relevant information.

See [User Orders](user-orders.md).

### Adaptive Memory (Triple-P)

On top of the basic memory extraction Etienne implements a **Triple-P** agent
memory loop — Picker / Packer / Ponderer — built atop the existing Skills,
Sessions, Dreaming, ChromaDB (RAG), and Quadstore (KG) modules:

- **Picker** assembles candidate context from Wiki / KG / RAG / Preferences / SOR.
- **Packer** trims to fit the token budget and enforces a `public` / `private` /
  `secret` classification firewall before context reaches the LLM.
- **Ponderer** runs nightly: scores sessions, prunes stale state, induces
  cross-project personality principles, rewrites the dreaming skill from
  user feedback, and publishes a Review Queue.

A project opts in by creating
`workspace/<project>/.etienne/adaptive-memory.config.json` (most easily via
the Settings tab inside the Adaptive Memory dialog — open it from the
**Adaptive Memory** tile on the dashboard grid). The file's existence is
the activation switch — without it the Ponderer cron is not registered and
the within-task endpoint returns `409`.

**Full architecture, storage map, firewall details, API surface, and tests:**
[adaptive-memory.md](adaptive-memory.md).

## The Web: Searching, Scraping and Browsing

Use the **web-scraping skill** to enable the agent to interact with websites on the internet.

<div align="center">
<img src="/docs/images/web-access.jpg" alt="Interacting with websites" width="800">
</div>

It uses these technologies by default:

* **Web search**: The default tool included in Claude Code or Codex. Uses the search index of Anthropic or OpenAI.

* **Web scraping**: Uses the Scrapling GitHub project which is fast and can process Javascript sites. It is a common choice for red-teaming tasks.

* **Web browsing**: Uses Vercel's [agent-browser](https://github.com/vercel-labs/agent-browser) package, a headless browser automation CLI designed for AI agents. Pre-installed in the Docker image via `npm install -g agent-browser` with Chromium pre-downloaded. It is a good choice for cooperative sites and a token saver (compared to pure Playwright implementations). The browser daemon can be managed from the service console. Keep in mind that it is not suited to interact with websites which deploy anti-bot/anti-agent techniques like captchas or fingerprinting!

## Securing the Agent against Prompt Injection

Prompt injection is the #1 security threat to AI agents right now.

When Etienne connects to tools and databases, every user input becomes a potential attack. Malicious prompts can trick it into leaking data, bypassing safety rules, or executing unintended actions.

The solution: a **security gateway** that sits between users and our AI models. It scans every request real-time, blocking attacks before they reach your systems. Simple concept, but here's the reality most vendors won't share:

Security isn't a one-time fix. New attack patterns emerge daily. Effective protection requires:
- ✅ Always-on cloud infrastructure (for speed)
- ✅ Continuous threat updates (not static rules)
- ✅ Active learning (adapting to new risks)

This means your security layer becomes a complex system itself. But that's the cost of staying protected.

<div align="center">
<img src="/docs/images/prompt-injection-2.jpg" alt="Prompt Injection" width="700">
</div>

Start your security journey with understanding these services:
* NeuralTrust API Gateway
* Google ModelArmorAPI
* AWS Bedrock Guardrails

# What's in the Box

## Main Components

This repo contains 3 mandatory servers, 6 optional servers and many modules. Modules can be removed if their functionality is not required (e. g. A2A Client, Observability, SMTP IMAP).

<div align="center">
<img src="/docs/images/servers-modules.jpg" alt="Servers and modules" width="900">
</div>

The following diagram shows the essential internal and external ports of a deployed Etienne instance:

<div align="center">
<img src="/docs/images/system-context.jpg" alt="System Context" width="900">
</div>

While the workbench (React frontend) serves as the primary user interface, messengers can optionally be added as secondary/mobile user interfaces. Real-time communication between frontend and backend uses Server-Sent Events — see [SSE Real-Time Communication](SSE-between-frontend-and-backend.md).

## The Agent and the outside World

Etienne is built to maximize what an AI agent can do outwardly in commercial and operational contexts. It focuses on professional automation protocols in a single deployment, which is what commercial environments actually run on.

<div align="center">
<img src="/docs/images/etienne-outside-world.jpg" alt="Outside world" width="900">
</div>

Etienne extends the system boundary itself by implementing and exposing new interfaces such as MCP servers, API endpoints, or web applications. Etienne is about turning an agent into infrastructure.

See [HITL Protocol Support](hitl-protocol.md).

## Focused on Data and Local Services

Etienne's data structures are build around the idea of keeping things local and separated. This might be a strange concept of self-containment if you are a cloud developer and your daily-business is dealing with shared services like databases.

### Workspace & Projects

Etienne expects all the user data inside a single local **workspace directory** (or in case of Docker deployment a single mount). The subdirectories in the workspace are the **projects**. While in advanced use cases the agent can work cross-project the default setting for the **coding agent's root directory** is set at project level.

Inside the workspace the usual `.` convention applies: the user cannot see any internal files or directories starting with a `.` character. Only the admin role can see these files via the UI.

<div align="center">
<img src="/docs/images/file-explorer-1.jpg" alt="Filesystem user perspective" width="500">
</div>

All relevant settings and data are kept on project level to ensure two features:
* **Right to forget** — if sensitive data was processed inside one project, it will be purged when the directory is deleted
* **Portability** — users can exchange a complete project by simply copying the directory

### Service Control & Project-aware Services

The user interface provides access to the process-manager API which is responsible for starting/stopping local servers on different ports. This feature is not so much targeted at human usage but to give the agent the ability to decide which services to ramp up: there is an MCP server with a MCP App(UI) which enables the user to access service control also in the chat pane.

All local **services treat projects like tenants**: they store their data (also temp files) in subdirectories of the project folder and serve them from this location. In the example of the RDF store ("knowledge graph"), log and data files live inside the project's directory.

See [Self-Healing Capabilities](self-healing.md).

## Supported Coding Models

Though Etienne was initially implemented for the Anthropic Claude Agent SDK you can use other (coding) models by setting the **CODING_AGENT** variable in the .env file in the backend:

<div align="center">
<img src="/docs/images/coding-agents.jpg" alt="Coding agents" width="700">
</div>

The main drawback with other models is limited support for MCP tools or agent skills which becomes obvious with more complex agentic tasks. **OpenCode** (`CODING_AGENT=open-code`) is a notable exception — it provides native MCP, subagent, skill, and elicitation support on par with the Anthropic harness, plus LSP integration and 75+ model support.

### Coding Agent Feature Matrix

| Feature | Anthropic | Codex | OpenAI Agents | pi-mono | OpenCode |
|---|:-:|:-:|:-:|:-:|:-:|
| **Subagents** | Native SDK | Understands defs | Agents-as-tools | Simulated (Task tool) | Native (agent system) |
| **MCP tools** | Native | Native | Native | Bridge (tools only) | Native |
| **MCP resources/prompts/sampling** | Yes | Yes | Partial | No | Yes |
| **Agent skills** | agentskills.io | Via AGENTS.md | Via AGENTS.md | Via skills dir | Native skill tool |
| **Elicitations (AskUserQuestion)** | AskUserQuestion tool | No | No | Via beforeToolCall | question tool |
| **Plan mode** | Built-in | No | No | No | Custom modes |
| **File Explorer** | Agent-agnostic REST | Agent-agnostic REST | Agent-agnostic REST | Agent-agnostic REST | Agent-agnostic REST |
| **Multi-provider models** | Anthropic only | OpenAI only | OpenAI only | 50+ providers | 75+ providers |
| **LSP / code intelligence** | No | No | No | No | 30+ languages |
| **Permission prompts** | canUseTool callback | No | No | beforeToolCall bridge | permission.asked events |
| **Streaming text** | Yes | Yes | Yes | Yes | Yes |
| **Streaming thinking** | Yes | Reasoning events | No | Yes | Yes (reasoning field) |
| **Token/cost tracking** | Yes | Yes | Yes | Yes | Yes |
| **Session resume** | Yes | Yes | No | Yes | Yes (SQLite) |
| **Guardrails (input/output)** | Yes | Yes | Yes | Partial | Yes |
| **Memory / RAG** | Yes | Yes | Yes | Yes | Yes |

For detailed configuration and architecture of each agent, see:
- [CODEX_SUPPORT.md](CODEX_SUPPORT.md) — OpenAI Codex integration
- [OPENCODE_SUPPORT.md](OPENCODE_SUPPORT.md) — OpenCode integration
- [backend/src/claude/pi-mono-sdk/README.md](backend/src/claude/pi-mono-sdk/README.md) — pi-mono integration

# Setup & Running

See [API Keys & Secrets Management](api-keys-secrets.md) for how Etienne stores credentials.

## Checkpoints

The checkpoint feature requires **Gitea** to be installed and running on `localhost:3000`. Checkpoints create versioned backups of your project workspace and store them in a Gitea repository.

**Prerequisites:**
- Gitea server running on port 3000
- Valid Gitea user account (configured in `.env`)

**Configuration** — environment variables in `.env`:
- `CHECKPOINT_PROVIDER` — Provider type: `gitea` (default) or `git` (fallback)
- `GITEA_URL` — Gitea server URL (default: `http://localhost:3000`)
- `GITEA_USERNAME` — Gitea user email for authentication
- `GITEA_PASSWORD` — Gitea user password
- `GITEA_REPO` — Repository name for checkpoints (default: `workspace-checkpoints`)

**Provider Options:**

1. **Gitea Provider** (default, recommended) — stores checkpoints in a Gitea repository at `localhost:3000`, creates one repository with project folders (e.g., `workspace-checkpoints/project1/`), uses Gitea REST API, works on Windows/Linux without Docker, handles large files (>1MB) via raw download endpoint.
2. **Git Provider** (fallback) — stores checkpoints in a local git repository inside the Docker container at `/workspace/.checkpoints`, uses git commands via Docker exec (development) or direct shell (production), requires `claude-code` Docker container to be running, legacy option maintained for backwards compatibility.

**How it works:** Each checkpoint is a tarball (`.tar.gz`) of the project directory. Checkpoints are tracked in `.etienne/checkpoints.json` (timestamp, commit message, git commit hash). Restore operations extract the tarball and overwrite project files (except `checkpoints.json`).

To switch to the Git provider, set `CHECKPOINT_PROVIDER=git` in your `.env` file.

## OAuth Server (Authentication)

The frontend requires authentication via a lightweight OAuth/JWT server running on port 5950. You must start the OAuth server manually before accessing the application.

**Default credentials:**

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| user | user123 | user |
| guest | guest123 | guest |

**Available roles:**
- `guest` — read-only access
- `user` — full chat and project access
- `admin` — all permissions including user management

**User management:** users are configured in [`oauth-server/config/users.json`](oauth-server/config/users.json). Each user has a username, bcrypt-hashed password, role, and display name. To add or change a password, generate a bcrypt hash:

```bash
cd oauth-server
npm run hash-password YourNewPassword123
```

Copy the output hash into the `passwordHash` field in `users.json`. Example entry:

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

**Token behavior:**
- Access tokens expire after 15 minutes (configurable in `users.json`)
- Refresh tokens expire after 7 days
- "Remember me" stores tokens in localStorage; otherwise sessionStorage

## Starting up the services

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
Then **open your browser** with http://localhost:5000 and log in with `user` / `user123`.

## API Endpoints

* [Full API Reference](api.md)
* [Live API Documentation (ReDoc)](http://localhost:6060/docs)

See also: [Knowledge Base Feature](knowledge-base.md), [Context Management / Metadata Layer](context-management.md).

## UX Modes

The frontend supports a **verbose** mode (default — full AppBar, ChatPane header, project selector) and a **minimalistic** mode (resizable left sidebar with quick-access tiles). Toggle at runtime with **Ctrl+U** (persisted to localStorage). Cycle UI language with **Ctrl+L** (English / German / Italian / Chinese).

For configuration via `VITE_UX_TYPE`, sidebar sizing, and recent-items tracking see [User Experience Modes](docs/ux-modes.md).

# Operations & Deployment

## Managed Etienne

You can install Etienne locally, deploy it using the Docker (after you have built it from Docker the file provided) or get it hosted on AWS:

<div align="center">
<img src="/docs/images/managed-etienne.jpg" alt="Managed Etienne" width="800">
</div>

[Managed Etienne Landing Page](https://etienne-agent.replit.app/)

## Azure Foundry Deployment

Etienne deploys as an **Azure Foundry hosted agent** (Microsoft's bring-your-own-container agent runtime, public preview April 2026) — the recommended path for enterprise Azure environments. Benefits include managed microVM isolation with scale-to-zero, automatic Entra Agent ID provisioning, IQ grounding via MCP (Foundry IQ, Work IQ, Fabric IQ), and one-click distribution to Microsoft 365 Copilot and Teams. Foundry exposes only port 8088, so the React frontend is hosted separately (e.g., on Azure Static Web Apps).

For prerequisites, the full `az` CLI setup, frontend deployment, MCP IQ configuration, and scale-to-zero behavior, see [Azure Foundry Deployment](docs/deployment-azure-foundry.md).

## Observability

The backend supports OpenTelemetry-based observability for monitoring LLM conversations and tool usage. When `OTEL_ENABLED=true`, traces (conversation spans + nested tool spans, following [OpenInference Semantic Conventions](https://github.com/Arize-ai/openinference)) are sent to an OTLP-compatible collector like [Arize Phoenix](https://phoenix.arize.com/).

For environment variables, Phoenix setup, traced span attributes, and how to view traces, see [Observability](docs/observability.md).

## Architecture Decision Records

The architectural decisions behind Etienne are documented as formal ADRs in the [adrs/](adrs/README.md) directory. The 11 records cover project isolation, inner harness design, SSE communication, service connectivity (ZeroMQ, MCP, A2A), security, event-driven architecture, agentic behaviour, UX components, messenger integration, the external webserver, and cloud service integration. Each ADR includes mermaid diagrams and a base-value alignment check.

## IT Budget Situation

This project is in the middle between "Buy a complete AI agent solution" and "Build an AI agent framework from scratch". You should extend/modify it using Claude Code.

<div align="center">
<img src="/docs/images/buy-build.jpg" alt="Buy and Build" width="700">
</div>

It proposes to focus your development efforts on the business layer instead on the AI layer.

## Budget Tracking

Etienne tracks AI inference costs per project and enforces a **global** budget limit across all projects (the limit applies to total spend, not per-project, so work cannot be split to circumvent it). Tracking is always-on, session-based, and pre-flight enforced. Default limit: 200 €.

<div align="center">
<img src="/docs/images/budget-tracking.jpg" alt="Budget tracking pane" width="500">
</div>

For cost calculation, `.env` configuration, storage layout, the dashboard, and the SSE real-time update stream see [Budget Tracking](docs/budget-tracking.md). Governance-layer details: [MCP Registry/Governance Layer](mcp-registry.md).

# Extended Capabilities

## File Type Previewers

The previewer system routes file opens and service activations to specialized React viewer components. It uses a three-layer extension mapping (built-in defaults → system config → project overrides) and supports three classes of previewers: file-extension, service (e.g., `#imap/inbox`), and MCP UI (rendered via MCP tool calls). Built-in viewers cover HTML, JSON/JSONL, Markdown, Mermaid, images, Excel, PDF, DOCX, video, scrapbook, knowledge graph, workflow, requirements, artifacts, and more.

For the architecture diagram, key files, full extension table, context-menu actions with role gating, and recipes for adding new file/service/MCP UI previewers see [File Type Previewers](docs/file-previewers.md).

## Agent Email Account

Etienne can operate its own email account — monitoring an IMAP inbox for incoming mail and sending replies or notifications via SMTP. Two integration modes are supported: **MCP Tools** (on-demand, via `email_send` / `email_check_inbox`) and **event-driven** (a standalone IMAP Connector publishes new-mail events to the agent bus, where the rule engine can trigger workflows).

For the architecture diagram, secret formats (`IMAP_CONNECTION` / `SMTP_CONNECTION` / `SMTP_WHITELIST`), MCP tool details, the bus event payload, and the optional email skill see [Agent Email Account](docs/agent-email.md).

## OneDrive / Microsoft 365 Integration

Etienne can mirror a user's OneDrive (and SharePoint, in org mode) into a project's workspace volume so the coding agent reads and writes those files as if they were local. The integration uses a native Microsoft Graph client (no MCP pass-through) with per-project OAuth tokens, automatic 20 s delta pull, manual push to upload local changes, and an MCP tool surface at `/mcp/ms365` so Claude Code can manage its own connection.

For the architecture, sync strategy (pull-auto + push-manual), Entra app registration, env vars, and limitations see [OneDrive / Microsoft 365 Integration](one-drive.md).

## Agent Package Composer — Distribute Agents Between Instances

The composer turns a working agent project into a portable **Agent Package** — a manifest + lockfile + materialized `.claude/` tree bundled into a single zip. The intended use is **moving complete agent apps between Etienne instances**: an agency builds a specialized agent for a customer (legal intake, sales discovery, condition monitoring, …), promotes the working project to a package, and ships the zip. The customer imports it on their own Etienne instance and gets the same agent — same skills, same MCP servers, same subagents, same example files.

<div align="center">
<img src="/docs/images/agent-package-composer.jpg" alt="Agent Package Composer" width="900">
</div>

Two roundtrip paths, same materializer underneath:

- **Compose from scratch** — pick an application type, ticking skills / subagents / MCP servers / project templates from the five central catalogs. The composer continuously resolves dependencies (e.g. an application type may bundle subagents) and shows transitively-added items with a *provenance* badge so the user can tell what's theirs and what was pulled in automatically.
- **Promote a project** — an admin loads a project, opens the file explorer, ticks any *user-uploaded example files* (sample inputs in `data/`, reference docs, pre-populated databases) that should travel with the agent, and clicks **“Promote to package”** on the dashboard. The composer opens pre-populated from the project's existing state (application type, skills, subagents, MCP servers re-fetched from the registry — never from `.mcp.json`, so secrets don't leak) plus the ticked files as `extraFiles`.

From either entry point the user can then **Build zip** (portable artifact) or **Deploy** directly into a new local project. A built zip is applied on another instance via the **Import package…** dialog (or `curl` for headless servers). The lockfile is preserved verbatim on import, so identical packages produce identical projects regardless of catalog drift on the target.

Compositions can be saved as named **profiles** for reuse — `legal-intake`, `legal-litigation`, and `legal-compliance` typically share 80% of their selections, and profiles make that reuse cheap.



Document parsing is provided by the standard skill **office-and-pdf-documents** (PDF, Word, PowerPoint, Excel, images via OCR). Non-PDF formats require **LibreOffice** (`soffice`) on the host. See [CLAUDE.md](CLAUDE.md#working-with-pdf-and-office-format-documents) for the full format list and the binary dependency.

## Messenger and MCP UI Integrations

* [Messenger Integration](messenger-integration.md) — Telegram and Microsoft Teams as alternative UIs
* [MCP UI](mcp-ui.md) — interactive UI rendered from MCP tool calls

# Portal App

A project can publish its own branded **portal app** that wraps Etienne. After
login, the user lands in the portal — a customer-facing welcome page running
on a separate dev server — and clicks through to the Etienne UI when they're
ready to work with the agent. This lets agencies deliver Etienne under their
own brand without forking the frontend.

## How it works

```
                ┌───────────────────────────────────┐
  Browser  ──►  │ http://localhost:5000  (Etienne)  │
                │   /            → React app        │
                │   /api/*       → backend :6060    │
                │   /app/*       → Vite proxy ──┐   │
                └───────────────────────────────┼───┘
                                                ▼
                                  ┌──────────────────────────┐
                                  │ PORTAL_APP_HOST           │
                                  │ http://localhost:5001     │
                                  │ (portal-example, MUI)     │
                                  └──────────────────────────┘
```

Two pieces of configuration are needed:

1. **Vite proxy** — `PORTAL_APP_HOST` in `frontend/.env` tells the dev server
   where to forward `/app/*` requests. This is a one-time setup per
   developer/host (Vite reads `.env` at startup).
2. **Per-project enablement** — the active project's
   `.etienne/user-interface.json` declares `appHost` and `appDirectory`. When
   `appDirectory` is set (e.g. `/app`), Etienne redirects the user to it after
   login and shows a dashboard icon in the preview pane that navigates back to
   the portal. Configure both fields in **Customization → Portal App**.

When the user clicks **Start Onboarding Agent** in the portal, the browser
navigates to http://localhost:5000. A `sessionStorage` flag
(`portalRedirected`) prevents Etienne from immediately bouncing the user back
to the portal — closing the tab and reopening triggers the portal flow again.

## Sample

[`portal-example/`](portal-example/) is a minimal React + MUI portal already
wired up for `lumitec-led-onboarding`:

```bash
cd portal-example
npm install
npm run dev          # serves http://localhost:5001/app
```

Then in `frontend/.env` (copy from `frontend/.env.example`):

```
PORTAL_APP_HOST=http://localhost:5001
```

Restart Vite. Log into Etienne with `lumitec-led-onboarding` as the active
project — the browser lands on the Lumitec welcome page.

Fork `portal-example/` to build your own portal: only `src/App.jsx` carries
project-specific content.

# Demo Videos & Use Cases

## Brainstorming with Etienne

<div align="center">
<img src="/docs/images/video2-snapshot.jpg" alt="UI Screenshot" width="900">
</div>

[Watch Etienne walking the user through a mindmap creation process](https://youtu.be/cT1jMUM_vtk)

## Creating a new project with Etienne

<div align="center">
<img src="/docs/images/video1-snapshot.jpg" alt="UI Screenshot" width="900">
</div>

[See the basic project settings and how a live website is created from specifications](https://youtu.be/I9aNyB07AaA)

## Extended Use Case: Prototyping together with your Customer

As a forward deployed engineer you can bring a complete working AI business solution to the meeting with your customer. The Etienne frontend in combination with Claude Code for live modifications allows you to prototype solutions in real-time.

<div align="center">
<img src="/docs/images/forward-deployed-engineer.jpg" alt="Forward deployed engineer" width="700">
</div>

# Articles & Maintainer

## Etienne Articles on LinkedIn

A growing collection of long-form articles about Etienne, AI agent architecture, and the practical realities of deploying agents in commercial environments — see [Articles on LinkedIn](docs/articles.md).

## Maintainer

Brought to you by **[e-ntegration GmbH](https://e-ntegration.de)**, Nürnberg, Germany.

<div align="center">
<img src="/docs/images/ralph-navasardyan.jpg" alt="Ralph" width="900">
</div>

<div align="center">
<img src="/docs/images/etienne-in-action.jpg" alt="Etienne in action" width="900">
</div>

**Happy building!**
