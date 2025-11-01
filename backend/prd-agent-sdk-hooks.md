# Anthropic Agent SDK TypeScript Hooks Reference

The Anthropic Agent SDK (formerly Claude Code SDK) provides **hooks that fire at specific lifecycle events** during agent execution, giving you deterministic control over agent behavior, security enforcement, and observability. Unlike prompt-based controls that depend on LLM behavior, hooks execute directly in your application with guaranteed execution.

## Understanding hooks in the Agent SDK

Hooks are callback functions that execute at critical moments in the agent lifecycle. They allow you to **block dangerous operations, inject context, log activities, and enforce custom policies** before they depend on the model's judgment. The SDK provides 9 hook events covering tool usage, session lifecycle, and notifications.

### Hook event types available

```typescript
type HookEvent = 
  | 'PreToolUse'        // Before tool execution - can block
  | 'PostToolUse'       // After tool completion - can inject context
  | 'Notification'      // System notifications
  | 'UserPromptSubmit'  // User prompt submission - can validate/enhance
  | 'SessionStart'      // Session initialization - source: startup/resume/clear/compact
  | 'SessionEnd'        // Session termination - reason provided
  | 'Stop'              // Agent stops responding
  | 'SubagentStop'      // Subagent task completion
  | 'PreCompact';       // Before context compaction - manual or auto
```

**PreToolUse** enables security enforcement by inspecting and potentially blocking tool calls before execution. **PostToolUse** lets you validate results and add context based on tool outputs. **SessionStart** and **SessionEnd** handle lifecycle management, while **UserPromptSubmit** allows prompt validation and enhancement.

## Hook callback function structure

Every hook callback follows the same signature:

```typescript
type HookCallback = (
  input: HookInput,                      // Event-specific input data
  toolUseID: string | undefined,         // Tool identifier (undefined for non-tool events)
  options: { signal: AbortSignal }       // Cancellation support
) => Promise<HookJSONOutput>;
```

The **input parameter** is a discriminated union containing event-specific data. Use `input.hook_event_name` to determine the event type and narrow the TypeScript type. The **toolUseID** identifies which tool invocation triggered the hook. The **AbortSignal** enables cancellation of long-running hook operations.

### Hook input types by event

All hook inputs extend a base structure:

```typescript
type BaseHookInput = {
  session_id: string;        // Unique session identifier
  transcript_path: string;   // Path to session transcript file
  cwd: string;              // Current working directory
  permission_mode?: string; // Active permission mode
}
```

**PreToolUse** adds tool identification and input parameters:

```typescript
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PreToolUse';
  tool_name: string;         // Tool about to execute
  tool_input: ToolInput;     // Tool's input parameters
}
```

**PostToolUse** includes both input and output:

```typescript
type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: ToolInput;
  tool_response: ToolOutput; // Actual tool execution result
}
```

**SessionStart** indicates how the session began:

```typescript
type SessionStartHookInput = BaseHookInput & {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear' | 'compact';
}
```

## Hook output and control flow

Hooks return structured output that controls agent behavior:

```typescript
type SyncHookJSONOutput = {
  continue?: boolean;           // Continue execution (default: true)
  suppressOutput?: boolean;     // Hide output from transcript
  stopReason?: string;          // Reason when continue is false
  decision?: 'approve' | 'block'; // Approval decision
  systemMessage?: string;       // Message to display
  reason?: string;              // Explanation for decision
  
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  } | {
    hookEventName: 'PostToolUse' | 'SessionStart' | 'UserPromptSubmit';
    additionalContext?: string;  // Context to inject into conversation
  }
}
```

Setting **continue to false** halts execution immediately. The **permissionDecision** field in PreToolUse hooks determines whether the tool executes. PostToolUse hooks can inject **additionalContext** that becomes part of the conversation, allowing you to provide automated feedback based on tool results.

## Query objects and configuration

The `query()` function is your primary interface for creating agent sessions:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

**Prompt** accepts either a simple string for one-shot queries or an AsyncIterable for streaming interactive sessions. **Options** provides comprehensive configuration including hooks, permissions, tools, and MCP servers.

### Essential query options

```typescript
const result = query({
  prompt: "Your task here",
  options: {
    // Hook configuration
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [securityHook] }],
      PostToolUse: [{ hooks: [loggingHook] }]
    },
    
    // Permission control
    permissionMode: 'default', // 'acceptEdits' | 'bypassPermissions' | 'plan'
    
    // Tool restrictions
    allowedTools: ['Read', 'Write', 'Bash', 'WebSearch'],
    disallowedTools: ['KillBash'],
    
    // Execution limits
    maxTurns: 10,
    
    // System prompts
    systemPrompt: "You are a code review assistant",
    
    // MCP servers for custom tools
    mcpServers: { 'custom': customServerConfig },
    
    // Session management
    cwd: '/path/to/project',
    resume: 'session-id-to-continue'
  }
});
```

