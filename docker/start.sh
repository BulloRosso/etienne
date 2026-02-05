#!/bin/bash
# Etienne Multi-Service Startup Script
# Starts oauth-server, backend, and frontend services

set -e

echo "=========================================="
echo "Starting Etienne Services"
echo "=========================================="

# Trap to handle graceful shutdown
cleanup() {
    echo ""
    echo "Shutting down services..."
    kill $OAUTH_PID 2>/dev/null || true
    kill $BACKEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# ============================================
# Start OAuth Server (port 5950)
# ============================================
echo "[1/3] Starting OAuth Server on port 5950..."
cd /app/oauth-server
npm start 2>&1 | sed 's/^/[oauth-server] /' &
OAUTH_PID=$!

# Wait for oauth-server to be ready
sleep 2
if ! kill -0 $OAUTH_PID 2>/dev/null; then
    echo "ERROR: OAuth Server failed to start!"
    exit 1
fi
echo "[oauth-server] Started successfully (PID: $OAUTH_PID)"

# ============================================
# Start Backend (port 6060)
# ============================================
echo "[2/3] Starting Backend on port 6060..."
cd /app/backend
npm run dev 2>&1 | sed 's/^/[backend] /' &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ERROR: Backend failed to start!"
    exit 1
fi
echo "[backend] Started successfully (PID: $BACKEND_PID)"

# ============================================
# Start Frontend (port 5000 -> external 80)
# ============================================
echo "[3/3] Starting Frontend on port 80..."
cd /app/frontend

# Run vite with host binding to allow external access
# The --port 80 allows direct binding to the exposed port
npx vite --host 0.0.0.0 --port 80 2>&1 | sed 's/^/[frontend] /'

# If frontend exits, the container will stop
echo "Frontend has stopped. Shutting down..."
cleanup
