import { useEffect, useRef, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_BASE } from '../services/api';

/**
 * Multiplexed SSE hook — replaces multiple EventSource connections with one.
 * Uses fetch-based SSE client to support Authorization headers (no token in URL).
 * Supports Last-Event-Id for reliable reconnection with event replay.
 *
 * Usage:
 *   const mux = useMultiplexSSE(project);
 *   mux.on('interceptor', '*', handler);          // all interceptor events
 *   mux.on('research', 'Research.started', handler); // specific type
 *   mux.on('budget', 'budget-update', handler);
 *   mux.on('events', 'prompt-execution', handler);
 *   mux.on('interceptor-global', '*', handler);
 *
 * Returns { on, off, connected }
 *
 * @typedef {'interceptor'|'interceptor-global'|'research'|'budget'|'events'|'heartbeat'|'system'} MuxChannel
 * @typedef {(payload: any, type: string) => void} MuxHandler
 */
export default function useMultiplexSSE(project) {
  const abortRef = useRef(null);
  const listenersRef = useRef(new Map()); // key: "channel:type" → Set<handler>
  const connectedRef = useRef(false);
  const lastEventIdRef = useRef(null);

  // Stable dispatch function
  const dispatch = useCallback((channel, type, payload) => {
    const specificKey = `${channel}:${type}`;
    const wildcardKey = `${channel}:*`;

    const fire = (key) => {
      const handlers = listenersRef.current.get(key);
      if (handlers) {
        handlers.forEach((h) => {
          try { h(payload, type); } catch (e) { console.error('[MuxSSE] handler error', e); }
        });
      }
    };

    fire(specificKey);
    fire(wildcardKey);
  }, []);

  // Connect / reconnect
  useEffect(() => {
    if (!project) {
      // Abort any existing connection
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        connectedRef.current = false;
      }
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const getToken = () =>
      localStorage.getItem('auth_accessToken') ||
      sessionStorage.getItem('auth_accessToken');

    const url = `${API_BASE}/api/sse/stream/${encodeURIComponent(project)}`;

    // Custom fetch wrapper that injects fresh Authorization + Last-Event-Id
    // on every request (including retries after disconnection).
    const authFetch = (input, init) => {
      const headers = new Headers(init?.headers || {});
      const token = getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (lastEventIdRef.current) {
        headers.set('Last-Event-Id', lastEventIdRef.current);
      }
      return fetch(input, { ...init, headers });
    };

    fetchEventSource(url, {
      signal: ctrl.signal,
      fetch: authFetch,

      onopen: async (response) => {
        if (response.ok) {
          connectedRef.current = true;
          console.log(`[MuxSSE] Connected for project ${project}`);
          return;
        }
        if (response.status === 401) {
          // Token expired — try refreshing before the library retries
          const refreshToken = localStorage.getItem('auth_refreshToken')
            || sessionStorage.getItem('auth_refreshToken');
          if (refreshToken) {
            try {
              const refreshResp = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
              });
              if (refreshResp.ok) {
                const data = await refreshResp.json();
                const storage = localStorage.getItem('auth_accessToken')
                  ? localStorage : sessionStorage;
                storage.setItem('auth_accessToken', data.accessToken);
              }
            } catch (e) {
              console.error('[MuxSSE] Token refresh failed', e);
            }
          }
          throw new Error('Unauthorized — will retry with refreshed token');
        }
        throw new Error(`SSE connection failed: ${response.status}`);
      },

      onmessage: (event) => {
        // Track sequence for Last-Event-Id reconnection
        if (event.id) {
          lastEventIdRef.current = event.id;
        }

        if (event.event === 'mux') {
          try {
            const { channel, type, payload } = JSON.parse(event.data);
            dispatch(channel, type, payload);
          } catch (err) {
            console.error('[MuxSSE] parse error', err);
          }
        }
      },

      onerror: (err) => {
        connectedRef.current = false;
        if (ctrl.signal.aborted) {
          // Don't retry if intentionally aborted
          throw err;
        }
        console.warn('[MuxSSE] connection error, will retry', err?.message || err);
        // Returning nothing lets fetchEventSource retry with default backoff.
        // Throwing would stop retrying entirely.
      },

      // Keep connection alive when tab is hidden (prevent browser from closing it)
      openWhenHidden: true,
    });

    return () => {
      ctrl.abort();
      abortRef.current = null;
      connectedRef.current = false;
      lastEventIdRef.current = null;
    };
  }, [project, dispatch]);

  // Subscribe to a channel + type
  const on = useCallback((channel, type, handler) => {
    const key = `${channel}:${type}`;
    if (!listenersRef.current.has(key)) {
      listenersRef.current.set(key, new Set());
    }
    listenersRef.current.get(key).add(handler);
  }, []);

  // Unsubscribe
  const off = useCallback((channel, type, handler) => {
    const key = `${channel}:${type}`;
    const set = listenersRef.current.get(key);
    if (set) {
      set.delete(handler);
      if (set.size === 0) listenersRef.current.delete(key);
    }
  }, []);

  return { on, off, connected: connectedRef };
}
