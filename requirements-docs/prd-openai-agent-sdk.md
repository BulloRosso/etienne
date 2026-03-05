# Coding Agent openai-agent-sdk

I want to add a third coding agent in the backend at backend/src/claude/openai-agent-sdk. It will be based on https://openai.github.io/openai-agents-js

We must focus ont these items when integrating the SDK:
* **Agents-as-tools** orchestration
* Activate and use the SQLite **session management** feature
* Connect and map the **stream events** of the SDK to our existing events system (we won't introduce new events!)
* Experimental Codex Tool

## About the SDK

Build text and voice agents with a small set of primitives.

Let’s build 
Text Agent
Voice Agent
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant.',
});

const result = await run(
  agent,
  'Write a haiku about recursion in programming.',
);

console.log(result.finalOutput);

Overview
The OpenAI Agents SDK for TypeScript enables you to build agentic AI apps in a lightweight, easy-to-use package with very few abstractions. It’s a production-ready upgrade of our previous experimentation for agents, Swarm, that’s also available in Python. The Agents SDK has a very small set of primitives:

Agents, which are LLMs equipped with instructions and tools
Agents as tools / Handoffs, which allow agents to delegate to other agents for specific tasks
Guardrails, which enable the inputs to agents to be validated
In combination with TypeScript, these primitives are powerful enough to express complex relationships between tools and agents, and allow you to build real-world applications without a steep learning curve. In addition, the SDK comes with built-in tracing that lets you visualize and debug your agentic flows, as well as evaluate them and even fine-tune models for your application.

Why use the Agents SDK
The SDK has two driving design principles:

Enough features to be worth using, but few enough primitives to make it quick to learn.
Works great out of the box, but you can customize exactly what happens.
Here are the main features of the SDK:

Agent loop: A built-in agent loop that handles tool invocation, sends results back to the LLM, and continues until the task is complete.
TypeScript-first: Orchestrate and chain agents using native TypeScript language features, without needing to learn new abstractions.
Agents as tools / Handoffs: A powerful mechanism for coordinating and delegating work across multiple agents.
Guardrails: Run input validation and safety checks in parallel with agent execution, and fail fast when checks do not pass.
Function tools: Turn any TypeScript function into a tool with automatic schema generation and Zod-powered validation.
MCP server tool calling: Built-in MCP server tool integration that works the same way as function tools.
Sessions: A persistent memory layer for maintaining working context within an agent loop.
Human in the loop: Built-in mechanisms for involving humans across agent runs.
Tracing: Built-in tracing for visualizing, debugging, and monitoring workflows, with support for the OpenAI suite of evaluation, fine-tuning, and distillation tools.
Realtime Agents: Build powerful voice agents with features such as automatic interruption detection, context management, guardrails, and more.
Installation
Terminal window
npm install @openai/agents zod

The SDK requires Zod v4; installing zod via npm will fetch the latest v4 release.

Choose your starting point
Most first-time users only need one of these entry points:

Start with	Use it when	Notes
@openai/agents	You are building most text or voice applications.	Recommended default. It includes the OpenAI provider setup and exposes voice APIs under @openai/agents/realtime.
@openai/agents-realtime	You only need the standalone Realtime package.	Useful for browser-only voice apps or when you want a narrower package boundary.
Lower-level packages (@openai/agents-core, @openai/agents-openai, @openai/agents-extensions)	You need lower-level composition, custom provider wiring, or specific integrations.	Most new users can ignore these until they have a concrete need.
Hello world example
Hello World
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant',
});

const result = await run(
  agent,
  'Write a haiku about recursion in programming.',
);
console.log(result.finalOutput);

// Code within the code,
// Functions calling themselves,
// Infinite loop's dance.

(If running this, ensure you set the OPENAI_API_KEY environment variable)

Terminal window
export OPENAI_API_KEY=sk-...

## Agent orchestration

Agent Orchestration
Orchestration refers to the flow of agents in your app. Which agents run, in what order, and how do they decide what happens next? There are two main ways to orchestrate agents:

Read this page after the Quickstart or the Agents guide. This page is about workflow design across multiple agents, not the Agent constructor itself.

Allowing the LLM to make decisions: this uses the intelligence of an LLM to plan, reason, and decide on what steps to take based on that.
Orchestrating via code: determining the flow of agents via your code.
You can mix and match these patterns. Each has their own tradeoffs, described below.

Orchestrating via LLM
An agent is an LLM equipped with instructions, tools and handoffs. This means that given an open-ended task, the LLM can autonomously plan how it will tackle the task, using tools to take actions and acquire data, and using handoffs to delegate tasks to sub-agents. For example, a research agent could be equipped with tools like:

Web search to find information online
File search and retrieval to search through proprietary data and connections
Computer use to take actions on a computer
Code execution to do data analysis
Handoffs to specialized agents that are great at planning, report writing and more.
Core SDK patterns
In the Agents SDK, two orchestration patterns come up most often:

Pattern	How it works	Best when
Agents as tools	A manager agent keeps control of the conversation and calls specialist agents through agent.asTool().	You want one agent to own the final answer, combine outputs from multiple specialists, or enforce shared guardrails in one place.
Handoffs	A triage agent routes the conversation to a specialist, and that specialist becomes the active agent for the rest of the turn.	You want the specialist to speak directly to the user, keep prompts focused, or use different instructions/models per specialist.
Use agents as tools when the specialist should help with a subtask but should not take over the user-facing conversation. The manager stays responsible for deciding which tools to call and how to present the final response. See the tools guide for the API details, and the agents guide for a side-by-side example.

Use handoffs when routing itself is part of the workflow and you want the selected specialist to own the next part of the conversation. The handoff preserves the conversation context while narrowing the active instructions to the specialist. See the handoffs guide for the API, and the quickstart for the smallest end-to-end example.

You can combine the two patterns. A triage agent might hand off to a specialist, and that specialist can still use other agents as tools for bounded subtasks.

