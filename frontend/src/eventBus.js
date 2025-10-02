// eventBus.js - Simple pub/sub for Claude Code events
class EventBus {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType).add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(eventType);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  publish(eventType, data) {
    const subs = this.subscribers.get(eventType);
    if (subs) {
      subs.forEach(callback => callback(data));
    }
  }

  clear() {
    this.subscribers.clear();
  }
}

export const claudeEventBus = new EventBus();

// Event type constants
export const ClaudeEvents = {
  MESSAGE: 'claude:message',
  TOOL_CALL_START: 'claude:tool_call_start',
  TOOL_CALL_END: 'claude:tool_call_end',
  PERMISSION_REQUEST: 'claude:permission_request',
  PERMISSION_RESPONSE: 'claude:permission_response',
  ERROR: 'claude:error',
  SUBAGENT_START: 'claude:subagent_start',
  SUBAGENT_END: 'claude:subagent_end',
  CONNECTION_STATE: 'claude:connection_state',
  PROCESS_STATE: 'claude:process_state',
  THINKING: 'claude:thinking',
  USER_MESSAGE: 'claude:user_message',
};
