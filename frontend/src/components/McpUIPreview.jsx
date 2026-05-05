import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography, IconButton, Tooltip, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AppRenderer } from '@mcp-ui/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UI_EXTENSION_CAPABILITIES } from '@mcp-ui/client';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useRegisterMcpViewer } from '../hooks/useActiveMcpViewers.js';
import { BiTransfer } from 'react-icons/bi';
import { IoClose } from 'react-icons/io5';
import { JSONTree } from 'react-json-tree';

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
  const [viewerState, setViewerState] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const { mode: themeMode } = useThemeMode();
  const clientRef = useRef(null);

  // Register this viewer's MCP group so inline chat rendering is suppressed
  useRegisterMcpViewer(mcpGroup);

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

  // Register this viewer immediately so the model knows it's open (even without selection)
  useEffect(() => {
    if (toolResult && onViewerStateChange) {
      onViewerStateChange({ selectedItems: [] });
    }
    // On unmount, clear the viewer state
    return () => { onViewerStateChange?.(null); };
  }, [toolResult]);

  // Listen for viewer state updates from the MCP App iframe (via postMessage)
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'viewer-state-update') {
        setViewerState(event.data.state);
        onViewerStateChange?.(event.data.state);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onViewerStateChange]);

  // Listen for viewer commands from the model (dispatched by App.jsx when a tool
  // with _action in its result completes). Forward these to the MCP App iframe
  // so the running UI can react (e.g. change selection state).
  const iframeRef = useRef(null);
  useEffect(() => {
    const handler = (event) => {
      const { toolName, action, payload } = event.detail || {};
      // Only forward commands that target this viewer's MCP group
      if (!toolName) return;
      const isOurTool = toolName.startsWith(`mcp__${mcpGroup}__`);
      if (!isOurTool) return;

      // Find all iframes in the container and post to each — the AppRenderer
      // may use a sandbox proxy (nested iframes) or direct srcDoc mode.
      const container = iframeRef.current;
      if (!container) {
        console.warn('[McpUIPreview] viewer-command: no container ref');
        return;
      }
      const iframes = container.querySelectorAll('iframe');
      if (iframes.length === 0) {
        console.warn('[McpUIPreview] viewer-command: no iframes found in container');
        return;
      }
      const msg = { type: 'viewer-command', action, payload };
      for (const iframe of iframes) {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(msg, '*');
        }
      }
      console.log(`[McpUIPreview] viewer-command forwarded to ${iframes.length} iframe(s):`, action, payload);
    };
    window.addEventListener('mcp-viewer-command', handler);
    return () => window.removeEventListener('mcp-viewer-command', handler);
  }, [mcpGroup, mcpToolName]);

  // Style the AppRenderer iframe for minimal scrollbar once it appears
  useEffect(() => {
    if (!iframeRef.current) return;
    const observer = new MutationObserver(() => {
      const iframe = iframeRef.current?.querySelector('iframe');
      if (iframe) {
        iframe.style.scrollbarWidth = 'none';
        iframe.style.overflow = 'hidden';
        observer.disconnect();
      }
    });
    observer.observe(iframeRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [client]);

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

  const debugState = {
    mcpGroup,
    mcpToolName,
    filename,
    connecting,
    sessionId: clientRef.current?.transport?.sessionId ?? null,
    hasClient: !!client,
    hasToolResult: !!toolResult,
    toolResult,
    viewerState,
    error: error ? (error.message || String(error)) : null,
    iframeHeight,
  };

  const jsonTreeTheme = themeMode === 'dark'
    ? { scheme: 'monokai', base00: 'transparent' }
    : { scheme: 'rjv-default', base00: 'transparent', base0B: '#2e7d32', base0D: '#1565c0', base09: '#c62828', base03: '#666' };

  // Find the resource URI from the tool's metadata
  // We pass it as toolResourceUri so AppRenderer knows which resource to fetch
  return (
    <Box ref={iframeRef} sx={{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
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
      <Tooltip title="MCP UI Status">
        <IconButton
          size="small"
          onClick={() => setStatusOpen(true)}
          sx={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
            '&:hover': { bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)' },
            zIndex: 1,
          }}
        >
          <BiTransfer size={16} />
        </IconButton>
      </Tooltip>
      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          MCP UI Status
          <IconButton size="small" onClick={() => setStatusOpen(false)}>
            <IoClose size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{
          overflow: 'auto',
          maxHeight: 450,
          '& ul > li > ul > li': { borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '4px' },
          '& ul > li > ul > li:last-child': { borderBottom: 'none', mb: 0, pb: 0 },
        }}>
          <JSONTree
            data={debugState}
            theme={jsonTreeTheme}
            invertTheme={false}
            hideRoot
            shouldExpandNodeInitially={(keyPath, data, level) => level < 2}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
