// useGlobalInterceptorEvents — subscribes to the global interceptor channel and
// raises pairing-request dialogs. (Phase 4 of the App.jsx decomposition.)

import { useEffect } from 'react';

/**
 * @param {object} deps
 * @param {ReturnType<import('../../hooks/useMultiplexSSE').default>} deps.mux
 * @param {(type: string, data: any) => boolean} deps.openHitlFromEvent
 */
export default function useGlobalInterceptorEvents({ mux, openHitlFromEvent }) {
  useEffect(() => {
    const handler = (event) => {
      console.log('Global interceptor event:', event.type, event.data);
      if (event.type === 'pairing_request') {
        // Dedupe + open handled inside the HITL hook.
        openHitlFromEvent('pairing_request', event.data);
      }
    };
    mux.on('interceptor-global', '*', handler);
    return () => mux.off('interceptor-global', '*', handler);
  }, [mux, openHitlFromEvent]);
}