This pattern is great when the task is open-ended and you want to rely on the intelligence of an LLM. The most important tactics here are:

Invest in good prompts. Make it clear what tools are available, how to use them, and what parameters it must operate within.
Monitor your app and iterate on it. See where things go wrong, and iterate on your prompts.
Allow the agent to introspect and improve. For example, run it in a loop, and let it critique itself; or, provide error messages and let it improve.
Have specialized agents that excel in one task, rather than having a general purpose agent that is expected to be good at anything.
Invest in evals. This lets you train your agents to improve and get better at tasks.
If you want the SDK primitives behind this style of orchestration, start with tools, handoffs, and running agents.

Orchestrating via code
While orchestrating via LLM is powerful, orchestrating via code makes tasks more deterministic and predictable, in terms of speed, cost and performance. Common patterns here are:

Using structured outputs to generate well formed data that you can inspect with your code. For example, you might ask an agent to classify the task into a few categories, and then pick the next agent based on the category.
Chaining multiple agents by transforming the output of one into the input of the next. You can decompose a task like writing a blog post into a series of steps - do research, write an outline, write the blog post, critique it, and then improve it.
Running the agent that performs the task in a while loop with an agent that evaluates and provides feedback, until the evaluator says the output passes certain criteria.
Running multiple agents in parallel, e.g. via JavaScript primitives like Promise.all. This is useful for speed when you have multiple tasks that don’t depend on each other.
We have a number of examples in examples/agent-patterns.

## Sessions

Sessions
Sessions give the Agents SDK a persistent memory layer. Provide any object that implements the Session interface to Runner.run, and the SDK handles the rest. When a session is present, the runner automatically:

Fetches previously stored conversation items and prepends them to the next turn.
Persists new user input and assistant output after each run completes.
Keeps the session available for future turns, whether you call the runner with new user text or resume from an interrupted RunState.
This removes the need to manually call toInputList() or stitch history between turns. The TypeScript SDK ships with two implementations: OpenAIConversationsSession for the Conversations API and MemorySession, which is intended for local development. Because they share the Session interface, you can plug in your own storage backend. For inspiration beyond the Conversations API, explore the sample session backends under examples/memory/ (Prisma, file-backed, and more). When you use an OpenAI Responses model, wrap any session with OpenAIResponsesCompactionSession to automatically shrink stored conversation history via responses.compact.

Tip: To run the OpenAIConversationsSession examples on this page, set the OPENAI_API_KEY environment variable (or provide an apiKey when constructing the session) so the SDK can call the Conversations API.

Use sessions when you want the SDK to manage client-side memory for you. If you are already using OpenAI server-managed state with conversationId or previousResponseId, you usually do not also need a session for the same conversation history.

Getting started
Quick start
Use OpenAIConversationsSession to sync memory with the Conversations API, or swap in any other Session implementation.

Use the Conversations API as session memory
import { Agent, OpenAIConversationsSession, run } from '@openai/agents';

const agent = new Agent({
  name: 'TourGuide',
  instructions: 'Answer with compact travel facts.',
});

// Any object that implements the Session interface works here. This example uses
// the built-in OpenAIConversationsSession, but you can swap in a custom Session.
const session = new OpenAIConversationsSession();

const firstTurn = await run(agent, 'What city is the Golden Gate Bridge in?', {
  session,
});
console.log(firstTurn.finalOutput); // "San Francisco"

const secondTurn = await run(agent, 'What state is it in?', { session });
console.log(secondTurn.finalOutput); // "California"

Reusing the same session instance ensures the agent receives the full conversation history before every turn and automatically persists new items. Switching to a different Session implementation requires no other code changes.

For local demos, tests, or process-local chat state, MemorySession provides the same interface without talking to OpenAI:

Use MemorySession for local state
import { Agent, MemorySession, run } from '@openai/agents';

const agent = new Agent({
  name: 'TourGuide',
  instructions: 'Answer with compact travel facts.',
});

const session = new MemorySession();
const result = await run(agent, 'What city is the Golden Gate Bridge in?', {
  session,
});

console.log(result.finalOutput);

OpenAIConversationsSession constructor options:

Option	Type	Notes
conversationId	string	Reuse an existing conversation instead of creating one lazily.
client	OpenAI	Pass a preconfigured OpenAI client.
apiKey	string	API key used when creating an internal OpenAI client.
baseURL	string	Base URL for OpenAI-compatible endpoints.
organization	string	OpenAI organization ID for requests.
project	string	OpenAI project ID for requests.
MemorySession constructor options:

Option	Type	Notes
sessionId	string	Stable identifier for logs or tests. Generated automatically by default.
initialItems	AgentInputItem[]	Seed the session with existing history.
logger	Logger	Override the logger used for debug output.
MemorySession stores everything in local process memory, so it is reset when your process exits.

If you need to pre-create a conversation ID before constructing the session, use startOpenAIConversationsSession(client?) and pass the returned ID as conversationId.

Core session behavior
How the runner uses sessions
Before each run it retrieves the session history, merges it with the new turn’s input, and passes the combined list to your agent.
After a non-streaming run one call to session.addItems() persists both the original user input and the model outputs from the latest turn.
For streaming runs it writes the user input first and appends streamed outputs once the turn completes.
When resuming from RunResult.state (for approvals or other interruptions) keep passing the same session. The resumed turn is added to memory without re-preparing the input.
Inspecting and editing history
Sessions expose simple CRUD helpers so you can build “undo”, “clear chat”, or audit features.

Read and edit stored items
import { OpenAIConversationsSession } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents-core';

// Replace OpenAIConversationsSession with any other Session implementation that
// supports get/add/pop/clear if you store history elsewhere.
const session = new OpenAIConversationsSession({
  conversationId: 'conv_123', // Resume an existing conversation if you have one.
});

const history = await session.getItems();
console.log(`Loaded ${history.length} prior items.`);

