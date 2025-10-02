# Migration Guide: Plain Text to Structured Claude Code Streaming

## Overview
This guide walks you through evolving from a simple plain-text SSE stream to a fully structured, component-based streaming architecture for Claude Code output.

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

## Migration Steps

### Phase 1: Add Parser Layer (Backend)
**Goal**: Transform plain text into structured events without changing frontend

1. **Install the parser**
   ```javascript
   import { ClaudeCodeParser } from './claudeCodeParser.js';
   const parser = new ClaudeCodeParser();
   ```

2. **Wrap existing stdout handler**
   ```javascript
   claudeProcess.stdout.on('data', (chunk) => {
     // Old: res.write(`data: ${chunk.toString()}\n\n`);
     
     // New: Parse then send
     const events = parser.parseChunk(chunk.toString());
     events.forEach(event => {
       res.write(`data: ${JSON.stringify(event)}\n\n`);
     });
     
     // Fallback for unparsed text
     if (events.length === 0) {
       res.write(`data: ${JSON.stringify({
         type: 'user_message',
         content: chunk.toString()
       })}\n\n`);
     }
   });
   ```

3. **Test**: Frontend should now receive JSON objects

### Phase 2: Update Frontend Parser (React)
**Goal**: Handle JSON events but still display as plain text

1. **Update event handler**
   ```javascript
   eventSource.onmessage = (event) => {
     try {
       const data = JSON.parse(event.data);
       
       // Extract text content from any event type
       const text = data.content || data.message || 
                    JSON.stringify(data.args) || '';
       
       setOutput(prev => prev + text + '\n');
     } catch (e) {
       // Fallback to plain text
       setOutput(prev => prev + event.data);
     }
   };
   ```

2. **Test**: Should look identical to before, but now processing JSON

### Phase 3: Introduce Component Routing
**Goal**: Route different event types to different components

1. **Add message array state**
   ```javascript
   const [messages, setMessages] = useState([]);
   
   eventSource.onmessage = (event) => {
     const data = JSON.parse(event.data);
     setMessages(prev => [...prev, { ...data, id: Date.now() }]);
   };
   ```

2. **Create basic router**
   ```javascript
   const renderMessage = (msg) => {
     switch (msg.type) {
       case 'user_message':
         return <div>{msg.content}</div>;
       case 'tool_call':
         return <div>🔧 {msg.toolName}</div>;
       case 'error':
         return <div style={{color: 'red'}}>{msg.message}</div>;
       default:
         return <div>{JSON.stringify(msg)}</div>;
     }
   };
   
   return messages.map(msg => renderMessage(msg));
   ```

3. **Test**: Different message types now have visual distinction

### Phase 4: Add Specialized Components
**Goal**: Replace simple divs with rich components from the artifact

1. **Import components**
   ```javascript
   import { UserMessage, ToolCall, ErrorMessage } from './components';
   ```

2. **Update router**
   ```javascript
   case 'user_message':
     return <UserMessage key={msg.id} content={msg.content} />;
   case 'tool_call':
     return <ToolCall key={msg.id} {...msg} />;
   ```

3. **Test**: Rich visual components for each type

### Phase 5: Add Bidirectional Communication
**Goal**: Handle permission requests with responses

1. **Backend: Add permission endpoint**
   ```javascript
   app.post('/api/claude-code/permission', (req, res) => {
     const { permissionId, approved } = req.body;
     claudeProcess.stdin.write(approved ? 'y\n' : 'n\n');
     res.json({ success: true });
   });
   ```

2. **Frontend: Add response handler**
   ```javascript
   const handlePermissionResponse = async (id, approved) => {
     await fetch('/api/claude-code/permission', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ permissionId: id, approved })
     });
   };
   
   // Pass to component
   case 'permission_request':
     return <PermissionRequest 
       key={msg.id} 
       {...msg} 
       onResponse={handlePermissionResponse} 
     />;
   ```

3. **Test**: Click approve/deny and verify Claude Code continues

### Phase 6: Full Handler Integration
**Goal**: Replace custom code with the complete SSE handler

1. **Replace backend with handler class**
   ```javascript
   import { setupClaudeCodeRoutes } from './sseHandler.js';
   const handler = setupClaudeCodeRoutes(app);
   
   // Start Claude Code
   app.post('/api/start', (req, res) => {
     handler.startClaudeCode(req.body.command);
     res.json({ success: true });
   });
   ```

