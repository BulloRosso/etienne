// Deterministic agent driving the booking lifecycle.
// No LLM. State transitions are pure functions of (state, userAction).

import type { A2uiMessage } from './a2ui-messages.js';
import { buildBookingFormMessages, buildConfirmationMessages } from './booking-surface.js';

export type BookingState = 'initial' | 'awaitingConfirm' | 'confirmed';

export interface UserAction {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string;
  context: Record<string, unknown>;
}

export interface SessionState {
  state: BookingState;
}

export function newSession(): SessionState {
  return { state: 'initial' };
}

// Returns the initial surface payload when a session starts.
export function start(session: SessionState): A2uiMessage[] {
  session.state = 'awaitingConfirm';
  return buildBookingFormMessages();
}

// Advance the state machine in response to a userAction.
export function handleAction(session: SessionState, action: UserAction): A2uiMessage[] {
  if (session.state !== 'awaitingConfirm') return [];
  if (action.name !== 'confirm') return [];

  const datetime = String(action.context?.datetime ?? '');
  const guests = String(action.context?.guests ?? '');
  session.state = 'confirmed';
  return buildConfirmationMessages(datetime, guests);
}