const followUp: AgentInputItem[] = [
  {
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: 'Let’s continue later.' }],
  },
];
await session.addItems(followUp);

const undone = await session.popItem();

if (undone?.type === 'message') {
  console.log(undone.role); // "user"
}

await session.clearSession();

session.getItems() returns the stored AgentInputItem[]. Call popItem() to remove the last entry—useful for user corrections before you rerun the agent.

Custom storage and merge behavior
Bring your own storage
Implement the Session interface to back memory with Redis, DynamoDB, SQLite, or another datastore. Only five asynchronous methods are required.

Custom in-memory session implementation
import { Agent, run } from '@openai/agents';
import { randomUUID } from '@openai/agents-core/_shims';
import { getLogger } from '@openai/agents-core';
import type { AgentInputItem, Session } from '@openai/agents-core';

/**
 * Minimal example of a Session implementation; swap this class for any storage-backed version.
 */
export class CustomMemorySession implements Session {
  private readonly sessionId: string;
  private readonly logger: ReturnType<typeof getLogger>;

  private items: AgentInputItem[];

  constructor(
    options: {
      sessionId?: string;
      initialItems?: AgentInputItem[];
      logger?: ReturnType<typeof getLogger>;
    } = {},
  ) {
    this.sessionId = options.sessionId ?? randomUUID();
    this.items = options.initialItems
      ? options.initialItems.map(cloneAgentItem)
      : [];
    this.logger = options.logger ?? getLogger('openai-agents:memory-session');
  }

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (limit === undefined) {
      const cloned = this.items.map(cloneAgentItem);
      this.logger.debug(
        `Getting items from memory session (${this.sessionId}): ${JSON.stringify(cloned)}`,
      );
      return cloned;
    }
    if (limit <= 0) {
      return [];
    }
    const start = Math.max(this.items.length - limit, 0);
    const items = this.items.slice(start).map(cloneAgentItem);
    this.logger.debug(
      `Getting items from memory session (${this.sessionId}): ${JSON.stringify(items)}`,
    );
    return items;
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const cloned = items.map(cloneAgentItem);
    this.logger.debug(
      `Adding items to memory session (${this.sessionId}): ${JSON.stringify(cloned)}`,
    );
    this.items = [...this.items, ...cloned];
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    if (this.items.length === 0) {
      return undefined;
    }
    const item = this.items[this.items.length - 1];
    const cloned = cloneAgentItem(item);
    this.logger.debug(
      `Popping item from memory session (${this.sessionId}): ${JSON.stringify(cloned)}`,
    );
    this.items = this.items.slice(0, -1);
    return cloned;
  }

  async clearSession(): Promise<void> {
    this.logger.debug(`Clearing memory session (${this.sessionId})`);
    this.items = [];
  }
}

function cloneAgentItem<T extends AgentInputItem>(item: T): T {
  return structuredClone(item);
}

const agent = new Agent({
  name: 'MemoryDemo',
  instructions: 'Remember the running total.',
});

// Using the above custom memory session implementation here
const session = new CustomMemorySession({
  sessionId: 'session-123-4567',
});

const first = await run(agent, 'Add 3 to the total.', { session });
console.log(first.finalOutput);

const second = await run(agent, 'Add 4 more.', { session });
console.log(second.finalOutput);

Custom sessions let you enforce retention policies, add encryption, or attach metadata to each conversation turn before persisting it.

Control how history and new items merge
When you pass an array of AgentInputItems as the run input, provide a sessionInputCallback to merge them with stored history deterministically. The runner loads the existing history, calls your callback before the model invocation, and hands the returned array to the model as the turn’s complete input. This hook is ideal for trimming old items, deduplicating tool results, or highlighting only the context you want the model to see.

Truncate history with sessionInputCallback
import { Agent, OpenAIConversationsSession, run } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents-core';

const agent = new Agent({
  name: 'Planner',
  instructions: 'Track outstanding tasks before responding.',
});

// Any Session implementation can be passed here; customize storage as needed.
const session = new OpenAIConversationsSession();

const todoUpdate: AgentInputItem[] = [
  {
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_text', text: 'Add booking a hotel to my todo list.' },
    ],
  },
];

await run(agent, todoUpdate, {
  session,
  // function that combines session history with new input items before the model call
  sessionInputCallback: (history, newItems) => {
    const recentHistory = history.slice(-8);
    return [...recentHistory, ...newItems];
  },
});

For string inputs the runner merges history automatically, so the callback is optional. The callback only runs when your turn input is already an item array.

If you are also using conversationId or previousResponseId, keep at least one new item from the current turn in the callback result. Those server-managed APIs depend on the current-turn delta. If the callback drops every new item, the SDK restores the original new inputs and logs a warning instead of sending an empty delta.

Resumable runs
Handling approvals and resumable runs
Human-in-the-loop flows often pause a run to wait for approval:

Resume a run with the same session
import { Agent, MemorySession, Runner } from '@openai/agents';

const agent = new Agent({
  name: 'Trip Planner',
  instructions: 'Plan trips and ask for approval before booking anything.',
});

const runner = new Runner();
const session = new MemorySession();

const result = await runner.run(agent, 'Search the itinerary', {
  session,
});

if (result.interruptions?.length) {
  // ... collect user feedback, then resume the agent in a later turn.
  for (const interruption of result.interruptions) {
    result.state.approve(interruption);
  }

  const continuation = await runner.run(agent, result.state, { session });
  console.log(continuation.finalOutput);
}

When you resume from a previous RunState, the new turn is appended to the same memory record to preserve a single conversation history. Human-in-the-loop (HITL) flows stay fully compatible—approval checkpoints still round-trip through RunState while the session keeps the conversation history complete.