2. **Replace frontend with full component**
   ```javascript
   import ClaudeCodeStreamChat from './ClaudeCodeStreamChat';
   
   function App() {
     return <ClaudeCodeStreamChat />;
   }
   ```

## Parser Pattern Reference

### Detecting Claude Code Output Types

The parser looks for these patterns in stdout:

| Pattern | Event Type | Example |
|---------|------------|---------|
| `[TOOL_CALL] name(args)` | `tool_call` | `[TOOL_CALL] execute_command({"cmd":"ls"})` |
| `[TOOL_RESULT] data` | `tool_call` (completion) | `[TOOL_RESULT] file1.txt file2.txt` |
| `[PERMISSION_REQUIRED] msg` | `permission_request` | `[PERMISSION_REQUIRED] Execute shell command?` |
| `[ERROR] message` | `error` | `[ERROR] File not found` |
| `[SUBAGENT_START] name` | `subagent_start` | `[SUBAGENT_START] code_analyzer` |
| `[SUBAGENT_END] name` | `subagent_end` | `[SUBAGENT_END] code_analyzer` |
| Plain text | `user_message` | `Here's the analysis...` |

**Note**: You may need to adjust these patterns based on actual Claude Code output format. Monitor the raw stdout to identify the exact patterns used.

## Testing Strategy

### Unit Tests for Parser
```javascript
import { ClaudeCodeParser } from './claudeCodeParser.js';

test('parses tool calls', () => {
  const parser = new ClaudeCodeParser();
  const events = parser.parseChunk('[TOOL_CALL] read_file({"path":"test.js"})\n');
  
  expect(events[0].type).toBe('tool_call');
  expect(events[0].toolName).toBe('read_file');
  expect(events[0].args.path).toBe('test.js');
});
```

### Integration Test
```javascript
// Start Claude Code with known command
const handler = new ClaudeCodeSSEHandler();
handler.startClaudeCode('List all files');

// Monitor events
const events = [];
handler.on('broadcast', (event) => {
  events.push(event);
});

// Wait for completion
await new Promise(resolve => {
  handler.claudeProcess.on('close', resolve);
});

// Assert expected event sequence
expect(events).toContainEqual(
  expect.objectContaining({ type: 'tool_call', toolName: 'list_directory' })
);
```

## Troubleshooting

### Events not appearing
- Check Claude Code is in non-interactive mode: `claude code --non-interactive`
- Verify stdout is being captured: `console.log(chunk.toString())`
- Check parser patterns match actual output format

### Permission responses not working
- Ensure stdin is writable: check `claudeProcess.stdin.writable`
- Verify correct response format (`y\n` or `n\n`)
- Check permission ID is tracked in parser state

### SSE connection drops
- Add reconnection logic with exponential backoff
- Implement heartbeat messages every 30 seconds
- Handle network errors gracefully

## Performance Considerations

### Memory Management
```javascript
// Limit message history
const MAX_MESSAGES = 1000;
setMessages(prev => {
  const updated = [...prev, newMsg];
  return updated.slice(-MAX_MESSAGES);
});
```

### Large Tool Results
```javascript
// Truncate large results
if (event.type === 'tool_call' && event.result?.length > 10000) {
  event.result = event.result.slice(0, 10000) + '\n... (truncated)';
}
```

## Next Steps

1. **Add persistent state** - Save conversation history to disk/database
2. **Implement message search** - Allow filtering/searching through past events
3. **Add export functionality** - Export conversations as markdown or JSON
4. **Real-time metrics** - Track tool call duration, token usage, etc.
5. **Multi-session support** - Handle multiple concurrent Claude Code processes

## Advanced Patterns

### Virtual Scrolling for Performance
For very long conversations (1000+ messages), implement virtual scrolling:

```javascript
import { useVirtualizer } from '@tanstack/react-virtual';

const MessageList = ({ messages }) => {
  const parentRef = useRef(null);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderMessage(messages[virtualItem.index])}
          </div>
        ))}
      </div>
    </div>
  );
};
```

### State Machine for Process Lifecycle
Track Claude Code process state explicitly:

```javascript
const ProcessState = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  WAITING_PERMISSION: 'waiting_permission',
  COMPLETED: 'completed',
  ERROR: 'error'
};

class ProcessStateMachine {
  constructor() {
    this.state = ProcessState.IDLE;
    this.listeners = [];
  }
  
  transition(newState, data = {}) {
    const oldState = this.state;
    this.state = newState;
    this.notify({ oldState, newState, data });
  }
  
  onTransition(callback) {
    this.listeners.push(callback);
  }
  
  notify(event) {
    this.listeners.forEach(cb => cb(event));
  }
}
```

