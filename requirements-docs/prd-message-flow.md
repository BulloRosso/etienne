# Message Flow: API → Backend → Claude Code

This document describes the core message flow from API request to Claude Code response, focusing on streaming, events, and hooks.

---

## Overview

```
Frontend/API Client
    ↓ HTTP SSE Request
Backend NestJS Controller
    ↓ Observable/RxJS
SDK Orchestrator Service
    ↓ Async Generator
Claude Agent SDK
    ↓ Streaming Messages
Anthropic API (Claude)
    ↓ Response Stream
Transform & Events
    ↓ SSE Events
Frontend/API Client
```

---

## 1. Request Initiation

### Frontend/API Request

**Endpoint**: `GET /api/claude/streamPrompt/sdk`

**Query Parameters**:
```typescript
{
  project_dir: string;      // Project identifier
  prompt: string;           // User's message
  agentMode?: 'plan';       // Optional: planning vs execution mode
  memoryEnabled?: 'true';   // Optional: enable RAG memory
  maxTurns?: number;        // Optional: max conversation turns
}
```

**Protocol**: Server-Sent Events (SSE)
```javascript
const eventSource = new EventSource(
  '/api/claude/streamPrompt/sdk?project_dir=myproject&prompt=hello'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle: session, stdout, usage, completed, error events
};
```

---

## 2. Backend Entry Point

### Controller ([claude.controller.ts:66-84](backend/src/claude/claude.controller.ts#L66-L84))

```typescript
@Sse('streamPrompt/sdk')
streamPromptSdk(
  @Query('project_dir') projectDir: string,
  @Query('prompt') prompt: string,
  @Query('agentMode') agentMode?: string,
  @Query('memoryEnabled') memoryEnabled?: string,
  @Query('maxTurns') maxTurns?: string
): Observable<MessageEvent> {
  return this.sdkOrchestrator.streamPrompt(
    projectDir,
    prompt,
    agentMode,
    memoryEnabled === 'true',
    false,
    maxTurns ? parseInt(maxTurns, 10) : undefined
  );
}
```

**Key Points**:
- Returns `Observable<MessageEvent>` (RxJS)
- SSE automatically streams Observable emissions
- No manual stream handling needed (NestJS handles it)

---

## 3. Orchestration Layer

### SDK Orchestrator ([claude-sdk-orchestrator.service.ts](backend/src/claude/sdk/claude-sdk-orchestrator.service.ts))

The orchestrator coordinates the entire message flow:

```typescript
streamPrompt(projectDir, prompt, ...): Observable<MessageEvent> {
  return new Observable((observer) => {
    this.runStreamPrompt(observer, projectDir, prompt, ...).catch(...);
  });
}
```

#### 3.1 Pre-Processing Phase

**Step 1: Input Guardrails**
```typescript
const guardrailsConfig = await this.guardrailsService.getConfig(projectDir);
const sanitizationResult = sanitize_user_message(prompt, guardrailsConfig.enabled);
const sanitizedPrompt = sanitizationResult.sanitizedText;
```

**Event Emitted**:
```typescript
if (sanitizationResult.triggeredPlugins.length > 0) {
  observer.next({
    type: 'guardrails_triggered',
    data: {
      plugins: triggeredPlugins,
      detections: detections,
      count: totalDetections
    }
  });
}
```

**Step 2: Memory Integration (Optional)**
```typescript
if (memoryEnabled && isFirstRequest) {
  const memories = await axios.post(`${memoryUrl}/search`, {
    query: sanitizedPrompt,
    limit: 5
  });

  enhancedPrompt = `[Context: ${memories}]\n\n${sanitizedPrompt}`;
}
```

---

## 4. SDK Streaming Layer

### Claude SDK Service ([claude-sdk.service.ts](backend/src/claude/sdk/claude-sdk.service.ts))

