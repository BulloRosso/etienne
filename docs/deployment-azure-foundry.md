[← back to README](../README.md)

# Azure Foundry Deployment

Etienne can be deployed as an **Azure Foundry hosted agent** — Microsoft's bring-your-own-container agent runtime (public preview April 2026). This is the recommended path for enterprise Azure environments.

<div align="center">
<img src="/docs/images/azure-foundry.jpg" alt="2026 Foundry Architecture" width="800">
</div>

## Benefits

* **Managed microVM isolation** — every user session runs in a dedicated hypervisor-isolated sandbox with persistent `$HOME` and `/files`; scales to zero after ~15 min idle and rehydrates state on resume
* **Automatic Entra Agent ID** — Foundry provisions a Microsoft Entra service principal for the agent at deploy time; no client secrets or certificates required
* **IQ grounding via MCP** — native access to Foundry IQ (Azure AI Search), Work IQ (Microsoft 365 / Graph), and Fabric IQ (Fabric data agents) through a single Toolbox MCP endpoint with OBO identity passthrough; per-document and per-row permissions are enforced automatically
* **Multi-model support** — call Foundry-hosted Claude models (Sonnet, Opus, Haiku) at `https://{resource}.services.ai.azure.com/anthropic/v1/messages` authenticated via the agent's managed identity
* **One-click distribution** — publish to Microsoft 365 Copilot, Teams, and the Entra Agent Registry

## Architecture: External Frontend

Foundry hosted agents expose **only port 8088** to the outside world. The Etienne container runs the backend (NestJS) and the Foundry protocol adapter internally, but **the React frontend must be hosted separately** — for example on Azure Static Web Apps, Azure App Service, or any static hosting.

```
┌─────────────────────────────────────────┐
│  Foundry microVM (port 8088 only)       │
│  ┌──────────────────────────────────┐   │
│  │ Foundry Adapter (Express :8088)  │   │
│  │  GET  /readiness                 │   │
│  │  POST /responses                 │   │
│  │  POST /invocations               │   │
│  │  /api/* /auth/* /mcp/*  ──proxy──┼─┐ │
│  └──────────────────────────────────┘ │ │
│  ┌────────────────────────────────────┘ │
│  │ NestJS Backend (:6060 internal)      │
│  └──────────────────────────────────────│
└─────────────────────────────────────────┘
         ▲                       ▲
         │ Foundry protocol      │ /api, /auth, /mcp
         │ (M365 Copilot,        │ (proxied through 8088)
         │  Teams, A2A)          │
                           ┌─────────────┐
                           │  Frontend   │
                           │  (external) │
                           │  Static     │
                           │  Web App    │
                           └─────────────┘
```

The Foundry adapter on port 8088 reverse-proxies `/api/*`, `/auth/*`, and `/mcp/*` to the internal NestJS backend on port 6060. The external frontend points its API calls at the Foundry agent endpoint URL (instead of `localhost:6060`).

When `FOUNDRY_ENABLED=true`, the Docker startup script skips the in-container frontend. A separate `docker/Dockerfile.frontend` is provided to build and serve the frontend as a standalone nginx container (or deploy as static files to Azure Static Web Apps).

## Prerequisites

* Azure subscription with an Azure AI Foundry project
* Azure Container Registry (ACR) — public endpoint required for image pull
* Hosting for the frontend (Azure Static Web Apps recommended)
* Microsoft 365 Copilot license (required for Work IQ only)
* `az` CLI with the `azure-ai-projects` extension

## Setup Steps

**1. Configure environment variables**

Copy `backend/.env.template` and set the Foundry-specific variables:

```env
FOUNDRY_ENABLED=true
AZURE_AI_ENDPOINT=https://<resource>.services.ai.azure.com
FOUNDRY_TOOLBOX_MCP_ENDPOINT=<your-toolbox-url>
FABRIC_IQ_MCP_ENDPOINT=<your-fabric-iq-url>
FOUNDRY_FRONTEND_ORIGIN=https://<your-frontend>.azurestaticapps.net
AUTH_PROVIDER=azure-entraid
SECRET_VAULT_PROVIDER=azure-keyvault
AZURE_KEY_VAULT_URL=https://<vault>.vault.azure.net
```

**2. Build and push to ACR**

```bash
az acr build --registry <acr-name> --image etienne:v1 -f docker/Dockerfile .
```

**3. Create hosted agent version**

```bash
az ai project agent create-version \
  --name etienne \
  --image <acr-name>.azurecr.io/etienne:v1
```

Foundry creates the agent identity, provisions the microVM compute, and exposes the endpoint at `{project_endpoint}/agents/etienne/endpoint/protocols/responses`.

**4. Deploy the frontend**

A separate Dockerfile is provided at `docker/Dockerfile.frontend` for the frontend. It builds the Vite app with the Foundry endpoint baked in and serves it via nginx.

```bash
# Build and push the frontend image
az acr build --registry <acr-name> \
  --image etienne-frontend:v1 \
  --build-arg VITE_API_BASE_URL=https://<foundry-agent-endpoint> \
  -f docker/Dockerfile.frontend .
```

Deploy this image to Azure Container Apps, App Service, or any container host. Alternatively, build locally and deploy the static files to Azure Static Web Apps:

```bash
cd frontend
VITE_API_BASE_URL=https://<foundry-endpoint> npx vite build
# Deploy dist/ to Azure Static Web Apps
az staticwebapp create --name etienne-ui --source ./dist
```

**5. Verify readiness**

```bash
curl https://<endpoint>/readiness
# → {"status":"ready"}
```

**6. (Optional) Publish to M365 Copilot / Teams**

Publishing creates an Agent Application resource with a stable URL, dedicated blueprint, and one-click distribution to M365 Copilot and Teams via the Activity protocol.

## MCP IQ Configuration

The MCP server registry includes pre-configured entries for Foundry IQ, Work IQ, and Fabric IQ with `authType: "UserEntraToken"`. When `FOUNDRY_TOOLBOX_MCP_ENDPOINT` is set, these servers are automatically routed through the Foundry Toolbox endpoint with OBO identity passthrough — no manual MSAL plumbing required.

See `agent.yaml` in the project root for the full Foundry deployment descriptor.

## Scale-to-Zero Resilience

Foundry scales the microVM to zero after ~15 minutes of inactivity and restarts it on the next request. This is by design — it reduces cost and is not something to work around. Etienne handles cold starts gracefully:

**Survives restart** (persisted to Foundry's persistent filesystem):
* Project data, chat history, and session metadata (JSONL files in `.etienne/`)
* Claude SDK session ID (`data/session.id`) for conversation resumption
* Foundry session-to-project mappings (`.foundry-sessions.json`)
* Knowledge graphs, scrapbook notes, and all workspace files

**Re-acquired on cold start** (in-memory, rebuilt automatically):
* Managed identity token — `DefaultAzureCredential` re-acquires on `onModuleInit`
* MCP server connections — re-established on first tool call
* Active streaming sessions — the user simply retries the request

The first request after a cold start takes a few extra seconds for NestJS initialization and token acquisition. Subsequent requests within the 15-minute idle window are instant.
