import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function JSONViewer({ filename, projectName, className = '', isJsonl = false }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [jsonContent, setJsonContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Function to fetch JSON file content
  const fetchJsonContent = async () => {
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

      // Handle JSONL: parse each line as JSON and wrap in an array
      const detectJsonl = isJsonl || filename?.endsWith('.jsonl');
      if (detectJsonl) {
        try {
          const lines = text.split('\n').filter(l => l.trim());
          const parsed = lines.map(line => JSON.parse(line));
          setJsonContent(JSON.stringify(parsed, null, 2));
        } catch (parseError) {
          // If parsing fails, display as-is
          setJsonContent(text);
        }
      } else {
        // Try to parse and format JSON for better display
        try {
          const parsed = JSON.parse(text);
          setJsonContent(JSON.stringify(parsed, null, 2));
        } catch (parseError) {
          // If it's not valid JSON, display as-is
          setJsonContent(text);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading JSON file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchJsonContent();
  }, [filename, projectName, refreshKey]);

  // Handler for manual reload
  const handleReload = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      // Check if this is a PostHook event for our file
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;

        console.log('[JSONViewer] Received claudeHook:', { hook, file, currentFilename: filename });

        if (hook === 'PostHook' && file) {
          // Handle both absolute and relative paths
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');

          console.log('[JSONViewer] Normalized paths:', { normalizedFile, normalizedFilename });

          // Check if paths match (exact match or file ends with filename)
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);

          console.log('[JSONViewer] Match check:', { exactMatch, endsWithMatch });

          if (exactMatch || endsWithMatch) {
            console.log('[JSONViewer] ✓ Match found! Refreshing content for', filename);
            // Increment refresh key to trigger reload
            setRefreshKey(prev => prev + 1);
          } else {
            console.log('[JSONViewer] ✗ No match for', filename);
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
        {t('jsonViewer.errorLoading')} {error}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%" position="relative">
      <Tooltip title={t('jsonViewer.reloadFile')}>
        <IconButton
          onClick={handleReload}
          disabled={loading}
          sx={{
            position: 'absolute',
            top: 8,
            right: 18,
            zIndex: 1000,
            bgcolor: 'background.paper',
            boxShadow: 1,
            '&:hover': {
              bgcolor: 'action.hover'
            }
          }}
          size="small"
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>
      <Editor
        height="100%"
        defaultLanguage="json"
        language="json"
        value={jsonContent}
        theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          automaticLayout: true,
          wordWrap: 'on',
          wrappingIndent: 'indent',
          folding: true,
          bracketPairColorization: {
            enabled: true
          }
        }}
      />
    </Box>
  );
}
