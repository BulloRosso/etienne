import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Box, Tabs, Tab, Typography, Alert,
} from '@mui/material';
import { Close, Settings } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

export default function CodingAgentConfigDialog({ open, onClose }) {
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
        fetch('/api/coding-agent-configuration/anthropic'),
        fetch('/api/coding-agent-configuration/openai'),
      ]);
      const claudeData = await claudeRes.json();
      const codexData = await codexRes.json();
      setClaudeContent(claudeData.content || '');
      setClaudeIsCustom(claudeData.isCustom || false);
      setCodexContent(codexData.content || '');
      setCodexIsCustom(codexData.isCustom || false);
    } catch (err) {
      setError('Failed to load configurations');
    }
  };

  const handleSave = async () => {
    const agentType = activeTab === 0 ? 'anthropic' : 'openai';
    const content = activeTab === 0 ? claudeContent : codexContent;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/coding-agent-configuration/${agentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        if (activeTab === 0) setClaudeIsCustom(true);
        else setCodexIsCustom(true);
        setSuccess('Configuration saved');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to save');
      }
    } catch {
      setError('Failed to save configuration');
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
      await fetch(`/api/coding-agent-configuration/${agentType}`, { method: 'DELETE' });
      const res = await fetch(`/api/coding-agent-configuration/${agentType}`);
      const data = await res.json();
      if (activeTab === 0) {
        setClaudeContent(data.content || '');
        setClaudeIsCustom(false);
      } else {
        setCodexContent(data.content || '');
        setCodexIsCustom(false);
      }
      setSuccess('Defaults restored');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to load defaults');
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
          <Typography variant="h6">Coding Agent Configuration</Typography>
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
        <Tab label="Claude" />
        <Tab label="Codex" />
      </Tabs>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {error && <Alert severity="error" sx={{ m: 2, mb: 0 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ m: 2, mb: 0 }}>{success}</Alert>}

        <Box sx={{ px: 2, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {isCustom ? 'Custom override active' : 'Using default template'}
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
          Load Defaults
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
