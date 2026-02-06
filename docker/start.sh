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
# Start Additional Services via Process Manager
# ============================================
if [ -n "$ADDITIONAL_SERVICES" ]; then
    echo "[additional-services] Starting additional services: $ADDITIONAL_SERVICES"

    # Wait for backend API to be fully ready
    echo "[additional-services] Waiting for backend API to be ready..."
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:6060/api/process-manager > /dev/null 2>&1; then
            echo "[additional-services] Backend API is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 1
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "[additional-services] WARNING: Backend API not responding, skipping additional services"
    else
        # Parse comma-separated list and start each service
        IFS=',' read -ra SERVICES <<< "$ADDITIONAL_SERVICES"
        for SERVICE in "${SERVICES[@]}"; do
            # Trim whitespace
            SERVICE=$(echo "$SERVICE" | xargs)
            if [ -n "$SERVICE" ]; then
                echo "[additional-services] Starting service: $SERVICE"
                RESPONSE=$(curl -s -X POST "http://localhost:6060/api/process-manager/$SERVICE" \
                    -H "Content-Type: application/json" \
                    -d '{"action":"start"}' 2>&1)
                echo "[additional-services] $SERVICE: $RESPONSE"
            fi
        done
    fi
fi

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