### Optimistic Updates for Permissions
Show immediate feedback before backend confirms:

```javascript
const handlePermissionResponse = async (id, approved) => {
  // Optimistically update UI
  setMessages(prev => prev.map(msg => 
    msg.permissionId === id 
      ? { ...msg, responding: true, response: approved }
      : msg
  ));
  
  try {
    await fetch('/api/claude-code/permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionId: id, approved })
    });
    
    // Confirm success
    setMessages(prev => prev.map(msg => 
      msg.permissionId === id 
        ? { ...msg, responding: false, confirmed: true }
        : msg
    ));
  } catch (error) {
    // Revert on error
    setMessages(prev => prev.map(msg => 
      msg.permissionId === id 
        ? { ...msg, responding: false, response: null, error: error.message }
        : msg
    ));
  }
};
```

### Message Grouping
Group related messages (e.g., tool call + result) for better UX:

```javascript
const groupMessages = (messages) => {
  const groups = [];
  let currentGroup = null;
  
  for (const msg of messages) {
    if (msg.type === 'tool_call' && msg.status === 'running') {
      currentGroup = { type: 'tool_execution', messages: [msg] };
      groups.push(currentGroup);
    } else if (currentGroup && msg.type === 'tool_call' && msg.status === 'complete') {
      currentGroup.messages.push(msg);
      currentGroup = null;
    } else {
      groups.push({ type: 'single', messages: [msg] });
    }
  }
  
  return groups;
};
```

### Streaming Text Accumulation
For incremental user messages, accumulate chunks:

```javascript
const [streamingMessage, setStreamingMessage] = useState(null);

// In event handler
if (event.type === 'user_message_chunk') {
  setStreamingMessage(prev => ({
    content: (prev?.content || '') + event.chunk,
    timestamp: prev?.timestamp || event.timestamp
  }));
} else if (event.type === 'user_message_complete') {
  setMessages(prev => [...prev, streamingMessage]);
  setStreamingMessage(null);
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────┐    ┌──────────────────────────┐    │
│  │ SSE Connection │───▶│ Message State Manager    │    │
│  └────────────────┘    └──────────────────────────┘    │
│                                  │                       │
│                                  ▼                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Component Router                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │   │
│  │  │UserMsg   │ │ToolCall  │ │PermissionReq   │  │   │
│  │  └──────────┘ └──────────┘ └────────────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │   │
│  │  │Error     │ │Subagent  │ │Thinking        │  │   │
│  │  └──────────┘ └──────────┘ └────────────────┘  │   │
│  └─────────────────────────────────────────────────┘   │
│                                  │                       │
│                                  ▼                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │      Permission Response Handler                 │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP POST
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Node.js Backend                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────┐     │
│  │         SSE Handler                             │     │
│  │  ┌──────────────────────────────────────────┐  │     │
│  │  │  Client Set (Multiple SSE connections)   │  │     │
│  │  └──────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────┘     │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐     │
│  │         Claude Code Parser                      │     │
│  │  • Pattern matching                             │     │
│  │  • Event transformation                         │     │
│  │  • State tracking (tools, permissions, agents)  │     │
│  └────────────────────────────────────────────────┘     │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐     │
│  │      Child Process Manager                      │     │
│  │  ┌──────────────────────────────────────────┐  │     │
│  │  │  claude code --non-interactive            │  │     │
│  │  │  ├─ stdout ──▶ Parser                     │  │     │
│  │  │  ├─ stderr ──▶ Error handler              │  │     │
│  │  │  └─ stdin  ◀── Permission responses       │  │     │
│  │  └──────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────┘     │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## Production Checklist

- [ ] Error boundaries around each component
- [ ] Graceful reconnection with exponential backoff
- [ ] Message persistence (localStorage/IndexedDB)
- [ ] Rate limiting on permission endpoint
- [ ] Input sanitization on all user-provided data
- [ ] Logging for debugging (Winston/Pino)
- [ ] Health check endpoint for monitoring
- [ ] Proper cleanup on process exit
- [ ] Memory leak detection (heap snapshots)
- [ ] Load testing with multiple concurrent streams
- [ ] Security audit of stdin commands
- [ ] CORS configuration for production domains

## Complete Working Example

See the artifacts for:
1. **ClaudeCodeStreamChat** - Full React component with all message types
2. **Node.js Stream Parser** - Complete backend with SSE handler
3. This migration guide

Start with Phase 1 and progressively enhance your existing system!