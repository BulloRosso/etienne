import React, { useState, useEffect } from 'react';
import { Box, Button, CircularProgress, Alert, Typography } from '@mui/material';
import { Save } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { apiAxios } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';

export default function Mission({ projectName }) {
  const { t } = useTranslation();
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
      const response = await apiAxios.post('/api/claude/mission', {
        projectName
      });
      setContent(response.data.content || '');
    } catch (err) {
      setError(t('mission.errorLoadFailed'));
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
      await apiAxios.post('/api/claude/mission/save', {
        projectName,
        content
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(t('mission.errorSaveFailed'));
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
          {t('mission.successSaved')}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <img
          src="/project-wizard-step-2.png"
          alt={t('mission.altImage')}
          style={{ maxHeight: '80px', width: 'auto', objectFit: 'contain', borderRadius: 4 }}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('mission.description')}
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
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}
