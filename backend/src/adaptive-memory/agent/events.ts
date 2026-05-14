/**
 * Adaptive-Memory event shapes pushed over the multiplexed SSE channel.
 *
 * One channel — `'adaptive-memory'` — carries multiple event types so the
 * frontend can render a unified timeline (framing → picking → packing →
 * thinking → tool-use → final result). The SSE multiplex envelope wraps each
 * event as `{channel: 'adaptive-memory', type, payload}` per
 * backend/src/sse-multiplex/sse-mux.types.ts.
 *
 * Streaming is one-way (server → client). The HTTP POST that initiates a task
 * returns the final result as JSON; intermediate events flow through SSE.
 */

import type { ContextPackage, TaskFraming } from '../../memory/types';

export type AdaptiveMemoryEventType =
  | 'task-started'
  | 'frame'
  | 'pick'
  | 'pack'
  | 'tool-use'
  | 'task-completed'
  | 'task-failed';

export interface BaseAdaptiveMemoryEvent {
  type: AdaptiveMemoryEventType;
  project: string;
  sessionId: string;
  timestamp: string;
}

export interface TaskStartedEvent extends BaseAdaptiveMemoryEvent {
  type: 'task-started';
  payload: { prompt: string };
}

export interface FrameEvent extends BaseAdaptiveMemoryEvent {
  type: 'frame';
  payload: TaskFraming;
}

export interface PickEvent extends BaseAdaptiveMemoryEvent {
  type: 'pick';
  payload: {
    wikiPages: number;
    kgEntities: number;
    kgEdges: number;
    ragFragments: number;
    preferences: number;
    sorRecords: number;
    activeSkills: string[];
  };
}

export interface PackEvent extends BaseAdaptiveMemoryEvent {
  type: 'pack';
  payload: ContextPackage['meta'];
}

export interface ToolUseEvent extends BaseAdaptiveMemoryEvent {
  type: 'tool-use';
  payload: {
    tool: string;
    ok: boolean;
    entryId?: string;
    error?: string;
  };
}

export interface TaskCompletedEvent extends BaseAdaptiveMemoryEvent {
  type: 'task-completed';
  payload: {
    text: string;
    toolCalls: number;
    steps: number;
    durationMs: number;
  };
}

export interface TaskFailedEvent extends BaseAdaptiveMemoryEvent {
  type: 'task-failed';
  payload: { error: string };
}

export type AdaptiveMemoryEvent =
  | TaskStartedEvent
  | FrameEvent
  | PickEvent
  | PackEvent
  | ToolUseEvent
  | TaskCompletedEvent
  | TaskFailedEvent;