**Async Generator Pattern**:
```typescript
async *streamConversation(projectDir, initialPrompt, options) {
  // Lazy load SDK (first time only)
  await this.ensureSdkLoaded();

  // Load system prompt from CLAUDE.md
  const systemPrompt = await this.loadSystemPrompt(projectDir);

  // Load permissions from permissions.json
  const allowedTools = await this.loadPermissions(projectDir);

  // Configure SDK
  const queryOptions = {
    model: 'claude-sonnet-4-5',
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: systemPrompt
    },
    allowedTools: allowedTools,
    permissionMode: 'acceptEdits',
    maxTurns: 20,
    settingSources: ['project'],
    ...(sessionId && { resume: sessionId })
  };

  // Stream from SDK
  for await (const message of query({
    prompt: initialPrompt,
    options: queryOptions
  })) {
    yield message;
  }
}
```

**Key Points**:
- **Async Generator**: `async function*` yields messages as they arrive
- **Lazy Loading**: SDK loaded on first request (dynamic import)
- **System Prompts**: Loaded from `/workspace/{project}/CLAUDE.md`
- **Permissions**: Loaded from `/workspace/{project}/data/permissions.json`

---

## 5. Message Types & Flow

### SDK Message Types

The Agent SDK yields different message types during streaming:

#### 5.1 System Initialization
```typescript
{
  type: 'system',
  subtype: 'init',
  session_id: 'sess_abc123',
  model: 'claude-sonnet-4-5'
}
```

**Handled As**:
```typescript
if (SdkMessageTransformer.isSessionInit(sdkMessage)) {
  sessionId = sdkMessage.session_id;
  await this.sessionManager.createSession(projectDir, sessionId, model);

  observer.next({
    type: 'session',
    data: { session_id: sessionId, model: model }
  });
}
```

**Frontend Receives**:
```
data: {"type":"session","data":{"session_id":"sess_abc123","model":"claude-sonnet-4-5"}}
```

#### 5.2 Assistant Messages (Text Output)
```typescript
{
  type: 'assistant',
  content: [
    { type: 'text', text: 'Hello! How can I help you?' },
    { type: 'tool_use', name: 'Read', input: {...} }
  ]
}
```

**Handled As**:
```typescript
if (SdkMessageTransformer.isAssistant(sdkMessage)) {
  const text = extractTextFromContent(sdkMessage.content);
  assistantText += text;

  // Stream immediately (unless buffering for output guardrails)
  if (!shouldBufferOutput) {
    observer.next({
      type: 'stdout',
      data: { chunk: text }
    });
  }
}
```

**Frontend Receives** (multiple chunks):
```
data: {"type":"stdout","data":{"chunk":"Hello! "}}
data: {"type":"stdout","data":{"chunk":"How can I help you?"}}
```

#### 5.3 Result Messages (Completion)
```typescript
{
  type: 'result',
  subtype: 'success',
  usage: {
    input_tokens: 42,
    output_tokens: 15,
    model: 'claude-sonnet-4-5'
  }
}
```

**Handled As**:
```typescript
if (SdkMessageTransformer.isResult(sdkMessage)) {
  // Emit usage
  observer.next({
    type: 'usage',
    data: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      model: usage.model
    }
  });

  // Apply output guardrails (if enabled)
  if (shouldBufferOutput) {
    const checked = await outputGuardrailsService.check(assistantText);
    assistantText = checked.modifiedContent;
  }

  // Emit completion
  observer.next({
    type: 'completed',
    data: { exitCode: 0, usage: usage }
  });
}
```

**Frontend Receives**:
```
data: {"type":"usage","data":{"input_tokens":42,"output_tokens":15,...}}
data: {"type":"completed","data":{"exitCode":0,...}}
```

---

## 6. Message Transformation

### Transformer ([sdk-message-transformer.ts](backend/src/claude/sdk/sdk-message-transformer.ts))

**Purpose**: Convert SDK message format → Existing MessageEvent format

