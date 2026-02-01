# Telegram Provider for Etienne

This is a Telegram bot provider that connects Telegram users to Etienne (Claude Code) projects. Users can chat with Etienne directly from Telegram after completing a secure pairing process.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Telegram User  │     │  Telegram Provider   │     │    Backend      │
│                 │     │    (this service)    │     │  (NestJS API)   │
└────────┬────────┘     └──────────┬───────────┘     └────────┬────────┘
         │                         │                          │
         │  1. Send message        │                          │
         │ ───────────────────────>│                          │
         │                         │  2. Check session        │
         │                         │ ────────────────────────>│
         │                         │                          │
         │                         │  3. Forward to Etienne   │
         │                         │ ────────────────────────>│
         │                         │                          │
         │                         │  4. Etienne response     │
         │                         │ <────────────────────────│
         │  5. Reply to user       │                          │
         │ <───────────────────────│                          │
         │                         │                          │
```

### Components

1. **Telegram Provider** (`/telegram`)
   - Grammy-based Telegram bot using long polling
   - Handles user messages, commands, and media uploads
   - Connects to backend via REST API
   - Listens for events via SSE (Server-Sent Events)

2. **Backend Remote Sessions Module** (`/backend/src/remote-sessions`)
   - Manages session mappings between Telegram chats and Etienne projects
   - Handles pairing requests with admin approval via web UI
   - Forwards messages to Etienne via the unattended endpoint
   - Stores session data in `backend/.etienne/remote-sessions.json`

3. **Frontend Pairing Modal** (`/frontend/src/components/PairingRequestModal.jsx`)
   - Displays pairing requests for admin approval/denial
   - Connected via SSE to receive real-time pairing requests

### Data Flow

#### Pairing Flow
```
Telegram User              Telegram Provider           Backend              Frontend (Web UI)
     │                           │                        │                       │
     │  /start                   │                        │                       │
     │ ─────────────────────────>│                        │                       │
     │                           │  POST /pairing/request │                       │
     │                           │ ──────────────────────>│                       │
     │                           │                        │  SSE: pairing_request │
     │                           │                        │ ─────────────────────>│
     │  "Waiting for approval"   │                        │                       │
     │ <─────────────────────────│                        │                       │
     │                           │                        │                       │
     │                           │                        │  Admin clicks Approve │
     │                           │                        │ <─────────────────────│
     │                           │  SSE: pairing_approved │                       │
     │                           │ <──────────────────────│                       │
     │  "Pairing approved!"      │                        │                       │
     │ <─────────────────────────│                        │                       │
```

#### Message Flow
```
Telegram User              Telegram Provider           Backend
     │                           │                        │
     │  "Hello Etienne"          │                        │
     │ ─────────────────────────>│                        │
     │                           │  POST /message         │
     │                           │ ──────────────────────>│
     │                           │                        │ ──> Etienne processes
     │                           │                        │ <── Etienne responds
     │                           │  Response              │
     │                           │ <──────────────────────│
     │  "Hello! How can I help?" │                        │
     │ <─────────────────────────│                        │
```

## Configuration

### Environment Variables

Create a `.env` file in the `/telegram` directory:

```env
# Required: Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your-bot-token-here

# Optional: Backend URL (default: http://localhost:6060)
BACKEND_URL=http://localhost:6060
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token obtained from @BotFather |
| `BACKEND_URL` | No | `http://localhost:6060` | URL of the Etienne backend API |

## Setup Guide

### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` to create a new bot
3. Follow the prompts:
   - Enter a **name** for your bot (e.g., "My Etienne Bot")
   - Enter a **username** for your bot (must end in `bot`, e.g., "my_etienne_bot")
4. BotFather will respond with your **bot token** - save this securely!

Example token format:
```
123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### Step 2: Configure the Provider

1. Copy the example environment file:
   ```bash
   cd telegram
   cp .env.example .env
   ```

2. Edit `.env` and add your bot token:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   BACKEND_URL=http://localhost:6060
   ```

### Step 3: Install Dependencies

```bash
cd telegram
npm install
```

### Step 4: Start the Provider

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

You should see:
```
========================================
  Telegram Provider for Etienne
========================================

[Config] Backend URL: http://localhost:6060
[Bot] Starting with long polling...

========================================
  Bot @YourBotName is running!
========================================
```

## Usage Guide

### Pairing (First-Time Setup)

1. **Find your bot** in Telegram by searching for `@YourBotUsername`

2. **Send `/start`** to begin the pairing process
   - The bot will respond: "A pairing request is being sent to the admin..."

3. **Admin approves in web UI**:
   - A modal will appear in the Etienne web interface
   - Shows the Telegram user's info (username, name, chat ID)
   - Click **Approve** to allow access or **Deny** to reject