Advanced: history compaction
Compact OpenAI Responses history automatically
OpenAIResponsesCompactionSession decorates any Session and uses the OpenAI Responses API to replace a long stored history with a shorter equivalent list of conversation items. After each persisted turn the runner passes the latest responseId into runCompaction, which calls responses.compact when your decision hook returns true. Depending on compactionMode, the request is built either from the latest Responses API chain or from the session’s current items. The default trigger compacts once at least 10 non-user items have accumulated; override shouldTriggerCompaction to base the decision on token counts or custom heuristics. After compaction returns, the decorator clears the underlying session and rewrites it with the reduced item list, so avoid pairing it with OpenAIConversationsSession, which uses a different server-managed history flow.

Decorate a session with OpenAIResponsesCompactionSession
import {
  Agent,
  MemorySession,
  OpenAIResponsesCompactionSession,
  run,
} from '@openai/agents';

const agent = new Agent({
  name: 'Support',
  instructions: 'Answer briefly and keep track of prior context.',
  model: 'gpt-5.2',
});

// Wrap any Session to trigger responses.compact once history grows beyond your threshold.
const session = new OpenAIResponsesCompactionSession({
  // You can pass any Session implementation except OpenAIConversationsSession
  underlyingSession: new MemorySession(),
  // (optional) The model used for calling responses.compact API
  model: 'gpt-5.2',
  // (optional) your custom logic here
  shouldTriggerCompaction: ({ compactionCandidateItems }) => {
    return compactionCandidateItems.length >= 12;
  },
});

await run(agent, 'Summarize order #8472 in one sentence.', { session });
await run(agent, 'Remind me of the shipping address.', { session });

// Compaction runs automatically after each persisted turn. You can also force it manually.
await session.runCompaction({ force: true });

OpenAIResponsesCompactionSession constructor options:

Option	Type	Notes
client	OpenAI	OpenAI client used for responses.compact.
underlyingSession	Session	Backing session store to clear/rewrite with compacted items. Defaults to an in-memory session for demos and must not be OpenAIConversationsSession.
model	OpenAI.ResponsesModel	Model used for compaction requests. Defaults to the SDK’s current default OpenAI model.
compactionMode	'auto' | 'previous_response_id' | 'input'	Controls whether compaction uses server response chaining or local input items.
shouldTriggerCompaction	(context) => boolean | Promise<boolean>	Custom trigger hook based on responseId, compactionMode, candidate items, and current session items.
compactionMode: 'previous_response_id' is useful when you are already chaining turns with Responses API response IDs. compactionMode: 'input' rebuilds compaction requests from the current session items instead, which is helpful when the response chain is unavailable or you want the underlying session contents to be the source of truth.

runCompaction(args) options:

Option	Type	Notes
responseId	string	Latest Responses API response id for previous_response_id mode.
compactionMode	'auto' | 'previous_response_id' | 'input'	Optional per-call override of the configured mode.
store	boolean	Indicates whether the last run stored server state.
force	boolean	Bypass shouldTriggerCompaction and compact immediately.
Manual compaction for low-latency streaming
Compaction clears and rewrites the underlying session, so the SDK waits for it before resolving a streaming run. If compaction is heavy, result.completed can stay pending for a few seconds after the last output token. For low-latency streaming or faster turn-taking, disable auto-compaction and call runCompaction yourself between turns (or during idle time).

Disable auto-compaction and compact between turns
import {
  Agent,
  MemorySession,
  OpenAIResponsesCompactionSession,
  run,
} from '@openai/agents';

const agent = new Agent({
  name: 'Support',
  instructions: 'Answer briefly and keep track of prior context.',
  model: 'gpt-5.2',
});

// Disable auto-compaction to avoid delaying stream completion.
const session = new OpenAIResponsesCompactionSession({
  underlyingSession: new MemorySession(),
  shouldTriggerCompaction: () => false,
});

const result = await run(agent, 'Share the latest ticket update.', {
  session,
  stream: true,
});

// Wait for the streaming run to finish before compacting.
await result.completed;

// Choose force based on your own thresholds or heuristics, between turns or during idle time.
await session.runCompaction({ force: true });

You can call runCompaction({ force: true }) at any time to shrink history before archiving or handoff. Enable debug logs with DEBUG=openai-agents:openai:compaction to trace compaction decisions.

## Streaming

Streaming
The Agents SDK can deliver output from the model and other execution steps incrementally. Streaming keeps your UI responsive and avoids waiting for the entire final result before updating the user.

Enabling streaming
Pass a { stream: true } option to Runner.run() to obtain a streaming object rather than a full result:

Enabling streaming
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a storyteller. You will be given a topic and you will tell a story about it.',
});

const result = await run(agent, 'Tell me a story about a cat.', {
  stream: true,
});

When streaming is enabled the returned stream implements the AsyncIterable interface. Each yielded event is an object describing what happened within the run. The stream yields one of three event types, each describing a different part of the agent’s execution. Most applications only want the model’s text though, so the stream provides helpers.

Get the text output
Call stream.toTextStream() to obtain a stream of the emitted text. When compatibleWithNodeStreams is true the return value is a regular Node.js Readable. We can pipe it directly into process.stdout or another destination.

Logging out the text as it arrives
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a storyteller. You will be given a topic and you will tell a story about it.',
});

const result = await run(agent, 'Tell me a story about a cat.', {
  stream: true,
});

result
  .toTextStream({
    compatibleWithNodeStreams: true,
  })
  .pipe(process.stdout);

The promise stream.completed resolves once the run and all pending callbacks are completed. Always await it if you want to ensure there is no more output. This includes post-processing work such as session persistence or history compaction hooks that finish after the last text token arrives.

toTextStream() only emits assistant text. Tool calls, handoffs, approvals, and other runtime events are available from the full event stream.

Listen to all events
You can use a for await loop to inspect each event as it arrives. Useful information includes low level model events, any agent switches and SDK specific run information:

Listening to all events
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a storyteller. You will be given a topic and you will tell a story about it.',
});

const result = await run(agent, 'Tell me a story about a cat.', {
  stream: true,
});

