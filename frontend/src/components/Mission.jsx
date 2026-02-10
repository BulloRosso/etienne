import React, { useState, useEffect } from 'react';
import { Box, Button, CircularProgress, Alert, Typography } from '@mui/material';
import { Save } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

export default function Mission({ projectName }) {
  const { mode: themeMode } = useThemeMode();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadMission();
  }, [projectName]);

  const loadMission = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/claude/mission', {
        projectName
      });
      setContent(response.data.content || '');
    } catch (err) {
      setError('Failed to load mission');
      console.error('Load mission error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await axios.post('/api/claude/mission/save', {
        projectName,
        content
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save mission');
      console.error('Save mission error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Mission saved successfully
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <img
          src="/project-wizard-step-2.png"
          alt="Mission Brief"
          style={{ maxHeight: '80px', width: 'auto', objectFit: 'contain', borderRadius: 4 }}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          The mission brief guides your AI assistant's behavior. A detailed description ensures better, more focused results aligned with your objectives.
        </Typography>
      </Box>

      <Box sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
          value={content}
          onChange={(value) => setContent(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            automaticLayout: true
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
