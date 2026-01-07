# AskUserQuestion

I want to implement the Agent SDKs 
* canUseTool 
* AskUserQuestion 
* ExitPlanMode
events using our existing elicitation system. We also must use/extend the existing SSE communication channel between frontend and backend. DO NOT create a second SSE connection!

We only need to support the Agent SDK's permission modes 'plan' and 'acceptEdits'.

Please review and extend the backend and frontend projects.

## Handling elicitation in Claude Agent SDK for custom React UIs

The Claude Code SDK has been **renamed to Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) and provides three primary mechanisms for handling user elicitations: the `canUseTool` callback for permission requests, the built-in `AskUserQuestion` tool for structured multi-choice prompts, and a comprehensive hooks system for fine-grained event interception. Custom React frontends integrate through these TypeScript APIs to present permission dialogs, capture user responses, and control agent execution flow.

### Core elicitation mechanisms and when to use them

The SDK doesn't use a single "elicitation event" pattern—instead, elicitations flow through the **permission system**. When Claude wants to use a tool, the SDK evaluates permissions in this order: PreToolUse hooks → deny rules → allow rules → ask rules → permission mode → `canUseTool` callback → PostToolUse hooks.

The `canUseTool` callback is your **primary integration point** for custom UIs:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

type CanUseTool = (
  toolName: string,
  input: ToolInput,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
  }
) => Promise<PermissionResult>;

type PermissionResult = 
  | { behavior: 'allow'; updatedInput: ToolInput; updatedPermissions?: PermissionUpdate[]; }
  | { behavior: 'deny'; message: string; interrupt?: boolean; };
```

When implementing this callback, you render your custom UI, wait for user input, then return the appropriate `PermissionResult`. Setting `interrupt: true` on a denial halts the entire session rather than just failing the single tool call.

### SDK message types and streaming protocol

The SDK emits messages through an AsyncGenerator pattern, yielding a union type `SDKMessage` that your React components consume:

```typescript
type SDKMessage = 
  | SDKAssistantMessage      // Claude's responses with content blocks
  | SDKUserMessage           // User input messages
  | SDKResultMessage         // Final result with cost, usage, permission_denials
  | SDKSystemMessage         // Initialization with session_id, tools, model
  | SDKPartialAssistantMessage // Streaming partial content (when enabled)
  | SDKCompactBoundaryMessage; // Context compaction markers
```

The `SDKSystemMessage` with `subtype: 'init'` provides the `session_id` needed for session management. Enable streaming updates by setting `includePartialMessages: true` in options—this yields partial content blocks as they arrive, essential for responsive UIs.

### Handling AskUserQuestion for multi-choice elicitations

The SDK includes a special `AskUserQuestion` tool that Claude uses to request structured user input. Its input schema defines questions with predefined options:

```typescript
interface AskUserQuestionInput {
  questions: Array<{
    question: string;     // Full question text ending in "?"
    header: string;       // Short label, max 12 characters ("Auth method")
    options: Array<{
      label: string;      // Display text, 1-5 words
      description: string; // Explanation of this choice
    }>;
    multiSelect: boolean; // Allow selecting multiple options
  }>;
  answers?: Record<string, string>; // You populate this with user responses
}
```

Handle this in your `canUseTool` callback by detecting the tool name, rendering a custom question UI, collecting answers, and returning them in `updatedInput`:

```typescript
const canUseTool = async (toolName: string, input: any, opts: any) => {
  if (toolName === 'AskUserQuestion') {
    const answers: Record<string, string> = {};
    
    for (const q of input.questions) {
      const selection = await showQuestionModal({
        question: q.question,
        header: q.header,
        options: q.options,
        multiSelect: q.multiSelect
      });
      answers[q.question] = selection; // Multi-select uses comma-separated values
    }
    
    return { behavior: 'allow', updatedInput: { ...input, answers } };
  }
  
  // Handle other permission requests with standard approval UI
  const approved = await showPermissionDialog(toolName, input);
  return approved 
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: 'User declined' };
};
```

### React hook pattern for complete integration

A production React implementation wraps the SDK in a custom hook that manages messages, streaming content, and pending elicitation requests:

```typescript
import { useState, useCallback, useRef } from 'react';
import { query, SDKMessage, PermissionResult } from '@anthropic-ai/claude-agent-sdk';

interface PermissionRequest {
  toolName: string;
  toolInput: unknown;
  resolve: (result: PermissionResult) => void;
}

