import { useState, useRef, useCallback } from 'react';

/**
 * Manages a Map of active streaming sessions, enabling multi-session awareness.
 *
 * Each StreamContext holds per-session streaming state (EventSource, messages,
 * structured messages, text buffer, etc.) and a targetRef that controls whether
 * SSE event handlers write to React state ('state') or to internal buffers ('buffer').
 *
 * Returns:
 *   activeSessionIds  — state array of currently-streaming session IDs (triggers re-renders)
 *   startStream(sid, es, pid) — register a new streaming session
 *   stopStream(sid)          — close ES, remove from map
 *   isSessionStreaming(sid)  — boolean check
 *   getStreamContext(sid)    — returns StreamContext or null
 *   updateStreamContext(sid, updater) — mutate a context in-place
 *   rekey(oldKey, newKey)    — rename a temporary key once real sessionId is known
 *   closeAll()               — close all EventSources (for cleanup)
 */
export default function useStreamingSessions() {
  // Map<sessionId, StreamContext> — stored as ref to avoid re-renders on every mutation
  const contextsRef = useRef(new Map());

  // State array that triggers re-renders only when sessions start/stop streaming
  const [activeSessionIds, setActiveSessionIds] = useState([]);

  const startStream = useCallback((sessionId, eventSource, processId) => {
    const ctx = {
      sessionId,
      eventSource,
      processId,
      // Buffered state for when this session is in the background
      messages: [],
      structuredMessages: [],
      currentMessageText: '',
      currentMessageTimestamp: null,
      currentUsage: null,
      textBuffer: '',
      lastChunkTime: Date.now(),
      assistantMessageAdded: false,
      // Controls where SSE handlers write: 'state' (React state) or 'buffer' (this context)
      targetRef: { current: 'state' },
    };
    contextsRef.current.set(sessionId, ctx);
    setActiveSessionIds(Array.from(contextsRef.current.keys()));
  }, []);

  const stopStream = useCallback((sessionId) => {
    const ctx = contextsRef.current.get(sessionId);
    if (ctx) {
      try { ctx.eventSource?.close(); } catch { /* ignore */ }
      contextsRef.current.delete(sessionId);
      setActiveSessionIds(Array.from(contextsRef.current.keys()));
    }
  }, []);

  const isSessionStreaming = useCallback((sessionId) => {
    return contextsRef.current.has(sessionId);
  }, []);

  const getStreamContext = useCallback((sessionId) => {
    return contextsRef.current.get(sessionId) || null;
  }, []);

  const updateStreamContext = useCallback((sessionId, updater) => {
    const ctx = contextsRef.current.get(sessionId);
    if (ctx) updater(ctx);
  }, []);

  // Rename a temporary key (e.g. 'pending_12345') to the real sessionId
  const rekey = useCallback((oldKey, newKey) => {
    const ctx = contextsRef.current.get(oldKey);
    if (ctx) {
      ctx.sessionId = newKey;
      contextsRef.current.delete(oldKey);
      contextsRef.current.set(newKey, ctx);
      setActiveSessionIds(Array.from(contextsRef.current.keys()));
    }
  }, []);

  // Close all EventSources (used on unmount / page unload)
  const closeAll = useCallback(() => {
    for (const ctx of contextsRef.current.values()) {
      try { ctx.eventSource?.close(); } catch { /* ignore */ }
    }
    contextsRef.current.clear();
    setActiveSessionIds([]);
  }, []);

  return {
    activeSessionIds,
    startStream,
    stopStream,
    isSessionStreaming,
    getStreamContext,
    updateStreamContext,
    rekey,
    closeAll,
  };
}
