import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Clock, Code, Terminal, Zap, AlertTriangle } from 'lucide-react';

// Event types from Claude Code non-interactive mode
const EventType = {
  USER_MESSAGE: 'user_message',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  PERMISSION_REQUEST: 'permission_request',
  ERROR: 'error',
  SUBAGENT_START: 'subagent_start',
  SUBAGENT_END: 'subagent_end',
  THINKING: 'thinking',
  COMPLETION: 'completion'
};

// Message item component
const UserMessage = ({ content, timestamp }) => (
  <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
    <div className="flex items-start gap-3">
      <Terminal className="w-5 h-5 text-blue-600 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-medium text-blue-900 mb-1">Claude Response</div>
        <div className="text-gray-800 whitespace-pre-wrap">{content}</div>
        <div className="text-xs text-gray-500 mt-2">{timestamp}</div>
      </div>
    </div>
  </div>
);

// Tool call component
const ToolCall = ({ toolName, args, status, result }) => (
  <div className="mb-4 p-4 bg-purple-50 border-l-4 border-purple-500 rounded">
    <div className="flex items-start gap-3">
      <Code className="w-5 h-5 text-purple-600 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-medium text-purple-900 mb-1">
          Tool: {toolName}
        </div>
        {args && (
          <pre className="text-xs bg-purple-100 p-2 rounded mb-2 overflow-x-auto">
            {JSON.stringify(args, null, 2)}
          </pre>
        )}
        {status && (
          <div className="flex items-center gap-2 text-sm">
            {status === 'running' && <Clock className="w-4 h-4 text-yellow-600" />}
            {status === 'complete' && <CheckCircle className="w-4 h-4 text-green-600" />}
            <span className="text-gray-700">{status}</span>
          </div>
        )}
        {result && (
          <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-x-auto max-h-40">
            {result}
          </pre>
        )}
      </div>
    </div>
  </div>
);

// Permission request component with callback
const PermissionRequest = ({ id, message, onResponse }) => {
  const [responding, setResponding] = useState(false);

  const handleResponse = async (approved) => {
    setResponding(true);
    await onResponse(id, approved);
  };

  return (
    <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium text-yellow-900 mb-2">Permission Required</div>
          <div className="text-gray-800 mb-3 whitespace-pre-wrap">{message}</div>
          <div className="flex gap-2">
            <button
              onClick={() => handleResponse(true)}
              disabled={responding}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
            >
              Approve
            </button>
            <button
              onClick={() => handleResponse(false)}
              disabled={responding}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Error component
const ErrorMessage = ({ message, details }) => (
  <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded">
    <div className="flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-medium text-red-900 mb-1">Error</div>
        <div className="text-gray-800 mb-2">{message}</div>
        {details && (
          <pre className="text-xs bg-red-100 p-2 rounded overflow-x-auto">
            {details}
          </pre>
        )}
      </div>
    </div>
  </div>
);

// Subagent activity component
const SubagentActivity = ({ name, status, content }) => (
  <div className="mb-4 p-4 bg-indigo-50 border-l-4 border-indigo-500 rounded">
    <div className="flex items-start gap-3">
      <Zap className="w-5 h-5 text-indigo-600 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-medium text-indigo-900 mb-1">
          Subagent: {name}
        </div>
        <div className="flex items-center gap-2 text-sm mb-2">
          {status === 'active' && <Clock className="w-4 h-4 text-indigo-600 animate-pulse" />}
          {status === 'complete' && <CheckCircle className="w-4 h-4 text-green-600" />}
          <span className="text-gray-700">{status}</span>
        </div>
        {content && (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{content}</div>
        )}
      </div>
    </div>
  </div>
);

// Main streaming chat component
const ClaudeCodeStreamChat = () => {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const eventSourceRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle permission responses
  const handlePermissionResponse = async (permissionId, approved) => {
    try {
      const response = await fetch('/api/claude-code/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, approved })
      });
      
      if (!response.ok) throw new Error('Failed to send permission response');
    } catch (error) {
      console.error('Permission response error:', error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: EventType.ERROR,
        message: 'Failed to send permission response',
        details: error.message
      }]);
    }
  };

  // Connect to SSE stream
  useEffect(() => {
    const connectStream = () => {
      setConnectionStatus('connecting');
      const eventSource = new EventSource('/api/claude-code/stream');
      
      eventSource.onopen = () => {
        setConnectionStatus('connected');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages(prev => [...prev, { ...data, id: Date.now() + Math.random() }]);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setConnectionStatus('error');
        eventSource.close();
        
        // Reconnect after 3 seconds
        setTimeout(connectStream, 3000);
      };

      eventSourceRef.current = eventSource;
    };

    connectStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Render message based on type
  const renderMessage = (msg) => {
    switch (msg.type) {
      case EventType.USER_MESSAGE:
        return <UserMessage key={msg.id} content={msg.content} timestamp={msg.timestamp} />;
      
      case EventType.TOOL_CALL:
        return <ToolCall key={msg.id} toolName={msg.toolName} args={msg.args} status={msg.status} result={msg.result} />;
      
      case EventType.PERMISSION_REQUEST:
        return <PermissionRequest key={msg.id} id={msg.permissionId} message={msg.message} onResponse={handlePermissionResponse} />;
      
      case EventType.ERROR:
        return <ErrorMessage key={msg.id} message={msg.message} details={msg.details} />;
      
      case EventType.SUBAGENT_START:
      case EventType.SUBAGENT_END:
        return <SubagentActivity key={msg.id} name={msg.name} status={msg.status} content={msg.content} />;
      
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Claude Code Stream</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'connecting' ? 'bg-yellow-500' : 
            'bg-red-500'
          }`} />
          <span className="text-sm text-gray-600 capitalize">{connectionStatus}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Waiting for Claude Code output...
          </div>
        ) : (
          messages.map(msg => renderMessage(msg))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ClaudeCodeStreamChat;