import { useState, useEffect } from 'react';

/**
 * Hook to fetch MCP App tool metadata from the backend.
 * Returns a map keyed by both the raw toolName AND the MCP-prefixed name
 * (mcp__<group>__<tool>) -> { group, resourceUri }.
 * This allows matching regardless of how the tool name appears in SSE events.
 */
export default function useMcpAppMeta() {
  const [appMeta, setAppMeta] = useState(new Map());

  useEffect(() => {
    async function fetchMeta() {
      try {
        const res = await fetch('/mcp/tool-app-meta', {
          headers: { Authorization: 'test123' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const map = new Map();
        for (const entry of data) {
          const value = { group: entry.group, resourceUri: entry.resourceUri };
          // Register under both the raw name and MCP-prefixed name
          map.set(entry.toolName, value);
          if (entry.mcpToolName) {
            map.set(entry.mcpToolName, value);
          }
        }
        setAppMeta(map);
      } catch (err) {
        console.error('[useMcpAppMeta] Failed to fetch:', err);
      }
    }
    fetchMeta();
  }, []);

  return appMeta;
}
