# Visualizing Claude's Reasoning with the Anthropic Agent SDK in React

We want to rework the existing rendering of the chatpane in the frontend:
* Current behaviour: render user input and ai agent as message bubbles, intermediate tool calls are ephemeral and only displayed for the currently running process and removed with the next user input
* new behaviour: render user input as a message bubble, render response from agent with a right margin of 40px but without bubble. intermediate reasoning steps are shown for the currently running process but rendered according the logic below, they are also not removed form display with the next user input but hidden inside a collapsible section "Reasoning".
we must also conserve the reasoning sections in our chat protocol file and restore appropriately

## Background info: The Anthropic Agent SDK architecture

Building effective visualizations of Claude's reasoning process requires mastering three interconnected systems: the **Anthropic Agent SDK's streaming architecture**, React's state management for real-time updates, and UI patterns that make complex AI workflows comprehensible. The Agent SDK provides dedicated event handlers for thinking blocks, tool invocations, and text output—each requiring different rendering strategies in React components.

The most effective approach combines the Agent SDK's streaming event system with React's `useReducer` for complex state, memoized markdown rendering for performance, and collapsible progressive disclosure patterns for reasoning steps.

The **`@anthropic-ai/claude-agent-sdk`** provides higher-level abstractions for autonomous agents with built-in tool orchestration. It uses an async generator pattern for message iteration, providing `SDKAssistantMessage`, `SDKPartialAssistantMessage`, and `SDKResultMessage` types that include session tracking, parent tool references, and cost metrics—essential for visualizing nested agent workflows.

```typescript
import { Claude } from '@anthropic-ai/claude-agent-sdk';

const client = new Claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Agent SDK streaming pattern
for await (const message of client.sendMessage({
  content: 'Complex reasoning task...',
  tools: registeredTools,
})) {
  if (message.type === 'partial') {
    // Handle streaming deltas
    if (message.thinking) {
      // Real-time thinking updates
    }
    if (message.content) {
      // Streaming text content
    }
    if (message.toolUse) {
      // Tool invocation started
    }
  } else if (message.type === 'complete') {
    // Handle final message with all tool results
  }
}
```

## TypeScript interfaces for Agent SDK visualization

The Agent SDK provides structured message types that inform React component interfaces:

```typescript
interface SDKPartialAssistantMessage {
  type: 'partial';
  thinking?: string;
  content?: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  sessionId: string;
  messageId: string;
}

interface SDKAssistantMessage {
  type: 'complete';
  content: string;
  thinking?: string;
  toolResults?: ToolResult[];
  sessionId: string;
  messageId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

interface ToolResult {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  duration: number;
}
```

These types inform React component interfaces:

```typescript
interface ReasoningStepProps {
  id: string;
  thinking: string;
  isStreaming: boolean;
  defaultExpanded?: boolean;
  timestamp?: Date;
}

interface ToolInvocationProps {
  toolResult: ToolResult;
  status: 'pending' | 'executing' | 'complete' | 'error';
}
```

## React streaming with Agent SDK requires solving state management

The Agent SDK's async generator pattern requires careful state handling in React. Use `useReducer` for complex reasoning workflows:

