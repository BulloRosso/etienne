# Etienne Docker Setup

This Docker configuration builds and runs the core Etienne services in a single container.

## Architecture

The Docker image includes all 6 project folders but only starts 3 services:

| Service | Internal Port | Description |
|---------|---------------|-------------|
| oauth-server | 5950 | JWT authentication server |
| backend | 6060 | NestJS API backend |
| frontend | 80 | React/Vite development server |

**Built but not started by default (use ADDITIONAL_SERVICES to enable):**

| Service | Port | Description |
|---------|------|-------------|
| rdf-store | 7000 | RDF triple store for knowledge graphs |
| vector-store | 7100 | ChromaDB vector database for embeddings |
| webserver | 4000 | Flask API server for custom endpoints |
| telegram | - | Telegram bot for remote sessions |
| ms-teams | 3978 | Microsoft Teams bot for remote sessions |

## Quick Start

### Build the Image

From the repository root:

```bash
docker build -t etienne -f docker/Dockerfile .
```

### Run the Container

**Important:** You must mount three volumes:
1. **Workspace directory** - for project storage
2. **Backend .env file** - for configuration (API keys, settings)
3. **Users directory** - for oauth-server user authentication

Minimal configuration:

```bash
docker run -p 80:80 \
  -v /path/to/your/workspace:/app/workspace \
  -v /path/to/backend/.env:/app/backend/.env:ro \
  -v /path/to/users:/users \
  etienne
```

Windows example:

```bash
docker run -p 80:80 \
  -v C:/Data/GitHub/claude-multitenant/workspace:/app/workspace \
  -v C:/Data/GitHub/claude-multitenant/backend/.env:/app/backend/.env:ro \
  -v C:/Data/GitHub/claude-multitenant/oauth-server/config:/users \
  etienne
```

Linux/macOS example:

```bash
docker run -p 80:80 \
  -v ~/projects/etienne/workspace:/app/workspace \
  -v ~/projects/etienne/backend/.env:/app/backend/.env:ro \
  -v ~/projects/etienne/oauth-server/config:/users \
  etienne
```

**Note:** The `:ro` suffix mounts the .env file as read-only for security.

### Access the Application

Open http://localhost in your browser.

## Workspace Directory

The workspace directory (`/app/workspace`) is where all projects are stored. Each project follows this structure:

```
workspace/
├── <project-name>/
│   ├── .claude/
│   │   ├── CLAUDE.md          # System prompt/role definition
│   │   └── settings.json      # Project-specific settings
│   ├── data/
│   │   └── permissions.json   # Tool permissions
│   ├── out/                   # Output files
│   └── knowledge-graph/       # RDF and vector data (if enabled)
└── <another-project>/
    └── ...
```

### Volume Mounts (Required)

You **must** mount three volumes:

#### 1. Workspace Directory

```bash
-v /host/path/to/workspace:/app/workspace
```

Without this mount, all project data will be lost when the container stops.

#### 2. Backend .env File

```bash
-v /host/path/to/backend/.env:/app/backend/.env:ro
```

The `.env` file contains all backend configuration including API keys. Mount it as read-only (`:ro`) for security.

**Note:** The .env file is intentionally not included in the Docker image to prevent sensitive data from being baked into the image.

#### 3. Users Directory

```bash
-v /host/path/to/users:/users
```

The users directory must contain `users.json` for oauth-server authentication. Mount the directory containing your `users.json` file (typically `oauth-server/config/`).

**Note:** This allows user credentials to persist across container restarts and be managed outside the container.

### Path Formatting by Operating System

The volume mount path format differs by operating system:

#### Windows (Command Prompt)

Use forward slashes with drive letter:
```bash
docker run -p 80:80 ^
  -v C:/Data/GitHub/claude-multitenant/workspace:/app/workspace ^
  -v C:/Data/GitHub/claude-multitenant/backend/.env:/app/backend/.env:ro ^
  -v C:/Data/GitHub/claude-multitenant/oauth-server/config:/users ^
  etienne
```

