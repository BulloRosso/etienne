import { useEffect, useRef, useCallback } from 'react';
import { authSSEUrl } from '../services/api';

/**
 * Multiplexed SSE hook — replaces multiple EventSource connections with one.
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
 */
export default function useMultiplexSSE(project) {
  const esRef = useRef(null);
  const listenersRef = useRef(new Map()); // key: "channel:type" → Set<handler>
  const connectedRef = useRef(false);

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
      // Close any stale connection
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
        connectedRef.current = false;
      }
      return;
    }

    let reconnectTimer = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      if (esRef.current) {
        esRef.current.close();
      }

      const url = authSSEUrl(`/api/sse/stream/${encodeURIComponent(project)}`);
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('mux', (e) => {
        try {
          const { channel, type, payload } = JSON.parse(e.data);
          dispatch(channel, type, payload);
        } catch (err) {
          console.error('[MuxSSE] parse error', err);
        }
      });

      es.onopen = () => {
        connectedRef.current = true;
        console.log(`[MuxSSE] Connected for project ${project}`);
      };

      es.onerror = () => {
        connectedRef.current = false;
        es.close();
        // Reconnect after 3 seconds
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      connectedRef.current = false;
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
