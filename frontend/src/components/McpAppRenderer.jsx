import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { AppRenderer } from '@mcp-ui/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UI_EXTENSION_CAPABILITIES } from '@mcp-ui/client';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

// Sandbox proxy served by mcpSandboxProxyPlugin in vite.config.js on the same origin.
const SANDBOX_PROXY_URL = new URL('/sandbox-proxy', window.location.origin);

/**
 * McpAppRenderer — renders an MCP App (interactive UI) inline in the chat.
 *
 * Connects to the backend MCP server via StreamableHTTPClientTransport and uses
 * @mcp-ui/client's AppRenderer to display the tool's UI resource in a sandboxed iframe.
 *
 * @param {string} mcpGroup - MCP server group name (e.g., 'etienne-configuration')
 * @param {string} toolName - MCP tool name that triggered this UI (e.g., 'list_services')
 * @param {string} resourceUri - The resource URI (e.g., 'ui://etienne-config/dashboard.html')
 * @param {object} toolInput - Tool input arguments
 * @param {object} toolResult - Tool execution result (MCP CallToolResult format)
 */
export default function McpAppRenderer({ mcpGroup, toolName, resourceUri, toolInput, toolResult }) {
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(500);
  const { mode: themeMode } = useThemeMode();
  const clientRef = useRef(null);

  // Extract raw tool name from MCP-prefixed format (mcp__group__tool -> tool)
  const rawToolName = toolName.startsWith('mcp__')
    ? toolName.split('__').slice(2).join('__')
    : toolName;

  // Build the CallToolResult in MCP format if we have a raw result
  const mcpToolResult = toolResult
    ? {
        content: [{ type: 'text', text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult) }],
      }
    : undefined;

  // Connect MCP client to backend
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const mcpUrl = new URL(`/mcp/${mcpGroup}`, window.location.origin);

        const transport = new StreamableHTTPClientTransport(mcpUrl, {
          requestInit: {
            headers: {
              'Authorization': 'test123',
            },
          },
        });

        const mcpClient = new Client(
          { name: 'frontend-mcp-app-host', version: '1.0.0' },
          {
            capabilities: {
              roots: { listChanged: false },
              extensions: UI_EXTENSION_CAPABILITIES,
            },
          },
        );

        await mcpClient.connect(transport);

        if (!cancelled) {
          clientRef.current = mcpClient;
          setClient(mcpClient);
          setConnecting(false);
        } else {
          await mcpClient.close();
        }
      } catch (err) {
        console.error('[McpAppRenderer] Connection error:', err);
        if (!cancelled) {
          setError(err);
          setConnecting(false);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.close().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [mcpGroup]);

  const handleSizeChanged = useCallback((params) => {
    if (params.height) {
      setIframeHeight(Math.min(params.height, 800));
    }
  }, []);

  const handleOpenLink = useCallback(async (params) => {
    if (params.url) {
      window.open(params.url, '_blank', 'noopener,noreferrer');
    }
    return {};
  }, []);

  const handleError = useCallback((err) => {
    console.error('[McpAppRenderer] App error:', err);
    setError(err);
  }, []);

  if (error) {
    return (
      <Box sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'error.main',
        borderRadius: 1,
        bgcolor: themeMode === 'dark' ? '#2c1a1a' : '#fff5f5',
      }}>
        <Typography variant="body2" color="error">
          MCP App Error: {error.message}
        </Typography>
      </Box>
    );
  }

  if (connecting) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Connecting to MCP server...
        </Typography>
      </Box>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <Box sx={{
      width: '100%',
      height: `${iframeHeight}px`,
      minHeight: '200px',
      maxHeight: '800px',
      border: '1px solid',
      borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <AppRenderer
        client={client}
        toolName={rawToolName}
        toolResourceUri={resourceUri}
        toolInput={toolInput || {}}
        toolResult={mcpToolResult}
        sandbox={{ url: SANDBOX_PROXY_URL }}
        onSizeChanged={handleSizeChanged}
        onOpenLink={handleOpenLink}
        onError={handleError}
        hostContext={{
          theme: themeMode === 'dark' ? 'dark' : 'light',
          platform: 'web',
        }}
      />
    </Box>
  );
}
