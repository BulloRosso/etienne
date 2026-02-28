import React, { useState, useEffect, useRef } from 'react';
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import mermaid from 'mermaid';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function MermaidViewer({ filename, projectName, className = '' }) {
  const { t } = useTranslation();
  const [mermaidContent, setMermaidContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const mermaidRef = useRef(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Arial, sans-serif',
    });
  }, []);

  // Function to fetch mermaid file content
  const fetchMermaidContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const text = await response.text();
      setMermaidContent(text);
      setLoading(false);
    } catch (err) {
      console.error('Error loading mermaid file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMermaidContent();
  }, [filename, projectName, refreshKey]);

  // Render mermaid diagram whenever content changes
  useEffect(() => {
    if (mermaidContent && mermaidRef.current) {
      const renderMermaid = async () => {
        try {
          // Clear previous content
          mermaidRef.current.innerHTML = '';

          // Generate a unique ID for this diagram
          const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render the diagram
          const { svg } = await mermaid.render(id, mermaidContent);

          // Insert the SVG
          mermaidRef.current.innerHTML = svg;
        } catch (err) {
          console.error('Error rendering mermaid diagram:', err);
          setError(`Failed to render diagram: ${err.message}`);
        }
      };

      renderMermaid();
    }
  }, [mermaidContent]);

  // Handler for manual reload
  const handleReload = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      // Check if this is a PostHook event for our file
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;

        console.log('[MermaidViewer] Received claudeHook:', { hook, file, currentFilename: filename });

        if (hook === 'PostHook' && file) {
          // Handle both absolute and relative paths
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');

          console.log('[MermaidViewer] Normalized paths:', { normalizedFile, normalizedFilename });

          // Check if paths match (exact match or file ends with filename)
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);

          console.log('[MermaidViewer] Match check:', { exactMatch, endsWithMatch });

          if (exactMatch || endsWithMatch) {
            console.log('[MermaidViewer] ✓ Match found! Refreshing diagram for', filename);
            // Increment refresh key to trigger reload
            setRefreshKey(prev => prev + 1);
          } else {
            console.log('[MermaidViewer] ✗ No match for', filename);
          }
        }
      }
    };

    window.addEventListener('claudeHook', handleClaudeHook);

    return () => {
      window.removeEventListener('claudeHook', handleClaudeHook);
    };
  }, [filename]);

  if (loading) {
    return (
      <Box
        className={className}
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        className={className}
        p={2}
        color="error.main"
      >
        {t('mermaidViewer.errorLoading')} {error}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%" position="relative">
      {/* Control buttons */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 18,
          zIndex: 1000,
          display: 'flex',
          gap: 0.5,
          bgcolor: 'background.paper',
          boxShadow: 1,
          borderRadius: 1,
          p: 0.5
        }}
      >
        <Tooltip title={t('mermaidViewer.zoomOut')}>
          <IconButton
            onClick={handleZoomOut}
            disabled={loading || zoom <= 0.25}
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
          >
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('mermaidViewer.resetZoom', { percent: Math.round(zoom * 100) })}>
          <IconButton
            onClick={handleZoomReset}
            disabled={loading || zoom === 1}
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('mermaidViewer.zoomIn')}>
          <IconButton
            onClick={handleZoomIn}
            disabled={loading || zoom >= 3}
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
          >
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('mermaidViewer.reloadFile')}>
          <IconButton
            onClick={handleReload}
            disabled={loading}
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        ref={mermaidRef}
        sx={{
          height: '100%',
          overflow: 'auto',
          p: 3,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          '& svg': {
            maxWidth: '100%',
            height: 'auto',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-in-out'
          }
        }}
      />
    </Box>
  );
}
