# Claude Agent SDK Integration

This directory contains the Agent SDK integration for the Claude Multi-Tenant application. It replaces the previous bash subprocess approach with direct TypeScript integration using `@anthropic-ai/claude-agent-sdk`.

## Architecture

### Components

```
sdk/
├── claude-sdk.service.ts            # Core SDK service (streaming conversations)
├── sdk-session-manager.service.ts   # Session lifecycle management
├── sdk-message-transformer.ts       # Transform SDK messages to MessageEvent format
├── claude-sdk-orchestrator.service.ts # Main orchestrator (integrates all services)
└── README.md                        # This file
```

### Flow

```
Frontend
   ↓ (SSE Request)
ClaudeController
   ↓ (streamPromptSdk)
ClaudeSdkOrchestratorService
   ├─→ Input Guardrails
   ├─→ Memory Management (fetch)
   ├─→ ClaudeSdkService (query SDK)
   │    └─→ Agent SDK (streaming)
   ├─→ SdkMessageTransformer
   ├─→ Output Guardrails
   ├─→ Chat Persistence
   ├─→ Budget Tracking
   └─→ Memory Management (store)
```

## Key Features

### 1. Streaming Input Architecture
- **Before**: Single-message mode with manual session resumption
- **After**: Async generator pattern for continuous streaming
- Maintains persistent context across turns
- Automatic prompt caching (90% cost reduction)

### 2. Session Management
- In-memory cache of active sessions
- File-based persistence (backward compatible)
- Automatic session cleanup for idle sessions
- Token usage tracking per session

### 3. Message Transformation
- SDK messages → existing MessageEvent format
- Maintains backward compatibility with frontend
- No frontend changes required
- Preserves all event types (session, stdout, usage, completed, error)

### 4. Full Integration
- ✅ Input guardrails (sanitization)
- ✅ Output guardrails (buffering + checks)
- ✅ Memory management (RAG)
- ✅ Budget monitoring (token tracking)
- ✅ Chat persistence (history)
- ✅ Tool permissions
- ✅ System prompts (CLAUDE.md)

## Usage

### New SDK Endpoint

The SDK integration is available at a new endpoint alongside the existing CLI endpoint:

**CLI Endpoint (existing):**
```
GET /api/claude/streamPrompt?project_dir=myproject&prompt=hello
```

**SDK Endpoint (new):**
```
GET /api/claude/streamPrompt/sdk?project_dir=myproject&prompt=hello
```

### Query Parameters

Both endpoints support the same parameters:
- `project_dir` (required): Project directory name
- `prompt` (required): User's prompt text
- `agentMode` (optional): `plan` for planning mode, default for execute mode
- `memoryEnabled` (optional): `true` to enable memory RAG integration
- `maxTurns` (optional): Maximum conversation turns (default: 20)

### Example Usage

```typescript
// Frontend (no changes needed)
const eventSource = new EventSource(
  '/api/claude/streamPrompt/sdk?project_dir=myproject&prompt=hello&memoryEnabled=true'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'session':
      console.log('Session ID:', data.data.session_id);
      break;
    case 'stdout':
      console.log('Output:', data.data.chunk);
      break;
    case 'usage':
      console.log('Tokens:', data.data);
      break;
    case 'completed':
      console.log('Completed');
      break;
  }
};
```

## Service Descriptions

### ClaudeSdkService

Core service that interfaces with the Agent SDK.

**Key Methods:**
- `streamConversation()`: Async generator that yields SDK messages
- `loadSystemPrompt()`: Reads CLAUDE.md from project directory
- `loadPermissions()`: Reads allowedTools from permissions.json

**Configuration:**
- System prompts use preset + append pattern
- Tools loaded from project permissions
- Session resumption via `resume` option

### SdkSessionManagerService

Manages session lifecycle and metadata.

**Key Methods:**
- `createSession()`: Register new session with metadata
- `loadSessionId()`: Load existing session from filesystem
- `touchSession()`: Update last activity timestamp
- `updateTokenUsage()`: Track token consumption
- `cleanupIdleSessions()`: Remove inactive sessions (called periodically)

**Storage:**
- In-memory Map for active sessions
- Filesystem `/workspace/{project}/data/session.id` for persistence
- Future: Database storage for production

### SdkMessageTransformer

Transforms SDK message types to existing MessageEvent format.

**Key Methods:**
- `transform()`: Main transformation method
- `extractUsage()`: Extract token usage from result messages
- `isSessionInit()`: Check if message is session initialization
- `isAssistant()`: Check if message is assistant response

**Message Mappings:**
- `system` (init) → `session` event
- `assistant` → `stdout` event (text streaming)
- `result` (success) → `completed` + `usage` events
- `result` (error) → `error` event

### ClaudeSdkOrchestratorService

Main orchestrator that integrates SDK with all other services.

**Responsibilities:**
1. Apply input guardrails (sanitization)
2. Fetch and enhance with memories (if enabled)
3. Stream conversation via SDK
4. Apply output guardrails (if enabled)
5. Persist chat history
6. Track budget costs
7. Store new memories (fire-and-forget)

**Integration Points:**
- `GuardrailsService`: Input sanitization
- `OutputGuardrailsService`: Output validation
- `BudgetMonitoringService`: Cost tracking
- `SessionsService`: Chat persistence
- Memories API: RAG integration

