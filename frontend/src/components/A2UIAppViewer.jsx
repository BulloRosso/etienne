import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { A2uiSurface, MarkdownContext } from '@a2ui/react/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';
import { muiCatalog } from './a2ui/muiCatalog';
import { apiFetch } from '../services/api';

/**
 * A2UIAppViewer — opens a `.a2ui` descriptor file and renders the A2UI app it points at.
 *
 * Descriptor (JSON):
 *   {
 *     "endpoint": "/a2ui-restaurant",   // proxy prefix forwarded to the agent's :PORT/a2a
 *     "title":    "Restaurant Booking", // optional, shown in the footer
 *     "prompt":   "book a table"        // optional, initial user message; defaults to "start"
 *   }
 *
 * The viewer POSTs A2A `message/stream` to `${endpoint}/a2a`, feeds A2UI v0.9 messages
 * (riding inside A2A DataParts) into a MessageProcessor, and renders the resulting
 * surface via @a2ui/react's <A2uiSurface />. Action callbacks round-trip via
 * `action/submit` on the same endpoint.
 */
export default function A2UIAppViewer({ filename, projectName }) {
  const [descriptor, setDescriptor] = useState(null);
  const [descriptorError, setDescriptorError] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState(null);
  const [surfaces, setSurfaces] = useState([]);
  const streamIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setDescriptor(null);
    setDescriptorError(null);
    setStatus('loading');
    setSurfaces([]);

    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load descriptor: ${res.statusText}`);
        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error(`Descriptor is not valid JSON: ${e.message}`);
        }
        if (!parsed.endpoint || typeof parsed.endpoint !== 'string') {
          throw new Error('Descriptor is missing required "endpoint" field.');
        }
        if (!cancelled) setDescriptor(parsed);
      })
      .catch((err) => {
        if (!cancelled) setDescriptorError(String(err?.message || err));
      });

    return () => { cancelled = true; };
  }, [filename, projectName]);

  useEffect(() => {
    if (!descriptor) return undefined;

    const abort = new AbortController();
    setStatus('connecting');
    setSurfaces([]);
    streamIdRef.current = null;

    const endpoint = descriptor.endpoint.replace(/\/$/, '');
    const initialPrompt = descriptor.prompt || 'start';

    const processor = new MessageProcessor([muiCatalog], async (action) => {
      const streamId = streamIdRef.current;
      if (!streamId) return;
      try {
        await fetch(`${endpoint}/a2a`, {
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
        console.error('[A2UIAppViewer] action/submit failed', err);
      }
    });

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
        message: { role: 'user', parts: [{ kind: 'text', text: initialPrompt }] },
      },
    });

    fetchEventSource(`${endpoint}/a2a`, {
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
        if (response.ok) { setStatus('open'); return; }
        throw new Error(`Agent returned ${response.status}`);
      },
      onmessage: (ev) => {
        if (!ev.data) return;
        let parsed;
        try { parsed = JSON.parse(ev.data); } catch { return; }
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
          console.error('[A2UIAppViewer] processMessages failed', err);
        }
      },
      onerror: (err) => {
        setStatus('error');
        setErrorMessage(String(err?.message || err || 'Connection failed'));
        throw err;
      },
    }).catch((err) => {
      if (!abort.signal.aborted) {
        console.error('[A2UIAppViewer] stream ended', err);
      }
    });

    return () => {
      abort.abort();
      subCreated.unsubscribe?.();
      subDeleted.unsubscribe?.();
    };
  }, [descriptor]);

  if (descriptorError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Cannot open A2UI app</Typography>
          <Typography variant="caption">{descriptorError}</Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'auto', p: 2 }}>
      {(status === 'loading' || status === 'connecting') && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">
            {status === 'loading' ? 'Loading descriptor…' : 'Connecting to A2UI agent…'}
          </Typography>
        </Box>
      )}
      {status === 'error' && descriptor && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Could not reach the A2UI agent.</Typography>
          <Typography variant="caption">{errorMessage}</Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
            Endpoint: <code>{descriptor.endpoint}</code>
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
      {descriptor && (
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, pt: 1, borderTop: 1, borderColor: 'divider', fontFamily: 'monospace' }}>
          A2UI · v0.9 · transport: A2A+SSE · {descriptor.title || filename} · endpoint: {descriptor.endpoint}
        </Typography>
      )}
    </Box>
  );
}