for await (const event of result) {
  // these are the raw events from the model
  if (event.type === 'raw_model_stream_event') {
    console.log(`${event.type} %o`, event.data);
  }
  // agent updated events
  if (event.type === 'agent_updated_stream_event') {
    console.log(`${event.type} %s`, event.agent.name);
  }
  // Agent SDK specific events
  if (event.type === 'run_item_stream_event') {
    console.log(`${event.type} %o`, event.item);
  }
}

See the streamed example for a fully worked script that prints both the plain text stream and the raw event stream.

Responses WebSocket transport (optional)
The streaming APIs on this page also work with the OpenAI Responses WebSocket transport.

Enable it globally with setOpenAIResponsesTransport('websocket'), or use your own OpenAIProvider with useResponsesWebSocket: true.

You do not need withResponsesWebSocketSession(...) or a custom OpenAIProvider just to stream over WebSocket. If reconnecting between runs is acceptable, run() / Runner.run(..., { stream: true }) still works after enabling the transport.

Use withResponsesWebSocketSession(...) or a custom OpenAIProvider / Runner when you want connection reuse and more explicit provider lifecycle control.

Continuation with previousResponseId uses the same semantics as the HTTP transport. The difference is just the transport and connection lifecycle.

If you build the provider yourself, remember to call await provider.close() when shutting down. Websocket-backed model wrappers are cached for reuse by default, and closing the provider releases those connections. withResponsesWebSocketSession(...) gives you the same reuse but scopes cleanup to a single callback automatically.

See examples/basic/stream-ws.ts for a complete example with streaming, tool calls, approvals, and previousResponseId.

Event types
The stream yields three different event types:

raw_model_stream_event
RunRawModelStreamEvent
import type { RunRawModelStreamEvent, RunStreamEvent } from '@openai/agents';

export function isRunRawModelStreamEvent(
  event: RunStreamEvent,
): event is RunRawModelStreamEvent {
  return event.type === 'raw_model_stream_event';
}

Example:

{
  "type": "raw_model_stream_event",
  "data": {
    "type": "output_text_delta",
    "delta": "Hello"
  }
}

run_item_stream_event
RunItemStreamEvent
import type { RunItemStreamEvent, RunStreamEvent } from '@openai/agents';

export function isRunItemStreamEvent(
  event: RunStreamEvent,
): event is RunItemStreamEvent {
  return event.type === 'run_item_stream_event';
}

name identifies which kind of item was produced:

name	Meaning
message_output_created	A message output item was created.
handoff_requested	The model requested a handoff.
handoff_occurred	The runtime completed a handoff to another agent.
tool_called	A tool call item was emitted.
tool_output	A tool result item was emitted.
reasoning_item_created	A reasoning item was emitted.
tool_approval_requested	A tool call paused for human approval.
Example handoff payload:

{
  "type": "run_item_stream_event",
  "name": "handoff_occurred",
  "item": {
    "type": "handoff_call",
    "id": "h1",
    "status": "completed",
    "name": "transfer_to_refund_agent"
  }
}

agent_updated_stream_event
RunAgentUpdatedStreamEvent
import type {
  RunAgentUpdatedStreamEvent,
  RunStreamEvent,
} from '@openai/agents';

export function isRunAgentUpdatedStreamEvent(
  event: RunStreamEvent,
): event is RunAgentUpdatedStreamEvent {
  return event.type === 'agent_updated_stream_event';
}

Example:

{
  "type": "agent_updated_stream_event",
  "agent": {
    "name": "Refund Agent"
  }
}

Human in the loop while streaming
Streaming is compatible with handoffs that pause execution (for example when a tool requires approval). The interruptions field on the stream object exposes the pending approvals, and you can continue execution by calling state.approve() or state.reject() for each of them. After the stream pauses, stream.completed resolves and stream.interruptions contains the approvals to handle. Executing again with { stream: true } resumes streaming output.

Handling human approval while streaming
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a storyteller. You will be given a topic and you will tell a story about it.',
});

let stream = await run(
  agent,
  'What is the weather in San Francisco and Oakland?',
  { stream: true },
);
stream.toTextStream({ compatibleWithNodeStreams: true }).pipe(process.stdout);
await stream.completed;

while (stream.interruptions?.length) {
  console.log(
    'Human-in-the-loop: approval required for the following tool calls:',
  );
  const state = stream.state;
  for (const interruption of stream.interruptions) {
    const approved = confirm(
      `Agent ${interruption.agent.name} would like to use the tool ${interruption.name} with "${interruption.arguments}". Do you approve?`,
    );
    if (approved) {
      state.approve(interruption);
    } else {
      state.reject(interruption);
    }
  }

  // Resume execution with streaming output
  stream = await run(agent, state, { stream: true });
  const textStream = stream.toTextStream({ compatibleWithNodeStreams: true });
  textStream.pipe(process.stdout);
  await stream.completed;
}

A fuller example that interacts with the user is human-in-the-loop-stream.ts.

Tips
Remember to wait for stream.completed before exiting to ensure all output has been flushed.
The initial { stream: true } option only applies to the call where it is provided. If you re-run with a RunState you must specify the option again.
If your application only cares about the textual result prefer toTextStream() to avoid dealing with individual event objects.
With streaming and the event system you can integrate an agent into a chat interface, terminal application or any place where users benefit from incremental updates.

## Tools

Tools
Tools let an Agent take actions – fetch data, call external APIs, execute code, or even use a computer. The JavaScript/TypeScript SDK supports six categories:

Read this page after Agents once you know which agent should own the task and you want to give it capabilities. If you are still deciding between delegation patterns, see Agent orchestration.

