import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const defaultValues = {
  ANTHROPIC_API_KEY: '',
  WORKSPACE_ROOT: 'C:/Data/GitHub/claude-multitenant/workspace',
  CHECKPOINT_PROVIDER: 'gitea',
  GITEA_URL: 'http://localhost:3000',
  GITEA_USERNAME: '',
  GITEA_PASSWORD: '',
  GITEA_REPO: 'workspace-checkpoints',
  IMAP_CONNECTION: '',
  SMTP_CONNECTION: '',
  SMTP_WHITELIST: '',
  COSTS_CURRENCY_UNIT: 'EUR',
  COSTS_PER_MIO_INPUT_TOKENS: '3.0',
  COSTS_PER_MIO_OUTPUT_TOKENS: '15.0',
  MEMORY_MANAGEMENT_URL: 'http://localhost:6060/api/memories',
  MEMORY_DECAY_DAYS: '6',
  OTEL_ENABLED: 'false',
  PHOENIX_COLLECTOR_ENDPOINT: 'http://localhost:6006',
  OTEL_SERVICE_NAME: 'a2a-server'
};

export default function Configuration({ onSave }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState(defaultValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch('/api/configuration');

      if (response.status === 404) {
        // No configuration exists, use defaults
        setConfig(defaultValues);
      } else if (response.ok) {
        const data = await response.json();
        // Merge with defaults to ensure all fields exist
        setConfig({ ...defaultValues, ...data });
      } else {
        throw new Error(t('configuration.errorLoad'));
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
      setError(t('configuration.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (event) => {
    setConfig(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    setSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await apiFetch('/api/configuration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(t('configuration.errorSave'));
      }

      setSuccess(true);
      if (onSave) {
        onSave(config);
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setError(t('configuration.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const isValid = config.ANTHROPIC_API_KEY && config.WORKSPACE_ROOT;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {t('configuration.successSave')}
        </Alert>
      )}

      {/* Required Configuration */}
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
        {t('configuration.sectionRequired')}
      </Typography>

      <TextField
        fullWidth
        label={t('configuration.anthropicApiKeyLabel')}
        value={config.ANTHROPIC_API_KEY}
        onChange={handleChange('ANTHROPIC_API_KEY')}
        type="password"
        required
        sx={{ mb: 2 }}
        helperText={t('configuration.anthropicApiKeyHelperText')}
      />

      <TextField
        fullWidth
        label={t('configuration.workspaceRootLabel')}
        value={config.WORKSPACE_ROOT}
        onChange={handleChange('WORKSPACE_ROOT')}
        required
        sx={{ mb: 2 }}
        helperText={t('configuration.workspaceRootHelperText')}
      />

      {/* Optional Features */}
      <Accordion defaultExpanded={false} elevation={0} sx={{ '&:before': { display: 'none' }, backgroundColor: 'transparent' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
          <Typography sx={{marginLeft: '0px'}}>{t('configuration.sectionOptional')}</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0 }}>
          {/* Checkpointing */}
          <Typography variant="subtitle2" sx={{ mb: '8px', mt: 1, fontWeight: 'bold' }}>
            {t('configuration.sectionCheckpointing')}
          </Typography>

          <TextField
            fullWidth
            label={t('configuration.checkpointProviderLabel')}
            value={config.CHECKPOINT_PROVIDER}
            onChange={handleChange('CHECKPOINT_PROVIDER')}
            size="small"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label={t('configuration.giteaUrlLabel')}
            value={config.GITEA_URL}
            onChange={handleChange('GITEA_URL')}
            size="small"
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label={t('configuration.giteaUsernameLabel')}
              value={config.GITEA_USERNAME}
              onChange={handleChange('GITEA_USERNAME')}
              size="small"
              sx={{ flex: 1 }}
            />

            <TextField
              label={t('configuration.giteaPasswordLabel')}
              value={config.GITEA_PASSWORD}
              onChange={handleChange('GITEA_PASSWORD')}
              type="password"
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>

          <TextField
            fullWidth
            label={t('configuration.giteaRepositoryLabel')}
            value={config.GITEA_REPO}
            onChange={handleChange('GITEA_REPO')}
            size="small"
            sx={{ mb: 3 }}
          />

          {/* Email Connectivity */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            {t('configuration.sectionEmail')}
          </Typography>

          <TextField
            fullWidth
            label={t('configuration.imapConnectionLabel')}
            value={config.IMAP_CONNECTION}
            onChange={handleChange('IMAP_CONNECTION')}
            size="small"
            sx={{ mb: 2 }}
            helperText={t('configuration.imapConnectionHelperText')}
          />

          <TextField
            fullWidth
            label={t('configuration.smtpConnectionLabel')}
            value={config.SMTP_CONNECTION}
            onChange={handleChange('SMTP_CONNECTION')}
            size="small"
            sx={{ mb: 2 }}
            helperText={t('configuration.smtpConnectionHelperText')}
          />

          <TextField
            fullWidth
            label={t('configuration.smtpWhitelistLabel')}
            value={config.SMTP_WHITELIST}
            onChange={handleChange('SMTP_WHITELIST')}
            size="small"
            sx={{ mb: 3 }}
            helperText={t('configuration.smtpWhitelistHelperText')}
          />

          {/* Budget Control */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            {t('configuration.sectionBudget')}
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              label={t('configuration.currencyUnitLabel')}
              value={config.COSTS_CURRENCY_UNIT}
              onChange={handleChange('COSTS_CURRENCY_UNIT')}
              size="small"
              sx={{ flex: 1 }}
            />

            <TextField
              label={t('configuration.costPerMioInputLabel')}
              value={config.COSTS_PER_MIO_INPUT_TOKENS}
              onChange={handleChange('COSTS_PER_MIO_INPUT_TOKENS')}
              size="small"
              type="number"
              sx={{ flex: 1 }}
            />

            <TextField
              label={t('configuration.costPerMioOutputLabel')}
              value={config.COSTS_PER_MIO_OUTPUT_TOKENS}
              onChange={handleChange('COSTS_PER_MIO_OUTPUT_TOKENS')}
              size="small"
              type="number"
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Memory Management */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            {t('configuration.sectionMemory')}
          </Typography>

          <TextField
            fullWidth
            label={t('configuration.memoryManagementUrlLabel')}
            value={config.MEMORY_MANAGEMENT_URL}
            onChange={handleChange('MEMORY_MANAGEMENT_URL')}
            size="small"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label={t('configuration.memoryDecayDaysLabel')}
            value={config.MEMORY_DECAY_DAYS}
            onChange={handleChange('MEMORY_DECAY_DAYS')}
            size="small"
            type="number"
            sx={{ mb: 3 }}
            helperText={t('configuration.memoryDecayDaysHelperText')}
          />

          {/* OpenTelemetry Observability */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            {t('configuration.sectionOtel')}
          </Typography>

          <TextField
            fullWidth
            label={t('configuration.otelEnabledLabel')}
            value={config.OTEL_ENABLED}
            onChange={handleChange('OTEL_ENABLED')}
            size="small"
            select
            SelectProps={{ native: true }}
            sx={{ mb: 2 }}
            helperText={t('configuration.otelEnabledHelperText')}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </TextField>

          <TextField
            fullWidth
            label={t('configuration.phoenixEndpointLabel')}
            value={config.PHOENIX_COLLECTOR_ENDPOINT}
            onChange={handleChange('PHOENIX_COLLECTOR_ENDPOINT')}
            size="small"
            sx={{ mb: 2 }}
            helperText={t('configuration.phoenixEndpointHelperText')}
          />

          <TextField
            fullWidth
            label={t('configuration.otelServiceNameLabel')}
            value={config.OTEL_SERVICE_NAME}
            onChange={handleChange('OTEL_SERVICE_NAME')}
            size="small"
            sx={{ mb: 2 }}
            helperText={t('configuration.otelServiceNameHelperText')}
          />
        </AccordionDetails>
      </Accordion>

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isValid || saving}
        >
          {saving ? <CircularProgress size={24} /> : t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}
