import { useEffect, useCallback } from 'react';
import { useMuxSSE } from '../contexts/MuxSSEContext';
import useTabStateStore from '../stores/useTabStateStore';

export default function useTabStateSSE(projectName) {
  const mux = useMuxSSE();
  const setTabState = useTabStateStore(s => s.setTabState);

  const handler = useCallback((data, type) => {
    console.log('[useTabStateSSE] event received:', type, data?.group, data?.name, data?.event?.group, data?.event?.name);
    // Raw event (no rules matched)
    if (type === 'event' && data.group === 'Email' && data.name === 'Email Received') {
      console.log('[useTabStateSSE] Setting orange indicator on #imap/inbox for project:', projectName);
      setTabState(projectName, '#imap/inbox', 'orange');
    }
    // Rule execution (rules matched — the event is nested in data.event)
    if (type === 'rule-execution' && data.event?.group === 'Email' && data.event?.name === 'Email Received') {
      console.log('[useTabStateSSE] Setting orange indicator (rule-execution) on #imap/inbox for project:', projectName);
      setTabState(projectName, '#imap/inbox', 'orange');
    }
  }, [projectName, setTabState]);

  useEffect(() => {
    console.log('[useTabStateSSE] mount effect — mux:', !!mux, 'projectName:', projectName);
    if (!mux || !projectName) return;
    console.log('[useTabStateSSE] subscribing to events:*');
    mux.on('events', '*', handler);
    return () => {
      console.log('[useTabStateSSE] unsubscribing from events:*');
      mux.off('events', '*', handler);
    };
  }, [mux, projectName, handler]);
}
