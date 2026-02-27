#!/bin/bash
# Web Scraper Service - Starts Scrapling MCP server in HTTP mode on port 3480
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# Detect venv bin path (Scripts/ on Windows, bin/ on Linux/Mac)
if [ -d "$VENV_DIR/Scripts" ]; then
  VENV_BIN="$VENV_DIR/Scripts"
else
  VENV_BIN="$VENV_DIR/bin"
fi

# Create venv and install deps if venv doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "[web-scraper] Creating virtual environment..."
  python3 -m venv "$VENV_DIR"

  # Re-detect after creation
  if [ -d "$VENV_DIR/Scripts" ]; then
    VENV_BIN="$VENV_DIR/Scripts"
  else
    VENV_BIN="$VENV_DIR/bin"
  fi

  echo "[web-scraper] Installing dependencies..."
  "$VENV_BIN/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

PYTHON="$VENV_BIN/python"

echo "[web-scraper] Checking browser dependencies..."
"$PYTHON" -c "from scrapling.cli import main; import sys; sys.argv=['scrapling','install']; main()"

echo "[web-scraper] Starting Scrapling MCP server on port 3480..."
exec "$PYTHON" -c "from scrapling.cli import main; import sys; sys.argv=['scrapling','mcp','--http','--port','3480']; main()"
