# Handling Claude Code responses in a structured way

## Current State (Plain Text)
### Chat Message
We send a plain test stream over SSE from the backend to the frontend.

The frontend displays the stream in the chat bubble of the agent.

### Event System
We send already all hooks and events to the frontends via the SSE connection.

IMPORTANT
--------------
The existing hook and events components in interceptors/ directory MUST be used and should not be changed.
Do not implement any second channel or mechanism to propagate hooks and events - USE interceptors.controller.ts and interceptors.service.ts as it is.
--------------

## New State (migration)

Read the migration guide at the file structured-claude-response-handling.md to perform the followin tasks:

1. React Components (see example file claude-code-stream-handler.tsx)
A complete streaming chat interface with specialized components for:

User messages from Claude
Tool calls (with running/complete states)
Permission requests (with approve/deny buttons)
Errors
Subagent activity
Auto-scrolling and connection status

2. Node.js Backend (see example file node-stream-parser.js)

The example inlcudes the SSE handling - this is only illustrative. We must use the extisting SSE implementation.

ClaudeCodeParser: Parses raw stdout into structured events
SSEEventHandler: Manages SSE connections and broadcasts
Permission handling: Bidirectional communication via stdin
Complete Express route setup

3. Migration Guide (see file structured-claude-response-handling.md)
A 6-phase evolution path from your current plain text approach to the full structured system, with testing strategies and troubleshooting tips.

4. Pub/Sub System (see file event-bus.js)
A clean event bus architecture that provides:

Decoupled components using useClaudeEvent hook
SSE adapter that routes events to the event bus
Example specialized components (ToolCallMonitor, PermissionManager)
Clear separation of concerns

Key Features
✅ Streaming-first: All components handle incremental updates
✅ Bidirectional: Permission requests flow back to Claude Code via stdin
✅ Separation of concerns: Pub/sub keeps components independent
✅ Single-user optimized: No complex state management needed
✅ Production-ready: Error handling, reconnection, cleanup