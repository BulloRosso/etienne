---
name: vapi-voice-agent
description: A Claude Code skill for managing voice calls via the Vapi MCP server. Supports making outbound calls, querying recent inbound/outbound calls, and summarizing call transcriptions.
---

# Vapi Voice Agent Skill

This skill enables Claude to manage voice calls through the [Vapi](https://vapi.ai) platform using the Vapi MCP Server.

## Prerequisites

The Vapi MCP server must be configured in your Claude Code (or Claude Desktop) MCP settings.

### Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vapi-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.vapi.ai/mcp",
        "--header",
        "Authorization: Bearer ${VAPI_TOKEN}"
      ],
      "env": {
        "VAPI_TOKEN": "YOUR_VAPI_API_KEY"
      }
    }
  }
}
```

### Claude Code Configuration

```bash
claude mcp add vapi-mcp \
  --transport sse \
  --url "https://mcp.vapi.ai/sse" \
  --header "Authorization: Bearer YOUR_VAPI_API_KEY"
```

Get your API key from: https://dashboard.vapi.ai/org/api-keys

---

## Available MCP Tools

The Vapi MCP server exposes these tools:

| Tool                | Description                                |
|---------------------|--------------------------------------------|
| `list_assistants`   | List all Vapi assistants                   |
| `create_assistant`  | Create a new assistant                     |
| `get_assistant`     | Get assistant details by ID                |
| `list_calls`        | List calls (supports time filtering)       |
| `create_call`       | Create an outbound call (immediate or scheduled) |
| `get_call`          | Get call details including transcript      |
| `list_phone_numbers`| List available phone numbers               |
| `get_phone_number`  | Get phone number details                   |
| `list_tools`        | List available Vapi tools                  |
| `get_tool`          | Get tool details                           |

---

## Capabilities

### 1. Make an Outbound Call

Use `list_assistants` to find the right assistant, `list_phone_numbers` to find the caller ID, then `create_call` to initiate.

**Workflow:**
1. Call `list_assistants` → pick the appropriate assistant (by name or purpose)
2. Call `list_phone_numbers` → pick the phone number to call from
3. Call `create_call` with:
   - `assistantId`: the chosen assistant's ID
   - `phoneNumberId`: the Vapi phone number ID (caller ID)
   - `customer.number`: the destination phone number in E.164 format (e.g. `+15551234567`)
   - `scheduledAt` (optional): ISO 8601 datetime to schedule the call for later

**Example prompt:** "Call Jeremy at +1-555-123-4567 using the customer support assistant."

### 2. Query Recent Calls (Last Hour)

Use `list_calls` to retrieve calls from a specific time window. The MCP tool supports filtering by `createdAtGe` (created at ≥) and `createdAtLe` (created at ≤) parameters.

**Workflow:**
1. Call `list_calls` with time filter parameters to get calls from the last hour (or any window)
   - Use `createdAtGe` with an ISO 8601 timestamp for "1 hour ago"
   - Optionally filter by `assistantId` to narrow results
2. For each call returned, call `get_call` with the call's `id` to retrieve full details including:
   - `transcript` — the full text transcript of the conversation
   - `messages` — array of individual utterances with role, message, and timestamps
   - `analysis.summary` — AI-generated summary (if analysis plan is configured)
   - `status` — call status (queued, ringing, in-progress, forwarding, ended)
   - `endedReason` — why the call ended
   - `startedAt` / `endedAt` — call timing
   - `cost` — call cost breakdown
   - `type` — `inboundPhoneCall`, `outboundPhoneCall`, or `webCall`

**Example prompt:** "Show me all incoming calls from the last hour and summarize what was discussed."

### 3. Summarize Call Transcriptions

After retrieving calls via `list_calls` + `get_call`, summarize the transcriptions.

**Workflow:**
1. Retrieve calls as in capability #2
2. For each call with a transcript, extract:
   - Call type (inbound/outbound)
   - Caller/callee number
   - Duration (from `startedAt` and `endedAt`)
   - The `transcript` field (full conversation text)
   - The `analysis.summary` field if available
3. Present a summary including:
   - Number of calls in the time window
   - For each call: who called, when, duration, and a concise summary of the conversation
   - Any notable patterns or action items mentioned

**Example prompt:** "Summarize all calls from the last 2 hours — group by inbound vs outbound."

---

## Response Format

When presenting call summaries, use this structure:

```
## Call Summary — [Time Window]

**Total calls:** X (Y inbound, Z outbound)

### Call 1 — [Inbound/Outbound] at [time]
- **From/To:** [phone number]
- **Assistant:** [assistant name]
- **Duration:** [X minutes]
- **Summary:** [concise summary of the conversation]
- **Action items:** [if any were mentioned]

### Call 2 — ...
```

---

## Tips

- Phone numbers must be in **E.164 format**: `+15551234567` (with country code, no spaces/dashes)
- The `analysis.summary` field is only populated if the assistant has an analysis plan configured — if missing, summarize from the raw `transcript` or `messages` array
- The `list_calls` tool returns calls in reverse chronological order by default
- Call transcripts may be empty for very short or failed calls — check `status` and `endedReason`
- Use `scheduledAt` on `create_call` to schedule calls for a future time