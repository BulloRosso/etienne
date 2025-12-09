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
  MEMORY_DECAY_DAYS: '6'
};

export default function Configuration({ onSave }) {
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
      const response = await fetch('/api/configuration');

      if (response.status === 404) {
        // No configuration exists, use defaults
        setConfig(defaultValues);
      } else if (response.ok) {
        const data = await response.json();
        // Merge with defaults to ensure all fields exist
        setConfig({ ...defaultValues, ...data });
      } else {
        throw new Error('Failed to load configuration');
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
      setError('Failed to load configuration');
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

      const response = await fetch('/api/configuration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setSuccess(true);
      if (onSave) {
        onSave(config);
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setError('Failed to save configuration');
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
          Configuration saved successfully
        </Alert>
      )}

      {/* Required Configuration */}
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
        Required Configuration (.env file in backend project)
      </Typography>

      <TextField
        fullWidth
        label="Anthropic API Key"
        value={config.ANTHROPIC_API_KEY}
        onChange={handleChange('ANTHROPIC_API_KEY')}
        type="password"
        required
        sx={{ mb: 2 }}
        helperText="Your Anthropic API key (sk-ant-api03-...)"
      />

      <TextField
        fullWidth
        label="Workspace Root"
        value={config.WORKSPACE_ROOT}
        onChange={handleChange('WORKSPACE_ROOT')}
        required
        sx={{ mb: 2 }}
        helperText="Local path to workspace files"
      />

      {/* Optional Features */}
      <Accordion defaultExpanded={false} elevation={0} sx={{ '&:before': { display: 'none' }, backgroundColor: 'transparent' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
          <Typography sx={{marginLeft: '0px'}}>Optional Features</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0 }}>
          {/* Checkpointing */}
          <Typography variant="subtitle2" sx={{ mb: '8px', mt: 1, fontWeight: 'bold' }}>
            1. Checkpointing
          </Typography>

          <TextField
            fullWidth
            label="Checkpoint Provider"
            value={config.CHECKPOINT_PROVIDER}
            onChange={handleChange('CHECKPOINT_PROVIDER')}
            size="small"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Gitea URL"
            value={config.GITEA_URL}
            onChange={handleChange('GITEA_URL')}
            size="small"
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Gitea Username"
              value={config.GITEA_USERNAME}
              onChange={handleChange('GITEA_USERNAME')}
              size="small"
              sx={{ flex: 1 }}
            />

            <TextField
              label="Gitea Password"
              value={config.GITEA_PASSWORD}
              onChange={handleChange('GITEA_PASSWORD')}
              type="password"
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>

          <TextField
            fullWidth
            label="Gitea Repository"
            value={config.GITEA_REPO}
            onChange={handleChange('GITEA_REPO')}
            size="small"
            sx={{ mb: 3 }}
          />

          {/* Email Connectivity */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            2. Email Connectivity
          </Typography>

          <TextField
            fullWidth
            label="IMAP Connection"
            value={config.IMAP_CONNECTION}
            onChange={handleChange('IMAP_CONNECTION')}
            size="small"
            sx={{ mb: 2 }}
            helperText="Format: host|port|secure|user|password (e.g., mail.example.com|993|true|user@example.com|password)"
          />

          <TextField
            fullWidth
            label="SMTP Connection"
            value={config.SMTP_CONNECTION}
            onChange={handleChange('SMTP_CONNECTION')}
            size="small"
            sx={{ mb: 2 }}
            helperText="Format: host|port|secure|user|password (e.g., mail.example.com|587|false|user@example.com|password)"
          />

          <TextField
            fullWidth
            label="SMTP Whitelist"
            value={config.SMTP_WHITELIST}
            onChange={handleChange('SMTP_WHITELIST')}
            size="small"
            sx={{ mb: 3 }}
            helperText="Comma-separated list of allowed email recipients"
          />

          {/* Budget Control */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            3. Budget Control
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              label="Currency Unit"
              value={config.COSTS_CURRENCY_UNIT}
              onChange={handleChange('COSTS_CURRENCY_UNIT')}
              size="small"
              sx={{ flex: 1 }}
            />

            <TextField
              label="Cost per Million Input Tokens"
              value={config.COSTS_PER_MIO_INPUT_TOKENS}
              onChange={handleChange('COSTS_PER_MIO_INPUT_TOKENS')}
              size="small"
              type="number"
              sx={{ flex: 1 }}
            />

            <TextField
              label="Cost per Million Output Tokens"
              value={config.COSTS_PER_MIO_OUTPUT_TOKENS}
              onChange={handleChange('COSTS_PER_MIO_OUTPUT_TOKENS')}
              size="small"
              type="number"
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Memory Management */}
          <Typography variant="subtitle2" sx={{ mb: '8px', fontWeight: 'bold' }}>
            4. Memory Management (User Preferences)
          </Typography>

          <TextField
            fullWidth
            label="Memory Management URL"
            value={config.MEMORY_MANAGEMENT_URL}
            onChange={handleChange('MEMORY_MANAGEMENT_URL')}
            size="small"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Memory Decay Days"
            value={config.MEMORY_DECAY_DAYS}
            onChange={handleChange('MEMORY_DECAY_DAYS')}
            size="small"
            type="number"
            sx={{ mb: 2 }}
            helperText="Number of days before memories are considered stale"
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
          {saving ? <CircularProgress size={24} /> : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