export function useClaudeAgent(options = {}) {
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [questionRequest, setQuestionRequest] = useState<any>(null);
  const abortRef = useRef<AbortController>();

  const canUseTool = useCallback(async (
    toolName: string, input: any, opts: any
  ): Promise<PermissionResult> => {
    if (toolName === 'AskUserQuestion') {
      return new Promise(resolve => {
        setQuestionRequest({
          questions: input.questions,
          resolve: (answers: Record<string, string>) => {
            resolve({ behavior: 'allow', updatedInput: { ...input, answers } });
            setQuestionRequest(null);
          }
        });
      });
    }

    return new Promise(resolve => {
      setPermissionRequest({
        toolName, toolInput: input,
        resolve: (result) => { resolve(result); setPermissionRequest(null); }
      });
    });
  }, []);

  const sendMessage = useCallback(async (prompt: string) => {
    abortRef.current = new AbortController();
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);

    for await (const msg of query({
      prompt,
      options: {
        abortController: abortRef.current,
        allowedTools: ['Read', 'Write', 'Bash', 'AskUserQuestion'],
        permissionMode: 'default',
        maxTurns: 10,
        canUseTool,
        includePartialMessages: true
      }
    })) {
      if (msg.type === 'result') {
        setMessages(prev => [...prev, { role: 'assistant', content: msg.result }]);
        setStreamingContent('');
      }
    }
    setIsLoading(false);
  }, [canUseTool]);

  const allowPermission = () => permissionRequest?.resolve({ 
    behavior: 'allow', updatedInput: permissionRequest.toolInput 
  });
  const denyPermission = (msg = 'Denied') => permissionRequest?.resolve({ 
    behavior: 'deny', message: msg 
  });
  const interrupt = () => abortRef.current?.abort();

  return { 
    messages, streamingContent, isLoading, 
    permissionRequest, questionRequest,
    sendMessage, allowPermission, denyPermission, interrupt 
  };
}
```

### Permission modes control automatic approval behavior

Four permission modes configure how aggressively the SDK auto-approves tool usage:

| Mode | Behavior |
|------|----------|
| `default` | Standard flow—prompts user via `canUseTool` for unmatched tools |
| `acceptEdits` | Auto-approves file modifications (Write, Edit, MultiEdit) |
| `bypassPermissions` | Skips all permission checks—use only in trusted environments |
| `plan` | Planning mode—Claude explains what it would do without executing |

Set the mode at query time or change it dynamically during streaming sessions using `query.setPermissionMode('acceptEdits')`. Plan mode is particularly useful for review-before-execution workflows where you want Claude to present a plan for user approval before taking action.

### Plan presentation via ExitPlanMode tool

When `permissionMode: 'plan'` is set, Claude uses the `ExitPlanMode` tool to present its execution plan for approval:

```typescript
interface ExitPlanModeInput {
  plan: string;  // Detailed plan text for user review
}

interface ExitPlanModeOutput {
  message: string;
  approved?: boolean;
}
```

In your `canUseTool` callback, detect this tool name to render a plan approval UI, then return the approval status in `updatedInput`.

### Key types and exports from the SDK

The SDK exports these essential types for TypeScript integration:

```typescript
import {
  query,                    // Main entry point
  tool, createSdkMcpServer, // Custom tool creation
  
  // Message types
  SDKMessage, SDKAssistantMessage, SDKUserMessage,
  SDKResultMessage, SDKSystemMessage,
  
  // Permission types
  PermissionResult, PermissionMode, PermissionUpdate,
  CanUseTool, PermissionBehavior,
  
  // Hook types
  HookInput, HookJSONOutput, HookCallbackMatcher,
  
  // Tool input types
  ToolInput, AskUserQuestionInput,
  
  // Errors
  ClaudeSDKError, CLINotFoundError, ProcessError
} from '@anthropic-ai/claude-agent-sdk';
```

Note that `ElicitationMessage` and `PlanElicitation` as exact type names don't exist in the SDK—the closest equivalents are `AskUserQuestionInput` for structured user prompts and `ExitPlanModeInput` for plan presentations.

## Conclusion

Building custom React frontends for Claude Agent SDK centers on implementing the `canUseTool` callback to intercept tool permission requests and the `AskUserQuestion` tool for multi-choice prompts. The streaming AsyncGenerator pattern provides real-time message updates, while the hooks system enables deterministic security policies. Permission modes offer flexibility from fully manual approval (`default`) to automated execution (`bypassPermissions`), with plan mode providing a review-before-execution pattern. For production implementations, combine the `useClaudeAgent` hook pattern with modal components for permissions and questions, ensuring users maintain meaningful control over agent actions while enabling the responsive, interactive experience modern applications require.