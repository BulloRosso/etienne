# Claude Code webhook routing through hooks system

**Claude Code doesn't have native HTTP webhooks** - instead, it uses a **hooks system** that executes shell commands at lifecycle events. You can route these to your endpoint at `http://localhost:6060/api/hooks` by configuring hooks to POST JSON data using curl.

Since your Claude Code runs in a devcontainer, you'll need to use `host.docker.internal:6060` instead of `localhost:6060` to reach your host machine's endpoint, or configure the container with host networking mode.

## Configuration file location

Create or edit `.claude/settings.json` in your project directory (or `~/.claude/settings.json` for global configuration). For configurations you don't want checked into git, use `.claude/settings.local.json` instead.

Settings follow this hierarchy:
1. User-level: `~/.claude/settings.json` (applies to all projects)
2. Project-level: `.claude/settings.json` (checked into git)
3. Local project: `.claude/settings.local.json` (not checked in)

## Eight available hook events

Claude Code supports eight distinct lifecycle events that can trigger your webhook:

**UserPromptSubmit** - Fires immediately when a user submits a prompt, before Claude processes it. Receives prompt text, session_id, and timestamp. Useful for prompt logging, validation, or security filtering.

**PreToolUse** - Triggers before any tool execution. Receives tool_name and tool_input parameters. Can block tool execution by returning exit code 2. Critical for security validation and dangerous command prevention.

**PostToolUse** - Fires after successful tool completion. Receives tool_name, tool_input, and tool_response with results. Cannot block execution since tool already ran.

**Notification** - Triggers when Claude Code sends notifications (waiting for input, etc.). Receives message content for custom notification systems.

**Stop** - Fires when Claude Code finishes responding. Can force continuation if needed. Receives stop_hook_active boolean flag.

**SubagentStop** - Triggers when subagents (Task tools) finish responding. Similar to Stop but for subagents specifically.

**PreCompact** - Fires before compaction operations that compress conversation history. Receives trigger type (manual/auto) and custom instructions. Useful for backing up transcripts before compression.

**SessionStart** - Triggers when starting a new session or resuming an existing one. Receives source (startup/resume/clear) and session info. Ideal for loading development context like git status or recent issues.

## Complete configuration for your setup

Here's a complete `.claude/settings.json` configuration that routes all events to your endpoint at `http://localhost:6060/api/hooks`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"UserPromptSubmit\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: UserPromptSubmit' -d @- -s"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"PreToolUse\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: PreToolUse' -d @- -s"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"PostToolUse\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: PostToolUse' -d @- -s"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"Notification\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: Notification' -d @- -s"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"Stop\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: Stop' -d @- -s"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"SubagentStop\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: SubagentStop' -d @- -s"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"PreCompact\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: PreCompact' -d @- -s"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"SessionStart\", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'X-Claude-Event: SessionStart' -d @- -s"
          }
        ]
      }
    ]
  }
}
```

**Key configuration elements:**

- **host.docker.internal:6060** - Special DNS name that resolves to host machine from inside Docker/devcontainer
- **jq command** - Adds event_type and timestamp fields to the JSON payload before sending
- **X-Claude-Event header** - Identifies which event type triggered the webhook
- **-s flag** - Silent mode to suppress curl progress output
- **@- input** - Reads JSON data from stdin (hook receives JSON via stdin)

## Devcontainer networking setup

Since your Claude Code runs in a devcontainer, you have three options for reaching your host machine's endpoint:

### Option 1: Use host.docker.internal (recommended)

This is already configured in the example above. The `host.docker.internal` DNS name automatically resolves to your host machine's IP address from inside Docker containers.

### Option 2: Host networking mode

Add to your `.devcontainer/devcontainer.json`:

```json
{
  "name": "Dev Container",
  "runArgs": ["--network=host"],
  "mounts": [
    "source=${localEnv:HOME}/.claude,target=/root/.claude,type=bind,consistency=cached"
  ]
}
```

With host networking, the container shares your host's network stack, so `localhost:6060` works directly without `host.docker.internal`.

### Option 3: Docker Compose extra_hosts

If using docker-compose.yml for your devcontainer:

```yaml
services:
  dev:
    build: .
    volumes:
      - .:/workspace
      - ~/.claude:/root/.claude
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

## Endpoint URL format specification

Your endpoint receives POST requests with this structure:

**URL:** `http://host.docker.internal:6060/api/hooks` (from devcontainer) or `http://localhost:6060/api/hooks` (with host networking)

**Method:** POST

**Headers:**
- `Content-Type: application/json`
- `X-Claude-Event: [EventType]` (custom header identifying the event)

**Body:** JSON payload with event-specific data plus added fields:
```json
{
  "event_type": "PreToolUse",
  "timestamp": "2025-10-01T12:34:56Z",
  "tool_name": "Edit",
  "tool_input": {
    "path": "/workspace/file.js",
    "operations": [...]
  }
}
```

## Authentication and custom headers

To add authentication headers, modify the curl commands:

```json
{
  "type": "command",
  "command": "jq -c '. + {event_type: \"PreToolUse\"}' | curl -X POST http://host.docker.internal:6060/api/hooks -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_SECRET_TOKEN' -H 'X-API-Key: YOUR_API_KEY' -H 'X-Claude-Event: PreToolUse' -d @- -s"
}
```

**Better approach using environment variables:**

Create `.claude/hooks/send_webhook.sh`:

```bash
#!/bin/bash
EVENT_TYPE="$1"
curl -X POST "${WEBHOOK_ENDPOINT:-http://host.docker.internal:6060/api/hooks}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEBHOOK_AUTH_TOKEN}" \
  -H "X-Claude-Event: ${EVENT_TYPE}" \
  -d @- \
  -s
```

