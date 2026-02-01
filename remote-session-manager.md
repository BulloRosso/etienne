# Remote Session Manager

We will introduce a remote session manager which is capable to work with several remote session providers at the same time.

The remote session manager maps a session of a remote session provider to a project's session. The project session is the claude agent session id. A remote session provider example is "Telegram" and the remote session is a Telegram chat or channel.

## Remote Session Manager Implementation
The remote session manager is implemented in /backend/remote-sessions.

IMPORTANT: The remote session manager will only use the existing REST endpoints of /backend/src/claude to send and receive messages and files to the existing projects. No modification of these endpoints is allowed.

### Mapping Sessions
The main purpose of the session manager keep a memory of session mappings in a JSON remote-sessions.json which has the structure:
{
    "remote-sessions": [
        {
            "provider": "telegram",
            "webhook": {
                "url": "telegram webhook id for this session"
            }
            "created_at": <ISO timestamp>,
            "project": {
                "name": "project folder name",
                "sessionId": "12321"
            },
            "remoteSession": {
                "sessionId": "<telegram session id>",
                ...
            }
        }
    ]
}

The content of remoteSession object is dependend on the session provider.

### Forwarding messages
The remote session manager can subscribe to webhooks for the remote session providers in order to receive incomming events. The remote session providers expose POST endpoints which are used by the remote session manager to send messages or files to the remote session provider.

### Claude Code Project Sessions
A new session from the outside must first be mapped to a existing etienne project. Remote session providers can never create new etienne sessions.

## Telegram Remote Session Provider
The Telegram session provider is implemented in /telegram at the root level. It is a server based on grammy (https://github.com/grammyjs/grammY?tab=readme-ov-file) which runs on port 6350 and can be started with a script in /start-scripts/start-telegram.sh

### Interaction with Telegram: Creating a Telegram Bot 
Users can and must create their own Telegram bot to use Etienne with Telegram:
Search and select @BotFather in Telegram. This is the official bot for creating and managing Telegram bots. 

The setup process involves:

1. Create a bot via Telegram's @BotFather
2. Get a bot token
3. Configure remote session provider with that token (channels.telegram.botToken)
4. Start the Remote Session Provider as gateway

The remote session provider then is connected to this bot owned by the user.

### Pairing the Telegram app with the Telegram Bot
How Users Talk to Their Bot in Telegram
Once the remote session provider is configured with a Telegram bot token, users interact with the bot just like any other Telegram bot:
1. Finding and Starting the Bot
In Telegram, search and select the bot you created in Part 1. Send /start to your bot. You should receive a message containing a pairing code. 
The user:

* Opens the Telegram app (mobile or desktop)
* Searches for their bot by its username (e.g., @MyAssistantBot)
* Starts a chat by tapping on the bot
* Sends /start to initiate the conversation

2. Pairing (First-Time Authentication)
By default, the remote session provider uses a pairing system to authorize users:
DM access is pairing by default; approve the pairing code on first contact. Openclaw
Send /start to your bot. You should receive a message containing a pairing code. In your terminal, run the following command (replace <code> with the pairing code from the message). You should see a success message in both the terminal and Telegram. 

The pairing flow:

1. User sends a message to the bot in Telegram
2. Bot replies with a pairing code
3. User (or admin) approves the code via CLI: remote session provider pairing approval telegram <CODE>
4. User is now authorized and can chat freely

### Mapping an Etienne project to the chat
The user must issue a select project command by simply typing "project '<etienne project name>'. The remote session provider then selects the most recent session of this etienne project as mapping - if no session is existing a new one is created.

The user can change the session mapping to another project at any time by typing "project '<etienne project name>'.

### REST API
The remote session provider provides REST API endpoints where the remote session manager can subscribe to incomming communication events and POST outgoing communication messages or files.