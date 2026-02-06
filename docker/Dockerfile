# Etienne Multi-Service Docker Image
# Builds and runs oauth-server, backend, and frontend services

FROM node:22-bookworm

# Install Python 3.12, pip, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# ============================================
# Build oauth-server
# ============================================
COPY oauth-server/package*.json ./oauth-server/
WORKDIR /app/oauth-server
RUN npm install

COPY oauth-server/src ./src/
COPY oauth-server/tsconfig.json ./
COPY oauth-server/config ./config/
RUN npm run build

# ============================================
# Build backend (excluding .env)
# ============================================
WORKDIR /app
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install
# Install Claude Agent SDK (dynamically imported, not in package.json)
RUN npm install @anthropic-ai/claude-agent-sdk

COPY backend/src ./src/
COPY backend/tsconfig.json ./
COPY backend/services.json ./

# ============================================
# Build frontend
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
# Build rdf-store
# ============================================
WORKDIR /app
COPY rdf-store/package*.json ./rdf-store/
WORKDIR /app/rdf-store
RUN npm install

COPY rdf-store/server.js ./

# ============================================
# Build vector-store
# ============================================
WORKDIR /app
COPY vector-store/requirements.txt ./vector-store/
WORKDIR /app/vector-store
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY vector-store/*.py ./

# ============================================
# Build webserver
# ============================================
WORKDIR /app
RUN pip3 install --no-cache-dir --break-system-packages flask

COPY webserver/app.py ./webserver/

# ============================================
# Build telegram (optional service)
# ============================================
WORKDIR /app
COPY telegram/package*.json ./telegram/
WORKDIR /app/telegram
RUN npm install

COPY telegram/src ./src/
COPY telegram/tsconfig.json ./

# ============================================
# Build ms-teams (optional service)
# ============================================
WORKDIR /app
COPY ms-teams/package*.json ./ms-teams/
WORKDIR /app/ms-teams
RUN npm install

COPY ms-teams/src ./src/
COPY ms-teams/tsconfig.json ./

# ============================================
# Setup startup script
# ============================================
WORKDIR /app
COPY docker/start.sh ./start.sh
# Convert Windows line endings to Unix and make executable
RUN sed -i 's/\r$//' ./start.sh && chmod +x ./start.sh

# Create workspace directory (mount point for projects)
RUN mkdir -p /app/workspace

# Create users directory (mount point for oauth-server users.json)
RUN mkdir -p /users

# Declare volume mount points
VOLUME /app/workspace
VOLUME /users

# Set environment defaults
ENV NODE_ENV=development
ENV WORKSPACE_ROOT=/app/workspace
# Optional: comma-separated list of additional services to start
# Valid values: vector-store, rdf-store, telegram, ms-teams, webserver
ENV ADDITIONAL_SERVICES=""

# Expose port 80 (mapped from frontend's 5000)
EXPOSE 80

# Start all services
CMD ["/bin/bash", "./start.sh"]
