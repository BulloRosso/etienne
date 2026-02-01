#!/bin/bash

# Start script for Telegram Provider
# Usage: ./start-telegram.sh
#
# Environment variables:
#   TELEGRAM_BOT_TOKEN - Required: Your Telegram bot token from @BotFather
#   BACKEND_URL - Optional: Backend URL (default: http://localhost:6060)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TELEGRAM_DIR="$(dirname "$SCRIPT_DIR")/telegram"

echo "========================================="
echo "  Starting Telegram Provider"
echo "========================================="
echo ""

# Check if bot token is set
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN environment variable is not set"
    echo ""
    echo "To create a Telegram bot:"
    echo "1. Open Telegram and search for @BotFather"
    echo "2. Send /newbot and follow the instructions"
    echo "3. Copy the bot token"
    echo ""
    echo "Then run:"
    echo "  export TELEGRAM_BOT_TOKEN='your-bot-token'"
    echo "  $0"
    exit 1
fi

cd "$TELEGRAM_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if TypeScript is compiled
if [ ! -d "dist" ]; then
    echo "Compiling TypeScript..."
    npm run build
fi

echo "Starting Telegram bot..."
npm start