```typescript
interface StreamState {
  messages: SDKAssistantMessage[];
  currentMessage?: SDKPartialAssistantMessage;
  isStreaming: boolean;
  currentThinking: string;
  activeToolCalls: Map<string, ToolInvocation>;
  error: string | null;
}

interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'executing' | 'complete' | 'error';
  result?: unknown;
  startTime: Date;
  endTime?: Date;
}

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'STREAM_START':
      return {
        ...state,
        isStreaming: true,
        currentThinking: '',
        activeToolCalls: new Map(),
        error: null
      };

    case 'THINKING_UPDATE':
      return {
        ...state,
        currentThinking: action.payload,
        currentMessage: {
          ...state.currentMessage,
          thinking: action.payload
        }
      };

    case 'TOOL_CALL_START':
      const newToolCall: ToolInvocation = {
        id: action.payload.id,
        name: action.payload.name,
        input: action.payload.input,
        status: 'executing',
        startTime: new Date()
      };
      return {
        ...state,
        activeToolCalls: new Map(state.activeToolCalls.set(action.payload.id, newToolCall))
      };

    case 'TOOL_CALL_COMPLETE':
      const updatedToolCall = {
        ...state.activeToolCalls.get(action.payload.id)!,
        status: 'complete' as const,
        result: action.payload.result,
        endTime: new Date()
      };
      return {
        ...state,
        activeToolCalls: new Map(state.activeToolCalls.set(action.payload.id, updatedToolCall))
      };

    case 'MESSAGE_COMPLETE':
      return {
        ...state,
        isStreaming: false,
        messages: [...state.messages, action.payload],
        currentMessage: undefined,
        currentThinking: '',
        activeToolCalls: new Map()
      };

    default:
      return state;
  }
}
```

## Custom hook encapsulates Agent SDK streaming logic

Extract streaming complexity into a reusable hook:

```typescript
function useClaudeAgentStream() {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const clientRef = useRef<Claude>();
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    clientRef.current = new Claude({
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
    });
  }, []);

  const sendMessage = useCallback(async (content: string, tools?: Tool[]) => {
    if (!clientRef.current) return;

    abortRef.current = new AbortController();
    dispatch({ type: 'STREAM_START' });

    try {
      const messageStream = clientRef.current.sendMessage({
        content,
        tools: tools || [],
        signal: abortRef.current.signal
      });

      for await (const message of messageStream) {
        if (message.type === 'partial') {
          if (message.thinking) {
            dispatch({
              type: 'THINKING_UPDATE',
              payload: message.thinking
            });
          }

          if (message.toolUse) {
            dispatch({
              type: 'TOOL_CALL_START',
              payload: message.toolUse
            });
          }

          if (message.content) {
            dispatch({
              type: 'CONTENT_UPDATE',
              payload: message.content
            });
          }
        } else if (message.type === 'complete') {
          // Process tool results
          message.toolResults?.forEach(result => {
            dispatch({
              type: 'TOOL_CALL_COMPLETE',
              payload: result
            });
          });

          dispatch({
            type: 'MESSAGE_COMPLETE',
            payload: message
          });
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        dispatch({
          type: 'ERROR',
          payload: error.message
        });
      }
    }
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    ...state,
    sendMessage,
    cancelStream
  };
}
```

## Component architecture for Agent SDK visualization

Build layered components that separate streaming logic from rendering:

```typescript
// Main chat container
const AgentChat = () => {
  const { messages, currentMessage, isStreaming, sendMessage } = useClaudeAgentStream();

  return (
    <div className="flex flex-col h-full">
      <MessageList>
        {messages.map(message => (
          <AgentMessage key={message.messageId} message={message} />
        ))}
        {currentMessage && (
          <AgentMessage message={currentMessage} isStreaming={isStreaming} />
        )}
      </MessageList>
      
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
};

// Individual agent message component
const AgentMessage = ({ message, isStreaming = false }) => {
  return (
    <div className="agent-message">
      {message.thinking && (
        <ReasoningBlock 
          thinking={message.thinking} 
          isStreaming={isStreaming}
        />
      )}
      
      {message.toolResults?.map(tool => (
        <ToolInvocationCard 
          key={tool.id} 
          toolResult={tool}
          status="complete"
        />
      ))}
      
      {message.content && (
        <StreamingMarkdown 
          content={message.content}
          id={message.messageId}
        />
      )}
    </div>
  );
};
```

## Reasoning block with progressive disclosure

Implement collapsible reasoning sections that show summaries by default:

