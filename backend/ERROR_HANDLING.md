# Error Handling Improvements

## Overview

This document describes the error handling improvements implemented to ensure tool call failures and other errors don't terminate the SSE stream connection.

## Changes Made

### 1. MCP Server Tool Execution ([mcp-server.service.ts:95-128](src/mcpserver/mcp-server.service.ts#L95-L128))

**Before:**
```typescript
catch (error) {
  this.logger.error(`Error executing tool ${name}: ${error.message}`);
  throw new Error(`Tool execution failed: ${error.message}`);
}
```

**After:**
```typescript
catch (error) {
  // Log the error but return it as content instead of throwing
  // This prevents the error from terminating the stream
  this.logger.error(`❌ Error executing tool ${name}: ${error.message}`, error.stack);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          error: true,
          tool: name,
          message: error.message,
          details: error.stack || 'No stack trace available'
        }, null, 2),
      },
    ],
    isError: true,
  };
}
```

**Impact:** Tool failures now return error information to Claude instead of throwing exceptions that terminate the stream.

### 2. SDK Orchestrator Hook Error Handling ([claude-sdk-orchestrator.service.ts:166-258](src/claude/sdk/claude-sdk-orchestrator.service.ts#L166-L258))

Added try-catch blocks around both `preToolUseHook` and `postToolUseHook` functions:

```typescript
const preToolUseHook = async (input: any, toolUseID: string | undefined, options: { signal: AbortSignal }) => {
  try {
    // ... hook logic ...
    return { continue: true };
  } catch (hookError: any) {
    this.logger.error(`Error in PreToolUse hook: ${hookError.message}`, hookError.stack);
    // Continue anyway - don't block tool execution
    return { continue: true };
  }
};
```

**Impact:** Errors in hook functions no longer terminate the stream. Execution continues normally.

### 3. Stream Message Processing Error Handling ([claude-sdk-orchestrator.service.ts:258-463](src/claude/sdk/claude-sdk-orchestrator.service.ts#L258-L463))

Added nested try-catch blocks:
- **Outer try-catch**: Wraps the entire stream loop
- **Inner try-catch**: Wraps individual message processing

```typescript
try {
  for await (const sdkMessage of this.claudeSdkService.streamConversation(...)) {
    try {
      // Process individual message
    } catch (messageError: any) {
      this.logger.error(`Error processing SDK message: ${messageError.message}`, messageError.stack);
      observer.next({
        type: 'error',
        data: {
          message: `Message processing error: ${messageError.message}`,
          recoverable: true
        }
      });
      // Continue processing next message
    }
  }
} catch (streamError: any) {
  this.logger.error(`Stream error in SDK conversation: ${streamError.message}`, streamError.stack);
  observer.next({
    type: 'error',
    data: {
      message: `Stream error: ${streamError.message}`,
      recoverable: false
    }
  });
  // Don't throw - let the stream complete gracefully
}
```

**Impact:**
- Individual message processing errors are logged and emitted as error events, but streaming continues
- Stream-level errors are caught and handled gracefully without terminating the connection

### 4. Enhanced Logging ([mcp-server.service.ts:97-99](src/mcpserver/mcp-server.service.ts#L97-L99), [claude-sdk-orchestrator.service.ts:355-356](src/claude/sdk/claude-sdk-orchestrator.service.ts#L355-L356))

Added comprehensive logging at key points:

**Tool Execution:**
```typescript
this.logger.log(`🔧 Executing tool: ${name} with args: ${JSON.stringify(args || {}).substring(0, 200)}`);
this.logger.log(`✅ Tool ${name} executed successfully`);
this.logger.error(`❌ Error executing tool ${name}: ${error.message}`, error.stack);
```

**Session Events:**
```typescript
this.logger.log(`✨ Session initialized: ${newSessionId} with model: ${model}`);
this.logger.log(`🔧 Tool execution started: ${block.name} (ID: ${toolCallId})`);
```

### 5. Runtime Log Persistence ([package.json:5](package.json#L5))

Modified the dev script to persist all console output:

```json
"dev": "cross-env NODE_ENV=development node -r ts-node/register/transpile-only src/main.ts 2>&1 | tee -a runtime.log"
```

**Impact:** All runtime logs are now persisted to `backend/runtime.log` for debugging.

## Error Flow

### Before Changes
```
Tool Error → Exception Thrown → Stream Terminated → Connection Closed → Frontend Shows Error
```

### After Changes
```
Tool Error → Error Logged → Error Returned as Content → Claude Receives Error → Stream Continues → Frontend Stays Connected
```

## Testing

To test the error handling:

1. **Trigger a tool failure**: Modify a tool to throw an error
2. **Check logs**: Review `backend/runtime.log` for error messages with emoji indicators (❌, 🔧, ✅)
3. **Verify stream continues**: Ensure the frontend connection remains active
4. **Check error display**: Verify Claude receives and can work with error information

## Benefits

1. **Resilience**: Stream connections no longer terminate on tool failures
2. **Debugging**: Comprehensive logging with emoji indicators makes debugging easier
3. **User Experience**: Users see error messages instead of broken connections
4. **AI Recovery**: Claude can handle tool errors gracefully and continue the conversation
5. **Persistence**: Runtime logs are saved for post-mortem analysis

## Monitoring

Watch for these log patterns:

- `🔧 Executing tool:` - Tool execution started
- `✅ Tool X executed successfully` - Tool completed successfully
- `❌ Error executing tool` - Tool failed (stream continues)
- `Error processing SDK message` - Message processing error (stream continues)
- `Stream error in SDK conversation` - Stream-level error (graceful termination)

## Future Improvements

1. Add error rate monitoring and alerting
2. Implement exponential backoff for retryable errors
3. Add tool-specific error handling strategies
4. Create a centralized error reporting service
5. Add frontend error recovery UI components