4. **Confirmation**:
   - Once approved, the bot responds: "✅ Pairing approved!"
   - You can now select a project

### Project Selection

After pairing, you must select a project to chat with Etienne:

1. **List available projects**:
   ```
   /projects
   ```
   Shows all available projects in the workspace.

2. **Select a project**:
   ```
   project 'project-name'
   ```
   or
   ```
   project "project-name"
   ```

   Example:
   ```
   project 'my-awesome-app'
   ```

3. **Confirmation**:
   - Bot responds: "✅ Connected to project: `my-awesome-app`"
   - You can now send messages to Etienne!

### Chatting with Etienne

Once paired and a project is selected, simply type your message:

```
Hello! Can you help me understand the codebase structure?
```

Etienne will respond directly in the Telegram chat.

### Sending Files

You can send files to Etienne by:

1. **Sending a photo, document, video, or audio file**
2. The file is automatically uploaded to the project's `.attachments` folder
3. If you include a **caption**, it will be sent to Etienne with a reference to the file

Example:
- Send a screenshot with caption: "What's wrong with this error?"
- Etienne receives: "Please have a look at photo_1234567890.jpg in the .attachments folder. What's wrong with this error?"

### Downloading Files

You can download files from your project workspace using these commands:

```
show me <filename>
download <filename>
get <filename>
```

Examples:
```
show me output.png
download report.pdf
get src/index.ts
```

The bot will send the file directly to your Telegram chat. Images are sent as photos with a preview, while other files are sent as documents.

### Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin pairing or show current status |
| `/status` | Show current session status (provider, project, etc.) |
| `/projects` | List all available projects |
| `/disconnect` | Disconnect from Etienne (requires re-pairing) |
| `/help` | Show available commands |

## Security

### Access Control

- **All users are blocked by default** - no one can interact with Etienne without explicit admin approval
- Pairing codes are generated per-request and expire after 10 minutes
- Admins must approve each pairing request via the web UI
- Sessions can be revoked using `/disconnect` or via the backend API

### Recommendations

1. **Keep your bot token secret** - never commit it to version control
2. **Use environment variables** - don't hardcode tokens in code
3. **Monitor pairing requests** - only approve users you trust
4. **Revoke access** when needed using the disconnect functionality

## Troubleshooting

### Bot doesn't respond

1. Check that the backend is running on the configured URL
2. Verify your bot token is correct
3. Check the console for error messages

### Pairing request not appearing in web UI

1. Ensure the frontend is connected to the backend
2. Check that the global SSE endpoint is working: `/api/interceptors/stream/__global__`
3. Look for errors in the backend logs

### File upload fails

1. Check that the project exists and is accessible
2. Verify the backend has write permissions to the workspace
3. File size limits apply (Telegram's default is 20MB for bots)

### SSE connection errors

The provider will automatically reconnect with exponential backoff. If errors persist:
1. Check backend connectivity
2. Verify the SSE endpoint: `/api/remote-sessions/events/telegram`
3. Restart the provider

## Development

### Project Structure

```
telegram/
├── src/
│   ├── main.ts                 # Entry point
│   ├── bot.ts                  # Grammy bot setup
│   ├── config/
│   │   └── config.ts           # Configuration loader
│   ├── handlers/
│   │   ├── command.handler.ts  # /start, /help, etc.
│   │   └── message.handler.ts  # Text and media handling
│   ├── services/
│   │   ├── session-manager-client.service.ts  # Backend REST client
│   │   └── sse-listener.service.ts            # SSE subscription
│   └── types/
│       └── index.ts            # TypeScript interfaces
├── dist/                       # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env                        # Environment variables (create this)
├── .env.example                # Example configuration
└── README.md                   # This file
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run in development mode with ts-node |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled JavaScript |
| `npm run watch` | Watch mode for development |

### Adding New Features

1. **New command**: Add handler in `src/handlers/command.handler.ts`
2. **New media type**: Add handler in `src/handlers/message.handler.ts`
3. **New API call**: Add method in `src/services/session-manager-client.service.ts`

## API Reference

### Backend Endpoints Used

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/remote-sessions/pairing/request` | Request pairing |
| POST | `/api/remote-sessions/pairing/respond` | Respond to pairing (frontend) |
| GET | `/api/remote-sessions/session/:chatId` | Get session info |
| POST | `/api/remote-sessions/project` | Select project |
| POST | `/api/remote-sessions/message` | Send message to Etienne |
| GET | `/api/remote-sessions/projects` | List available projects |
| POST | `/api/remote-sessions/disconnect/:chatId` | Disconnect session |
| SSE | `/api/remote-sessions/events/telegram` | Event stream for responses |
| POST | `/api/workspace/:project/attachments/upload` | Upload file attachment |
