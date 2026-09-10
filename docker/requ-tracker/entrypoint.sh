#!/bin/bash
# requ-tracker — startup
#
#   1. resolve the workspace (Azure File Share or local)
#   2. oauth-server  :5950
#   3. rdf-store     :7000     ← required by requirements-tracking
#   4. vector-store  :7100     ← powers search_requirements / search_catalog
#   5. backend       :6060
#   6. frontend      :80       ← the container's only exposed port
#   7. seed the requirements-tracking project (background, idempotent)
#
# The frontend is started before the backend is ready on purpose: it is a proxy,
# it binds within a second, and Azure App Service fails a container that has not
# answered on its port within a few minutes. The backend's first boot downloads
# the local embeddings model and takes ~3 minutes; until then the UI simply
# shows API errors instead of the whole container being killed and restarted.
#
# The seed is last because it drives the backend's own MCP endpoint — every
# other service has to be live first.

set -u

echo "=========================================="
echo " requ-tracker"
echo "=========================================="

# App Service injects PORT into custom containers. Several services in this repo
# read PORT themselves (oauth-server defaults to it), so it is claimed here for
# the frontend and explicitly overridden for anything that would inherit it.
FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-80}}"
unset PORT

# ── workspace ──────────────────────────────────────────────────────────────
# shellcheck source=lib/mount-workspace.sh
source /app/docker-lib/mount-workspace.sh
resolve_workspace

# oauth-server prefers /users/users.json so credentials survive a redeploy.
# Seed it from the image's baked config the first time.
mkdir -p /users
if [ ! -f /users/users.json ] && [ -f /app/oauth-server/config/users.json ]; then
    cp /app/oauth-server/config/users.json /users/users.json
    echo "[oauth-server] Seeded /users/users.json from the image defaults"
fi

PIDS=()
cleanup() {
    echo ""
    echo "Shutting down..."
    for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
    exit 0
}
trap cleanup SIGTERM SIGINT

# Wait for a TCP port to accept connections. $3 = seconds (default 60).
wait_for_port() {
    local label="$1" port="$2" timeout="${3:-60}" waited=0
    while [ "$waited" -lt "$timeout" ]; do
        if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
            echo "[startup] $label ready on :$port (${waited}s)"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    echo "[startup] WARNING: $label is not listening on :$port after ${timeout}s"
    return 1
}

# ── 2. oauth-server ────────────────────────────────────────────────────────
echo "[1/6] oauth-server :5950"
cd /app/oauth-server
PORT=5950 npm start 2>&1 | sed 's/^/[oauth-server] /' &
PIDS+=($!)

# ── 3. rdf-store ───────────────────────────────────────────────────────────
echo "[2/6] rdf-store :7000"
cd /app/rdf-store
WORKSPACE_DIR="$WORKSPACE_ROOT" node server.js 2>&1 | sed 's/^/[rdf-store] /' &
PIDS+=($!)

# ── 4. vector-store ────────────────────────────────────────────────────────
echo "[3/6] vector-store :7100"
cd /app/vector-store
WORKSPACE_DIR="$WORKSPACE_ROOT" CHROMA_PORT=7100 \
    /app/vector-store/.venv/bin/python multi-tenant-chromadb.py 2>&1 \
    | sed 's/^/[vector-store] /' &
PIDS+=($!)

# ── 5. backend ─────────────────────────────────────────────────────────────
echo "[4/6] backend :6060"
cd /app/backend
npm run dev 2>&1 | sed 's/^/[backend] /' &
PIDS+=($!)

# ── 6. frontend ────────────────────────────────────────────────────────────
echo "[5/6] frontend :$FRONTEND_PORT"
cd /app/frontend
npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" 2>&1 | sed 's/^/[frontend] /' &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")

# ── 7. seed ────────────────────────────────────────────────────────────────
(
    wait_for_port oauth-server 5950 90
    wait_for_port rdf-store 7000 90
    wait_for_port vector-store 7100 300   # Chroma's first boot builds its index
    wait_for_port backend 6060 600        # first boot downloads the embeddings model

    if [ "${SKIP_SEED:-false}" != "true" ]; then
        echo "[6/6] seeding"
        /app/docker-lib/seed-project.sh 2>&1 | sed 's/^/[seed] /'
    else
        echo "[6/6] SKIP_SEED=true — not seeding"
    fi
    echo "[startup] requ-tracker is up on :$FRONTEND_PORT"
) &
PIDS+=($!)

# The frontend is the process that defines "the container is alive".
wait "$FRONTEND_PID"
echo "Frontend exited — shutting down."
cleanup
