// useClaudeStream — owns the genuinely-sequential part of sending a message:
// build the user message, POST viewer state, open the EventSource, register the
// stream context, build the `api` capability object, and wire every SSE event
// type to its handler in streamEventHandlers. The per-event logic lives in that
// registry; this hook is the lifecycle around it.
//
// Reattach support (stream-reattach feature): the EventSource wiring lives in
// wireStream() so it can be reused for both a fresh send and a reattach (after
// reload or transport error). reattachToStream() opens the backend's
// /streamPrompt/attach/:processId endpoint, which replays the buffered events
// (optionally past lastEventId) and continues live.

import { useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import { claudeEventBus, ClaudeEvents } from '../../eventBus';
import { getViewerForFile } from '../../components/viewerRegistry.jsx';
import { formatTime, extractRelativePath } from '../../utils/paths';
import { splitParagraphSegments } from './textSegmentation';
import { streamEventHandlers } from './streamEventHandlers';

/** Build an empty per-stream assistant message (reattach builds an identical one). */
export function makeStreamMsg() {
  return { role: 'assistant', text: '', timestamp: formatTime() };
}

const bookmarkKey = (project) => `etienne.activeStream.${project}`;

/**
 * @param {object} deps  stable dependencies (setters, refs, helpers)
 * @returns {{ sendMessage: Function, reattachToStream: Function }}
 */
export default function useClaudeStream({
  streamSessions,
  esRef,
  currentMessageRef,
  currentUsageRef,
  activeToolCallsRef,
  setMessages,
  setStructuredMessages,
  setContextState,
  setSessionId,
  setCurrentProcessId,
  setHasSessions,
  hasPreviewExtension,
  fetchFile,
  setRetryAvailable,
  lastSentRef,
}) {
  // Forward-ref so wireStream's api can call the latest reattachToStream without
  // listing it as a dependency (which would form a definition cycle). Assigned
  // below, after reattachToStream is defined.
  const reattachToStreamRef = useRef(null);

  // ── Shared EventSource wiring (used by both sendMessage and reattach) ──────
  // existingCtx: reuse a live stream context (in-page reconnect); otherwise a
  // fresh pending ctx is created.
  const wireStream = useCallback((es, streamMsg, { currentProject, autoPreviewExtensionMap, existingCtx } = {}) => {
    esRef.current = es;

    let ctx;
    if (existingCtx) {
      ctx = existingCtx;
      streamSessions.replaceEventSource(ctx, es); // swap ES, keep buffers
      ctx.stopped = false;
    } else {
      const pendingKey = `pending_${Date.now()}`;
      streamSessions.startStream(pendingKey, es, null);
      ctx = streamSessions.getStreamContext(pendingKey);
      ctx.resolvedSessionId = pendingKey; // real sessionId once 'session' arrives
      ctx.stopped = false;
    }
    ctx.streamMsg = streamMsg;
    currentMessageRef.current = streamMsg;

    // Helper: get or update messages depending on whether this session is in foreground
    const updateMessages = (updater) => {
      if (ctx.targetRef.current === 'state') {
        setMessages(updater);
      } else {
        ctx.messages = updater(ctx.messages);
      }
    };
    const updateStructuredMessages = (updater) => {
      if (ctx.targetRef.current === 'state') {
        setStructuredMessages(updater);
      } else {
        ctx.structuredMessages = updater(ctx.structuredMessages);
      }
    };

    // Ensure an empty assistant message exists so the elapsed timer shows
    const ensureAssistantMessage = () => {
      if (ctx.assistantMessageAdded) return;
      ctx.assistantMessageAdded = true;
      updateMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') return prev;
        return [...prev, { ...streamMsg }];
      });
    };

    // Push a structured-message into the timeline for the generic SystemEventMessage renderer.
    const pushSystemEvent = (eventType, summary, raw) => {
      updateStructuredMessages(prev => [...prev, {
        id: `${eventType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'system_event',
        eventType,
        summary,
        raw,
        timestamp: Date.now()
      }]);
    };

    // Idempotent finalizer: flush buffer, mark running items complete, finalize
    // the assistant message, deregister the stream, refresh the sessions list.
    const stop = () => {
      if (ctx.stopped) return;
      ctx.stopped = true;
      es.close();
      // Clear the reattach bookmark — this run is done.
      try { if (currentProject) sessionStorage.removeItem(bookmarkKey(currentProject)); } catch { /* ignore */ }
      setCurrentProcessId(null);

      const finalStructuredMessages = [];

      const flushStructured = (prev) => {
        let updated = [...prev];

        // Flush any remaining text buffer
        if (ctx.textBuffer.trim()) {
          updated.push({
            id: `text_${Date.now()}_final`,
            type: 'text_chunk',
            content: ctx.textBuffer,
            timestamp: ctx.lastChunkTime
          });
          ctx.textBuffer = '';
        }

        // Mark all running items as complete
        updated = updated.map(msg =>
          msg.status === 'running' ? { ...msg, status: 'complete' } : msg
        );

        finalStructuredMessages.push(...updated);
        return updated;
      };

      if (ctx.targetRef.current === 'state') {
        setStructuredMessages(flushStructured);
      } else {
        ctx.structuredMessages = flushStructured(ctx.structuredMessages);
      }

      // Finalize message with reasoning steps attached
      if (streamMsg.text) {
        const finalizeMessages = (prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...streamMsg,
              usage: ctx.currentUsage,
              reasoningSteps: finalStructuredMessages.length > 0 ? finalStructuredMessages : undefined
            };
          }
          return newMessages;
        };

        if (ctx.targetRef.current === 'state') {
          setMessages(finalizeMessages);
        } else {
          ctx.messages = finalizeMessages(ctx.messages);
        }
      }

      // Remove from active streaming sessions
      streamSessions.stopStream(ctx.resolvedSessionId);

      // Refresh sessions list (a new session may have been created)
      if (currentProject) {
        apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`)
          .then(res => res.json())
          .then(data => {
            setHasSessions(data.success && data.sessions && data.sessions.length > 0);
          })
          .catch(err => {
            console.error('Failed to refresh sessions:', err);
          });
      }
    };

    // The capability object passed to every handler.
    const api = {
      ctx,
      currentProject,
      updateMessages,
      updateStructuredMessages,
      pushSystemEvent,
      ensureAssistantMessage,
      stop,
      setSessionId,
      setCurrentProcessId,
      setContextState,
      rekey: streamSessions.rekey,
      currentUsageRef,
      autoPreviewExtensionMap,
      hasPreviewExtension,
      fetchFile,
      getViewerForFile,
      claudeEventBus,
      ClaudeEvents,
      splitParagraphSegments,
      extractRelativePath,
      setRetryAvailable,
      // reattach plumbing — used by the error handler (Part 3.4)
      reattachToStream: (...args) => reattachToStreamRef.current(...args),
    };

    // One centralized parse replaces ~30 copies of JSON.parse(e.data). Native
    // EventSource transport errors carry no data → data === null, which the
    // `error` handler uses to distinguish transport from application errors.
    // Capturing e.lastEventId here (once) gives every event type replay-dedup
    // on reconnect for free.
    for (const [type, handler] of Object.entries(streamEventHandlers)) {
      es.addEventListener(type, (e) => {
        if (e.lastEventId) ctx.lastEventId = e.lastEventId;
        let data = null;
        try { data = e.data ? JSON.parse(e.data) : null; } catch { /* native error event */ }
        handler(data, api, e);
      });
    }

    return ctx;
  }, [
    streamSessions, esRef, currentMessageRef, currentUsageRef,
    setMessages, setStructuredMessages, setContextState,
    setSessionId, setCurrentProcessId, setHasSessions,
    hasPreviewExtension, fetchFile, setRetryAvailable,
  ]);

  /**
   * Re-attach a client to a live (or recently finished) run. Used on reload and
   * on transport errors. With no lastEventId the full buffer replays (rebuilding
   * the message text + timeline); with lastEventId it resumes past seen events.
   */
  const reattachToStream = useCallback((processId, opts = {}) => {
    const { existingCtx, lastEventId, currentProject, autoPreviewExtensionMap } = opts;
    const url = new URL(
      `/api/claude/streamPrompt/attach/${encodeURIComponent(processId)}`,
      window.location.origin
    );
    if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
    const token = localStorage.getItem('auth_accessToken') || sessionStorage.getItem('auth_accessToken');
    if (token) url.searchParams.set('token', token);

    const streamMsg = existingCtx?.streamMsg || makeStreamMsg();
    wireStream(new EventSource(url.toString()), streamMsg, {
      currentProject,
      autoPreviewExtensionMap,
      existingCtx,
    });
  }, [wireStream]);

  // Keep the forward-ref pointed at the latest reattachToStream.
  useEffect(() => { reattachToStreamRef.current = reattachToStream; }, [reattachToStream]);

  /**
   * Send a prompt and stream the response.
   *
   * Inputs that vary per render are passed in via `config` (no stale closures),
   * so this callback stays stable across renders.
   */
  const sendMessage = useCallback(async (messageText, config) => {
    const {
      currentProject,
      mode,
      aiModel,
      codingAgent,
      activeContext = null,
      autoPreviewExtensionMap,
      getViewerStates,
      options = {},
    } = config;

    // Remember the last turn so the Retry affordance can re-send it, and clear
    // any stale retry banner.
    if (lastSentRef) lastSentRef.current = { text: messageText, config };
    setRetryAvailable?.(null);

    // Add user message. `options.source` / `options.sourceMetadata` carry the
    // hints used by ChatMessage to swap the verbose user bubble for a compact pill.
    setMessages(prev => [...prev, {
      role: 'user',
      text: messageText,
      timestamp: formatTime(),
      contextName: activeContext ? activeContext.name : null,
      source: options.source,
      sourceMetadata: options.sourceMetadata,
    }]);

    const streamMsg = makeStreamMsg();
    currentUsageRef.current = null;
    activeToolCallsRef.current.clear(); // Clear any pending tool calls
    // Persist current structured messages to the last assistant message, then clear
    setStructuredMessages(prev => {
      if (prev.length > 0) {
        setMessages(msgPrev => {
          const newMessages = [...msgPrev];
          const lastIdx = newMessages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1);
          if (lastIdx >= 0 && !newMessages[lastIdx].reasoningSteps) {
            newMessages[lastIdx] = { ...newMessages[lastIdx], reasoningSteps: prev };
          }
          return newMessages;
        });
      }
      return []; // Clear structured messages for the new streaming session
    });

    // Ensure project file exists
    await apiFetch(`/api/claude/addFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_dir: currentProject, file_name: codingAgent === 'anthropic' ? 'CLAUDE.md' : 'AGENTS.md', file_content: `# ${currentProject}\n` })
    });

    // Stream prompt
    const url = new URL(`/api/claude/streamPrompt/sdk`, window.location.origin);
    url.searchParams.set('project_dir', currentProject);
    url.searchParams.set('prompt', messageText);
    url.searchParams.set('agentMode', mode);
    url.searchParams.set('aiModel', aiModel);

    // Add memory enabled parameter
    const memoryEnabled = localStorage.getItem('memoryEnabled') !== 'false';
    if (memoryEnabled) {
      url.searchParams.set('memoryEnabled', 'true');
    }

    // Add maxTurns parameter
    const maxTurns = localStorage.getItem('maxTurns');
    if (maxTurns) {
      url.searchParams.set('maxTurns', maxTurns);
    }

    // Add notification channels for server-side notifications
    try {
      const notifChannels = JSON.parse(localStorage.getItem('notificationChannels') || '[]');
      const serverChannels = notifChannels.filter(c => c !== 'desktop');
      if (serverChannels.length > 0) {
        url.searchParams.set('notificationChannels', serverChannels.join(','));
      }
      const notifEmail = localStorage.getItem('notificationEmail');
      if (serverChannels.includes('email') && notifEmail) {
        url.searchParams.set('notificationEmail', notifEmail);
      }
    } catch { /* ignore parse errors */ }

    // Attach shared viewer state (selections from open previewers) via POST
    const viewerStates = getViewerStates();
    if (viewerStates.length > 0) {
      try {
        await apiFetch('/api/claude/viewerState', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_dir: currentProject, viewerState: viewerStates }),
        });
      } catch (e) {
        console.warn('[App] Failed to post viewer state:', e);
      }
    }

    const token = localStorage.getItem('auth_accessToken') || sessionStorage.getItem('auth_accessToken');
    if (token) url.searchParams.set('token', token);

    wireStream(new EventSource(url.toString()), streamMsg, { currentProject, autoPreviewExtensionMap });
  }, [
    wireStream, currentUsageRef, activeToolCallsRef, setMessages, setStructuredMessages,
    setRetryAvailable, lastSentRef,
  ]);

  return { sendMessage, reattachToStream };
}