Hosted OpenAI tools – run alongside the model on OpenAI servers. (web search, file search, code interpreter, image generation)
Built-in execution tools – SDK-provided tools that execute outside the model. (computer use and apply_patch run locally; shell can run locally or in hosted containers)
Function tools – wrap any local function with a JSON schema so the LLM can call it.
Agents as tools – expose an entire Agent as a callable tool.
MCP servers – attach a Model Context Protocol server (local or remote).
Experimental: Codex tool – wrap the Codex SDK as a function tool to run workspace-aware tasks.
Tool categories
The rest of this guide first covers each tool category, then summarizes cross-cutting tool selection and prompting guidance.

1. Hosted tools (OpenAI Responses API)
When you use the OpenAIResponsesModel you can add the following built‑in tools:

Tool	Type string	Purpose
Web search	'web_search'	Internet search.
File / retrieval search	'file_search'	Query vector stores hosted on OpenAI.
Code Interpreter	'code_interpreter'	Run code in a sandboxed environment.
Image generation	'image_generation'	Generate images based on text.
Hosted tools
import {
  Agent,
  codeInterpreterTool,
  fileSearchTool,
  imageGenerationTool,
  webSearchTool,
} from '@openai/agents';

const agent = new Agent({
  name: 'Travel assistant',
  tools: [
    webSearchTool({ searchContextSize: 'medium' }),
    fileSearchTool('VS_ID', { maxNumResults: 3 }),
    codeInterpreterTool(),
    imageGenerationTool({ size: '1024x1024' }),
  ],
});

The SDK provides helper functions that return hosted tool definitions:

Helper function	Notes
webSearchTool(options?)	JS-friendly options such as searchContextSize, userLocation, and filters.allowedDomains.
fileSearchTool(ids, options?)	Accepts one or more vector store IDs as the first argument, plus options like maxNumResults, includeSearchResults, rankingOptions, and filters.
codeInterpreterTool(options?)	Defaults to an auto-managed container when no container is provided.
imageGenerationTool(options?)	Supports image generation configuration such as model, size, quality, background, inputFidelity, inputImageMask, moderation, outputCompression, partialImages, and output format.
These helpers map JavaScript/TypeScript-friendly option names to the underlying OpenAI Responses API tool payloads. Refer to the official OpenAI tools guide for the full tool schemas and advanced options like ranking options or semantic filters.

2. Built-in execution tools
These tools are built into the SDK, but execution happens outside the model response itself:

Computer use – implement the Computer interface and pass it to computerTool(). This always runs against a local Computer implementation that you provide.
Shell – either provide a local Shell implementation, or configure a hosted container environment with shellTool({ environment }).
Apply patch – implement the Editor interface and pass it to applyPatchTool(). This always runs against a local Editor implementation that you provide.
The tool calls are still requested by the model, but your application or configured execution environment performs the work.

Built-in execution tools
import {
  Agent,
  applyPatchTool,
  computerTool,
  shellTool,
  Computer,
  Editor,
  Shell,
} from '@openai/agents';

const computer: Computer = {
  environment: 'browser',
  dimensions: [1024, 768],
  screenshot: async () => '',
  click: async () => {},
  doubleClick: async () => {},
  scroll: async () => {},
  type: async () => {},
  wait: async () => {},
  move: async () => {},
  keypress: async () => {},
  drag: async () => {},
};

const shell: Shell = {
  run: async () => ({
    output: [
      {
        stdout: '',
        stderr: '',
        outcome: { type: 'exit', exitCode: 0 },
      },
    ],
  }),
};

const editor: Editor = {
  createFile: async () => ({ status: 'completed' }),
  updateFile: async () => ({ status: 'completed' }),
  deleteFile: async () => ({ status: 'completed' }),
};

const agent = new Agent({
  name: 'Local tools agent',
  tools: [
    computerTool({ computer }),
    shellTool({ shell, needsApproval: true }),
    applyPatchTool({ editor, needsApproval: true }),
  ],
});

Computer tool specifics
computerTool() accepts either:

A concrete Computer instance.
An initializer function that creates a Computer per run.
A provider object with { create, dispose } when you need run-scoped setup and teardown.
Use needsApproval when computer actions should pause for user review, and onSafetyCheck when you want to acknowledge or reject pending safety checks raised during a computer action.

Shell tool specifics
shellTool() has two modes:

Local mode: provide shell, and optionally environment: { type: 'local', skills } plus needsApproval and onApproval for automatic approval handling.
Hosted container mode: provide environment with type: 'container_auto' or type: 'container_reference'.
In local mode, environment.skills lets you mount local skills by name, description, and filesystem path.

In hosted container mode, configure shellTool({ environment }) with either:

type: 'container_auto' to create a managed container for the run.
type: 'container_reference' to reuse an existing container by containerId.
Hosted container_auto environments support:

networkPolicy, including allowlists with domainSecrets.
fileIds for mounting uploaded files.
memoryLimit for container sizing.
skills, either by skill_reference or inline zip bundles.
Hosted shell environments do not accept shell, needsApproval, or onApproval, because the execution happens in the hosted container environment instead of your local process.

See examples/tools/local-shell.ts, examples/tools/container-shell-skill-ref.ts, and examples/tools/container-shell-inline-skill.ts for end-to-end usage.

Apply-patch tool specifics
applyPatchTool() mirrors the local approval flow from shellTool(): use needsApproval to pause before file edits and onApproval when you want an app-level callback to auto-approve or reject.

3. Function tools
You can turn any function into a tool with the tool() helper.

Function tool with Zod parameters
import { tool } from '@openai/agents';
import { z } from 'zod';

const getWeatherTool = tool({
  name: 'get_weather',
  description: 'Get the weather for a given city',
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    return `The weather in ${city} is sunny.`;
  },
});

