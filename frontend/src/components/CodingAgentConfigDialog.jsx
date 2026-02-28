import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Box, Tabs, Tab, Typography, Alert,
} from '@mui/material';
import { Close, Settings } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function CodingAgentConfigDialog({ open, onClose }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [activeTab, setActiveTab] = useState(0);
  const [claudeContent, setClaudeContent] = useState('');
  const [codexContent, setCodexContent] = useState('');
  const [claudeIsCustom, setClaudeIsCustom] = useState(false);
  const [codexIsCustom, setCodexIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (open) {
      loadConfigs();
    }
  }, [open]);

  const loadConfigs = async () => {
    setError('');
    setSuccess('');
    try {
      const [claudeRes, codexRes] = await Promise.all([
        apiFetch('/api/coding-agent-configuration/anthropic'),
        apiFetch('/api/coding-agent-configuration/openai'),
      ]);
      const claudeData = await claudeRes.json();
      const codexData = await codexRes.json();
      setClaudeContent(claudeData.content || '');
      setClaudeIsCustom(claudeData.isCustom || false);
      setCodexContent(codexData.content || '');
      setCodexIsCustom(codexData.isCustom || false);
    } catch (err) {
      setError(t('codingAgentConfig.failedToLoadConfigs'));
    }
  };

  const handleSave = async () => {
    const agentType = activeTab === 0 ? 'anthropic' : 'openai';
    const content = activeTab === 0 ? claudeContent : codexContent;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(`/api/coding-agent-configuration/${agentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        if (activeTab === 0) setClaudeIsCustom(true);
        else setCodexIsCustom(true);
        setSuccess(t('codingAgentConfig.configSaved'));
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.message || t('codingAgentConfig.failedToSaveConfig'));
      }
    } catch {
      setError(t('codingAgentConfig.failedToSaveConfig'));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDefaults = async () => {
    const agentType = activeTab === 0 ? 'anthropic' : 'openai';
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/api/coding-agent-configuration/${agentType}`, { method: 'DELETE' });
      const res = await apiFetch(`/api/coding-agent-configuration/${agentType}`);
      const data = await res.json();
      if (activeTab === 0) {
        setClaudeContent(data.content || '');
        setClaudeIsCustom(false);
      } else {
        setCodexContent(data.content || '');
        setCodexIsCustom(false);
      }
      setSuccess(t('codingAgentConfig.defaultsRestored'));
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError(t('codingAgentConfig.failedToLoadDefaults'));
    } finally {
      setLoading(false);
    }
  };

  const isCustom = activeTab === 0 ? claudeIsCustom : codexIsCustom;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Settings sx={{ color: '#1976d2' }} />
          <Typography variant="h6">{t('codingAgentConfig.dialogTitle')}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={activeTab}
        onChange={(e, v) => { setActiveTab(v); setError(''); setSuccess(''); }}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab label={t('codingAgentConfig.tabClaude')} />
        <Tab label={t('codingAgentConfig.tabCodex')} />
      </Tabs>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {error && <Alert severity="error" sx={{ m: 2, mb: 0 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ m: 2, mb: 0 }}>{success}</Alert>}

        <Box sx={{ px: 2, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {isCustom ? t('codingAgentConfig.customOverrideActive') : t('codingAgentConfig.usingDefaultTemplate')}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minHeight: '400px', p: 1 }}>
          <Editor
            height="400px"
            language={activeTab === 0 ? 'json' : 'ini'}
            value={activeTab === 0 ? claudeContent : codexContent}
            onChange={(value) => {
              if (activeTab === 0) setClaudeContent(value || '');
              else setCodexContent(value || '');
            }}
            theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Button
          onClick={handleLoadDefaults}
          disabled={loading}
          color="warning"
        >
          {t('codingAgentConfig.loadDefaults')}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading}
        >
          {loading ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
