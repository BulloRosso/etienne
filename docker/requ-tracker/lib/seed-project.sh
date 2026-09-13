#!/bin/bash
# Install the seed-requirements-tracking project on first boot.
#
# The seed replays the whole TenderTrace story through the product's own MCP
# endpoint, so it is not a file copy — it needs backend + oauth + rdf-store
# (+ vector-store for search) to be live. The entrypoint calls this only after
# all four are listening.
#
# Idempotent: the seed script itself refuses to run when the project directory
# already exists, and we skip before spending the startup time on it.

set -u

SEED_SCRIPT="${SEED_SCRIPT:-scripts/seed-requirements-tracking/seed-requirements-tracking.ts}"
PROJECT_NAME="${SEED_PROJECT_NAME:-tendertrace-analysis}"
PROJECT_DIR="${WORKSPACE_ROOT}/${PROJECT_NAME}"

if [ -d "$PROJECT_DIR" ]; then
    echo "Project '$PROJECT_NAME' already exists at $PROJECT_DIR — skipping."
    exit 0
fi

echo "Seeding project '$PROJECT_NAME' (type: seed-requirements-tracking)..."
echo "This writes the Lagerlogistik demo files and (SEED_RUN_ANALYSIS) starts phase A of the tender analysis."

cd /app || exit 1

export WORKSPACE_ROOT
export OAUTH_BASE="${OAUTH_BASE:-http://localhost:5950}"
export BACKEND_BASE="${BACKEND_BASE:-http://localhost:6060}"
export SEED_USERNAME="${SEED_USERNAME:-admin}"
export SEED_PASSWORD="${SEED_PASSWORD:-admin123}"
export SEED_PROJECT_NAME="$PROJECT_NAME"
export SEED_RUN_ANALYSIS="${SEED_RUN_ANALYSIS:-true}"

if tsx "$SEED_SCRIPT"; then
    echo "Seed complete — open the project '$PROJECT_NAME' in the UI."
else
    status=$?
    echo "WARNING: seed exited with code $status."
    echo "The app is still usable; re-run it later with:"
    echo "  docker exec <container> /app/docker-lib/seed-project.sh"
    # Remove a half-written project dir so the next boot retries cleanly.
    if [ -d "$PROJECT_DIR" ]; then
        echo "Removing the partial project directory so the next start retries."
        rm -rf "$PROJECT_DIR"
    fi
    exit 0   # never take the container down over a failed demo seed
fi
