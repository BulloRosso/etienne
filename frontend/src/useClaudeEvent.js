// useClaudeEvent.js - React hook for subscribing to events
import { useEffect } from 'react';
import { claudeEventBus } from './eventBus';

export function useClaudeEvent(eventType, callback, deps = []) {
  useEffect(() => {
    const unsubscribe = claudeEventBus.subscribe(eventType, callback);
    return unsubscribe;
  }, [eventType, ...deps]);
}