The **hooks** property maps each HookEvent to an array of callback configurations. Each configuration can include a **matcher** pattern to filter which tools trigger the hook (e.g., 'Bash|Write|Edit' matches any of those tools, or '*' matches all).

### Query return type and methods

The query function returns a Query object that extends AsyncGenerator:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}
```

These methods are **only available in streaming mode** (when using AsyncIterable prompt input). Use `interrupt()` to stop execution or `setPermissionMode()` to dynamically change permission behavior mid-execution.

## Working code examples

### Example 1: Security hook blocking dangerous commands

This hook prevents execution of potentially destructive bash commands:

```typescript
import { query, PreToolUseHookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

async function bashSecurityHook(
  input: PreToolUseHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  // Type guard to ensure PreToolUse event
  if (input.hook_event_name !== 'PreToolUse' || input.tool_name !== 'Bash') {
    return { continue: true };
  }

  const command = input.tool_input.command || '';
  const dangerousPatterns = ['rm -rf', 'dd if=', 'mkfs', '> /dev/'];
  
  for (const pattern of dangerousPatterns) {
    if (command.includes(pattern)) {
      return {
        decision: 'block',
        systemMessage: '🔒 Security policy violation',
        reason: `Dangerous command blocked: ${pattern}`,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Command contains dangerous pattern: ${pattern}`
        }
      };
    }
  }

  return { 
    decision: 'approve',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  };
}

// Usage
async function runSecureAgent() {
  for await (const message of query({
    prompt: 'Clean up temporary files',
    options: {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [bashSecurityHook] }]
      },
      allowedTools: ['Bash', 'Read'],
      permissionMode: 'default'
    }
  })) {
    if (message.type === 'result') {
      console.log('Task completed:', message.result);
    }
  }
}
```

### Example 2: File access control with path restrictions

Protect sensitive files and restrict operations to allowed directories:

```typescript
import { query, PreToolUseHookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

async function fileAccessControl(
  input: PreToolUseHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PreToolUse') {
    return { continue: true };
  }

  // Only check file operation tools
  if (!['Write', 'Edit', 'Read', 'MultiEdit'].includes(input.tool_name)) {
    return { continue: true };
  }

  const filePath = input.tool_input.file_path || '';
  const forbiddenFiles = ['.env', 'secrets.yml', 'private.key', 'package-lock.json'];
  const allowedPaths = ['/tmp/sandbox', './data', './src'];

  // Block access to sensitive files
  for (const forbidden of forbiddenFiles) {
    if (filePath.includes(forbidden)) {
      return {
        decision: 'block',
        systemMessage: '⛔ Access denied to sensitive file',
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Cannot access protected file: ${forbidden}`
        }
      };
    }
  }

  // Verify path is in allowed directories
  const isAllowed = allowedPaths.some(allowed => filePath.startsWith(allowed));
  if (!isAllowed && filePath.startsWith('/')) {
    return {
      decision: 'block',
      systemMessage: '🔒 Path outside allowed directory',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'File path not in allowed directories'
      }
    };
  }

  return { decision: 'approve' };
}

