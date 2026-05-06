/**
 * @fileoverview Shared type definitions for the multiplexed SSE protocol.
 *
 * These JSDoc types mirror the backend TypeScript types in
 * backend/src/sse-multiplex/sse-mux.types.ts
 *
 * Wire format (SSE):
 *   id: <sequence-number>
 *   event: mux
 *   data: {"channel":"<MuxChannel>","type":"<MuxEventType>","payload":{...}}
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * All available multiplexing channels.
 * @typedef {'interceptor'|'interceptor-global'|'research'|'budget'|'events'|'system'|'heartbeat'} MuxChannel
 */

// ---------------------------------------------------------------------------
// Event types per channel
// ---------------------------------------------------------------------------

/**
 * Interceptor channel event types.
 * @typedef {'hook'|'event'|'elicitation_request'|'permission_request'|'ask_user_question'|'plan_approval'|'pairing_request'|'chat_message'|'hitl_request'} InterceptorEventType
 */

/**
 * Research channel event types.
 * @typedef {'Research.started'|'Research.created'|'Research.in_progress'|'Research.web_search.in_progress'|'Research.web_search.searching'|'Research.web_search.completed'|'Research.output_item.added'|'Research.output_item.done'|'Research.content_part.added'|'Research.content_part.done'|'Research.reasoning.delta'|'Research.output_text.delta'|'Research.output_text.done'|'Research.completed'|'Research.error'} ResearchEventType
 */

/**
 * Budget channel event types.
 * @typedef {'budget-update'} BudgetEventType
 */

/**
 * Events channel event types (from SSEPublisherService).
 * @typedef {'event'|'rule-execution'|'prompt-execution'|'workflow-execution'|'script-execution'|'chat-refresh'|'service-status'|'connected'} EventsChannelEventType
 */

/**
 * System channel event types.
 * @typedef {'connected'} SystemEventType
 */

/**
 * Union of all event types across all channels.
 * @typedef {InterceptorEventType|ResearchEventType|BudgetEventType|EventsChannelEventType|SystemEventType|string} MuxEventType
 */

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/**
 * The wire-format envelope wrapping every mux event.
 * @typedef {Object} MuxEnvelope
 * @property {MuxChannel} channel - The channel this event belongs to
 * @property {MuxEventType} type - The event type within the channel
 * @property {*} payload - The event payload (shape depends on channel+type)
 */

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

/**
 * System 'connected' event payload.
 * @typedef {Object} SystemConnectedPayload
 * @property {string} project - The project name
 * @property {string[]} channels - Subscribed channel names
 */

/**
 * Heartbeat 'ping' event payload.
 * @typedef {Object} HeartbeatPayload
 * @property {number} timestamp - Unix timestamp in milliseconds
 */

/**
 * Budget 'budget-update' event payload.
 * @typedef {Object} BudgetUpdatePayload
 * @property {string} project - Project name
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {number} currentCosts - Current accumulated costs
 * @property {number} numberOfSessions - Number of sessions tracked
 * @property {string} currency - Currency code (e.g. 'EUR')
 */

/**
 * Permission request payload (interceptor channel).
 * @typedef {Object} PermissionRequestPayload
 * @property {string} id - Event ID
 * @property {string} requestId - Unique request identifier
 * @property {string} toolName - Name of the tool requesting permission
 * @property {*} toolInput - The tool input arguments
 * @property {Array<{toolName: string, permission: 'allow'|'deny'|'ask'}>} [suggestions] - Permission suggestions
 */

/**
 * Elicitation request payload (interceptor channel).
 * @typedef {Object} ElicitationRequestPayload
 * @property {string} id - Event ID
 * @property {string} message - Message to display to the user
 * @property {*} requestedSchema - JSON Schema for the expected response
 * @property {string} toolName - Name of the tool requesting input
 */

/**
 * Prompt execution payload (events channel).
 * @typedef {Object} PromptExecutionPayload
 * @property {'started'|'completed'|'error'} status - Execution status
 * @property {string} [promptId] - Prompt identifier
 * @property {string} [error] - Error message if status is 'error'
 */

/**
 * Workflow execution payload (events channel).
 * @typedef {Object} WorkflowExecutionPayload
 * @property {'started'|'step'|'completed'|'error'} status - Execution status
 * @property {string} [workflowId] - Workflow identifier
 * @property {string} [stepName] - Current step name
 * @property {string} [error] - Error message if status is 'error'
 */

/**
 * Handler function for mux events.
 * @typedef {(payload: *, type: MuxEventType) => void} MuxHandler
 */

/**
 * The return value of useMultiplexSSE hook.
 * @typedef {Object} MuxSSEConnection
 * @property {(channel: MuxChannel, type: MuxEventType|'*', handler: MuxHandler) => void} on - Subscribe to events
 * @property {(channel: MuxChannel, type: MuxEventType|'*', handler: MuxHandler) => void} off - Unsubscribe from events
 * @property {{current: boolean}} connected - Ref indicating connection state
 */

export {};