Make it executable: `chmod +x .claude/hooks/send_webhook.sh`

Then use in settings.json:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '. + {event_type: \"PreToolUse\"}' | .claude/hooks/send_webhook.sh PreToolUse"
          }
        ]
      }
    ]
  }
}
```

Set environment variables before starting Claude Code:

```bash
export WEBHOOK_ENDPOINT="http://host.docker.internal:6060/api/hooks"
export WEBHOOK_AUTH_TOKEN="your-secret-token"
```

## Matcher patterns for filtering tools

The `matcher` field in PreToolUse and PostToolUse hooks filters which tools trigger the hook:

- **Empty string or `"*"`** - Matches all tools
- **Exact match** - `"Edit"` matches only the Edit tool
- **Multiple tools** - `"Edit|Write|MultiEdit"` matches any of these tools
- **Regex patterns** - `"Notebook.*"` matches all Notebook-related tools

Example filtering only file operations:

```json
{
  "PreToolUse": [
    {
      "matcher": "Edit|Write|MultiEdit|Delete",
      "hooks": [
        {
          "type": "command",
          "command": "curl -X POST http://host.docker.internal:6060/api/hooks -d @-"
        }
      ]
    }
  ]
}
```

## Environment variables available in hooks

Hook commands have access to these environment variables:

- `$CLAUDE_EVENT_TYPE` - Event type (PreToolUse, PostToolUse, etc.)
- `$CLAUDE_TOOL_NAME` - Name of the tool being used
- `$CLAUDE_TOOL_INPUT` - Raw input parameters in JSON format
- `$CLAUDE_FILE_PATHS` - Space-separated list of file paths
- `$CLAUDE_NOTIFICATION` - Notification message (Notification event only)
- `$CLAUDE_TOOL_OUTPUT` - Tool execution output (PostToolUse only)
- `$CLAUDE_PROJECT_DIR` - Absolute path to project root

## Testing your configuration

**Step 1: Verify endpoint is accessible**

From inside your devcontainer, test connectivity:

```bash
curl -X POST http://host.docker.internal:6060/api/hooks \
  -H 'Content-Type: application/json' \
  -d '{"test": "connection", "event_type": "test"}' \
  -v
```

**Step 2: Test hook configuration manually**

Echo sample data and pipe to your curl command:

```bash
echo '{"tool_name": "Edit", "tool_input": {"path": "/test"}}' | \
  jq -c '. + {event_type: "PreToolUse", timestamp: (now | todate)}' | \
  curl -X POST http://host.docker.internal:6060/api/hooks \
    -H 'Content-Type: application/json' \
    -H 'X-Claude-Event: PreToolUse' \
    -d @- \
    -s
```

**Step 3: Verify hooks are loaded**

Use Claude Code's interactive command:

```bash
/hooks
```

This opens a menu showing all configured hooks. Changes to settings files require review here before taking effect.

**Step 4: Monitor hook execution**

Add logging to debug:

```json
{
  "type": "command",
  "command": "tee -a /tmp/claude-hook-debug.log | curl -X POST http://host.docker.internal:6060/api/hooks -d @-"
}
```

Check the log file: `tail -f /tmp/claude-hook-debug.log`

## Important security and operational notes

**Security considerations:**

- Hooks run with your user permissions and can access anything you can access
- Never hardcode sensitive credentials in settings files checked into git
- Use `.claude/settings.local.json` for sensitive configurations
- Always review hook commands before adding them
- Hooks have a 60-second timeout by default

**How changes take effect:**

Direct edits to settings files don't take effect immediately. You must review changes using the `/hooks` command before they apply. This prevents malicious hook modifications from affecting your current session.

**Performance characteristics:**

- All matching hooks for an event run in parallel
- Identical hook commands are automatically deduplicated
- Failed hooks return stderr which gets fed to Claude or shown to user
- Exit code 0 = success, 2 = blocking error (for PreToolUse), other = non-blocking error

## Alternative Python implementation for complex routing

For more sophisticated webhook handling, create `.claude/hooks/webhook_sender.py`:

```python
#!/usr/bin/env python3
import sys
import json
import requests
from datetime import datetime

def send_webhook(event_type, endpoint="http://host.docker.internal:6060/api/hooks"):
    # Read hook data from stdin
    hook_data = json.loads(sys.stdin.read())
    
    # Add metadata
    payload = {
        **hook_data,
        'event_type': event_type,
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    # Send to endpoint
    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'X-Claude-Event': event_type
            },
            timeout=5
        )
        response.raise_for_status()
        return 0
    except Exception as e:
        print(f"Webhook error: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    event_type = sys.argv[1] if len(sys.argv) > 1 else 'Unknown'
    sys.exit(send_webhook(event_type))
```

Make executable: `chmod +x .claude/hooks/webhook_sender.py`

Configure with `uv run` (recommended) or direct python:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "uv run .claude/hooks/webhook_sender.py PreToolUse"
          }
        ]
      }
    ]
  }
}
```

## Quick start summary

1. Create `.claude/settings.json` in your project directory
2. Copy the complete configuration example above
3. Ensure your devcontainer has `jq` and `curl` installed (usually included by default)
4. Verify `host.docker.internal:6060` is reachable from inside the container
5. Use `/hooks` command in Claude Code to review and activate the configuration
6. Monitor your endpoint at `http://localhost:6060/api/hooks` for incoming events
7. Test with simple operations like prompts or file edits to verify webhook delivery