## Configuration

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional
WORKSPACE_HOST_ROOT=C:/Data/GitHub/claude-multitenant/workspace
MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories
```

### System Prompts

System prompts are loaded from `CLAUDE.md` in project directories:

```
/workspace/myproject/CLAUDE.md
```

The SDK uses a **preset + append** pattern:
- Base: Claude Code preset (includes tool instructions)
- Append: Content from CLAUDE.md

### Permissions

Tool permissions are loaded from:

```
/workspace/myproject/data/permissions.json
```

Example:
```json
{
  "allowedTools": [
    "Task",
    "Read",
    "Write",
    "Bash(python3:*)"
  ]
}
```

## Testing

### Validation Script

Run the validation script to test SDK functionality:

```bash
cd backend
node test/sdk-test.mjs
```

**Tests:**
1. Basic query functionality
2. System prompt configuration
3. Session resumption
4. Error handling

### Manual Testing

Test the SDK endpoint manually:

```bash
# Test basic query
curl "http://localhost:6060/api/claude/streamPrompt/sdk?project_dir=test&prompt=hello&maxTurns=1"

# Test with memory
curl "http://localhost:6060/api/claude/streamPrompt/sdk?project_dir=test&prompt=hello&memoryEnabled=true"

# Test planning mode
curl "http://localhost:6060/api/claude/streamPrompt/sdk?project_dir=test&prompt=analyze%20code&agentMode=plan"
```

## Migration from CLI

### What Changed

**Removed:**
- ❌ `spawn('docker', ['exec', ...])` subprocess calls
- ❌ Bash script generation ([script-builder.ts](../builders/script-builder.ts))
- ❌ Stdout parsing ([stream-parser.ts](../parsers/stream-parser.ts))
- ❌ Process management (kill, abort)

**Added:**
- ✅ Direct SDK integration
- ✅ Async generator patterns
- ✅ In-memory session management
- ✅ Type-safe message handling
- ✅ Automatic prompt caching

### Backward Compatibility

The SDK integration maintains full backward compatibility:
- Same API endpoint structure (just add `/sdk`)
- Same SSE event format
- Same guardrails integration
- Same memory management
- Same budget tracking
- Same chat persistence

**No frontend changes required!**

## Performance Improvements

### Expected Benefits

- **90% cost reduction** through automatic prompt caching
  - First call: Full cost (~$0.030)
  - Cached calls: 10% cost (~$0.003)
  - Cache lifetime: 5 minutes

- **85% latency reduction** for cached prompts
  - First call: ~1000ms
  - Cached calls: ~150ms

- **Zero subprocess overhead**
  - No docker exec spawning
  - No shell script execution
  - Direct TypeScript → SDK → API

- **Better token efficiency**
  - Persistent context across turns
  - Automatic context compaction
  - Optimized prompt caching

### Monitoring

Track these metrics:
- Token usage (input/output)
- Session lifetime
- Cache hit rate
- Latency percentiles (p50, p95, p99)
- Error rates

## Troubleshooting

### Common Issues

**1. Session not found**
```
Error: Session not found
```
**Solution**: Session may have expired. Clear session and start new:
```bash
curl -X POST http://localhost:6060/api/claude/clearSession/myproject
```

**2. Module not found**
```
Error: Cannot find module '@anthropic-ai/claude-agent-sdk'
```
**Solution**: Install dependencies:
```bash
cd backend && npm install
```

**3. Type errors**
```
Property 'model' does not exist on type 'SDKMessage'
```
**Solution**: Already fixed with `as any` type assertions in orchestrator

**4. Guardrails errors**
```
Failed to apply guardrails: ...
```
**Solution**: Guardrails failures are non-fatal. Check guardrails configuration.

### Debug Logging

Enable debug logging to see detailed SDK flow:

```typescript
// In ClaudeSdkService
this.logger.setLogLevels(['debug', 'log', 'error', 'warn']);
```

Look for log messages:
- `Starting SDK stream for project: ...`
- `Loaded system prompt from ...`
- `Session created: ...`
- `SDK stream completed in Xms`

## Future Enhancements

### Phase 2 Features

- [ ] Database-backed session storage (replace filesystem)
- [ ] Session forking support (explore alternatives)
- [ ] Advanced hooks (PreToolUse, PostToolUse)
- [ ] MCP server integration
- [ ] Interruption support (real-time stop)
- [ ] Permission mode switching (dynamic)

### Production Readiness

- [ ] Implement session cleanup scheduler
- [ ] Add comprehensive metrics collection
- [ ] Set up monitoring dashboards
- [ ] Implement circuit breakers
- [ ] Add retry logic with exponential backoff
- [ ] Configure rate limiting per project

## Support

For questions or issues:
1. Check the [Migration Plan](../../../../MIGRATION-PLAN-AGENT-SDK.md)
2. Review the [validation script](../../../test/sdk-migration-validation.ts)
3. Enable debug logging and inspect logs

## References

- [Agent SDK Documentation](https://docs.claude.com/en/api/agent-sdk)
- [Streaming vs Single Mode](https://docs.claude.com/en/api/agent-sdk/streaming-vs-single-mode)
- [Sessions](https://docs.claude.com/en/api/agent-sdk/sessions)
- [Migration Plan](../../../../MIGRATION-PLAN-AGENT-SDK.md)
