import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function PdfViewer({ filename, projectName }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pdfUrlRef = useRef(null);

  const loadPdf = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load PDF: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }

      pdfUrlRef.current = url;
      setPdfUrl(url);
      setFileSize(blob.size);
      setLoading(false);
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!filename || !projectName) return;
    loadPdf();

    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [filename, projectName]);

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.type === 'claudeHook' && event.detail?.hook === 'PostHook') {
        const hookFile = event.detail.file || '';
        const normalizedHook = hookFile.replace(/\\/g, '/');
        const normalizedFilename = (filename || '').replace(/\\/g, '/');
        if (normalizedHook.endsWith(normalizedFilename) || normalizedFilename.endsWith(normalizedHook)) {
          loadPdf();
        }
      }
    };
    window.addEventListener('claudeHook', handleClaudeHook);
    return () => window.removeEventListener('claudeHook', handleClaudeHook);
  }, [filename]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 0.5, borderBottom: 1, borderColor: 'divider'
      }}>
        <Typography variant="body2" sx={{ color: themeMode === 'dark' ? '#aaa' : '#666' }}>
          {filename} {fileSize ? `(${formatFileSize(fileSize)})` : ''}
        </Typography>
        <Tooltip title={t('common.refresh', 'Refresh')}>
          <IconButton size="small" onClick={loadPdf}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <iframe
          src={pdfUrl}
          type="application/pdf"
          style={{ width: '100%', height: '100%', border: 'none' }}
          title={filename}
        />
      </Box>
    </Box>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
