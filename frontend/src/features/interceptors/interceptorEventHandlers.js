// Registry for the project interceptor SSE handler (Phase 4 of the App.jsx
// decomposition). Keyed by the top-level event.type; the `event` type fans out
// to several event_type sub-handlers. Each handler is (event, api) => void.
//
// The `api` capability object (built in useProjectInterceptorEvents):
//   {
//     currentProject,
//     t,                          // i18n translate
//     streamSessions,
//     setStructuredMessages, setMessages, setKnowledgeToast, setHasSessions,
//     getHasSessions,             // () => boolean (avoids stale closure)
//     currentMessageRef, currentSessionIdRef,
//     hasPreviewExtension, extractRelativePath, fetchFile,
//     openHitlFromEvent,
//     apiFetch,
//   }

function handleHook(event, api) {
  const hookData = event.data;
  const eventType = hookData.event_type;
  console.log('Hook event:', eventType, hookData);

  if (eventType === 'PreToolUse') {
    console.log('PreToolUse hook received:', hookData);
    return;
  }
  if (eventType !== 'PostToolUse') return;

  const toolName = hookData.tool_name;
  const toolInput = hookData.tool_input;
  const toolOutput = hookData.tool_output;

  if (!toolName) {
    console.warn('Could not find tool_name in PostToolUse hook:', hookData);
    return;
  }

  console.log('PostToolUse hook received:', hookData);

  // Forward MCP viewer commands: if the tool result contains _action, dispatch to
  // any open McpUIPreview tab. Secondary routing path (primary is the SSE tool event).
  if (toolOutput) {
    try {
      let resultObj = toolOutput;
      if (resultObj?.content && Array.isArray(resultObj.content)) {
        const textBlock = resultObj.content.find(c => c.type === 'text');
        if (textBlock?.text) resultObj = JSON.parse(textBlock.text);
      }
      if (typeof resultObj === 'string') resultObj = JSON.parse(resultObj);
      if (resultObj?._action) {
        console.log('[Interceptor] Dispatching mcp-viewer-command from PostToolUse:', toolName, resultObj._action);
        window.dispatchEvent(new CustomEvent('mcp-viewer-command', {
          detail: { toolName, action: resultObj._action, payload: resultObj },
        }));
      }
    } catch { /* ignore parse errors */ }
  }

  // Dispatch claudeHook event for file operations
  const fileOperationTools = ['Edit', 'Write', 'NotebookEdit'];
  if (fileOperationTools.includes(toolName) && toolInput?.file_path) {
    const claudeHookEvent = new CustomEvent('claudeHook', {
      detail: { hook: 'PostHook', file: toolInput.file_path }
    });
    window.dispatchEvent(claudeHookEvent);
    console.log('Dispatched claudeHook for file:', toolInput.file_path);

    const filePath = toolInput.file_path;
    if (api.hasPreviewExtension(filePath)) {
      const relativePath = api.extractRelativePath(filePath);
      setTimeout(() => {
        api.fetchFile(relativePath, api.currentProject);
      }, 800);
    }
  }
}

