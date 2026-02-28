import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function MarkdownViewer({ filename, projectName, className = '' }) {
  const { t } = useTranslation();
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Function to fetch markdown file content
  const fetchMarkdownContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const markdownText = await response.text();

      // Parse markdown to HTML
      const rawHtml = await marked.parse(markdownText);

      // Sanitize HTML to prevent XSS
      const cleanHtml = DOMPurify.sanitize(rawHtml);

      setHtmlContent(cleanHtml);
      setLoading(false);
    } catch (err) {
      console.error('Error loading markdown file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMarkdownContent();
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

        console.log('[MarkdownViewer] Received claudeHook:', { hook, file, currentFilename: filename });

        if (hook === 'PostHook' && file) {
          // Handle both absolute and relative paths
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');

          console.log('[MarkdownViewer] Normalized paths:', { normalizedFile, normalizedFilename });

          // Check if paths match (exact match or file ends with filename)
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);

          console.log('[MarkdownViewer] Match check:', { exactMatch, endsWithMatch });

          if (exactMatch || endsWithMatch) {
            console.log('[MarkdownViewer] ✓ Match found! Refreshing content for', filename);
            // Increment refresh key to trigger reload
            setRefreshKey(prev => prev + 1);
          } else {
            console.log('[MarkdownViewer] ✗ No match for', filename);
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
        {t('markdownViewer.errorLoading')} {error}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%" position="relative">
      <Tooltip title={t('markdownViewer.reloadFile')}>
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
      <Box
        sx={{
          height: '100%',
          overflow: 'auto',
          p: 3,
          '& h1': {
            fontSize: '2em',
            fontWeight: 'bold',
            marginTop: '0.67em',
            marginBottom: '0.67em',
            borderBottom: '1px solid #eaecef',
            paddingBottom: '0.3em'
          },
          '& h2': {
            fontSize: '1.5em',
            fontWeight: 'bold',
            marginTop: '0.83em',
            marginBottom: '0.83em',
            borderBottom: '1px solid #eaecef',
            paddingBottom: '0.3em'
          },
          '& h3': {
            fontSize: '1.17em',
            fontWeight: 'bold',
            marginTop: '1em',
            marginBottom: '1em'
          },
          '& h4': {
            fontSize: '1em',
            fontWeight: 'bold',
            marginTop: '1.33em',
            marginBottom: '1.33em'
          },
          '& h5': {
            fontSize: '0.83em',
            fontWeight: 'bold',
            marginTop: '1.67em',
            marginBottom: '1.67em'
          },
          '& h6': {
            fontSize: '0.67em',
            fontWeight: 'bold',
            marginTop: '2.33em',
            marginBottom: '2.33em'
          },
          '& p': {
            marginTop: '1em',
            marginBottom: '1em',
            lineHeight: '1.6'
          },
          '& ul, & ol': {
            marginTop: '1em',
            marginBottom: '1em',
            paddingLeft: '2em'
          },
          '& li': {
            marginTop: '0.25em',
            marginBottom: '0.25em'
          },
          '& code': {
            backgroundColor: '#f6f8fa',
            borderRadius: '3px',
            padding: '0.2em 0.4em',
            fontFamily: 'monospace',
            fontSize: '0.9em'
          },
          '& pre': {
            backgroundColor: '#f6f8fa',
            borderRadius: '6px',
            padding: '16px',
            overflow: 'auto',
            marginTop: '1em',
            marginBottom: '1em'
          },
          '& pre code': {
            backgroundColor: 'transparent',
            padding: 0,
            fontSize: '0.85em',
            lineHeight: '1.45'
          },
          '& blockquote': {
            borderLeft: '4px solid #dfe2e5',
            paddingLeft: '1em',
            marginLeft: 0,
            color: '#6a737d',
            marginTop: '1em',
            marginBottom: '1em'
          },
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
            marginTop: '1em',
            marginBottom: '1em'
          },
          '& table th, & table td': {
            border: '1px solid #dfe2e5',
            padding: '6px 13px'
          },
          '& table th': {
            fontWeight: 'bold',
            backgroundColor: '#f6f8fa'
          },
          '& a': {
            color: '#0366d6',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline'
            }
          },
          '& img': {
            maxWidth: '100%',
            height: 'auto'
          },
          '& hr': {
            border: 'none',
            borderTop: '1px solid #eaecef',
            marginTop: '1.5em',
            marginBottom: '1.5em'
          }
        }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </Box>
  );
}
