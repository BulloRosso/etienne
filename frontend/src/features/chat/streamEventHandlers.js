// SSE event handler registry for the Claude stream (Phase 2 of the App.jsx
// decomposition). One pure function per event type — no React imports, no shared
// module-level state. Everything a handler needs arrives via the `api` capability
// object built in useClaudeStream.
//
// Per-stream mutable state lives on `api.ctx` (the streamSessions context), never
// in module scope — module scope would be shared across concurrent streams of
// different sessions.
//
// The `api` shape:
//   {
//     ctx,                       // per-stream StreamContext (incl. ctx.streamMsg)
//     updateMessages,            // foreground-aware setter (state vs ctx buffer)
//     updateStructuredMessages,
//     pushSystemEvent,           // (eventType, summary, raw) => void
//     ensureAssistantMessage,
//     stop,                      // idempotent finalizer
//     setSessionId,
//     setCurrentProcessId,
//     setContextState,
//     rekey,                     // streamSessions.rekey(oldKey, newKey)
//     currentUsageRef,
//     currentProject,
//     autoPreviewExtensionMap,
//     hasPreviewExtension,       // (path) => boolean (map already bound)
//     fetchFile,                 // (relPath, project) => void
//     getViewerForFile,          // (path, map) => viewerName | null
//     claudeEventBus, ClaudeEvents,
//     splitParagraphSegments,
//     extractRelativePath,
//   }

