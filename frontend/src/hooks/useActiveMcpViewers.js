import { useEffect, useSyncExternalStore } from 'react';

/**
 * Tiny shared store tracking which MCP groups have an active McpUIPreview tab.
 * McpUIPreview registers on mount and unregisters on unmount.
 * StreamingTimeline reads the set to suppress inline rendering when a preview is open.
 */

// Map of mcpGroup -> count of active viewers (supports multiple viewers per group)
const activeGroups = new Map();
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Snapshot: returns a stable Set of active group names
let snapshot = new Set();
function getSnapshot() {
  return snapshot;
}

function rebuildSnapshot() {
  snapshot = new Set(activeGroups.keys());
}

/**
 * Register an MCP group as having an active viewer.
 * Call the returned cleanup function on unmount.
 */
export function registerMcpViewer(mcpGroup) {
  activeGroups.set(mcpGroup, (activeGroups.get(mcpGroup) || 0) + 1);
  rebuildSnapshot();
  notify();

  return () => {
    const count = (activeGroups.get(mcpGroup) || 1) - 1;
    if (count <= 0) {
      activeGroups.delete(mcpGroup);
    } else {
      activeGroups.set(mcpGroup, count);
    }
    rebuildSnapshot();
    notify();
  };
}

/**
 * Hook: returns the Set of MCP groups that currently have an open preview tab.
 */
export function useActiveMcpViewers() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Hook for McpUIPreview: registers this viewer's MCP group on mount,
 * unregisters on unmount.
 */
export function useRegisterMcpViewer(mcpGroup) {
  useEffect(() => {
    return registerMcpViewer(mcpGroup);
  }, [mcpGroup]);
}
