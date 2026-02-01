#!/bin/bash

# MS Teams Provider start script
# Starts the MS Teams bot provider for Etienne

cd "$(dirname "$0")/../ms-teams"

echo "========================================="
echo "  Starting MS Teams Provider"
echo "========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found!"
    echo "Please create .env from .env.example and configure:"
    echo "  - MICROSOFT_APP_ID"
    echo "  - MICROSOFT_APP_PASSWORD"
    echo ""
    echo "See README.md for Azure setup instructions."
    echo ""
fi

# Run in development mode
npm run dev