Options reference
Field	Required	Description
name	No	Defaults to the function name (e.g., get_weather).
description	Yes	Clear, human-readable description shown to the LLM.
parameters	Yes	Either a Zod schema or a raw JSON schema object. Zod parameters automatically enable strict mode.
strict	No	When true (default), the SDK returns a model error if the arguments don’t validate. Set to false for fuzzy matching.
execute	Yes	(args, context, details) => string | unknown | Promise<...> – your business logic. Non-string outputs are serialized for the model. context is optional RunContext; details includes metadata like toolCall, resumeState, and signal.
errorFunction	No	Custom handler (context, error) => string for transforming internal errors into a user-visible string.
timeoutMs	No	Per-call timeout in milliseconds. Must be greater than 0 and less than or equal to 2147483647.
timeoutBehavior	No	Timeout mode: error_as_result (default) returns a model-visible timeout message, and raise_exception throws ToolTimeoutError.
timeoutErrorFunction	No	Custom handler (context, timeoutError) => string for timeout output when timeoutBehavior is error_as_result.
needsApproval	No	Require human approval before execution. See the human-in-the-loop guide.
isEnabled	No	Conditionally expose the tool per run; accepts a boolean or predicate.
inputGuardrails	No	Guardrails that run before the tool executes; can reject or throw. See Guardrails.
outputGuardrails	No	Guardrails that run after the tool executes; can reject or throw. See Guardrails.
Function tool timeouts
Use timeoutMs to bound each function tool invocation.

timeoutBehavior: 'error_as_result' (default) returns Tool '<name>' timed out after <timeoutMs>ms. to the model.
timeoutBehavior: 'raise_exception' throws ToolTimeoutError, which you can catch as part of run exceptions.
timeoutErrorFunction lets you customize timeout text in error_as_result mode.
Timeouts abort details.signal, so long-running tools can stop promptly when they listen for cancellation.
If you invoke a function tool directly, use invokeFunctionTool to enforce the same timeout behavior as normal agent runs.

Non‑strict JSON‑schema tools
If you need the model to guess invalid or partial input you can disable strict mode when using raw JSON schema:

Non-strict JSON schema tools
import { tool } from '@openai/agents';

interface LooseToolInput {
  text: string;
}

const looseTool = tool({
  description: 'Echo input; be forgiving about typos',
  strict: false,
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: true,
  },
  execute: async (input) => {
    // because strict is false we need to do our own verification
    if (typeof input !== 'object' || input === null || !('text' in input)) {
      return 'Invalid input. Please try again';
    }
    return (input as LooseToolInput).text;
  },
});

4. Agents as tools
Sometimes you want an Agent to assist another Agent without fully handing off the conversation. Use agent.asTool():

If you are still choosing between agent.asTool() and handoff(), compare the patterns in the Agents guide and Agent orchestration.

Agents as tools
import { Agent } from '@openai/agents';

const summarizer = new Agent({
  name: 'Summarizer',
  instructions: 'Generate a concise summary of the supplied text.',
});

const summarizerTool = summarizer.asTool({
  toolName: 'summarize_text',
  toolDescription: 'Generate a concise summary of the supplied text.',
});

const mainAgent = new Agent({
  name: 'Research assistant',
  tools: [summarizerTool],
});

Under the hood the SDK:

Creates a function tool with a single input parameter.
Runs the sub‑agent with that input when the tool is called.
Returns either the last message or the output extracted by customOutputExtractor.
When you run an agent as a tool, Agents SDK creates a runner with the default settings and run the agent with it within the function execution. If you want to provide any properties of runConfig or runOptions, you can pass them to the asTool() method to customize the runner’s behavior.

You can also set needsApproval and isEnabled on the agent tool via asTool() options to integrate with human‑in‑the‑loop flows and conditional tool availability.

Inside customOutputExtractor, use result.agentToolInvocation to inspect the current Agent.asTool() invocation. In that callback the result always comes from Agent.asTool(), so agentToolInvocation is always defined and exposes toolName, toolCallId, and toolArguments. Use result.runContext for the regular app context and toolInput. This metadata is scoped to the current nested invocation and is not serialized into RunState.

Read agent tool invocation metadata
import { Agent } from '@openai/agents';

const billingAgent = new Agent({
  name: 'Billing Agent',
  instructions: 'Handle billing questions and subscription changes.',
});

const billingTool = billingAgent.asTool({
  toolName: 'billing_agent',
  toolDescription: 'Handles customer billing questions.',
  customOutputExtractor(result) {
    console.log('tool', result.agentToolInvocation.toolName);
    // Direct invoke() calls may not have a model-generated tool call id.
    console.log('call', result.agentToolInvocation.toolCallId);
    console.log('args', result.agentToolInvocation.toolArguments);

    return String(result.finalOutput ?? '');
  },
});

const orchestrator = new Agent({
  name: 'Support Orchestrator',
  instructions: 'Delegate billing questions to the billing agent tool.',
  tools: [billingTool],
});

Advanced structured-input options for agent.asTool():

inputBuilder: maps structured tool args to the nested agent input payload.
includeInputSchema: includes the input JSON schema in the nested run for stronger schema-aware behavior.
resumeState: controls context reconciliation strategy when resuming nested serialized RunState: 'merge' (default) merges live approval/context state into the serialized state, 'replace' uses the current run context instead, and 'preferSerialized' resumes with the serialized context unchanged.
Streaming events from agent tools
Agent tools can stream all nested run events back to your app. Choose the hook style that fits how you construct the tool:

Streaming agent tools
import { Agent } from '@openai/agents';

const billingAgent = new Agent({
  name: 'Billing Agent',
  instructions: 'Answer billing questions and compute simple charges.',
});

const billingTool = billingAgent.asTool({
  toolName: 'billing_agent',
  toolDescription: 'Handles customer billing questions.',
  // onStream: simplest catch-all when you define the tool inline.
  onStream: (event) => {
    console.log(`[onStream] ${event.event.type}`, event);
  },
});

// on(eventName) lets you subscribe selectively (or use '*' for all).
billingTool.on('run_item_stream_event', (event) => {
  console.log('[on run_item_stream_event]', event);
});
billingTool.on('raw_model_stream_event', (event) => {
  console.log('[on raw_model_stream_event]', event);
});