// Usage with file operations
const result = query({
  prompt: 'Review and edit the configuration files',
  options: {
    hooks: {
      PreToolUse: [{ 
        matcher: 'Write|Edit|Read|MultiEdit',
        hooks: [fileAccessControl] 
      }]
    },
    cwd: './my-project'
  }
});
```

### Example 3: Context injection with PostToolUse hooks

Add automated feedback and analysis after tool execution:

```typescript
import { query, PostToolUseHookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

async function postToolAnalysis(
  input: PostToolUseHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PostToolUse') {
    return { continue: true };
  }

  // Analyze bash command results
  if (input.tool_name === 'Bash') {
    const output = input.tool_response.output || '';
    const exitCode = input.tool_response.exit_code || 0;
    
    let additionalContext = '';
    
    if (exitCode !== 0) {
      additionalContext = `⚠️ Command exited with code ${exitCode}. This may indicate an error.`;
    } else if (output.includes('warning') || output.includes('error')) {
      additionalContext = '⚠️ Output contains warning or error messages that should be reviewed.';
    } else {
      additionalContext = `✅ Command executed successfully at ${new Date().toISOString()}`;
    }
    
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext
      }
    };
  }

  // Log file operations
  if (['Write', 'Edit'].includes(input.tool_name)) {
    const filePath = input.tool_input.file_path || 'unknown';
    console.log(`File modified: ${filePath}`);
    
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Modified ${filePath} - remember to test these changes`
      }
    };
  }

  return { continue: true };
}

// Usage
const result = query({
  prompt: 'Run tests and fix any issues',
  options: {
    hooks: {
      PostToolUse: [{ hooks: [postToolAnalysis] }]
    },
    allowedTools: ['Bash', 'Read', 'Write', 'Edit'],
    permissionMode: 'acceptEdits'
  }
});
```

### Example 4: Session lifecycle management

Track session initialization and cleanup:

```typescript
import { 
  query, 
  SessionStartHookInput, 
  SessionEndHookInput, 
  HookJSONOutput 
} from '@anthropic-ai/claude-agent-sdk';

async function sessionStartHook(
  input: SessionStartHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'SessionStart') {
    return { continue: true };
  }

  console.log('🚀 Session starting:', {
    sessionId: input.session_id,
    source: input.source,
    cwd: input.cwd,
    timestamp: new Date().toISOString()
  });

  // Initialize session-specific resources
  await initializeSessionResources(input.session_id);

  // Inject session context
  const context = `
Session initialized at ${new Date().toISOString()}
Working directory: ${input.cwd}
Session ID: ${input.session_id}
You have access to Read, Write, and Bash tools.
  `.trim();

  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  };
}

async function sessionEndHook(
  input: SessionEndHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'SessionEnd') {
    return { continue: true };
  }

  console.log('🏁 Session ending:', {
    sessionId: input.session_id,
    reason: input.reason,
    transcriptPath: input.transcript_path,
    timestamp: new Date().toISOString()
  });

  // Cleanup session resources
  await cleanupSessionResources(input.session_id);

  return { continue: true };
}

// Usage with lifecycle hooks
async function managedSession() {
  for await (const message of query({
    prompt: 'Analyze the codebase and generate a report',
    options: {
      hooks: {
        SessionStart: [{ hooks: [sessionStartHook] }],
        SessionEnd: [{ hooks: [sessionEndHook] }]
      },
      maxTurns: 15
    }
  })) {
    if (message.type === 'result') {
      console.log('Analysis complete:', message.result);
    }
  }
}

// Helper functions
async function initializeSessionResources(sessionId: string) {
  // Setup logging, temporary files, etc.
}

async function cleanupSessionResources(sessionId: string) {
  // Clean up temporary files, close connections, etc.
}
```

### Example 5: Multi-hook setup with comprehensive monitoring

Combine multiple hooks for complete observability and control:

```typescript
import { query, HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

// Audit logging hook
async function auditLogger(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: input.hook_event_name,
    sessionId: input.session_id,
    toolUseID,
    cwd: input.cwd
  };

  if (input.hook_event_name === 'PreToolUse') {
    logEntry.toolName = input.tool_name;
  }

  console.log('[AUDIT]', JSON.stringify(logEntry));
  return { continue: true };
}

// Permission enforcement hook
async function permissionEnforcer(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PreToolUse') {
    return { continue: true };
  }

  // Check with external permission service
  const hasPermission = await checkUserPermission(
    input.session_id,
    input.tool_name
  );

  if (!hasPermission) {
    return {
      decision: 'block',
      systemMessage: '⛔ Permission denied by policy',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'User lacks required permissions for this tool'
      }
    };
  }

  return { decision: 'approve' };
}

// Error handling wrapper
function withErrorHandling(hook: HookCallback): HookCallback {
  return async (input, toolUseID, options) => {
    try {
      return await hook(input, toolUseID, options);
    } catch (error) {
      console.error('Hook error:', error);
      // Continue on hook errors unless critical
      return { continue: true };
    }
  };
}

// Complete agent setup
async function comprehensiveAgent() {
  for await (const message of query({
    prompt: 'Review the codebase and suggest security improvements',
    options: {
      hooks: {
        PreToolUse: [
          { hooks: [withErrorHandling(auditLogger)] },
          { hooks: [withErrorHandling(permissionEnforcer)] },
          { matcher: 'Bash', hooks: [withErrorHandling(bashSecurityHook)] }
        ],
        PostToolUse: [
          { hooks: [withErrorHandling(auditLogger)] },
          { hooks: [withErrorHandling(postToolAnalysis)] }
        ],
        SessionStart: [
          { hooks: [withErrorHandling(sessionStartHook)] }
        ],
        SessionEnd: [
          { hooks: [withErrorHandling(sessionEndHook)] }
        ]
      },
      allowedTools: ['Read', 'Grep', 'Bash'],
      permissionMode: 'default',
      maxTurns: 20,
      cwd: './my-project'
    }
  })) {
    if (message.type === 'assistant') {
      // Process assistant messages
    } else if (message.type === 'result') {
      console.log('\n✅ Task completed');
      console.log(`Duration: ${message.duration_ms}ms`);
      console.log(`Cost: $${message.total_cost_usd}`);
      console.log(`Turns: ${message.num_turns}`);
      
      if (message.permission_denials.length > 0) {
        console.log('⚠️ Permission denials:', message.permission_denials);
      }
    }
  }
}

async function checkUserPermission(sessionId: string, toolName: string): Promise<boolean> {
  // Implement your permission logic
  return true;
}
```

### Example 6: Custom MCP tools with hooks

Combine custom tools with hooks for controlled execution:

```typescript
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Define custom weather tool
const weatherTool = tool(
  'get_weather',
  'Get current weather for a location',
  {
    location: z.string().describe('City name'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius')
  },
  async (args) => {
    const response = await fetch(
      `https://api.weather.com/v1/current?q=${args.location}&units=${args.units}`
    );
    const data = await response.json();
    return {
      content: [{
        type: 'text',
        text: `Temperature: ${data.temp}°\nConditions: ${data.conditions}`
      }]
    };
  }
);

