---
name: agent-collaboration
description: "Use this skill whenever the agent communicates with external agents via the A2A protocol. It establishes auditable 'diplomatic channels' — dedicated counterpart projects (a2a-<agent-name>) in the workspace that store all exchanged files in a controlled exchange/ folder and maintain a human-readable conversation log. Trigger on any A2A tool invocation, inter-agent delegation, or when the user asks to collaborate with an external agent."
---

# Agent Collaboration Skill

An auditable, reproducible framework for inter-agent communication via the A2A protocol.
Each external agent gets a dedicated **counterpart project** in the workspace that acts as
a "diplomatic channel" — storing exchanged files, conversation logs, and metadata.

---

## Activation

This skill activates when:

- You invoke any `a2a_*` tool (e.g., `a2a_send_message`, `a2a_<agent>_<skill>`)
- The user asks you to collaborate, delegate, or communicate with an external agent
- You receive a response from an external agent containing files or artifacts

On activation, ensure the counterpart project exists before proceeding with the exchange.

---

## Counterpart Project Convention

When communicating with an external agent named **Stefan**, a counterpart project
`a2a-stefan` is automatically created in the workspace. The project structure:

```
workspace/a2a-stefan/
├── CLAUDE.md                      # Mission brief: diplomatic channel description
├── .claude/
│   └── skills/
│       └── agent-collaboration/   # This skill
├── .etienne/
│   ├── counterpart.json           # Agent metadata, trust level, stats
│   └── a2a-settings.json          # Only Stefan enabled
├── exchange/
│   ├── outbound/                  # Files WE send to Stefan
│   └── inbound/                   # Files Stefan sends to US
├── conversations/
│   ├── conversation-log.md        # Human-readable audit trail
│   └── file-manifest.json         # Machine-readable file exchange record
└── out/                           # Internal output (not exposed)
```

---

## File & Folder Conventions

### The Exchange Boundary

The `exchange/` folder is the **controlled exposure boundary**:

- **`exchange/outbound/`** — ONLY files placed here may be sent to the counterpart agent.
  Before sending files via A2A, you MUST first copy or create them in this folder.
- **`exchange/inbound/`** — Files received from the counterpart are automatically saved here.
- **`out/`** — Internal output files that are NEVER exposed to the counterpart.

### File Naming

Use date-prefixed names to maintain chronological order and avoid collisions:

```
exchange/outbound/2026-03-29_market-analysis.pdf
exchange/outbound/2026-03-29_proposal-v2.docx
exchange/inbound/2026-03-29_feedback-report.csv
```

### What NOT to Send

Never place the following in `exchange/outbound/`:

- Configuration files (`.claude/`, `.etienne/`, `data/`)
- Files containing API keys, tokens, or credentials
- Files from other counterpart projects (cross-channel leakage)

---

## Conversation Logging

After **every** A2A interaction (send or receive), append an entry to
`conversations/conversation-log.md` in this format:

```markdown
# Conversation Log: Etienne ↔ Stefan

## Session <ISO-timestamp>

### [HH:MM] Etienne → Stefan
**Topic:** <brief topic description>
**Message:** <summary of the message sent>
**Files sent:** exchange/outbound/<filename> (if any)

### [HH:MM] Stefan → Etienne
**Status:** <completed|failed|input-required>
**Response:** <summary of the response received>
**Files received:** exchange/inbound/<filename> (if any)
**Task ID:** <a2a-task-id>

---
```

Also update `conversations/file-manifest.json` with each file exchanged:

```json
{
  "exchanges": [
    {
      "timestamp": "2026-03-29T10:15:00Z",
      "direction": "outbound",
      "files": [
        {
          "name": "market-data.csv",
          "path": "exchange/outbound/2026-03-29_market-data.csv",
          "mimeType": "text/csv",
          "sizeBytes": 12345
        }
      ],
      "messageId": "msg-uuid",
      "taskId": null
    }
  ]
}
```

---

## Negotiation Protocol

For complex multi-step collaborations, use this structured pattern:

### 1. Propose
Send a clear proposal describing what you need from the counterpart:
- The objective
- What files or data you are providing
- What you expect in return
- Any constraints or deadlines

### 2. Discuss
The counterpart may respond with questions, counter-proposals, or partial results.
Log each exchange in the conversation log. Iterate until alignment is reached.

### 3. Confirm
Once both parties agree on the outcome:
- Summarize the agreement in the conversation log
- Record all final artifacts in the file manifest
- Note the agreed-upon next steps (if any)

For simple request/response interactions, this protocol collapses to a single
send → receive cycle. Use the full protocol only when the collaboration requires
multiple rounds of negotiation.

---

## Session Workflow

### 1. Before Sending an A2A Message

1. **Identify the counterpart**: Determine which external agent you are communicating with.
2. **Ensure counterpart project exists**: The backend auto-creates it, but verify the
   `a2a-<agent-slug>` project is present.
3. **Prepare files**: If sending files, copy or create them in
   `exchange/outbound/` of the counterpart project.
4. **Send the message**: Use the appropriate `a2a_*` tool with file paths pointing to
   `exchange/outbound/`.

### 2. After Receiving a Response

1. **Check for files**: Received files are saved to `exchange/inbound/` automatically.
2. **Log the exchange**: Append entries to `conversations/conversation-log.md`.
3. **Update manifest**: Add file records to `conversations/file-manifest.json`.
4. **Inform the user**: Summarize what was exchanged and the outcome.

### 3. When the User Reviews

The user can open the counterpart project and read:
- `conversations/conversation-log.md` for a full narrative of what was negotiated
- `conversations/file-manifest.json` for a machine-readable record
- `exchange/` to inspect all files that were shared
- `.etienne/counterpart.json` for agent metadata and relationship stats

---

## Checklist Before Each A2A Exchange

- [ ] Is the counterpart project (`a2a-<name>`) ready?
- [ ] Are outbound files placed in `exchange/outbound/` (not elsewhere)?
- [ ] Does the message clearly state the objective and expected response?
- [ ] Will the conversation log be updated after the exchange?
- [ ] Are no sensitive files (credentials, configs) being exposed?

---

## Tone & Style

- Be precise and professional in inter-agent communication — clarity reduces
  misunderstandings between automated systems.
- When reporting results to the user, clearly distinguish between what YOU produced
  and what the COUNTERPART agent provided.
- Always reference the counterpart project name so the user knows where to find
  the audit trail.

---

## Error Handling

- If the counterpart agent is unreachable, log the failure in the conversation log
  with the error message and timestamp.
- If a received file cannot be saved, report the issue to the user and log it.
- If the counterpart returns `input-required`, log the request and ask the user
  whether to proceed with the additional input.
- Never silently swallow A2A failures — the audit trail must reflect all attempts,
  including failed ones.