```typescript
const ReasoningBlock = ({ thinking, isStreaming, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  // Show first line as summary when collapsed
  const summary = thinking.split('\n')[0]?.slice(0, 100) + '...';
  
  return (
    <div className="border-l-4 border-blue-400 pl-4 my-3 bg-blue-50 rounded-r">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800"
      >
        <ChevronRightIcon 
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} 
        />
        <span className="font-medium">
          {isStreaming ? 'Thinking...' : 'Reasoning'}
        </span>
        {isStreaming && <LoadingDots />}
      </button>
      
      {!expanded && !isStreaming && (
        <div className="mt-1 text-xs text-gray-600 italic">
          {summary}
        </div>
      )}
      
      {expanded && (
        <div className="mt-2 text-sm text-gray-700 font-mono whitespace-pre-wrap bg-white p-3 rounded border">
          {thinking}
          {isStreaming && <span className="animate-pulse text-blue-500">▋</span>}
        </div>
      )}
    </div>
  );
};
```

## Tool invocation cards with status tracking

Display tool calls with rich status information and interactive results:

```typescript
const ToolInvocationCard = ({ toolResult, status }) => {
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(true);
  
  const statusConfig = {
    pending: { color: 'yellow', icon: '⏳', text: 'Queued' },
    executing: { color: 'blue', icon: '⚡', text: 'Running' },
    complete: { color: 'green', icon: '✅', text: 'Complete' },
    error: { color: 'red', icon: '❌', text: 'Error' }
  };

  const config = statusConfig[status];
  
  return (
    <div className={`rounded-lg border-l-4 border-${config.color}-400 bg-${config.color}-50 p-4 my-3`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="font-medium text-gray-800">{toolResult.name}</span>
          <span className={`text-xs px-2 py-1 rounded bg-${config.color}-100 text-${config.color}-700`}>
            {config.text}
          </span>
        </div>
        {toolResult.duration && (
          <span className="text-xs text-gray-500">
            {toolResult.duration}ms
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        <details open={showInput}>
          <summary 
            className="cursor-pointer text-sm text-gray-600 hover:text-gray-800"
            onClick={() => setShowInput(!showInput)}
          >
            Input parameters
          </summary>
          <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-auto">
            {JSON.stringify(toolResult.input, null, 2)}
          </pre>
        </details>
        
        {toolResult.output && (
          <details open={showOutput}>
            <summary 
              className="cursor-pointer text-sm text-gray-600 hover:text-gray-800"
              onClick={() => setShowOutput(!showOutput)}
            >
              Result
            </summary>
            <div className="mt-2 bg-white p-2 rounded border">
              <ToolResultRenderer 
                name={toolResult.name} 
                result={toolResult.output} 
              />
            </div>
          </details>
        )}
        
        {toolResult.error && (
          <div className="text-sm text-red-600 bg-red-100 p-2 rounded">
            <strong>Error:</strong> {toolResult.error}
          </div>
        )}
      </div>
    </div>
  );
};
```

## Interactive tool result rendering

Create specialized renderers for different tool types, including interactive elements:

```typescript
const ToolResultRenderer = ({ name, result }) => {
  // Todo list tools with interactive checkboxes
  if (name === 'update_todo' || name === 'manage_tasks') {
    return (
      <div className="space-y-2">
        {result.items?.map(item => (
          <div key={item.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
            <input
              type="checkbox"
              checked={item.completed}
              readOnly
              className="rounded"
            />
            <span className={item.completed ? 'line-through text-gray-500' : 'text-gray-800'}>
              {item.text}
            </span>
            {item.justCompleted && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                ✓ Just completed
              </span>
            )}
            {item.priority && (
              <span className={`text-xs px-1 rounded ${
                item.priority === 'high' ? 'bg-red-100 text-red-700' :
                item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {item.priority}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // File operations
  if (name === 'write_file' || name === 'read_file') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <FileIcon className="w-4 h-4" />
          <code className="text-sm bg-gray-100 px-1 rounded">{result.path}</code>
        </div>
        {result.content && (
          <pre className="text-xs bg-gray-100 p-2 rounded max-h-40 overflow-auto">
            {result.content.slice(0, 500)}
            {result.content.length > 500 && '...'}
          </pre>
        )}
      </div>
    );
  }

  // Web search results
  if (name === 'web_search') {
    return (
      <div className="space-y-2">
        {result.results?.map((item, i) => (
          <div key={i} className="border-b pb-2 last:border-b-0">
            <a 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium text-sm"
            >
              {item.title}
            </a>
            <p className="text-xs text-gray-600 mt-1">{item.snippet}</p>
          </div>
        ))}
      </div>
    );
  }

  // Default JSON renderer
  return (
    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
};
```

## Performance optimization with memoization

Streaming responses trigger rapid re-renders. Optimize with careful memoization:

```typescript
import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => (
    <ReactMarkdown>{content}</ReactMarkdown>
  ),
  (prev, next) => prev.content === next.content
);