```typescript
class SdkMessageTransformer {
  static transform(sdkMessage: any): MessageEvent | null {
    switch (sdkMessage.type) {
      case 'system':
        if (sdkMessage.subtype === 'init') {
          return {
            type: 'session',
            data: {
              session_id: sdkMessage.session_id,
              model: sdkMessage.model
            }
          };
        }
        break;

      case 'assistant':
        return {
          type: 'stdout',
          data: {
            chunk: extractTextFromContent(sdkMessage.content)
          }
        };

      case 'result':
        if (sdkMessage.subtype === 'success') {
          return {
            type: 'completed',
            data: {
              exitCode: 0,
              usage: sdkMessage.usage
            }
          };
        }
        break;
    }
  }
}
```

**Why This Matters**:
- Frontend expects specific event types
- Maintains backward compatibility
- No frontend changes needed

---

## 7. Post-Processing Phase

### After Conversation Completes

**Step 1: Chat Persistence**
```typescript
await this.sessionsService.appendMessages(projectRoot, sessionId, [
  {
    timestamp: new Date().toISOString(),
    isAgent: false,
    message: sanitizedPrompt,
    costs: undefined
  },
  {
    timestamp: new Date().toISOString(),
    isAgent: true,
    message: assistantText,
    costs: usage
  }
]);
```

**Step 2: Budget Tracking**
```typescript
await this.budgetMonitoringService.trackCosts(
  projectDir,
  usage.input_tokens,
  usage.output_tokens
);
```

**Step 3: Memory Storage (Fire-and-Forget)**
```typescript
if (memoryEnabled) {
  axios.post(`${memoryUrl}`, {
    messages: [
      { role: 'user', content: sanitizedPrompt },
      { role: 'assistant', content: assistantText }
    ],
    user_id: userId,
    metadata: {
      session_id: sessionId,
      source: 'chat',
      timestamp: new Date().toISOString()
    }
  }).catch(error => {
    // Don't fail request if memory storage fails
    console.error('Failed to store memories:', error);
  });
}
```

---

## 8. Session Management

### Session Lifecycle

**Session Creation** ([sdk-session-manager.service.ts](backend/src/claude/sdk/sdk-session-manager.service.ts)):
```typescript
async createSession(projectDir: string, sessionId: string, model?: string) {
  const metadata = {
    sessionId,
    projectDir,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    model,
    turnCount: 1,
    totalTokens: 0
  };

  // Store in memory
  this.activeSessions.set(sessionId, metadata);

  // Persist to filesystem (backward compatible)
  await fs.writeFile(
    `/workspace/${projectDir}/data/session.id`,
    sessionId
  );
}
```

**Session Resumption**:
```typescript
// Load existing session ID
const sessionId = await this.sessionManager.loadSessionId(projectDir);

// Pass to SDK
const queryOptions = {
  ...otherOptions,
  resume: sessionId  // SDK resumes with full context
};
```

**Session Cleanup**:
```typescript
cleanupIdleSessions(idleTimeoutMs = 1800000) {
  const now = Date.now();
  for (const [sessionId, metadata] of this.activeSessions.entries()) {
    const idleTime = now - metadata.lastActiveAt.getTime();
    if (idleTime > idleTimeoutMs) {
      this.activeSessions.delete(sessionId);
    }
  }
}
```

---

## 9. Streaming & Events Summary

### Complete Event Flow

```
1. Frontend sends SSE request
   ↓
2. Controller returns Observable
   ↓
3. Orchestrator processes:
   ├─ Apply input guardrails
   ├─ Fetch memories (optional)
   └─ Emit guardrails_triggered event
   ↓
4. SDK Service streams:
   ├─ Load system prompt
   ├─ Load permissions
   └─ Call SDK query()
   ↓
5. SDK yields messages:
   ├─ system (init) → session event
   ├─ assistant → stdout events (chunks)
   └─ result → usage + completed events
   ↓
6. Transformer converts format
   ↓
7. Post-process:
   ├─ Apply output guardrails (optional)
   ├─ Persist chat history
   ├─ Track budget costs
   └─ Store memories (fire-and-forget)
   ↓
8. Frontend receives all events via SSE
```

### Event Types Reference

