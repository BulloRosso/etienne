import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Box, Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { useTranslation } from 'react-i18next';

export default function PromptEditor({ filename, projectName, className = '' }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isDirty = content !== savedContent;

  const fetchContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );

      if (!response.ok) {
        throw new Error(t('promptEditor.errorLoadFile'));
      }

      const text = await response.text();
      setContent(text);
      setSavedContent(text);
      setLoading(false);
    } catch (err) {
      console.error('Error loading prompt file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, [filename, projectName, refreshKey]);

  const handleReload = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${filename}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        throw new Error(t('promptEditor.errorSaveFile'));
      }

      setSavedContent(content);
      setSaving(false);
    } catch (err) {
      console.error('Error saving prompt file:', err);
      setError(err.message);
      setSaving(false);
    }
  };

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;
        if (hook === 'PostHook' && file) {
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);
          if (exactMatch || endsWithMatch) {
            setRefreshKey(prev => prev + 1);
          }
        }
      }
    };

    window.addEventListener('claudeHook', handleClaudeHook);
    return () => window.removeEventListener('claudeHook', handleClaudeHook);
  }, [filename]);

  if (loading) {
    return (
      <Box className={className} display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box className={className} p={2} color="error.main">
        {t('promptEditor.errorLoading', { error })}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%" display="flex" flexDirection="column" position="relative">
      {/* Reload button */}
      <Tooltip title={t('promptEditor.reloadFile')}>
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
            '&:hover': { bgcolor: 'action.hover' },
          }}
          size="small"
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>

      {/* Monaco Editor */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language="markdown"
          theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
          value={content}
          onChange={(value) => setContent(value || '')}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </Box>

      {/* Save bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}
