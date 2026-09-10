# requ-tracker — configuration

`requ-tracker` is Etienne packaged as a **single container** for Azure App
Service, pre-loaded with the requirements-tracking (TenderTrace) use case.

It differs from the general-purpose `etienne` image (`docker/Dockerfile`) in
four ways:

| | `etienne` | `requ-tracker` |
|---|---|---|
| Services started | frontend, backend, oauth-server | + **vector-store**, **rdf-store** |
| Requirements-tracking viewer | not built | built into the image |
| Projects | none | a **seed-requirements-tracking** project on first boot |
| Workspace | volume mount only | volume **or Azure File Share** (`WORKSPACE_ROOT_AZURE_FILESHARE`) |
| Models | `ANTHROPIC_API_KEY` | + **`AZURE_AI_CONNECTION`** (Azure AI Foundry, managed identity) |

---

## Contents

- [Quick start](#quick-start)
- [Services](#services)
- [`WORKSPACE_ROOT_AZURE_FILESHARE`](#workspace_root_azure_fileshare)
- [`AZURE_AI_CONNECTION`](#azure_ai_connection)
- [The seeded project](#the-seeded-project)
- [All environment variables](#all-environment-variables)
- [Deploying to Azure App Service](#deploying-to-azure-app-service)
- [Troubleshooting](#troubleshooting)

---

## Quick start

Build from the repository root:

```bash
docker build -t requ-tracker -f docker/requ-tracker/Dockerfile .
```

Run locally with a host directory as the workspace:

```bash
docker run -d --name requ-tracker -p 8080:80 \
  -v /path/to/workspace:/app/workspace \
  requ-tracker
```

Open <http://localhost:8080> and sign in with `admin` / `admin123`.

First boot takes **3–5 minutes**: the backend downloads the local embeddings
model (`Xenova/multilingual-e5-base`, ~1 GB) and the seed then replays the
tender history. The UI answers on port 80 within a few seconds regardless —
until the backend is up it shows API errors, which is expected. Watch progress
with `docker logs -f requ-tracker`; the last line is:

```
[startup] requ-tracker is up on :80
```

---

## Services

All five run inside the one container. Only port 80 is published.

| Service | Port | Role |
|---|---|---|
| frontend (Vite) | **80** | the UI, and the reverse proxy for `/api`, `/auth`, `/mcp` |
| backend (NestJS) | 6060 | API, MCP servers, coding-agent host |
| oauth-server | 5950 | JWT auth |
| rdf-store (Quadstore) | 7000 | the requirement/drift/link knowledge graph |
| vector-store (ChromaDB) | 7100 | embeddings behind `search_requirements` / `search_catalog` / `search_issues` |

rdf-store and vector-store are **not optional here** — requirements-tracking
stores every requirement, proposal and link as RDF, and the search tools query
Chroma. They are started directly by the entrypoint, so `ADDITIONAL_SERVICES`
stays empty; the Process Manager panel in the UI still shows them as running
(it detects services by port).

Startup order is enforced because the seed drives the backend's own MCP
endpoint: oauth → rdf → vector → backend → frontend → seed.

---

## `WORKSPACE_ROOT_AZURE_FILESHARE`

Points the workspace (`/app/workspace` by default) at an Azure Files share, so
projects survive a container restart or redeploy.

Format is an Azure-style connection string. Keys are case-insensitive; only the
first `=` in a segment splits key from value, so account keys ending in `=`
padding are safe.

| Key | Required | Default | Meaning |
|---|---|---|---|
| `ShareName` | yes | — | the file share |
| `MountPath` | no | `/app/workspace` | where the share appears in the container |
| `Mode` | no | auto | `platform` or `cifs` — see below |
| `AccountName` | for `cifs` | — | storage account |
| `AccountKey` | for `cifs` | — | storage account key |
| `SasToken` | for `cifs` | — | alternative to `AccountKey` |
| `Directory` | no | — | subdirectory of the share to use as the root |
| `EndpointSuffix` | no | `core.windows.net` | sovereign/other clouds |

**Mode is chosen automatically:** supply `AccountKey`/`SasToken` and the
container mounts the share itself (`cifs`); omit them and it assumes the host
already mounted it (`platform`). Set `Mode=` to force one.

### Mode `platform` — recommended on Azure App Service

App Service mounts Azure Files for you; the container only verifies the path
exists and is writable.

```
WORKSPACE_ROOT_AZURE_FILESHARE=ShareName=etienne-workspace;MountPath=/app/workspace
```

Create the mount with:

```bash
az webapp config storage-account add \
  --resource-group <rg> --name <app-name> \
  --custom-id workspace --storage-type AzureFiles \
  --account-name <storage-account> --share-name etienne-workspace \
  --access-key <key> --mount-path /app/workspace
```

No credentials go into the app settings this way — the platform holds them.

### Mode `cifs` — plain container hosts

The container runs `mount -t cifs` itself, which needs `CAP_SYS_ADMIN`:

```bash
docker run -d -p 8080:80 --cap-add SYS_ADMIN \
  -e 'WORKSPACE_ROOT_AZURE_FILESHARE=AccountName=mystorage;AccountKey=<key>;ShareName=etienne-workspace' \
  requ-tracker
```

Credentials are written to a `0600` temp file, never passed on the `mount`
command line (`/proc/*/cmdline` is world-readable inside the container).

**Azure App Service cannot use this mode** — containers there do not get
`CAP_SYS_ADMIN`. Use a platform path mapping.

### Failure behaviour

If the share cannot be mounted or is not writable, the container **logs the
reason and falls back to the container-local `/app/workspace`** rather than
crashing — you can still reach the UI and read the logs. The fallback is loud:

```
[workspace] ERROR: CIFS mount failed (exit 2, mountpoint check fail).
[workspace] Falling back to the container-local workspace at /app/workspace
[workspace] Project data will NOT survive a container restart.
```

Treat that second line as a deployment failure, not a warning.

`WORKSPACE_ROOT` (backend) and `WORKSPACE_DIR` (rdf-store, vector-store) are
both exported from the resolved path, so all three services agree.

> **Note on Azure Files and SQLite/LevelDB.** rdf-store (LevelDB) and
> vector-store (SQLite) keep their data under the workspace. SMB file locking
> is weaker than a local disk's, so run **one instance** against a given share.
> Scale up, not out.

---

## `AZURE_AI_CONNECTION`

One connection string describing the Claude deployments in **Azure AI Foundry**
(Azure AI Services) and how to authenticate to them. It configures both
consumers at once:

- the **coding agent** (the Claude Agent SDK subprocess), and
- the **LLM service** (titles, summaries, extraction, deviation-report and
  claim narratives).

Managed identity is the default — no API key is stored anywhere.

| Key | Required | Default | Meaning |
|---|---|---|---|
| `Endpoint` | yes | — | `https://<resource>.services.ai.azure.com`, or just `<resource>` |
| `Credential` | no | `ManagedIdentity` | `ManagedIdentity` \| `Default` \| `ApiKey` |
| `ClientId` | no | — | client id of a **user-assigned** managed identity |
| `TenantId` | no | — | pins the tenant |
| `ApiKey` | for `ApiKey` | — | static key (local testing only) |
| `Scope` | no | `https://cognitiveservices.azure.com/.default` | Entra scope |
| `Opus` | no | `claude-opus-5` | deployment name for the Opus tier |
| `Sonnet` | no | `claude-sonnet-5` | deployment name for the Sonnet tier |
| `Haiku` | no | `claude-haiku-4-5` | deployment name for the small tier |
| `Small` | no | `haiku` | which deployment backs background LLM calls |
| `Regular` | no | `sonnet` | which deployment backs foreground LLM calls |

`Endpoint` tolerates what the portal gives you — a trailing `/anthropic/v1`,
`/messages`, or extra slashes are stripped.

### System-assigned managed identity

```
AZURE_AI_CONNECTION=Endpoint=https://etienne-ai.services.ai.azure.com
```

### User-assigned managed identity

```
AZURE_AI_CONNECTION=Endpoint=https://etienne-ai.services.ai.azure.com;Credential=ManagedIdentity;ClientId=11111111-2222-3333-4444-555555555555
```

### Custom deployment names

Foundry serves *deployments*, not public model ids. If your deployments are not
named after the models, map them:

```
AZURE_AI_CONNECTION=Endpoint=etienne-ai;Opus=prod-opus;Sonnet=prod-sonnet;Haiku=prod-haiku
```

### Static key (local smoke test only)

```
AZURE_AI_CONNECTION=Endpoint=etienne-ai;Credential=ApiKey;ApiKey=<key>
```

### Required Azure role

The identity needs **Cognitive Services User** (or `Microsoft.CognitiveServices/accounts/*/read`
plus inference permissions) on the AI Services resource:

```bash
az role assignment create \
  --assignee <principal-id> \
  --role "Cognitive Services User" \
  --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<resource>
```

### What it expands to

The connection string is a convenience layer over the env vars the backend
already understood. It is expanded once at startup, **before** NestJS boots,
and **never overwrites a variable you set explicitly**:

| Set by the connection string | From |
|---|---|
| `AZURE_AI_ENDPOINT`, `ANTHROPIC_FOUNDRY_RESOURCE` | `Endpoint` + `/anthropic/v1` |
| `AZURE_FOUNDRY_AGENT_ID` | marker that activates the managed-identity path |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` | `ClientId`, `TenantId` |
| `CLAUDE_CODE_USE_FOUNDRY`, `ANTHROPIC_FOUNDRY_API_KEY` | only when `Credential=ApiKey` |
| `ANTHROPIC_MODELS` | `<Small>,<Regular>` |
| `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL` | `Opus`, `Sonnet`, `Haiku` |

Confirm it on startup — the log line carries no secrets:

```
[azure-ai] Azure AI connection: https://etienne-ai.services.ai.azure.com/anthropic/v1 via managed identity (client 1111…); opus=claude-opus-5 sonnet=claude-sonnet-5 haiku=claude-haiku-4-5
[Nest] LOG [LlmService] LLM provider: anthropic, models: {"small":"claude-haiku-4-5","regular":"claude-sonnet-5"}
```

A malformed value stops the backend with an explicit message rather than
silently falling back to the public Anthropic API:

```
[azure-ai] AZURE_AI_CONNECTION is set but has no Endpoint= (or Resource=) segment.
```

The token is acquired via `DefaultAzureCredential` at startup and refreshed
every 45 minutes. If acquisition fails (no identity, missing role), the backend
logs `Failed to acquire managed identity token` and keeps running with no model
configured — the UI reports a missing key rather than the container crash-looping.

> There is no "Claude Haiku 5". The current small model is **Claude Haiku 4.5**
> (`claude-haiku-4-5`), which is why that is the `Haiku` default.

### Without Azure

Leave `AZURE_AI_CONNECTION` empty and supply `ANTHROPIC_API_KEY` instead — the
image works unchanged against the public Anthropic API.

---

## The seeded project

On first boot the container installs the **`seed-requirements-tracking`**
project — `tendertrace-stadtwerke`, the TenderTrace story caught mid-flight
(spec: `requirements-docs/requirements-tracking/`).

It is not a file copy: the seed replays the whole history through the product's
own MCP tools with backdated timestamps, so the state is exactly what the app
produces in real use. That is why every service must be live first.

What you get:

- tender `T-2026-014` "Kundenselfservice-Portal Stadtwerke Musterstadt", 3 German
  tender documents + 2 implementation artifacts
- **22 approved requirements** (REQ-001…REQ-022), 1 pending extraction card,
  1 rejected; baseline **v1.0** frozen 2026-04-30
- 5 catalog services with mappings and compliance verdicts (FULL / PARTIAL /
  NEEDS_INPUT), 3 response sections
- 12 mock Jira issues, 5 requirement↔issue links (1 auto-staled by a change order)
- 4 drift cards — including the **unresolved Cloud vs. On-Premises conflict**
  that blocks in the Drift Inbox
- 1 deviation report, 1 priced claim ("Nachtrag 01 — Exportformate")
- 14 viewer pages under `out/tendertrace/pages/*.tendertrace.json`, the German
  `documentation.md`, and the **TenderTrace** sidebar
  (`application-types-repository/requirements-tracking/config.json`)

Seeding is **idempotent** — it is skipped when the project directory already
exists, so restarts and redeploys against a persistent share are safe:

```
[seed] Project 'tendertrace-stadtwerke' already exists at /mnt/fileshare/tendertrace-stadtwerke — skipping.
```

A failed seed never takes the container down; it removes the partial directory
so the next start retries. To disable it entirely set `SKIP_SEED=true`. To run
it by hand later:

```bash
docker exec <container> /app/docker-lib/seed-project.sh
```

---

## All environment variables

### Image-specific

| Variable | Default | Description |
|---|---|---|
| `WORKSPACE_ROOT_AZURE_FILESHARE` | *(empty)* | Azure Files connection — see above |
| `AZURE_AI_CONNECTION` | *(empty)* | Azure AI Foundry connection — see above |
| `WORKSPACE_ROOT` | `/app/workspace` | workspace path when no file share is configured |
| `FRONTEND_PORT` | `80` | published port; App Service's injected `PORT` also works |
| `SKIP_SEED` | `false` | `true` disables first-boot seeding |
| `SEED_PROJECT_NAME` | `tendertrace-stadtwerke` | the directory the seed guard checks |
| `SEED_USERNAME` / `SEED_PASSWORD` | `admin` / `admin123` | credentials the seed logs in with |

> **`PORT` is deliberately not set in the image.** oauth-server reads
> `process.env.PORT` and would bind the frontend's port. The entrypoint claims
> `PORT` for the frontend and explicitly overrides it for oauth-server.

### Inherited from the backend

Set as App Settings, or mount a `.env` at `/app/backend/.env`.

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required unless `AZURE_AI_CONNECTION` is set |
| `CODING_AGENT` | `anthropic` | coding-agent harness |
| `EMBEDDING_PROVIDER` | `transformers` | local model; `openai` needs `OPENAI_API_KEY` |
| `QUADSTORE_URL` | `http://localhost:7000` | rdf-store |
| `CHROMADB_URL` | `http://localhost:7100` | vector-store |
| `SKILL_REPOSITORY` | `/app/skill-repository` | baked into the image |
| `COSTS_CURRENCY_UNIT` | `EUR` | cost tracking |
| `COSTS_PER_MIO_INPUT_TOKENS` / `..._OUTPUT_TOKENS` | `3.0` / `15.0` | cost tracking |
| `OTEL_ENABLED` | `false` | OpenTelemetry |
| `SMTP_CONNECTION` / `IMAP_CONNECTION` | — | mail integration |

See `docker/README.md` for the full backend list.

---

## Deploying to Azure App Service

This image is designed for **App Service for Containers** (Linux), not Foundry
Agent Service — it serves its own UI on one port.

```bash
ACR=<registry>
az acr build --registry $ACR --image requ-tracker:v1 \
  -f docker/requ-tracker/Dockerfile .

az webapp create --resource-group <rg> --plan <plan> --name <app> \
  --deployment-container-image-name $ACR.azurecr.io/requ-tracker:v1

# Managed identity for both ACR pull and the model endpoint
az webapp identity assign --resource-group <rg> --name <app>

# Persist the workspace
az webapp config storage-account add \
  --resource-group <rg> --name <app> \
  --custom-id workspace --storage-type AzureFiles \
  --account-name <storage> --share-name etienne-workspace \
  --access-key <key> --mount-path /app/workspace

az webapp config appsettings set --resource-group <rg> --name <app> --settings \
  WEBSITES_PORT=80 \
  WEBSITES_CONTAINER_START_TIME_LIMIT=600 \
  'WORKSPACE_ROOT_AZURE_FILESHARE=ShareName=etienne-workspace;MountPath=/app/workspace' \
  'AZURE_AI_CONNECTION=Endpoint=https://<resource>.services.ai.azure.com'

# Grant the app's identity access to the model endpoint
az role assignment create \
  --assignee $(az webapp identity show -g <rg> -n <app> --query principalId -o tsv) \
  --role "Cognitive Services User" \
  --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<resource>
```

Sizing and settings that matter:

- **`WEBSITES_CONTAINER_START_TIME_LIMIT=600`.** The default (230 s) can expire
  during the first-boot embeddings download.
- **Always On = enabled.** Five services and an in-process embeddings model do
  not want to be cold-started per request.
- **At least 2 vCPU / 4 GB** (P1v3 or better). The embeddings model alone holds
  ~1 GB resident.
- **Scale up, not out.** rdf-store and vector-store are single-writer stores on
  the shared file system — run one instance.
- Change `admin`'s password after the first sign-in, or mount your own
  `users.json` at `/users`.

---

## Troubleshooting

**Container answers on :80 but every API call fails.**
Normal for the first few minutes — the backend is still loading the embeddings
model. `docker logs` shows `Loading transformers.js model`. Wait for
`[startup] backend ready on :6060`.

**`[workspace] Falling back to the container-local workspace`.**
The share was not mounted or is not writable. In `platform` mode, check the App
Service path mapping matches `MountPath`. In `cifs` mode, check the account key
and that the container has `--cap-add SYS_ADMIN`. Data written after this line
is lost on restart.

**`Failed to acquire managed identity token: ChainedTokenCredential authentication failed`.**
No managed identity is available, or it lacks a role. Assign the identity to the
app and grant **Cognitive Services User** on the AI Services resource. For a
user-assigned identity, `ClientId=` must be its *client* id, not its object id.

**Model calls 404 against the Foundry endpoint.**
The deployment names do not match. Foundry serves deployments, not public model
ids — set `Opus=` / `Sonnet=` / `Haiku=` to your actual deployment names.

**Seed did not run / the project is missing.**
Check `docker logs | grep '\[seed\]'`. It skips when the directory exists, and
it is disabled by `SKIP_SEED=true`. Re-run manually with
`docker exec <container> /app/docker-lib/seed-project.sh`.

**TenderTrace pages render blank.**
`mcp-app-requirements-tracking/dist/mcp-app.html` is missing — it is built into
the image, so this means the build step was skipped or the image is stale.
Verify with `docker exec <container> ls /app/mcp-app-requirements-tracking/dist`.

**Vite reports "Port 80 is already in use".**
Something set `PORT=80` in the environment; oauth-server then claimed it. The
entrypoint guards against this, so check for an override in the App Settings.

**`search_requirements` returns nothing.**
vector-store is down, or the project was ingested before it came up. Check
`:7100` in the Process Manager panel and re-run
`POST /api/requirements-tracking/<project>/projections/rebuild`.
