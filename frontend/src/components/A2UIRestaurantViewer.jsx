import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface, MarkdownContext } from '@a2ui/react/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';
import { muiCatalog } from './a2ui/muiCatalog';

/**
 * A2UIRestaurantViewer — preview-pane viewer for the a2ui-restaurant demo.
 *
 * Opens an A2A message/stream over SSE to the local A2UI agent at :4110
 * (proxied as /a2ui-restaurant). Feeds the A2UI v0.9 messages riding inside
 * each A2A DataPart into a MessageProcessor and renders the resulting surface
 * via @a2ui/react's <A2uiSurface />.
 *
 * No MCP, no iframe, no Google services involved.
 *
 * Props:
 *   servicePath – e.g. "#a2ui-restaurant/booking"
 *   projectName – current project name (unused for this demo, kept for symmetry)
 */
export default function A2UIRestaurantViewer({ servicePath: _servicePath, projectName: _projectName }) {
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const processorRef = useRef(null);
  const streamIdRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;

    const processor = new MessageProcessor([muiCatalog], async (action) => {
      const streamId = streamIdRef.current;
      if (!streamId) return;
      try {
        await fetch('/a2ui-restaurant/a2a', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'action/submit',
            params: { streamId, action },
          }),
        });
      } catch (err) {
        console.error('[A2UIRestaurantViewer] action/submit failed', err);
      }
    });
    processorRef.current = processor;

    const subCreated = processor.onSurfaceCreated((surface) => {
      setSurfaces((prev) => (prev.find((s) => s.id === surface.id) ? prev : [...prev, surface]));
    });
    const subDeleted = processor.onSurfaceDeleted((id) => {
      setSurfaces((prev) => prev.filter((s) => s.id !== id));
    });

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'message/stream',
      params: {
        message: {
          role: 'user',
          parts: [{ kind: 'text', text: 'book a table' }],
        },
      },
    });

    fetchEventSource('/a2ui-restaurant/a2a', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-A2A-Extensions': 'https://a2ui.org/a2a-extension/a2ui/v0.8',
      },
      body,
      signal: abort.signal,
      openWhenHidden: true,
      onopen: async (response) => {
        if (response.ok) {
          setStatus('open');
          return;
        }
        throw new Error(`Agent returned ${response.status}`);
      },
      onmessage: (ev) => {
        if (!ev.data) return;
        let parsed;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (ev.event === 'stream-open') {
          streamIdRef.current = parsed.streamId;
          return;
        }
        const a2aMessage = parsed?.result;
        const parts = a2aMessage?.parts || [];
        const a2uiMessages = parts
          .filter((p) => p.kind === 'data' && p.metadata?.mimeType === 'application/json+a2ui')
          .map((p) => p.data);
        if (a2uiMessages.length === 0) return;
        try {
          processor.processMessages(a2uiMessages);
        } catch (err) {
          console.error('[A2UIRestaurantViewer] processMessages failed', err);
        }
      },
      onerror: (err) => {
        setStatus('error');
        setErrorMessage(String(err?.message || err || 'Connection failed'));
        throw err; // stop retrying
      },
    }).catch((err) => {
      // fetchEventSource throws once retries are abandoned
      if (!abort.signal.aborted) {
        console.error('[A2UIRestaurantViewer] stream ended', err);
      }
    });

    return () => {
      abort.abort();
      subCreated.unsubscribe?.();
      subDeleted.unsubscribe?.();
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'auto', p: 2 }}>
      {status === 'connecting' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">Connecting to A2UI agent…</Typography>
        </Box>
      )}
      {status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Could not reach the A2UI agent.</Typography>
          <Typography variant="caption">{errorMessage}</Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
            Start it with <code>cd a2ui-app-restaurant-booking && npm start</code>.
          </Typography>
        </Alert>
      )}
      <MarkdownContext.Provider value={renderMarkdown}>
        <Box sx={{ flex: 1 }}>
          {surfaces.map((surface) => (
            <Box key={surface.id} sx={{ mb: 2 }}>
              <A2uiSurface surface={surface} />
            </Box>
          ))}
        </Box>
      </MarkdownContext.Provider>
      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, pt: 1, borderTop: 1, borderColor: 'divider', fontFamily: 'monospace' }}>
        A2UI · v0.9 · transport: A2A+SSE · agent: localhost:4110
      </Typography>
    </Box>
  );
}
