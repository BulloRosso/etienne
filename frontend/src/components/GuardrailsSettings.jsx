import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  FormControlLabel,
  Checkbox,
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import BackgroundInfo from './BackgroundInfo';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const getGuardrailOptions = (t) => [
  { id: 'creditCard', label: t('guardrails.creditCardLabel'), description: t('guardrails.creditCardDescription') },
  { id: 'ipAddress', label: t('guardrails.ipAddressLabel'), description: t('guardrails.ipAddressDescription') },
  { id: 'email', label: t('guardrails.emailLabel'), description: t('guardrails.emailDescription') },
  { id: 'url', label: t('guardrails.urlLabel'), description: t('guardrails.urlDescription') },
  { id: 'iban', label: t('guardrails.ibanLabel'), description: t('guardrails.ibanDescription') },
];

export default function GuardrailsSettings({ open, onClose, project, showBackgroundInfo }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [activeTab, setActiveTab] = useState(0);
  const [enabledGuardrails, setEnabledGuardrails] = useState([]);
  const [outputGuardrailsEnabled, setOutputGuardrailsEnabled] = useState(false);
  const [outputGuardrailsPrompt, setOutputGuardrailsPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && project) {
      loadConfig();
      loadOutputConfig();
    }
  }, [open, project]);

  const loadConfig = async () => {
    try {
      const response = await apiFetch(`/api/guardrails/${project}/input`);
      if (response.ok) {
        const data = await response.json();
        setEnabledGuardrails(data.config?.enabled || []);
      }
    } catch (error) {
      console.error('Failed to load guardrails config:', error);
    }
  };

  const loadOutputConfig = async () => {
    try {
      const response = await apiFetch(`/api/guardrails/${project}/output`);
      if (response.ok) {
        const data = await response.json();
        setOutputGuardrailsEnabled(data.config?.enabled || false);
        setOutputGuardrailsPrompt(data.config?.prompt || '');
      }
    } catch (error) {
      console.error('Failed to load output guardrails config:', error);
    }
  };

  const handleToggle = (guardrailId) => {
    setEnabledGuardrails((prev) => {
      if (prev.includes(guardrailId)) {
        return prev.filter((id) => id !== guardrailId);
      } else {
        return [...prev, guardrailId];
      }
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Save input guardrails
      const inputResponse = await apiFetch(`/api/guardrails/${project}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabledGuardrails }),
      });

      // Save output guardrails
      const outputResponse = await apiFetch(`/api/guardrails/${project}/output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: outputGuardrailsEnabled,
          prompt: outputGuardrailsPrompt,
        }),
      });

      if (inputResponse.ok && outputResponse.ok) {
        // Dispatch custom event to notify that guardrails changed
        window.dispatchEvent(new Event('guardrailsChanged'));
        onClose();
      } else {
        console.error('Failed to save guardrails config');
      }
    } catch (error) {
      console.error('Failed to save guardrails config:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('guardrails.title')}
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <BackgroundInfo infoId="input-guardrails" showBackgroundInfo={showBackgroundInfo} />

        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label={t('guardrails.tabPreProcessing')} />
          <Tab label={t('guardrails.tabPostProcessing')} />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('guardrails.preProcessingDescription')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {getGuardrailOptions(t).map((option) => (
                <Box key={option.id}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={enabledGuardrails.includes(option.id)}
                        onChange={() => handleToggle(option.id)}
                      />
                    }
                    label={option.label}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mt: -1 }}>
                    {option.description}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('guardrails.postProcessingDescription')}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={outputGuardrailsEnabled}
                  onChange={(e) => setOutputGuardrailsEnabled(e.target.checked)}
                />
              }
              label={t('guardrails.enablePostProcessing')}
              sx={{ mb: 2 }}
            />
            <Box sx={{ border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden', height: '400px' }}>
              <Editor
                height="400px"
                defaultLanguage="markdown"
                value={outputGuardrailsPrompt}
                onChange={(value) => setOutputGuardrailsPrompt(value || '')}
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
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>
          {loading ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