const orchestrator = new Agent({
  name: 'Support Orchestrator',
  instructions: 'Delegate billing questions to the billing agent tool.',
  tools: [billingTool],
});

Event types match RunStreamEvent['type']: raw_model_stream_event, run_item_stream_event, agent_updated_stream_event.
onStream is the simplest “catch-all” and works well when you declare the tool inline (tools: [agent.asTool({ onStream })]). Use it if you do not need per-event routing.
on(eventName, handler) lets you subscribe selectively (or with '*') and is best when you need finer-grained handling or want to attach listeners after creation.
If you provide either onStream or any on(...) handler, the agent-as-tool will run in streaming mode automatically; without them it stays on the non-streaming path.
Handlers are invoked in parallel so a slow onStream callback will not block on(...) handlers (and vice versa).
toolCallId is provided when the tool was invoked via a model tool call; direct invoke() calls or provider quirks may omit it.
5. MCP servers
You can expose tools via Model Context Protocol (MCP) servers and attach them to an agent. For instance, you can use MCPServerStdio to spawn and connect to the stdio MCP server:

Local MCP server
import { Agent, MCPServerStdio } from '@openai/agents';

const server = new MCPServerStdio({
  fullCommand: 'npx -y @modelcontextprotocol/server-filesystem ./sample_files',
});

await server.connect();

const agent = new Agent({
  name: 'Assistant',
  mcpServers: [server],
});

See filesystem-example.ts for a complete example. Also, if you’re looking for a comprehensitve guide for MCP server tool integration, refer to MCP guide for details. When managing multiple servers (or partial failures), use connectMcpServers and the lifecycle guidance in the MCP guide.

6. Experimental: Codex tool
@openai/agents-extensions/experimental/codex provides codexTool(), a function tool that routes model tool calls to the Codex SDK so the agent can run workspace-scoped tasks (shell, file edits, MCP tools) autonomously. This surface is experimental and may change.

Install dependencies first:

Terminal window
npm install @openai/agents-extensions @openai/codex-sdk

Quick start:

Experimental Codex tool
import { Agent } from '@openai/agents';
import { codexTool } from '@openai/agents-extensions/experimental/codex';

export const codexAgent = new Agent({
  name: 'Codex Agent',
  instructions:
    'Use the codex tool to inspect the workspace and answer the question. When skill names, which usually start with `$`, are mentioned, you must rely on the codex tool to use the skill and answer the question.',
  tools: [
    codexTool({
      sandboxMode: 'workspace-write',
      workingDirectory: '/path/to/repo',
      defaultThreadOptions: {
        model: 'gpt-5.2-codex',
        networkAccessEnabled: true,
        webSearchEnabled: false,
      },
    }),
  ],
});

What to know:

Auth: supply CODEX_API_KEY (preferred) or OPENAI_API_KEY, or pass codexOptions.apiKey.
Inputs: strict schema—inputs must contain at least one { type: 'text', text } or { type: 'local_image', path }.
Safety: pair sandboxMode with workingDirectory; set skipGitRepoCheck if the directory is not a Git repo.
Threading: useRunContextThreadId: true reads/stores the latest thread id in runContext.context, which is useful for cross-turn reuse in your app state.
Thread ID precedence: tool call threadId (if your schema includes it) takes priority, then run-context thread id, then codexTool({ threadId }).
Run context key: defaults to codexThreadId for name: 'codex', or codexThreadId_<suffix> for names like name: 'engineer' (codex_engineer after normalization).
Mutable context requirement: when useRunContextThreadId is enabled, pass a mutable object or Map as run(..., { context }).
Naming: tool names are normalized into the codex namespace (engineer becomes codex_engineer), and duplicate Codex tool names in an agent are rejected.
Streaming: onStream mirrors Codex events (reasoning, command execution, MCP tool calls, file changes, web search) so you can log or trace progress.
Outputs: tool result includes response, usage, and threadId, and Codex token usage is recorded in RunContext.
Structure: outputSchema can be a descriptor, JSON schema object, or Zod object. For JSON object schemas, additionalProperties must be false.
Run-context thread reuse example:

Codex run-context thread reuse
import { Agent, run } from '@openai/agents';
import { codexTool } from '@openai/agents-extensions/experimental/codex';

// Derived from codexTool({ name: 'engineer' }) when runContextThreadIdKey is omitted.
type ExampleContext = {
  codexThreadId_engineer?: string;
};

const agent = new Agent<ExampleContext>({
  name: 'Codex assistant',
  instructions: 'Use the codex tool for workspace tasks.',
  tools: [
    codexTool({
      // `name` is optional for a single Codex tool.
      // We set it so the run-context key is tool-specific and to avoid collisions when adding more Codex tools.
      name: 'engineer',
      // Reuse the same Codex thread across runs that share this context object.
      useRunContextThreadId: true,
      sandboxMode: 'workspace-write',
      workingDirectory: '/path/to/repo',
      defaultThreadOptions: {
        model: 'gpt-5.2-codex',
        approvalPolicy: 'never',
      },
    }),
  ],
});

// The default key for useRunContextThreadId with name=engineer is codexThreadId_engineer.
const context: ExampleContext = {};

// First turn creates (or resumes) a Codex thread and stores the thread ID in context.
await run(agent, 'Inspect src/tool.ts and summarize it.', { context });
// Second turn reuses the same thread because it shares the same context object.
await run(agent, 'Now list refactoring opportunities.', { context });

const threadId = context.codexThreadId_engineer;

Tool strategy and best practices
Tool use behavior
Refer to the Agents guide for controlling when and how a model must use tools (modelSettings.toolChoice, toolUseBehavior, etc.).

Best practices
Short, explicit descriptions – describe what the tool does and when to use it.
Validate inputs – use Zod schemas for strict JSON validation where possible.
Avoid side‑effects in error handlers – errorFunction should return a helpful string, not throw.
One responsibility per tool – small, composable tools lead to better model reasoning.