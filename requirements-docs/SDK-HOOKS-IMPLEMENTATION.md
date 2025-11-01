# SDK Hooks & Events Implementation

## Overview
This implementation adds Claude Code hooks and events support to the SDK-based agent approach, matching the functionality that was previously only available with the CLI/Docker approach.

## Problem
The frontend was not receiving hooks and events when using the SDK endpoint (`/api/claude/streamPrompt/sdk`) because:

1. **CLI Approach**: Hooks were configured in `.claude/settings.json` and executed by Claude Code CLI running in Docker
2. **SDK Approach**: The Agent SDK runs directly in Node.js without Docker, so the hooks configuration was not being used

## Solution
Created a `SdkHookEmitterService` that manually emits all hooks and events during SDK-based conversations.

## Files Created/Modified

### Created
- `backend/src/claude/sdk/sdk-hook-emitter.service.ts` - Service to emit hooks and events

### Modified
- `backend/src/claude/sdk/claude-sdk-orchestrator.service.ts` - Integrated hook emissions throughout conversation flow
- `backend/src/app.module.ts` - Registered the new service

## Hook & Event Types Implemented

### Events (sent to interceptors/events)
1. **UserPromptSubmit** - When user sends a message
2. **SessionStart** - When a new session is created
3. **Notification** - For informational messages
4. **Stop** - When conversation completes
5. **SubagentStop** - When a subagent completes
6. **PreCompact** - Before message history compaction

### Hooks (sent to interceptors/hooks)
1. **PreToolUse** - Before a tool is executed
2. **PostToolUse** - After a tool completes

## Integration Points

### In `claude-sdk-orchestrator.service.ts`:

1. **UserPromptSubmit** - Emitted before processing the prompt
   ```typescript
   this.hookEmitter.emitUserPromptSubmit(projectDir, {
     prompt: enhancedPrompt,
     session_id: sessionId
   });
   ```

2. **SessionStart** - Emitted when session is initialized
   ```typescript
   this.hookEmitter.emitSessionStart(projectDir, {
     session_id: newSessionId,
     model: model
   });
   ```

3. **PreToolUse** - Emitted when tool_use block is detected
   ```typescript
   this.hookEmitter.emitPreToolUse(projectDir, {
     tool_name: block.name,
     tool_input: block.input,
     call_id: toolCallId,
     session_id: sessionId
   });
   ```

4. **PostToolUse** - Emitted when tool_result message is received
   ```typescript
   this.hookEmitter.emitPostToolUse(projectDir, {
     tool_name: toolName,
     tool_output: toolOutput,
     call_id: callId,
     session_id: sessionId
   });
   ```

5. **Stop** - Emitted when conversation completes
   ```typescript
   this.hookEmitter.emitStop(projectDir, {
     reason: 'completed',
     session_id: sessionId,
     usage
   });
   ```

## How It Works

1. **Frontend** connects to `/api/interceptors/stream/:project` via SSE
2. **SdkHookEmitterService** emits events to `InterceptorsService`
3. **InterceptorsService** broadcasts events via SSE to all connected clients
4. **Frontend** receives events in real-time and displays them in the Interceptors tab

## Data Flow

```
SDK Conversation
    ↓
ClaudeSdkOrchestratorService
    ↓
SdkHookEmitterService.emit*()
    ↓
InterceptorsService.addInterceptor()
    ↓
RxJS Subject.next()
    ↓
SSE Stream (/api/interceptors/stream/:project)
    ↓
Frontend (Interceptors.jsx)
```

## Testing

To test the implementation:

1. Start the backend: `cd backend && npm run start:dev`
2. Open the frontend and select a project
3. Switch to the **Interceptors** tab
4. Send a message to Claude
5. You should see events appearing in real-time:
   - UserPromptSubmit when you send the message
   - SessionStart when session begins (for new sessions)
   - PreToolUse when Claude calls a tool
   - PostToolUse when tool completes
   - Stop when conversation ends

## Comparison: CLI vs SDK Approaches

| Aspect | CLI Approach | SDK Approach |
|--------|-------------|--------------|
| Execution | Docker container | Node.js process |
| Hooks Config | `.claude/settings.json` | Programmatic emission |
| Hook Execution | bash/curl commands | Direct service calls |
| Event Source | Claude Code CLI stdout | SDK message stream |
| Interception | Docker → HTTP POST | Service → Service |

## Future Enhancements

1. Add support for custom hook commands (similar to CLI approach)
2. Emit more granular events for streaming chunks
3. Add hook filtering/routing capabilities
4. Support for hook approval workflows
5. Add metrics for hook execution times

## Notes

- The SDK approach is more efficient as it doesn't require Docker process overhead
- Events are emitted synchronously during conversation flow
- All events include timestamp and session_id for tracking
- The implementation maintains backward compatibility with existing frontend code