export const streamEventHandlers = {
  session(data, api) {
    const { ctx } = api;
    if (data.session_id) {
      // Rekey the stream context from the temporary key to the real sessionId
      api.rekey(ctx.resolvedSessionId, data.session_id);
      ctx.resolvedSessionId = data.session_id;
      if (ctx.targetRef.current === 'state') {
        api.setSessionId(data.session_id);
      }
    }
    if (data.process_id) {
      ctx.processId = data.process_id;
      // Bookmark the active stream so a reload can reattach (cleared in stop()).
      try {
        if (api.currentProject) {
          sessionStorage.setItem(
            `etienne.activeStream.${api.currentProject}`,
            JSON.stringify({ processId: data.process_id, ts: Date.now() })
          );
        }
      } catch { /* storage full/blocked — reattach just won't work */ }
      if (ctx.targetRef.current === 'state') {
        api.setCurrentProcessId(data.process_id);
      }
    }
  },

  stdout(data, api) {
    const { ctx, splitParagraphSegments } = api;
    ctx.reconnectAttempts = 0; // a live chunk means the connection is healthy again
    const streamMsg = ctx.streamMsg;
    const { chunk } = data;
    const chunkTime = Date.now();
    api.ensureAssistantMessage();

    // Update last chunk time immediately
    ctx.lastChunkTime = chunkTime;

    // Trim leading linebreaks only if this is the first chunk
    const textToAdd = streamMsg.text === '' ? chunk.trimStart() : chunk;
    // Don't add extra line breaks - the chunk already contains proper formatting
    streamMsg.text += textToAdd;
    ctx.currentMessageText = streamMsg.text;

    // Accumulate text in buffer, then flush any complete paragraphs as
    // text_chunk structured messages (keeping the trailing partial buffered).
    ctx.textBuffer += chunk;
    const { segments, remainder } = splitParagraphSegments(ctx.textBuffer);
    if (segments.length > 0) {
      segments.forEach((segment, idx) => {
        const textChunk = {
          id: `text_${chunkTime}_${idx}`,
          type: 'text_chunk',
          content: segment,
          timestamp: chunkTime
        };
        api.updateStructuredMessages(prev => [...prev, textChunk]);
      });
      ctx.textBuffer = remainder;
    }

    api.updateMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        newMessages[newMessages.length - 1] = { ...streamMsg };
      } else {
        // Only add message to state if there's actual content
        if (streamMsg.text.trim()) {
          newMessages.push({ ...streamMsg });
        }
      }
      return newMessages;
    });
  },

  usage(data, api) {
    const { ctx } = api;
    const streamMsg = ctx.streamMsg;
    const usage = data;
    api.currentUsageRef.current = usage;
    ctx.currentUsage = usage;
    api.updateMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        newMessages[newMessages.length - 1] = {
          ...streamMsg,
          usage
        };
      }
      return newMessages;
    });
  },

  context_state(data, api) {
    const { ctx } = api;
    ctx.contextState = data;
    if (ctx.targetRef.current === 'state') {
      api.setContextState(data);
    }
  },

  compaction(data, api) {
    const compactionMsg = {
      id: `compaction_${Date.now()}`,
      role: 'system',
      kind: 'compaction',
      compaction: data,
      timestamp: data.timestamp || new Date().toISOString(),
    };
    api.updateMessages(prev => [...prev, compactionMsg]);
  },

  // Phase 1 events — post-stream callbacks
  session_end(data, api) {
    api.pushSystemEvent('session_end', `${data.reason} (${data.duration_ms}ms)`, data);
  },

  stop(data, api) {
    const bg = data.background_tasks?.length || 0;
    const crons = data.session_crons?.length || 0;
    const detail = bg || crons
      ? `${bg} background task(s), ${crons} scheduled cron(s)`
      : 'no background work';
    api.pushSystemEvent('stop', detail, data);
  },

  session_state(data, api) {
    api.pushSystemEvent('session_state', data.state, data);
  },

  // Phase 2 events — sub-agent lifecycle (reuse existing SubagentActivityMessage renderer)
  subagent_start(data, api) {
    api.updateStructuredMessages(prev => [...prev, {
      id: `subagent_start_${data.task_id || data.agent_id || Date.now()}`,
      type: 'subagent_start',
      name: data.agent_type || data.description || 'subagent',
      status: 'active',
      content: data.description,
      timestamp: Date.now()
    }]);
  },

  subagent_end(data, api) {
    api.updateStructuredMessages(prev => [...prev, {
      id: `subagent_end_${data.task_id || data.agent_id || Date.now()}`,
      type: 'subagent_end',
      name: data.agent_type || 'subagent',
      status: 'complete',
      content: data.summary,
      timestamp: Date.now()
    }]);
  },

  subagent_progress(data, api) {
    const summary = [data.last_tool_name, data.total_tokens && `${data.total_tokens} tok`].filter(Boolean).join(' · ');
    api.pushSystemEvent('subagent_progress', summary || data.description || data.task_id, data);
  },

  // Phase 3 events — status / quality-of-life
  status(data, api) {
    const parts = [
      data.status,
      data.message,  // e.g. queued → "Waiting for the previous task in this project to finish"
      data.permissionMode && `mode: ${data.permissionMode}`,
      data.compact_result && `compact: ${data.compact_result}`
    ].filter(Boolean);
    api.pushSystemEvent('status', parts.join(' · ') || 'idle', data);

    // Queued arrives before any stdout — create the empty assistant message
    // so the elapsed/typing indicator runs while waiting, instead of nothing.
    if (data.status === 'queued') {
      api.ensureAssistantMessage();
    }
  },

  rate_limit(data, api) {
    api.pushSystemEvent('rate_limit', data.message || 'Rate limit hit', data);
  },

  notification(data, api) {
    api.pushSystemEvent('notification', data.message || data.title || '', data);
  },

  prompt_suggestion(data, api) {
    api.pushSystemEvent('prompt_suggestion', data.suggestion || data.prompt || '', data);
  },

  // Aliased — render via existing renderers
  permission_denied(data, api) {
    api.updateStructuredMessages(prev => [...prev, {
      id: `permission_denied_${Date.now()}`,
      type: 'permission_request',
      permissionId: data.permissionId || `denied_${Date.now()}`,
      message: `Denied: ${data.tool_name || data.reason || 'tool use auto-denied'}`,
      timestamp: Date.now()
    }]);
  },

  memory_recall(data, api) {
    const facts = data.facts || data.items || data.memories || [];
    api.updateStructuredMessages(prev => [...prev, {
      id: `memory_recall_${Date.now()}`,
      type: 'memory_extracted',
      facts,
      count: facts.length || data.count,
      timestamp: Date.now()
    }]);
  },

  telemetry(data, api) {
    const { ctx } = api;
    const streamMsg = ctx.streamMsg;
    // Store spanId and traceId with the current assistant message for feedback
    if (data.span_id) {
      streamMsg.spanId = data.span_id;
      streamMsg.traceId = data.trace_id;
      api.updateMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = {
            ...streamMsg,
            spanId: data.span_id,
            traceId: data.trace_id
          };
        }
        return newMessages;
      });
    }
  },

  file_added(data, api) {
    const { claudeEventBus, ClaudeEvents } = api;
    const absolutePath = data.path;
    const relativePath = api.extractRelativePath(absolutePath);
    console.log(`[file_added] Absolute: ${absolutePath}, Relative: ${relativePath}`);

    // Dispatch claudeHook event for LiveHTMLPreview to refresh
    const claudeHookEvent = new CustomEvent('claudeHook', {
      detail: {
        hook: 'PostHook',
        file: absolutePath
      }
    });
    window.dispatchEvent(claudeHookEvent);
    console.log('[file_added] Dispatched claudeHook event for:', absolutePath);

    if (api.hasPreviewExtension(absolutePath)) {
      const viewer = api.getViewerForFile(absolutePath, api.autoPreviewExtensionMap);
      if (viewer) {
        claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
          action: `${viewer}-preview`,
          filePath: relativePath,
          projectName: api.currentProject
        });
      }
      api.fetchFile(relativePath, api.currentProject);
    }
  },

  file_changed(data, api) {
    const absolutePath = data.path;
    const relativePath = api.extractRelativePath(absolutePath);
    console.log(`[file_changed] Absolute: ${absolutePath}, Relative: ${relativePath}`);

    // Dispatch claudeHook event for LiveHTMLPreview to refresh
    const claudeHookEvent = new CustomEvent('claudeHook', {
      detail: {
        hook: 'PostHook',
        file: absolutePath
      }
    });
    window.dispatchEvent(claudeHookEvent);
    console.log('[file_changed] Dispatched claudeHook event for:', absolutePath);

    if (api.hasPreviewExtension(absolutePath)) {
      api.fetchFile(relativePath, api.currentProject);
    }
  },

  guardrails_triggered(data, api) {
    const { plugins, count, detections } = data;
    api.updateStructuredMessages(prev => [...prev, {
      id: `guardrails_${Date.now()}`,
      type: 'guardrails_warning',
      plugins,
      count,
      detections
    }]);
  },

  output_guardrails_triggered(data, api) {
    const { violations, count } = data;
    api.updateStructuredMessages(prev => [...prev, {
      id: `output_guardrails_${Date.now()}`,
      type: 'output_guardrails_warning',
      violations,
      count
    }]);
  },

  api_error(data, api) {
    const { message, fullError, timestamp, retryable } = data;
    console.error('API Error:', message, fullError);
    api.updateStructuredMessages(prev => [...prev, {
      id: `api_error_${Date.now()}`,
      type: 'api_error',
      message,
      fullError,
      retryable,
      timestamp
    }]);
    api.setRetryAvailable?.({ reason: message });
  },

  tool(data, api) {
    const { ctx } = api;
    const receivedTime = Date.now(); // Timestamp when we receive the event
    console.log('Tool event:', { tool: data.toolName, status: data.status, timestamp: receivedTime, callId: data.callId });

    // Flush any buffered text before the tool call
    // Use a timestamp slightly before the tool call to ensure proper ordering
    if (ctx.textBuffer.trim() && data.status === 'running') {
      const bufferContent = ctx.textBuffer;
      const bufferTimestamp = receivedTime - 1; // 1ms before tool call
      console.log('Flushing text buffer before tool call:', { timestamp: bufferTimestamp, preview: bufferContent.substring(0, 50) });
      api.updateStructuredMessages(prev => [...prev, {
        id: `text_${receivedTime}_before_tool`,
        type: 'text_chunk',
        content: bufferContent,
        timestamp: bufferTimestamp
      }]);
      ctx.textBuffer = '';
    }

    api.updateStructuredMessages(prev => {
      const existing = prev.find(msg => msg.id === data.callId);
      if (existing) {
        // Update existing tool call with new status
        console.log('Updating existing tool call:', { callId: data.callId, status: data.status });
        return prev.map(msg =>
          msg.id === data.callId
            ? {
                ...msg,
                type: 'tool_call',
                toolName: data.toolName,
                args: data.input,
                status: data.status,
                result: data.result
              }
            : msg
        );
      } else {
        // Add new tool call with timestamp from when we received it
        console.log('Adding new tool call:', { callId: data.callId, tool: data.toolName, timestamp: receivedTime });
        return [...prev, {
          id: data.callId,
          type: 'tool_call',
          toolName: data.toolName,
          args: data.input,
          status: data.status,
          result: data.result,
          timestamp: receivedTime
        }];
      }
    });

    // Forward UI action commands to active viewer iframes via custom event.
    // Tools with _action in their result (e.g. select_budget_items) are meant
    // to manipulate the state of a running MCP App viewer.
    if (data.status === 'complete' && data.result) {
      try {
        let resultObj = data.result;
        // Unwrap MCP CallToolResult format: { content: [{ type: 'text', text: '...' }] }
        if (resultObj?.content && Array.isArray(resultObj.content)) {
          const textBlock = resultObj.content.find(c => c.type === 'text');
          if (textBlock?.text) resultObj = JSON.parse(textBlock.text);
        }
        // Also handle plain string result
        if (typeof resultObj === 'string') resultObj = JSON.parse(resultObj);
        if (resultObj?._action) {
          console.log('[App] Dispatching mcp-viewer-command:', data.toolName, resultObj._action, resultObj);
          window.dispatchEvent(new CustomEvent('mcp-viewer-command', {
            detail: { toolName: data.toolName, action: resultObj._action, payload: resultObj },
          }));
        }
      } catch { /* ignore parse errors */ }
    }
  },

  // Two shapes arrive here:
  //  - Codex reasoning items: one event per COMPLETE reasoning block
  //  - Claude SDK thinking_delta: MANY small incremental chunks per block
  // Coalesce: append to the last structured message when it is a thinking
  // item; a tool/text item in between starts a new block. Without this,
  // every few-character delta becomes its own ThinkingTimeline row.
  thinking(data, api) {
    if (data.content) {
      const timestamp = Date.now();
      api.updateStructuredMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.type === 'thinking') {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + data.content
          };
          return updated;
        }
        return [...prev, {
          id: `thinking_${timestamp}`,
          type: 'thinking',
          content: data.content,
          timestamp
        }];
      });
    }
  },

  completed(data, api) {
    api.stop();
  },

  // Both application-level error events AND native EventSource transport errors
  // land here (same event type). Native transport errors arrive with data === null.
  error(data, api, e) {
    const { ctx } = api;

    if (data == null) {
      // Native transport error. Close IMMEDIATELY: otherwise the browser
      // auto-reconnects to the ORIGINAL streamPrompt URL, which re-submits the
      // prompt as a brand-new (double-billed) run.
      try { e?.target?.close?.(); } catch { /* ignore */ }
      if (!ctx.stopped && ctx.processId && (ctx.reconnectAttempts ?? 0) < 3) {
        ctx.reconnectAttempts = (ctx.reconnectAttempts ?? 0) + 1;
        api.pushSystemEvent('status', `Connection lost — reattaching (attempt ${ctx.reconnectAttempts})`, {});
        setTimeout(
          () => api.reattachToStream(ctx.processId, {
            existingCtx: ctx,
            lastEventId: ctx.lastEventId,
            currentProject: api.currentProject,
            autoPreviewExtensionMap: api.autoPreviewExtensionMap,
          }),
          1500 * ctx.reconnectAttempts
        );
        return; // backend keeps running inside its grace window
      }
      api.stop();
      return;
    }

    if (data.code === 'stream_not_found') {
      try {
        if (api.currentProject) sessionStorage.removeItem(`etienne.activeStream.${api.currentProject}`);
      } catch { /* ignore */ }
      api.stop();
      return;
    }

    if (data.recoverable) {
      // Backend kept going — surface it, keep streaming.
      api.pushSystemEvent('error', data.message, data);
      return;
    }
    if (data.message) {
      api.pushSystemEvent('error', data.message, data);
      api.setRetryAvailable?.({ reason: data.message });
    }
    api.stop();
  },
};
