# Session management

In our project we have the system session management provided by Claude Code and the application session management provided by our backend.

In our setup Claude Code stores its own session file in workspace/<projectname>/.claude/projets/-<projectname>/<sessionid>.jsonl

We want to extend our own application session management.

## Current status and goal
When you begin the implementation our status is that we store a single file for all sessions in workspace/<projectname>/.etienne/chat.history.json.

We want to introduce a new file workspace/<projectname>/.etienne/chat.sessions.json which contains the existing sessions and the last activity as a timestamp.

Example chat.sessions.json:
--------
{
  "session": [ 
    {
    "timestamp": <iso date time>,
    "sessionId": <claude session id>,
    "summary": <two sentences summarizing the messages>
    },
    ...
}
--------

We now want to write each session data in side a separate file and change from json to jsonl:
workspace/<projectname>/.etienne//chat.history-<sessionid>.jsonl

## Frontend
In the header of ChatPane.jsx we want to introduce two new right aligned icon buttons:
* "Start new session" with import { RiChatNewLine } from "react-icons/ri";
* "Resume session" with import { PiCaretCircleDownLight } from "react-icons/pi";

"Start new session" is only visible if we have a current session. If clicked it clears the current session and the chat message pane.

"Resume session" is only visible if we have chat.sessions.json file in the backend. If clicked it opens a drawer with the SessionPane.jsx component from the left screen side.

### SessionPane.jsx
Lists all sessions with in descending order by timestamp. If the user clicks one session the drawer closes, the selected session id becomes the active one and the ChatPane is reloaded to show session's messages.

Because the backend must update some of the sessions summaries before responding we need to display a spinner after calling  GET /api/sessions/<projectname> and use a defensive request timeout of 120 seconds.

We will use import { PiChatsThin } from "react-icons/pi"; for the session list items.

This component has a simple header "Recent Sessions" with a right aligned close icon button.

## Backend
The application session management must be done in a module backend/src/sessions which has a sessions.controller.ts and a sessions.service.ts. Refactor the current session management to this module before continuing.

The backend must update the chat.sessions.json file after each stream response from Claude Code was completely received: update the timestamp but don't touch the summary field.

The backend must also update the chat.history-<sessionId>.jsonl similar to the current existing approach.

The backend must provide a GET /api/sessions/<projectname> endpoint which returns the existing sessions. Before returning the JSON we have to update empty summaries by iteration over all sessions in the file, generate the summary, update the file and then returning the file content.

The summary is created by passing the session in workspace/<projectname>/.etienne//chat.history-<sessionid>.jsonl to a GPT-5-mini model with the Prompt "Summarize this chat session in two sentences. The user is the user, the other part is called the agent. Session messages: ${content from chat.history-<sessionId>.jsonl}".

This is an example summary: "The user asked about the creation of a responsive website. The agent created a weather page in html."

## Claude Code Details

### JSONL Session Files
Each conversation is stored in JSONL (JSON Lines) format at:
~/.claude/projects/[encoded-path]/[session-uuid].jsonl

Each line represents a single event:
```json
{"type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2025-06-02T18:46:59.937Z","uuid":"...","sessionId":"...","cwd":"/path/to/project"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]},"timestamp":"2025-06-02T18:47:06.267Z","uuid":"..."}
```
### Headless Mode (-p) Parameters
Core Flags
| Flag | Description |
---------------------
| --print, -p | Run in non-interactive mode |
| --output-format | Specify output format: text, json, or stream-json |
| --resume, -r | Resume a conversation by session ID |
| --continue, -c | Continue the most recent conversation |

### Session Output Format (JSON)
``` json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.003,
  "is_error": false,
  "duration_ms": 1234,
  "duration_api_ms": 800,
  "num_turns": 6,
  "result": "The response text here...",
  "session_id": "abc123"
}
```

### Scheduled tasks
Scheduled task contiue the last recent session.

### Session Persistence in Headless Mode
Important limitation: Headless mode does not persist between sessions by default Claude Code Best Practices \ Anthropic. Each -p invocation creates a new session unless explicitly resumed using --resume or --continue.
#### Multi-Turn Headless Conversations
For session persistence in automation:

```bash
# Capture session ID from first call
session_id=$(claude -p "Start task" --output-format json | jq -r '.session_id')
```

#### Resume for subsequent calls
claude -p --resume "$session_id" "Continue task step 2"
claude -p --resume "$session_id" "Finalize task"
stdin Input for Multi-Turn
You can pipe messages via stdin where each message represents a user turn, allowing multiple turns without re-launching the binary Headless mode - Claude Docs:
bashecho '{"role":"user","content":"Hello"}' | claude -p --output-format stream-json

#### Session Data Structure
Transcript Entry Fields
* sessionId: Unique session identifier (UUID)
* uuid: Unique message identifier
* type: Message type (user, assistant, system)
* message: The actual message content
* timestamp: ISO 8601 timestamp
* cwd: Current working directory
* gitBranch: Active git branch (if in git repo)
* version: Claude Code version
* parentUuid: For threaded/subagent messages
* isSidechain: Indicates subagent task