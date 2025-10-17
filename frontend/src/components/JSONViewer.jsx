import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Box, CircularProgress } from '@mui/material';

export default function JSONViewer({ filename, projectName, className = '' }) {
  const [jsonContent, setJsonContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Function to fetch JSON file content
  const fetchJsonContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const text = await response.text();

      // Try to parse and format JSON for better display
      try {
        const parsed = JSON.parse(text);
        setJsonContent(JSON.stringify(parsed, null, 2));
      } catch (parseError) {
        // If it's not valid JSON, display as-is
        setJsonContent(text);
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

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      const { hook, file } = event.detail || {};

      // If this is a PostHook event and it matches our filename
      if (hook === 'PostHook' && file && file.includes(filename)) {
        console.log(`JSONViewer: Detected change to ${filename}, reloading...`);
        // Increment refresh key to trigger reload
        setRefreshKey(prev => prev + 1);
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
        Error loading JSON file: {error}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%">
      <Editor
        height="100%"
        defaultLanguage="json"
        language="json"
        value={jsonContent}
        theme="light"
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
