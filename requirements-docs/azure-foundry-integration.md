# Azure 2026 Foundry integration

This document contains the requirements to integrate the Docker Container of Etienne to the new agent runtime of Azure ("new Foundry" as introduced 2026).

## Agent environment basics

Foundry Agent Service has a first-class "bring your own container" pathway called **Hosted Agents**. It is explicitly documented to support the Claude Agent SDK (alongside LangGraph, OpenAI Agents SDK, GitHub Copilot SDK, and Microsoft Agent Framework). You bring a Dockerfile; Microsoft does the runtime.

Each hosted agent gets a dedicated Microsoft Entra Agent ID automatically. This is provisioned via an agent identity blueprint with a federated credential trust to your project's managed identity; no client secret or certificate is required. The agent identity is a service principal that supports two flows: Unattended (client-credentials) and Attended (OAuth 2.0 OBO / jwt-bearer grant).

OBO is supported by the platform and is the recommended pattern. When the front-end signs the user in and calls the agent, Foundry can exchange the user's token for a token that carries both the agent identity and the user's delegated permissions; for downstream tools it uses OAuth identity passthrough (UserEntraToken connections in Toolbox). You almost never need to call MSAL acquire_token_on_behalf_of from inside your container — Foundry handles it for tools wired through Toolbox/MCP.

The three IQs are all consumed as MCP servers (this is the key design unification):

* **Foundry IQ** = Azure AI Search "knowledge bases" exposed as an MCP server with a knowledge_base_retrieve tool; permission-aware via the user's token. Microsoft LearnMicrosoft Learn

* **Work IQ** = a family of Microsoft 365 / Microsoft Graph–backed MCP servers (Work IQ Mail, Calendar, Teams, SharePoint, OneDrive, Copilot, User) hosted at https://agent365.svc.cloud.microsoft/agents/servers/.... Requires Microsoft 365 Copilot licenses and Agent 365 (Frontier program).

* **Fabric IQ** = Microsoft Fabric data agents (and the Fabric/OneLake MCP server) that can be exposed as MCP and consumed via OBO/identity passthrough.

## Service Setup

Use the Foundry Agent Service "hosted agent" path (refreshed April 22, 2026, public preview): keep your existing claude-agent-sdk container, add the lightweight Foundry protocol library (responses and/or invocations) so it exposes POST /responses or POST /invocations on port 8088 plus /readiness, push to Azure Container Registry, then create a hosted agent version with azure-ai-projects (HostedAgentDefinition / ImageBasedHostedAgentDefinition). At deploy time Foundry assigns the agent its own Microsoft Entra Agent ID, runs every user session in a dedicated hypervisor-isolated microVM (per-session sandbox with persistent $HOME and /files), and exposes a stable endpoint URL.

## Extend MCP registry

For grounding, we dont want to call Foundry IQ / Work IQ / Fabric IQ from custom code. Configure them as MCP-based tools on a Foundry Toolbox with authType: UserEntraToken (the "1P OBO / OAuth identity passthrough" pattern). 

The user signs in with Entra ID against your front-end app registration; Foundry forwards the user's identity to the IQ MCP servers (Foundry IQ knowledge-base MCP backed by Azure AI Search, Work IQ MCP at agent365.svc.cloud.microsoft, and Fabric IQ / Fabric data-agent MCP) which enforce per-document and per-row permissions. 

Our container code just consumes the Toolbox MCP endpoint as a regular MCP server via claude-agent-sdk's mcp_servers option — no MSAL acquire_token_on_behalf_of plumbing of your own.

Thus we need to flag MCP servers in our MCP server registry which are capable of receiving a UserEntraToken as credentials.

## Implementation Details for hosted agent

A hosted-agent container must:

* Listen on TCP port 8088 locally.
* Implement GET /readiness for platform health probes (auto-provided by the protocol library).
* Implement at least one of these protocols:
* Responses protocol (POST /responses) — OpenAI Responses-API-compatible body; Foundry manages conversation history server-side and gives you a session-id per conversation. Best for chat-style UIs and one-click M365 Copilot publishing.

* Invocations protocol (POST /invocations) — opaque body; the agent owns the turn end-to-end (can stream SSE, AG-UI, etc.); the client manages session id. Best for custom UIs.

* Optionally Activity protocol (Bot Framework) for Teams/M365 channels and A2A for agent-to-agent.

A single image can declare multiple protocols simultaneously in agent.yaml / the SDK call.

### Deployment artifacts.

Container registry = Azure Container Registry (ACR). Currently the registry must be reachable on its public endpoint; private-endpoint-only ACR isn't yet supported for image pull.
agent.yaml declares CPU (0.25–2 vCPU), memory (0.5–4 GiB), container_protocol_versions, and environment_variables.
Tools are not "injected" into your container. You connect to a Foundry Toolbox MCP endpoint (single URL) and consume tools through MCP. This is the integration seam for Foundry IQ, Work IQ, Fabric IQ, custom OpenAPI tools, Web Search, Azure AI Search, etc. Microsoft

Runtime model (microVM). Foundry "automatically spins up a secure microVM, an isolated sandbox" per user session. The microVM has its own persistent filesystem ($HOME, /files); Foundry scales to zero after ~15 minutes idle and rehydrates state when the session resumes. This is hypervisor isolation (not just process or container isolation) — the official refresh blog explicitly contrasts it with shared containers. Neowin
Agent identity model.

At create_version time, Foundry creates an agent identity (Entra service principal, type Agent ID) for your hosted agent.
An agent identity blueprint is registered in Microsoft Entra and trusts the project's managed identity via a federated identity credential. No secrets are stored.
Required RBAC: deployer needs Azure AI Project Manager on the project; the agent identity automatically gets Azure AI User on the project so it can call models and Toolbox tools.
Microsoft Entra Agent ID is a public preview capability in the Frontier program; agent identity blueprints (bulk creation/lifecycle) are still preview as of Ignite 2025. Many high-privileged Entra roles cannot be assigned to an agent identity.

Catalog / registration. "Onboarding" is not a custom directory upload. It is:

azd init / azd deploy (or AIProjectClient.agents.create_version) — registers the image, provisions the microVM compute, mints the agent identity, and exposes {project_endpoint}/agents/{name}/endpoint/protocols/{responses|invocations}.
Optionally, publish the agent — creates an Agent Application resource with its own stable URL, dedicated agent identity and blueprint, RBAC/Channels auth. Published agents appear automatically in Microsoft Entra Agent Registry and the Foundry Control Plane, and can be one-click-distributed to Microsoft 365 Copilot and Teams via the Activity protocol mapping. The Entra Agent Registry Graph API is being replaced by the Agent 365 registry API; agents registered against the old API will need to be re-registered. Microsoft Learn

Models. Foundry Agent Service is multi-model. The "Models supported by Agent Service" list historically called out OpenAI/Llama/DeepSeek, but the hosted agent path explicitly supports any model your code calls — including Anthropic Claude. Two viable options:

Foundry-hosted Claude (Sonnet 4.5/4.6, Haiku 4.5, Opus 4.1/4.6/4.7, plus the Mythos preview): the agent calls https://{resource}.services.ai.azure.com/anthropic/v1/messages. Authenticate with Entra (Cognitive Services User on the resource) using the agent identity. Requires Enterprise/MCA-E billing and is per-region/global standard.
Direct api.anthropic.com: works because the microVM has outbound egress by default, but takes you outside Foundry billing, observability and content safety; also incompatible with BYO VNet egress restrictions.