# requ-tracker — Etienne packaged for a single Azure App Service container.
#
# Differences from docker/Dockerfile (the general "etienne" image):
#   * vector-store + rdf-store are first-class services started at boot, not
#     opt-in extras — requirements-tracking needs both.
#   * the mcp-app-requirements-tracking viewer is built into the image.
#   * a seed-requirements-tracking project is installed on first boot.
#   * WORKSPACE_ROOT_AZURE_FILESHARE resolves the workspace at runtime.
#   * AZURE_AI_CONNECTION points the coding agent and the LLM service at
#     Claude models in Azure AI Foundry using a managed identity.
#
# Build from the repository root:
#   docker build -t requ-tracker -f docker/requ-tracker/Dockerfile .

FROM node:24-bookworm

ARG TZ=UTC
ENV TZ=$TZ

# ============================================
# OS packages
# ============================================
# cifs-utils: in-container Azure File Share mounts (docker run with SYS_ADMIN).
#             Not used by the Azure App Service platform-mount path, but the
#             image supports both shapes.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    curl \
    ca-certificates \
    cifs-utils \
    procps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice — @llamaindex/liteparse converts Office documents to PDF before
# parsing. Tender packages arrive as .docx/.xlsx, so this is not optional here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# uv — the Python services declare their deps in pyproject.toml/uv.lock.
# Installed from PyPI rather than the ghcr.io image so the build only needs
# Docker Hub + PyPI reachability (ghcr.io often needs auth behind a proxy).
RUN pip3 install --no-cache-dir --break-system-packages uv

# tsx runs the seed script (plain TypeScript, no build step).
RUN npm install -g tsx

WORKDIR /app

# ============================================
# oauth-server
# ============================================
COPY oauth-server/package*.json ./oauth-server/
WORKDIR /app/oauth-server
RUN npm install

COPY oauth-server/src ./src/
COPY oauth-server/tsconfig.json ./
COPY oauth-server/config ./config/
RUN npm run build

# ============================================
# backend
# ============================================
WORKDIR /app
# .npmrc carries legacy-peer-deps=true — @anthropic-ai/claude-agent-sdk wants
# zod 4 while the ai-sdk stack is on zod 3. Without it `npm install` ERESOLVEs.
COPY backend/package*.json backend/.npmrc ./backend/
WORKDIR /app/backend
RUN npm ci

COPY backend/src ./src/
COPY backend/tsconfig.json ./
COPY backend/services.json ./
COPY backend/scripts ./scripts/

# ============================================
# frontend
# ============================================
WORKDIR /app
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install

COPY frontend/src ./src/
COPY frontend/public ./public/
COPY frontend/index.html ./
COPY frontend/vite.config.js ./

# ============================================
# rdf-store (:7000) — knowledge graph behind requirement threads
# ============================================
WORKDIR /app
COPY rdf-store/package*.json ./rdf-store/
WORKDIR /app/rdf-store
RUN npm install
COPY rdf-store/server.js ./

# ============================================
# vector-store (:7100) — Chroma behind search_requirements / search_catalog
# ============================================
WORKDIR /app
COPY vector-store/pyproject.toml vector-store/uv.lock ./vector-store/
WORKDIR /app/vector-store
# Resolve into a project-local .venv at build time so the first container start
# does no network I/O. The entrypoint invokes .venv/bin/python directly.
RUN uv sync --frozen --no-dev
COPY vector-store/*.py ./

# ============================================
# mcp-app-requirements-tracking — the TenderTrace viewer
# ============================================
# The backend serves dist/mcp-app.html for every *.tendertrace.json page;
# without this build the seeded pages render blank.
WORKDIR /app
COPY mcp-app-requirements-tracking/package*.json ./mcp-app-requirements-tracking/
WORKDIR /app/mcp-app-requirements-tracking
RUN npm install
COPY mcp-app-requirements-tracking/src ./src/
COPY mcp-app-requirements-tracking/mcp-app.html ./
COPY mcp-app-requirements-tracking/tsconfig.json ./
COPY mcp-app-requirements-tracking/vite.config.ts ./
RUN npm run build

# ============================================
# seed + registries
# ============================================
WORKDIR /app
COPY scripts/seed-requirements-tracking ./scripts/seed-requirements-tracking/
COPY application-types-repository ./application-types-repository/
COPY skill-repository ./skill-repository/
COPY subagent-repository ./subagent-repository/
COPY agent-personas ./agent-personas/

# ============================================
# startup
# ============================================
COPY docker/requ-tracker/entrypoint.sh ./entrypoint.sh
COPY docker/requ-tracker/lib ./docker-lib/
# Normalise CRLF — this repo is edited on Windows.
RUN sed -i 's/\r$//' ./entrypoint.sh ./docker-lib/*.sh \
    && chmod +x ./entrypoint.sh ./docker-lib/*.sh

RUN mkdir -p /app/workspace /users
VOLUME /app/workspace
VOLUME /users

ENV NODE_ENV=development

# --- Workspace -------------------------------------------------------------
# Where projects live. WORKSPACE_ROOT_AZURE_FILESHARE overrides it at runtime;
# see docs/requ-tracker-configuration.md.
ENV WORKSPACE_ROOT=/app/workspace
ENV WORKSPACE_ROOT_AZURE_FILESHARE=""

# --- Models ----------------------------------------------------------------
# One connection string for Claude Opus 5 / Sonnet 5 / Haiku 4.5 deployed in
# Azure AI Foundry, authenticated with a managed identity (no API key).
# Consumed by both the coding agent and the backend LLM service.
ENV AZURE_AI_CONNECTION=""

# --- Registries (override by mounting your own) ----------------------------
ENV SKILL_REPOSITORY=/app/skill-repository
ENV AGENT_ROLE_REGISTRY=""
ENV MCP_REGISTRY=""
ENV A2A_REGISTRY=""

# --- Services --------------------------------------------------------------
# rdf-store and vector-store are started by the entrypoint, so the backend's
# process-manager auto-start list stays empty (it detects them by port).
ENV ADDITIONAL_SERVICES=""
ENV QUADSTORE_URL=http://localhost:7000
ENV CHROMADB_URL=http://localhost:7100

# --- Seed ------------------------------------------------------------------
ENV SKIP_SEED=false
ENV SEED_PROJECT_NAME=tendertrace-stadtwerke

# The container's single published port. Deliberately NOT named PORT: App
# Service injects PORT, and oauth-server reads it (`process.env.PORT || 5950`),
# so a global PORT=80 would make oauth-server steal the frontend's port. The
# entrypoint claims PORT for the frontend and unsets it for everything else.
ENV FRONTEND_PORT=80
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS "http://localhost:${FRONTEND_PORT:-80}/" > /dev/null || exit 1

CMD ["/bin/bash", "./entrypoint.sh"]
