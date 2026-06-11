// useChatSession — owns the React state the Claude stream writes into, plus the
// chat-related refs and the abort handler. (Phase 2 of the App.jsx decomposition.)
//
// useClaudeStream receives this hook's setters/refs via its deps; useProjectSwitching
// (Phase 5) composes against the returned state. App destructures the return into
// the same identifiers it used before, so call-sites are unchanged.

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '../../services/api';

/**
 * @param {object} deps
 * @param {ReturnType<import('../../hooks/useStreamingSessions').default>} deps.streamSessions
 */
export default function useChatSession({ streamSessions }) {
  const [messages, setMessages] = useState([]);
  const [structuredMessages, setStructuredMessages] = useState([]);
  const [contextState, setContextState] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null); // Track which session we're viewing
  const [currentProcessId, setCurrentProcessId] = useState(null);
  // Retry affordance for a failed turn (armed by the stream's error/api_error handlers).
  const [retryAvailable, setRetryAvailable] = useState(null);

  const esRef = useRef(null);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);
  const activeToolCallsRef = useRef(new Map());
  const currentSessionIdRef = useRef(null); // Ref to access current session ID in event listeners
  const lastSentRef = useRef(null); // { text, config } of the last sent turn, for Retry

  // Keep currentSessionIdRef in sync with state for use in event listeners
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const handleAbort = useCallback(async () => {
    // Look up the stream context for the currently viewed session
    const ctx = streamSessions.getStreamContext(sessionId);
    const pid = ctx?.processId || currentProcessId;
    if (pid) {
      try {
        await apiFetch(`/api/claude/abort/${pid}`, {
          method: 'POST'
        });
        // Close the specific EventSource and remove from streaming sessions
        if (ctx) {
          streamSessions.stopStream(sessionId);
        } else {
          esRef.current?.close();
        }
        setCurrentProcessId(null);
      } catch (error) {
        console.error('Failed to abort process:', error);
      }
    }
  }, [streamSessions, sessionId, currentProcessId]);

  return {
    // state
    messages, setMessages,
    structuredMessages, setStructuredMessages,
    contextState, setContextState,
    sessionId, setSessionId,
    currentSessionId, setCurrentSessionId,
    currentProcessId, setCurrentProcessId,
    retryAvailable, setRetryAvailable,
    // refs
    esRef,
    currentMessageRef,
    currentUsageRef,
    activeToolCallsRef,
    currentSessionIdRef,
    lastSentRef,
    // actions
    handleAbort,
  };
}
