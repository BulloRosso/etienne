import { useEffect, useCallback, useRef } from 'react';
import { useMuxSSE } from '../contexts/MuxSSEContext';
import useTabStateStore from '../stores/useTabStateStore';

export default function useTabStateSSE(projectName, openFilePaths) {
  const mux = useMuxSSE();
  const setTabState = useTabStateStore(s => s.setTabState);
  const openFilePathsRef = useRef(openFilePaths);
  openFilePathsRef.current = openFilePaths;

  const handler = useCallback((data, type) => {
    const event = type === 'rule-execution' ? data.event : (type === 'event' ? data : null);
    if (!event) return;

    // Email received → orange on IMAP inbox tab
    if (event.group === 'Email' && event.name === 'Email Received') {
      setTabState(projectName, '#imap/inbox', 'orange');
    }

    // File modified → orange on matching open tab
    if (event.group === 'Filesystem' && (event.name === 'File Modified' || event.name === 'File Created')) {
      const rawPath = event.payload?.path;
      if (!rawPath) return;
      // Normalize backslashes to forward slashes (Windows paths)
      const eventPath = rawPath.replace(/\\/g, '/');
      const prefix = projectName + '/';
      const tabPath = eventPath.startsWith(prefix) ? eventPath.slice(prefix.length) : eventPath;
      const paths = openFilePathsRef.current || [];
      if (paths.includes(tabPath)) {
        setTabState(projectName, tabPath, 'orange');
      }
    }
  }, [projectName, setTabState]);

  useEffect(() => {
    if (!mux || !projectName) return;
    mux.on('events', '*', handler);
    return () => mux.off('events', '*', handler);
  }, [mux, projectName, handler]);
}
