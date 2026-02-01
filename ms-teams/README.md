# MS Teams Provider for Etienne

This provider connects Microsoft Teams to Etienne, allowing users to interact with Claude via Teams chat.

## Prerequisites

- Node.js 20+
- An Azure subscription (free tier works)
- Microsoft Teams (desktop or web)
- ngrok or similar for local development (required for HTTPS)

## Azure Setup (Step-by-Step)

### 1. Create Azure Bot Resource

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource"
3. Search for "Azure Bot" and select it
4. Click "Create"
5. Fill in the required fields:
   - **Bot handle**: A unique name (e.g., `etienne-teams-bot`)
   - **Subscription**: Select your subscription
   - **Resource group**: Create new or use existing
   - **Pricing tier**: F0 (Free) is sufficient for development
   - **Microsoft App ID**: Select "Create new Microsoft App ID"
6. Click "Review + create", then "Create"
7. Wait for deployment to complete

### 2. Get App Credentials

1. Go to your newly created Azure Bot resource
2. In the left menu, click "Configuration"
3. Copy the **Microsoft App ID** - you'll need this for `MICROSOFT_APP_ID`
4. Click "Manage" next to Microsoft App ID (opens App registrations)
5. Go to "Certificates & secrets"
6. Click "New client secret"
7. Add a description (e.g., "Etienne Teams Bot")
8. Select an expiration period
9. Click "Add"
10. **IMPORTANT**: Copy the secret **Value** immediately (you won't see it again)
    - This is your `MICROSOFT_APP_PASSWORD`

### 3. Configure Teams Channel

1. Go back to your Azure Bot resource
2. In the left menu, click "Channels"
3. Click "Microsoft Teams" under "Available Channels"
4. Accept the Terms of Service
5. Click "Apply"

### 4. Set Messaging Endpoint

1. In the Azure Bot, go to "Configuration"
2. Set **Messaging endpoint** to your webhook URL:
   - For local dev: `https://your-ngrok-url.ngrok.io/api/messages`
   - For production: `https://your-domain.com/api/messages`
3. Click "Apply"

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Microsoft Bot Framework credentials (REQUIRED)
# Get these from Azure Portal -> Your Bot -> Configuration
MICROSOFT_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_APP_PASSWORD=your-client-secret-value

# Backend URL (where Etienne backend is running)
BACKEND_URL=http://localhost:6060

# Port for the Teams provider webhook server
TEAMS_PORT=6360
```

### Environment Variable Details

| Variable | Description | Example |
|----------|-------------|---------|
| `MICROSOFT_APP_ID` | Bot's App ID from Azure (GUID format) | `12345678-1234-1234-1234-123456789012` |
| `MICROSOFT_APP_PASSWORD` | Client secret from Azure App registration | `abc123~XYZ...` |
| `BACKEND_URL` | URL of the Etienne backend API | `http://localhost:6060` |
| `TEAMS_PORT` | Local port for the webhook server | `6360` |

## Local Development with ngrok

Teams requires HTTPS for webhooks. Use ngrok for local development:

1. **Install ngrok**: https://ngrok.com/download

2. **Start ngrok**:
   ```bash
   ngrok http 6360
   ```

3. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

4. **Update Azure Bot messaging endpoint** to `https://abc123.ngrok.io/api/messages`

5. **Start the provider**:
   ```bash
   npm run dev
   ```

**Note**: Free ngrok URLs change each time you restart. Update the Azure Bot endpoint accordingly.

## Installation

```bash
cd ms-teams
npm install
```

## Running

**Development mode** (with ts-node):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

Or use the start script:
```bash
./start-scripts/start-ms-teams.sh
```

## Testing the Bot

1. Open Microsoft Teams (desktop or web)
2. Go to Apps -> Search for your bot name
3. Click "Add" to install the bot
4. Start a conversation
5. Type `/start` to begin pairing
6. Approve the pairing request in the Etienne web UI
7. Select a project: `project 'your-project-name'`
8. Start chatting!

## Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin pairing or show status |
| `/status` | Show current session status |
| `/projects` | List available projects |
| `/disconnect` | Disconnect this chat |
| `/help` | Show help message |
| `project 'name'` | Select a project |

## Troubleshooting

### "Unauthorized" errors
- Check that `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD` are correct
- Ensure the client secret hasn't expired in Azure

### Bot doesn't respond
- Verify the messaging endpoint URL in Azure is correct
- Check ngrok is running and the URL matches
- Check the provider console for errors

### "Service URL is required" error
- The bot hasn't received any messages yet (conversation reference not stored)
- Send a message to the bot first before expecting proactive messages

### Can't find bot in Teams
- Verify the Teams channel is added in Azure Bot
- Try searching by the exact bot handle name
- It may take a few minutes for the bot to appear after channel setup

## Architecture

```
Teams User -> Teams Service -> ngrok -> MS Teams Provider -> Backend -> Claude
                                          |
                                    SSE Events <- Backend
                                          |
                                    Teams User (response)
```

## Security Notes

- Never commit `.env` file to version control
- Rotate client secrets periodically in Azure
- Use managed identity in production instead of client secrets
- Consider IP restrictions on the Azure Bot