function handleEvent(event, api) {
  const eventData = event.data;
  const eventType = eventData.event_type;
  console.log('Event (not hook):', eventType, eventData);

  if (eventType === 'MemoryExtracted') {
    api.setStructuredMessages(prev => [...prev, {
      id: `memory_${Date.now()}`,
      type: 'memory_extracted',
      facts: eventData.facts || [],
      count: eventData.count || 0
    }]);
  }

  if (eventType === 'file_added' || eventType === 'file_changed') {
    const absolutePath = eventData.path;
    if (absolutePath) {
      const relativePath = api.extractRelativePath(absolutePath);
      console.log(`[mux ${eventType}] Absolute: ${absolutePath}, Relative: ${relativePath}`);

      // Dispatch claudeHook event for LiveHTMLPreview to refresh
      const claudeHookEvent = new CustomEvent('claudeHook', {
        detail: { hook: 'PostHook', file: absolutePath }
      });
      window.dispatchEvent(claudeHookEvent);
      console.log(`[mux ${eventType}] Dispatched claudeHook event for:`, absolutePath);

      if (api.hasPreviewExtension(absolutePath)) {
        api.fetchFile(relativePath, api.currentProject);
      }
    }
  }

  if (eventType === 'knowledge-acquired') {
    // Dispatch window event for KnowledgeViewer to pick up
    window.dispatchEvent(new CustomEvent('knowledgeAcquired', { detail: eventData }));
    // Show global toast so user sees confirmation regardless of active tab
    const msg = eventData.summary || `Learned from ${eventData.document || 'document'}`;
    api.setKnowledgeToast({ open: true, message: msg });
  }

  if (eventType === 'Notification' && eventData.message) {
    const msg = eventData.message.toLowerCase();
    if (msg.includes('permission') || msg.includes('allow') || msg.includes('grant')) {
      api.setStructuredMessages(prev => [...prev, {
        id: `perm_${Date.now()}`,
        type: 'permission_request',
        permissionId: `perm_${Date.now()}`,
        message: eventData.message
      }]);
    }
  }

  if (eventType === 'Stop' && eventData.reason === 'completed') {
    try {
      const notifChannels = JSON.parse(localStorage.getItem('notificationChannels') || '[]');
      if (notifChannels.includes('desktop') && 'Notification' in window && Notification.permission === 'granted') {
        const body = api.currentMessageRef.current.text?.substring(0, 100) || api.t('app.taskCompletedBody');
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready
            .then(reg => reg.showNotification(api.t('app.taskCompleted'), { body }))
            .catch(() => new Notification(api.t('app.taskCompleted'), { body }));
        } else {
          new Notification(api.t('app.taskCompleted'), { body });
        }
        // Track desktop notification in recent items so it appears in the sidebar
        api.apiFetch('/api/recent-items/notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: body, projectName: api.currentProject }),
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // Track remote/external streaming sessions via interceptor events.
  // Handles streams started by Telegram, Teams, scheduled tasks, etc.
  if (eventType === 'SessionStart' && eventData.session_id) {
    // Only register if not already tracked (local streams register via handleSendMessage)
    if (!api.streamSessions.isSessionStreaming(eventData.session_id)) {
      api.streamSessions.startStream(eventData.session_id, null, null);
    }
  }
  if (eventType === 'Stop' && eventData.session_id) {
    // Remove from streaming if it was a remote session (no local EventSource)
    const ctx = api.streamSessions.getStreamContext(eventData.session_id);
    if (ctx && !ctx.eventSource) {
      api.streamSessions.stopStream(eventData.session_id);
    }
  }
}

function handleChatMessage(event, api) {
  const chatData = event.data;
  console.log('Remote chat message received:', chatData);

  const isRemoteMessage = chatData.source === 'remote';
  const sessionMatches = !api.currentSessionIdRef.current || api.currentSessionIdRef.current === chatData.sessionId;

  if (isRemoteMessage || sessionMatches) {
    const newMessage = {
      role: chatData.isAgent ? 'assistant' : 'user',
      text: chatData.message,
      timestamp: new Date(chatData.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false
      }),
      usage: chatData.costs,
      source: chatData.source,
      sourceMetadata: chatData.sourceMetadata
    };
    api.setMessages(prev => [...prev, newMessage]);
    if (!api.getHasSessions()) api.setHasSessions(true);
  }
}

const HITL_EVENT_TYPES = new Set([
  'elicitation_request',
  'permission_request',
  'ask_user_question',
  'plan_approval',
  'hitl_request',
]);

/**
 * Dispatch a project interceptor event to the right handler.
 * @param {{type: string, data: any}} event
 * @param {object} api
 */
export function dispatchInterceptorEvent(event, api) {
  // Log ALL interceptor events for debugging
  console.log('Interceptor event:', event.type, event.data);

  if (event.type === 'hook') {
    handleHook(event, api);
  } else if (event.type === 'event') {
    handleEvent(event, api);
  } else if (HITL_EVENT_TYPES.has(event.type)) {
    // Raise the corresponding HITL dialog (dedupe handled inside the hook).
    api.openHitlFromEvent(event.type, event.data);
  } else if (event.type === 'chat_message') {
    handleChatMessage(event, api);
  }
}