// Create MCP server
const weatherServer = createSdkMcpServer({
  name: 'weather-tools',
  version: '1.0.0',
  tools: [weatherTool]
});

// Hook to log custom tool usage
async function mcpToolLogger(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name === 'PreToolUse' && 
      input.tool_name.startsWith('mcp__')) {
    console.log('MCP tool called:', input.tool_name);
  }
  return { continue: true };
}

// Usage
async function weatherAgent() {
  for await (const message of query({
    prompt: 'What is the weather in San Francisco?',
    options: {
      mcpServers: {
        'weather': weatherServer
      },
      allowedTools: ['mcp__weather__get_weather'],
      hooks: {
        PreToolUse: [{ hooks: [mcpToolLogger] }]
      }
    }
  })) {
    if (message.type === 'result') {
      console.log(message.result);
    }
  }
}
```

## Best practices and patterns

### Type-safe hook implementations

Use TypeScript type guards for type-safe hook handling:

```typescript
function isPreToolUseInput(input: HookInput): input is PreToolUseHookInput {
  return input.hook_event_name === 'PreToolUse';
}

async function typeSafeHook(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (isPreToolUseInput(input)) {
    // TypeScript now knows input has tool_name and tool_input
    console.log('Tool:', input.tool_name);
    console.log('Input:', input.tool_input);
  }
  return { continue: true };
}
```

### Error handling in hooks

Always handle errors gracefully to prevent hook failures from breaking agent execution:

```typescript
async function resilientHook(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  try {
    // Hook logic here
    const result = await externalService();
    return { continue: true };
  } catch (error) {
    console.error('Hook error:', error);
    // Decide whether to continue or block on error
    return {
      continue: true,  // Continue despite error
      systemMessage: 'Warning: Hook validation unavailable'
    };
  }
}
```

### Cancellation support

Respect the AbortSignal for long-running operations:

```typescript
async function cancellableHook(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (options.signal.aborted) {
    return { continue: false, reason: 'Operation cancelled' };
  }

  // Pass signal to async operations
  try {
    await performAsyncCheck({ signal: options.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      return { continue: false, reason: 'Operation cancelled' };
    }
    throw error;
  }

  return { continue: true };
}
```

### Structured logging for observability

Implement structured logging for better debugging:

```typescript
async function structuredLogger(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    hookEvent: input.hook_event_name,
    sessionId: input.session_id,
    toolUseID
  };

  // Add event-specific data
  if (input.hook_event_name === 'PreToolUse') {
    logEntry.toolName = input.tool_name;
  }

  console.log(JSON.stringify(logEntry));
  return { continue: true };
}
```

## Key considerations

**Performance**: Keep hook logic lightweight since hooks block the agent loop. Avoid expensive synchronous operations and implement timeouts for external service calls.

**Security**: Hooks run with your application's credentials and permissions. Always validate inputs, never log sensitive data, and fail securely (deny by default) when external checks fail.

**Streaming limitations**: Some edge cases exist with hooks in streaming mode. SessionStart events may not fire consistently when using AsyncIterable prompts (GitHub issue #30). Single-string prompts work reliably.

**Hook execution order**: Multiple hooks for the same event execute sequentially in the order they're registered. PreToolUse hooks that deny permission prevent tool execution and subsequent hooks.

**Type safety**: Use TypeScript discriminated unions and type guards to safely handle different hook input types. The `hook_event_name` property enables type narrowing.

## Installation and setup

Install the SDK:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

Set your API key:

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

Basic usage:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function main() {
  for await (const message of query({
    prompt: 'Your task here',
    options: {
      hooks: {
        PreToolUse: [{ hooks: [yourHook] }]
      }
    }
  })) {
    if (message.type === 'result') {
      console.log(message.result);
    }
  }
}

main();
```

The hooks system provides the foundation for building production-ready agents with proper security, observability, and control over autonomous operations.