import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AppRenderer } from '@mcp-ui/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UI_EXTENSION_CAPABILITIES } from '@mcp-ui/client';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const SANDBOX_PROXY_URL = new URL('/sandbox-proxy', window.location.origin);

/**
 * McpUIPreview — renders file content via an MCP server group's tool + UI resource.
 *
 * Unlike McpAppRenderer (which receives a pre-computed toolResult from a chat tool call),
 * this component initiates the tool call itself, passing the file content as input.
 *
 * @param {string} filename - File path being previewed
 * @param {string} content - Raw file content to pass to the MCP tool
 * @param {string} mcpGroup - MCP server group name (e.g. 'budget')
 * @param {string} mcpToolName - Tool to call (e.g. 'render_budget')
 * @param {string} projectName - Current project name
 */
export default function McpUIPreview({ filename, content, mcpGroup, mcpToolName, projectName, onViewerStateChange }) {
  const { t } = useTranslation();
  const [client, setClient] = useState(null);
  const [toolResult, setToolResult] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(500);
  const { mode: themeMode } = useThemeMode();
  const clientRef = useRef(null);

  // Connect MCP client and call the tool
  useEffect(() => {
    let cancelled = false;

    async function connectAndCall() {
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
          { name: 'mcp-ui-preview-host', version: '1.0.0' },
          {
            capabilities: {
              roots: { listChanged: false },
              extensions: UI_EXTENSION_CAPABILITIES,
            },
          },
        );

        await mcpClient.connect(transport);

        if (cancelled) {
          await mcpClient.close();
          return;
        }

        clientRef.current = mcpClient;
        setClient(mcpClient);
        setConnecting(false);

        // Call the tool with the file content
        const result = await mcpClient.callTool({
          name: mcpToolName,
          arguments: { filename, content },
        });

        if (!cancelled) {
          setToolResult(result);
        }
      } catch (err) {
        console.error('[McpUIPreview] Error:', err);
        if (!cancelled) {
          setError(err);
          setConnecting(false);
        }
      }
    }

    connectAndCall();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.close().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [mcpGroup, mcpToolName, filename, content]);

  // Listen for viewer state updates from the MCP App iframe (via postMessage)
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'viewer-state-update' && onViewerStateChange) {
        onViewerStateChange(event.data.state);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onViewerStateChange]);

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
    console.error('[McpUIPreview] App error:', err);
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
          MCP UI Error: {error.message || String(error)}
        </Typography>
      </Box>
    );
  }

  if (connecting || !toolResult) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          {connecting ? `Connecting to ${mcpGroup}...` : 'Loading preview...'}
        </Typography>
      </Box>
    );
  }

  if (!client) return null;

  // Find the resource URI from the tool's metadata
  // We pass it as toolResourceUri so AppRenderer knows which resource to fetch
  return (
    <Box sx={{
      width: '100%',
      height: `${iframeHeight}px`,
      minHeight: '200px',
      maxHeight: '800px',
      border: '1px solid',
      borderColor: themeMode === 'dark' ? '#555' : '#eee',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <AppRenderer
        client={client}
        toolName={mcpToolName}
        toolInput={{ filename, content }}
        toolResult={toolResult}
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
