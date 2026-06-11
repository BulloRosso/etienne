// useProjectInterceptorEvents — subscribes to the per-project interceptor channel
// and routes each event through the interceptorEventHandlers registry. (Phase 4.)
//
// The subscription stays stable across [currentProject, mux]; a ref holds the
// latest `api` so handlers always read current state (e.g. hasSessions) without
// re-subscribing on every render.

import { useEffect, useRef } from 'react';
import { dispatchInterceptorEvent } from './interceptorEventHandlers';

/**
 * @param {object} deps
 * @param {string} deps.currentProject
 * @param {ReturnType<import('../../hooks/useMultiplexSSE').default>} deps.mux
 * @param {object} deps.api  capability object consumed by the handlers
 */
export default function useProjectInterceptorEvents({ currentProject, mux, api }) {
  // Keep a ref to the latest api so the stable subscription reads fresh values.
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!currentProject) return undefined;

    const handler = (event) => dispatchInterceptorEvent(event, apiRef.current);

    mux.on('interceptor', '*', handler);
    return () => mux.off('interceptor', '*', handler);
  }, [currentProject, mux]);
}
