/**
 * Shared TypeScript types for the multiplexed SSE protocol.
 *
 * These types define the wire format for all events flowing from the backend
 * to the frontend over the single multiplexed SSE connection.
 *
 * Wire format (SSE):
 *   id: <sequence-number>
 *   event: mux
 *   data: {"channel":"<MuxChannel>","type":"<MuxEventType>","payload":{...}}
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** All available multiplexing channels */
export type MuxChannel =
  | 'interceptor'
  | 'interceptor-global'
  | 'research'
  | 'budget'
  | 'events'
  | 'system'
  | 'heartbeat';

// ---------------------------------------------------------------------------
// Event types per channel
// ---------------------------------------------------------------------------

/** Interceptor channel event types */
export type InterceptorEventType =
  | 'hook'
  | 'event'
  | 'elicitation_request'
  | 'permission_request'
  | 'ask_user_question'
  | 'plan_approval'
  | 'pairing_request'
  | 'chat_message'
  | 'hitl_request';

/** Research channel event types */
export type ResearchEventType =
  | 'Research.started'
  | 'Research.created'
  | 'Research.in_progress'
  | 'Research.web_search.in_progress'
  | 'Research.web_search.searching'
  | 'Research.web_search.completed'
  | 'Research.output_item.added'
  | 'Research.output_item.done'
  | 'Research.content_part.added'
  | 'Research.content_part.done'
  | 'Research.reasoning.delta'
  | 'Research.output_text.delta'
  | 'Research.output_text.done'
  | 'Research.completed'
  | 'Research.error';

/** Budget channel event types */
export type BudgetEventType = 'budget-update';

/** Events channel event types (from SSEPublisherService) */
export type EventsChannelEventType =
  | 'event'
  | 'rule-execution'
  | 'prompt-execution'
  | 'workflow-execution'
  | 'script-execution'
  | 'chat-refresh'
  | 'service-status'
  | 'connected';

/** System channel event types */
export type SystemEventType = 'connected';

/** Heartbeat channel event types */
export type HeartbeatEventType = 'ping';

/** Union of all event types across all channels */
export type MuxEventType =
  | InterceptorEventType
  | ResearchEventType
  | BudgetEventType
  | EventsChannelEventType
  | SystemEventType
  | HeartbeatEventType
  | string; // Allow extension without breaking existing code

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/** The wire-format envelope wrapping every mux event */
export interface MuxEnvelope<T = any> {
  channel: MuxChannel;
  type: MuxEventType;
  payload: T;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

/** System 'connected' event payload */
export interface SystemConnectedPayload {
  project: string;
  channels: string[];
}

/** Heartbeat 'ping' event payload */
export interface HeartbeatPayload {
  timestamp: number;
}

/** Budget 'budget-update' event payload */
export interface BudgetUpdatePayload {
  project: string;
  timestamp: string;
  currentCosts: number;
  numberOfSessions: number;
  currency: string;
}

/** Permission request payload (interceptor channel) */
export interface PermissionRequestPayload {
  id: string;
  requestId: string;
  toolName: string;
  toolInput: any;
  suggestions?: Array<{ toolName: string; permission: 'allow' | 'deny' | 'ask' }>;
}

/** Elicitation request payload (interceptor channel) */
export interface ElicitationRequestPayload {
  id: string;
  message: string;
  requestedSchema: any;
  toolName: string;
}

/** Prompt execution payload (events channel) */
export interface PromptExecutionPayload {
  status: 'started' | 'completed' | 'error';
  promptId?: string;
  error?: string;
}

/** Workflow execution payload (events channel) */
export interface WorkflowExecutionPayload {
  status: 'started' | 'step' | 'completed' | 'error';
  workflowId?: string;
  stepName?: string;
  error?: string;
}