| Event Type | When Emitted | Data |
|------------|--------------|------|
| `session` | Session initialized | `session_id`, `model` |
| `stdout` | Assistant responds | `chunk` (text) |
| `usage` | Conversation completes | `input_tokens`, `output_tokens`, `model` |
| `completed` | Conversation ends | `exitCode`, `usage` |
| `error` | Error occurs | `message` |
| `guardrails_triggered` | Input sanitized | `plugins`, `detections`, `count` |
| `output_guardrails_triggered` | Output validated | `violations`, `count` |

---

## 10. Hooks (Future)

### Hook System (Not Yet Implemented)

The SDK supports hooks for intercepting tool calls:

```typescript
const preToolUseHook: HookCallback = async (input) => {
  // Called before each tool execution
  console.log(`Tool: ${input.tool_name}, Input: ${input.tool_input}`);

  // Can deny tool execution
  if (input.tool_name === 'Bash' && input.tool_input.includes('rm -rf')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Dangerous command blocked'
      }
    };
  }

  return {}; // Continue normally
};

const queryOptions = {
  hooks: {
    PreToolUse: [{ matcher: '', hooks: [preToolUseHook] }],
    PostToolUse: [{ matcher: '', hooks: [postToolUseHook] }]
  }
};
```

**Hook Types**:
- `UserPromptSubmit` - Before processing user prompt
- `PreToolUse` - Before executing any tool
- `PostToolUse` - After tool execution
- `Notification` - On system notifications
- `Stop` - When conversation stops
- `SubagentStop` - When subagent completes
- `PreCompact` - Before context compaction
- `SessionStart` - When session starts

**Current Status**: Hooks configured via `.claude/settings.json` (bash commands), not yet implemented as TypeScript callbacks in SDK orchestrator.

---

## 11. Error Handling

### Error Flow

**SDK Errors**:
```typescript
try {
  for await (const message of query({...})) {
    yield message;
  }
} catch (error) {
  this.logger.error(`SDK conversation failed: ${error.message}`);
  throw error;
}
```

**Orchestrator Errors**:
```typescript
try {
  await this.runStreamPrompt(observer, ...);
} catch (error) {
  observer.next({
    type: 'error',
    data: { message: error.message }
  });
  observer.complete();
}
```

**Frontend Receives**:
```
data: {"type":"error","data":{"message":"Connection timeout"}}
```

---

## 12. Performance Considerations

### Prompt Caching

The SDK automatically caches prompts:

**First Request**:
```
System prompt: 1000 tokens (full cost)
User prompt: 50 tokens (full cost)
Total: 1050 tokens → $0.030
```

**Cached Request** (within 5 minutes):
```
System prompt: 1000 tokens (10% cost - cached!)
User prompt: 50 tokens (full cost)
Total: 1050 tokens → $0.006 (90% cheaper!)
```

**Implementation**: Automatic by SDK, no configuration needed.

### Streaming Benefits

- **Incremental Display**: Frontend shows text as it arrives
- **Lower Perceived Latency**: User sees output immediately
- **Cancellation**: Can abort mid-stream if needed
- **Progress Feedback**: Real-time status updates

---

## Summary

### Core Flow
1. **Request** → SSE connection established
2. **Pre-process** → Guardrails + memories
3. **Stream** → SDK yields messages via async generator
4. **Transform** → Convert SDK format to MessageEvent
5. **Post-process** → Persist + track costs + store memories
6. **Response** → Events streamed to frontend via SSE

### Key Components
- **Controller**: NestJS SSE endpoint
- **Orchestrator**: Coordinates entire flow
- **SDK Service**: Interfaces with Agent SDK
- **Transformer**: Format conversion
- **Session Manager**: Tracks active sessions

### Message Types
- `session`, `stdout`, `usage`, `completed`, `error`
- `guardrails_triggered`, `output_guardrails_triggered`

### State Management
- Sessions tracked in-memory + filesystem
- Automatic cleanup after 30 minutes idle
- Token usage tracked per session
- Full conversation history persisted

This architecture provides a robust, production-ready streaming message flow with comprehensive integration, error handling, and performance optimization.