export const StreamingMarkdown = memo(({ 
  content, 
  id 
}: { 
  content: string; 
  id: string; 
}) => {
  const blocks = useMemo(() => {
    // Parse markdown into stable blocks for individual memoization
    const tokens = marked.lexer(content);
    return tokens.map(token => token.raw);
  }, [content]);

  return (
    <div className="prose prose-sm max-w-none">
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock 
          key={`${id}-${index}-${block.slice(0, 20)}`} 
          content={block} 
        />
      ))}
    </div>
  );
});

// Memoize entire message components
export const AgentMessage = memo(({ message, isStreaming }) => {
  // Component implementation
}, (prev, next) => {
  return prev.message.messageId === next.message.messageId &&
         prev.isStreaming === next.isStreaming &&
         prev.message.thinking === next.message.thinking &&
         prev.message.content === next.message.content;
});
```

## Error handling and recovery

Handle streaming errors gracefully with retry mechanisms:

```typescript
const ErrorBoundary = ({ error, onRetry, onDismiss }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-3">
    <div className="flex items-start gap-3">
      <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5" />
      <div className="flex-1">
        <h4 className="text-sm font-medium text-red-800">
          Agent Error
        </h4>
        <p className="text-sm text-red-700 mt-1">
          {error.message}
        </p>
        {error.code === 'rate_limit_exceeded' && (
          <p className="text-xs text-red-600 mt-1">
            Rate limit reached. Retrying automatically in 30 seconds...
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded"
        >
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="text-xs text-red-500 hover:text-red-600"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
);

// Enhanced hook with error handling
function useClaudeAgentStream() {
  // ... existing code ...
  
  const sendMessageWithRetry = useCallback(async (
    content: string, 
    tools?: Tool[], 
    retryCount = 0
  ) => {
    try {
      await sendMessage(content, tools);
    } catch (error) {
      if (error.code === 'rate_limit_exceeded' && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        setTimeout(() => {
          sendMessageWithRetry(content, tools, retryCount + 1);
        }, delay);
      } else {
        dispatch({
          type: 'ERROR',
          payload: {
            message: error.message,
            code: error.code,
            retryable: error.code === 'rate_limit_exceeded'
          }
        });
      }
    }
  }, [sendMessage]);

  return {
    ...state,
    sendMessage: sendMessageWithRetry,
    // ... rest of return
  };
}
```

## Conclusion

Visualizing Claude's reasoning with the Anthropic Agent SDK requires integrating the SDK's typed streaming events with React's state management patterns, while applying progressive disclosure principles from developer tools design. The **useReducer pattern** handles complex agent state, **block-level memoization** maintains performance during rapid updates, and **status-aware tool cards** make agent workflows comprehensible.

Key implementation insights:
- Use the Agent SDK's async generator pattern with `useReducer` for complex state management
- Implement progressive disclosure for reasoning blocks—collapsed by default with expansion available
- Create specialized tool result renderers for interactive elements like todo items
- Apply careful memoization to prevent performance degradation during streaming
- Handle errors gracefully with retry mechanisms and user feedback

The goal is **on-demand reasoning depth** that doesn't overwhelm users with real-time streams, but provides rich detail when requested.