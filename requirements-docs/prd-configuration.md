# Configuration of the Backend

The backend requires a .env file to operate properly. 

## Backend

The .env file is communicated as JSON file but stored as plain text file:
```
# Anthropic API Key (used for direct Claude API calls when aiModel=claude)
ANTHROPIC_API_KEY=sk-ant-api03-...AA
# Local path to workspace files 
WORKSPACE_ROOT=C:/Data/GitHub/claude-multitenant/workspace

# Memory Management Configuration
MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories
MEMORY_DECAY_DAYS=6

# Budget Control Configuration
COSTS_CURRENCY_UNIT=EUR
COSTS_PER_MIO_INPUT_TOKENS=3.0
COSTS_PER_MIO_OUTPUT_TOKENS=15.0


# Checkpoint Provider Configuration
CHECKPOINT_PROVIDER=gitea
GITEA_URL=http://localhost:3000
GITEA_USERNAME=email-address
GITEA_PASSWORD=password
GITEA_REPO=workspace-checkpoints

# Email Configuration
# SMTP_CONNECTION format: host|port|secure|user|password
# Port 587 uses STARTTLS (secure=false triggers STARTTLS mode)
# Port 993 uses direct SSL/TLS (secure=true)
SMTP_CONNECTION=mail.de2.hostedoffice.ag|587|false|email-address|password

# IMAP_CONNECTION format: host|port|secure|user|password
# IMAP uses SSL on port 993
IMAP_CONNECTION=mail.de2.hostedoffice.ag|993|true|email-address|password

# SMTP Whitelist - comma-separated list of allowed recipients
# This prevents AI agents from sending emails to unauthorized recipients
SMTP_WHITELIST=email-address,email-address
```

The backend needs a backend/src/configuration service which offers two endpoints:
* GET: to return the entries of the .env file in JSON format or and 404 http status if .env does not exist
* POST: to write the entries of the .env file

If the backend receives POSTed values from the frontend it:
a) writes the .env file into the backend directory 
b) exports the variables to the environment so we can avoid an restart of the service

## Frontend

The frontend must call the GET configuration endpoint on startup: if the GET returns 404 then the 
about modal dialog is displayed with the configuration tab active.

### About modal dialog
The about modal needs a new "Configuration" tab item which displays a new Configration.jsx compontent.
The component displays the items:
* ANTHROPIC_API_KEY
* WORKSPACE_ROOT
Below these items there is a collapsed section "Optional Features" with these items:

1. Checkpointing
* CHECKPOINT_PROVIDER=gitea
* GITEA_URL=http://localhost:3000
* GITEA_USERNAME=email-address
* GITEA_PASSWORD=password
* GITEA_REPO=workspace-checkpoints

2. Email Connectivity
* IMAP_CONNECTION=mail.de2.hostedoffice.ag|993|true|email-address|emaill-password
* SMTP_CONNECTION=mail.de2.hostedoffice.ag|587|false|email-address|emaill-password
* SMTP_WHITELIST=email-address,email-address

3. Budget Control
* COSTS_CURRENCY_UNIT=EUR
* COSTS_PER_MIO_INPUT_TOKENS=3.0
* COSTS_PER_MIO_OUTPUT_TOKENS=15.0

4. Memory Management (User Preferences)
* MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories
* MEMORY_DECAY_DAYS=6

The values behind = are the default values

Below these there is a right aligned "Save" button which is only enabled if both items were
provided by the user.
