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
  PROCESS_STATE: 'claude:process_state'
};

// useClaudeEvent.js - React hook for subscribing to events
import { useEffect } from 'react';
import { claudeEventBus } from './eventBus';

export function useClaudeEvent(eventType, callback, deps = []) {
  useEffect(() => {
    const unsubscribe = claudeEventBus.subscribe(eventType, callback);
    return unsubscribe;
  }, [eventType, ...deps]);
}

// sseEventAdapter.js - Adapter between SSE and event bus
import { claudeEventBus, ClaudeEvents } from './eventBus';

export class SSEEventAdapter {
  constructor(eventSource) {
    this.eventSource = eventSource;
    this.setupListeners();
  }

  setupListeners() {
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.routeEvent(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
        claudeEventBus.publish(ClaudeEvents.ERROR, {
          message: 'Parse error',
          details: error.message
        });
      }
    };

    this.eventSource.onerror = (error) => {
      claudeEventBus.publish(ClaudeEvents.CONNECTION_STATE, {
        status: 'error',
        error
      });
    };

    this.eventSource.onopen = () => {
      claudeEventBus.publish(ClaudeEvents.CONNECTION_STATE, {
        status: 'connected'
      });
    };
  }

  routeEvent(data) {
    switch (data.type) {
      case 'user_message':
        claudeEventBus.publish(ClaudeEvents.MESSAGE, data);
        break;
        
      case 'tool_call':
        if (data.status === 'running') {
          claudeEventBus.publish(ClaudeEvents.TOOL_CALL_START, data);
        } else if (data.status === 'complete') {
          claudeEventBus.publish(ClaudeEvents.TOOL_CALL_END, data);
        }
        break;
        
      case 'permission_request':
        claudeEventBus.publish(ClaudeEvents.PERMISSION_REQUEST, data);
        break;
        
      case 'error':
        claudeEventBus.publish(ClaudeEvents.ERROR, data);
        break;
        
      case 'subagent_start':
        claudeEventBus.publish(ClaudeEvents.SUBAGENT_START, data);
        break;
        
      case 'subagent_end':
        claudeEventBus.publish(ClaudeEvents.SUBAGENT_END, data);
        break;
        
      case 'connection':
        claudeEventBus.publish(ClaudeEvents.CONNECTION_STATE, data);
        break;
        
      default:
        console.warn('Unknown event type:', data.type);
    }
  }

  disconnect() {
    this.eventSource.close();
  }
}

// Example: Specialized component using pub/sub
import React, { useState } from 'react';
import { useClaudeEvent } from './useClaudeEvent';
import { ClaudeEvents } from './eventBus';

export const ToolCallMonitor = () => {
  const [activeTools, setActiveTools] = useState([]);
  const [completedTools, setCompletedTools] = useState([]);

  useClaudeEvent(ClaudeEvents.TOOL_CALL_START, (data) => {
    setActiveTools(prev => [...prev, data]);
  });

  useClaudeEvent(ClaudeEvents.TOOL_CALL_END, (data) => {
    setActiveTools(prev => prev.filter(t => t.callId !== data.callId));
    setCompletedTools(prev => [...prev, data]);
  });

  return (
    <div className="p-4 bg-gray-100 rounded">
      <h3 className="font-bold mb-2">Tool Activity</h3>
      
      {activeTools.length > 0 && (
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-600 mb-1">Running:</div>
          {activeTools.map(tool => (
            <div key={tool.callId} className="text-sm text-blue-600">
              • {tool.toolName} (active)
            </div>
          ))}
        </div>
      )}
      
      {completedTools.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-600 mb-1">
            Completed: {completedTools.length}
          </div>
        </div>
      )}
    </div>
  );
};

// Example: Permission manager component
export const PermissionManager = () => {
  const [pendingPermissions, setPendingPermissions] = useState([]);

  useClaudeEvent(ClaudeEvents.PERMISSION_REQUEST, (data) => {
    setPendingPermissions(prev => [...prev, data]);
  });

  useClaudeEvent(ClaudeEvents.PERMISSION_RESPONSE, (data) => {
    setPendingPermissions(prev => 
      prev.filter(p => p.permissionId !== data.permissionId)
    );
  });

  const handleResponse = async (permissionId, approved) => {
    try {
      const response = await fetch('/api/claude-code/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, approved })
      });

      if (response.ok) {
        claudeEventBus.publish(ClaudeEvents.PERMISSION_RESPONSE, {
          permissionId,
          approved
        });
      }
    } catch (error) {
      claudeEventBus.publish(ClaudeEvents.ERROR, {
        message: 'Failed to send permission response',
        details: error.message
      });
    }
  };

  if (pendingPermissions.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl p-4 border-2 border-yellow-500">
      <h3 className="font-bold text-lg mb-3">Pending Permissions</h3>
      {pendingPermissions.map(perm => (
        <div key={perm.permissionId} className="mb-4 last:mb-0">
          <p className="text-sm text-gray-700 mb-2">{perm.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleResponse(perm.permissionId, true)}
              className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => handleResponse(perm.permissionId, false)}
              className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Example: Main app with pub/sub architecture
export const ClaudeCodeApp = () => {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Subscribe to all message events
  useClaudeEvent(ClaudeEvents.MESSAGE, (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now() }]);
  });

  useClaudeEvent(ClaudeEvents.TOOL_CALL_START, (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now() }]);
  });

  useClaudeEvent(ClaudeEvents.TOOL_CALL_END, (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now() }]);
  });

  useClaudeEvent(ClaudeEvents.ERROR, (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now() }]);
  });

  useClaudeEvent(ClaudeEvents.CONNECTION_STATE, (data) => {
    setConnectionStatus(data.status);
  });

  useEffect(() => {
    const eventSource = new EventSource('/api/claude-code/stream');
    const adapter = new SSEEventAdapter(eventSource);

    return () => {
      adapter.disconnect();
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Claude Code</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="text-sm">{connectionStatus}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4">
          {messages.map(msg => (
            <div key={msg.id} className="mb-4">
              {/* Render based on message type */}
              {JSON.stringify(msg)}
            </div>
          ))}
        </main>

        <aside className="w-80 bg-gray-50 border-l p-4 overflow-y-auto">
          <ToolCallMonitor />
        </aside>
      </div>

      <PermissionManager />
    </div>
  );
};

// Benefits of this pub/sub architecture:
// 1. Components are decoupled - they don't need to know about each other
// 2. Easy to add new components that react to events
// 3. Single source of truth for events from SSE
// 4. Components can be mounted/unmounted without losing event flow
// 5. Easy to test - just publish mock events
// 6. Clear separation of concerns - adapter handles SSE, components handle UI