**Note:** Avoid backslashes (`\`). Docker on Windows accepts forward slashes (`/`).

#### Windows (PowerShell)

Use backtick for line continuation:
```powershell
docker run -p 80:80 `
  -v C:/Data/GitHub/claude-multitenant/workspace:/app/workspace `
  -v C:/Data/GitHub/claude-multitenant/backend/.env:/app/backend/.env:ro `
  -v C:/Data/GitHub/claude-multitenant/oauth-server/config:/users `
  etienne
```

Or use `${PWD}` for current directory (when in the project root):
```powershell
docker run -p 80:80 `
  -v ${PWD}/workspace:/app/workspace `
  -v ${PWD}/backend/.env:/app/backend/.env:ro `
  -v ${PWD}/oauth-server/config:/users `
  etienne
```

#### Windows (Git Bash / MSYS2)

Prefix with extra slash to prevent path conversion:
```bash
docker run -p 80:80 \
  -v //c/Data/GitHub/claude-multitenant/workspace:/app/workspace \
  -v //c/Data/GitHub/claude-multitenant/backend/.env:/app/backend/.env:ro \
  -v //c/Data/GitHub/claude-multitenant/oauth-server/config:/users \
  etienne
```

Or use `MSYS_NO_PATHCONV` to disable path conversion:
```bash
MSYS_NO_PATHCONV=1 docker run -p 80:80 \
  -v C:/Data/GitHub/claude-multitenant/workspace:/app/workspace \
  -v C:/Data/GitHub/claude-multitenant/backend/.env:/app/backend/.env:ro \
  -v C:/Data/GitHub/claude-multitenant/oauth-server/config:/users \
  etienne
```

#### Linux

Use absolute paths starting with `/`:
```bash
docker run -p 80:80 \
  -v /home/username/projects/workspace:/app/workspace \
  -v /home/username/projects/backend/.env:/app/backend/.env:ro \
  -v /home/username/projects/oauth-server/config:/users \
  etienne
```

Or use `$(pwd)` for current directory (when in the project root):
```bash
docker run -p 80:80 \
  -v $(pwd)/workspace:/app/workspace \
  -v $(pwd)/backend/.env:/app/backend/.env:ro \
  -v $(pwd)/oauth-server/config:/users \
  etienne
```

Or use `$HOME` for home directory:
```bash
docker run -p 80:80 \
  -v $HOME/projects/etienne/workspace:/app/workspace \
  -v $HOME/projects/etienne/backend/.env:/app/backend/.env:ro \
  -v $HOME/projects/etienne/oauth-server/config:/users \
  etienne
```

#### macOS

Same as Linux - use absolute paths starting with `/`:
```bash
docker run -p 80:80 \
  -v /Users/username/projects/workspace:/app/workspace \
  -v /Users/username/projects/backend/.env:/app/backend/.env:ro \
  -v /Users/username/projects/oauth-server/config:/users \
  etienne
```

Or use `~` for home directory (in bash/zsh):
```bash
docker run -p 80:80 \
  -v ~/projects/etienne/workspace:/app/workspace \
  -v ~/projects/etienne/backend/.env:/app/backend/.env:ro \
  -v ~/projects/etienne/oauth-server/config:/users \
  etienne
```

Or use `$(pwd)` for current directory (when in the project root):
```bash
docker run -p 80:80 \
  -v $(pwd)/workspace:/app/workspace \
  -v $(pwd)/backend/.env:/app/backend/.env:ro \
  -v $(pwd)/oauth-server/config:/users \
  etienne
```

**Note:** On macOS, you may need to grant Docker access to the folder in Docker Desktop → Settings → Resources → File Sharing.

### Creating a New Workspace

If starting fresh, create an empty directory on your host:

**Linux/macOS:**
```bash
mkdir -p ~/projects/etienne/workspace
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Path "C:\projects\etienne\workspace" -Force
```

**Windows (Command Prompt):**
```cmd
mkdir C:\projects\etienne\workspace
```

## Environment Variables

Environment variables are configured via the mounted `.env` file (`backend/.env`). You can also override them using `-e` flags.

### Docker Environment Variables

These variables are passed directly to the container via `-e` flags:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADDITIONAL_SERVICES` | `` | Comma-separated list of additional services to start on boot |

#### ADDITIONAL_SERVICES

Start optional services automatically when the container boots. The services are started via the process-manager API after the backend is ready.

**Valid values:** `vector-store`, `rdf-store`, `telegram`, `ms-teams`, `webserver`

**Example - Start vector store and knowledge graph:**
```bash
docker run -p 80:80 \
  -v /path/to/workspace:/app/workspace \
  -v /path/to/backend/.env:/app/backend/.env:ro \
  -v /path/to/oauth-server/config:/users \
  -e ADDITIONAL_SERVICES="vector-store,rdf-store" \
  etienne
```

**Example - Start all optional services:**
```bash
docker run -p 80:80 \
  -v /path/to/workspace:/app/workspace \
  -v /path/to/backend/.env:/app/backend/.env:ro \
  -v /path/to/oauth-server/config:/users \
  -e ADDITIONAL_SERVICES="vector-store,rdf-store,webserver,telegram,ms-teams" \
  etienne
```

**Note:** Services like `telegram` and `ms-teams` require additional environment variables (bot tokens, etc.) configured in the backend `.env` file.

### Backend .env File Contents

The `.env` file should contain the following variables:

**Required:**

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key for AI functionality |

**Optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_ROOT` | `/app/workspace` | Workspace directory path (inside container) |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `PHOENIX_COLLECTOR_ENDPOINT` | - | Phoenix collector URL for tracing |
| `OTEL_SERVICE_NAME` | `etienne` | Service name for tracing |
| `MEMORY_MANAGEMENT_URL` | - | Memory API endpoint |
| `MEMORY_DECAY_DAYS` | `6` | Days before memory decay |
| `COSTS_CURRENCY_UNIT` | `EUR` | Currency for cost tracking |
| `COSTS_PER_MIO_INPUT_TOKENS` | `3.0` | Cost per million input tokens |
| `COSTS_PER_MIO_OUTPUT_TOKENS` | `15.0` | Cost per million output tokens |
| `DIFFBOT_TOKEN` | - | Diffbot API token for MCP tools |
| `CHECKPOINT_PROVIDER` | - | Checkpoint storage provider (e.g., `gitea`) |
| `GITEA_URL` | - | Gitea server URL |
| `GITEA_USERNAME` | - | Gitea username |
| `GITEA_PASSWORD` | - | Gitea password |
| `GITEA_REPO` | - | Gitea repository name |
| `SMTP_CONNECTION` | - | SMTP config: `host\|port\|secure\|user\|password` |
| `IMAP_CONNECTION` | - | IMAP config: `host\|port\|secure\|user\|password` |
| `SMTP_WHITELIST` | - | Comma-separated allowed email recipients |

### Example .env File

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-xxx

# Observability (optional)
OTEL_ENABLED=false
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006
OTEL_SERVICE_NAME=etienne

# Costs (optional)
COSTS_CURRENCY_UNIT=EUR
COSTS_PER_MIO_INPUT_TOKENS=3.0
COSTS_PER_MIO_OUTPUT_TOKENS=15.0

# Checkpoint provider (optional)
CHECKPOINT_PROVIDER=gitea
GITEA_URL=http://localhost:3000
GITEA_USERNAME=your-username
GITEA_PASSWORD=your-password
GITEA_REPO=workspace-checkpoints
```

## Port Mapping

| External | Internal | Service |
|----------|----------|---------|
| 80 | 80 | Frontend (Vite) |

Internal services communicate via localhost within the container:
- Frontend → Backend: `http://localhost:6060`
- Frontend → OAuth: `http://localhost:5950`

## Full Example

```bash
docker run -p 80:80 \
  -v /path/to/workspace:/app/workspace \
  -v /path/to/backend/.env:/app/backend/.env:ro \
  -v /path/to/oauth-server/config:/users \
  etienne
```

You can override specific environment variables with `-e` flags:

```bash
docker run -p 80:80 \
  -v /path/to/workspace:/app/workspace \
  -v /path/to/backend/.env:/app/backend/.env:ro \
  -v /path/to/oauth-server/config:/users \
  -e OTEL_ENABLED=true \
  -e PHOENIX_COLLECTOR_ENDPOINT=http://host.docker.internal:6006 \
  etienne
```

## Logs

All services log to stdout with prefixes:
- `[oauth-server]` - OAuth server logs
- `[backend]` - Backend API logs
- `[frontend]` - Vite dev server logs

View logs:

```bash
docker logs -f <container_id>
```

## Troubleshooting

### Projects not persisting

Ensure you've mounted the workspace volume:
```bash
-v /path/to/workspace:/app/workspace
```

### OAuth Server fails to start

Check that port 5950 is not in use. The oauth-server requires a `users.json` file. Ensure you've mounted the users directory:
```bash
-v /path/to/oauth-server/config:/users
```

The mounted directory must contain a valid `users.json` file with user credentials.

### Backend fails to start

Ensure the `.env` file is mounted and contains a valid `ANTHROPIC_API_KEY`:
```bash
-v /path/to/backend/.env:/app/backend/.env:ro
```

The backend will fail if the .env file is missing or required environment variables are not set.

### Frontend shows proxy errors

The frontend proxies API calls to the backend. If you see 502 errors, the backend may not be running. Check container logs for `[backend]` errors.

### Container exits immediately

Check the startup logs for errors. Common issues:
- Missing environment variables
- Port conflicts
- Build failures during npm install

### Permission denied on workspace

On Linux, you may need to set proper permissions:
```bash
sudo chown -R 1000:1000 /path/to/workspace
```

### Additional services fail to start

If services specified in `ADDITIONAL_SERVICES` don't start:

1. Check that the backend API is running:
   ```bash
   docker logs <container_id> | grep "additional-services"
   ```

2. Verify the service name is valid (case-sensitive):
   - `vector-store` (not `vectorstore` or `VectorStore`)
   - `rdf-store` (not `rdfstore` or `knowledge-graph`)
   - `webserver`
   - `telegram`
   - `ms-teams`

3. For telegram/ms-teams, ensure required bot tokens are in the `.env` file.

4. You can also start services manually after boot via the UI (Process Manager section).

## Development

To modify the Dockerfile:

1. Edit `docker/Dockerfile`
2. Rebuild: `docker build -t etienne -f docker/Dockerfile .`
3. Test: `docker run -p 80:80 -v /path/to/workspace:/app/workspace -v /path/to/backend/.env:/app/backend/.env:ro -v /path/to/oauth-server/config:/users etienne`

### Files

- `Dockerfile` - Multi-stage build configuration
- `.dockerignore` - Files excluded from the build context
- `start.sh` - Service startup script
- `README.md` - This documentation
