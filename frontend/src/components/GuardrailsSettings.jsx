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
} from '@mui/material';
import { Close } from '@mui/icons-material';
import BackgroundInfo from './BackgroundInfo';

const GUARDRAIL_OPTIONS = [
  { id: 'creditCard', label: 'Credit Card Numbers', description: 'Detects and redacts credit card numbers' },
  { id: 'ipAddress', label: 'IP Addresses', description: 'Detects and redacts IPv4 and IPv6 addresses' },
  { id: 'email', label: 'Email Addresses', description: 'Detects and redacts email addresses' },
  { id: 'url', label: 'URLs', description: 'Detects and redacts HTTP/HTTPS URLs' },
  { id: 'iban', label: 'IBAN', description: 'Detects and redacts international bank account numbers' },
];

export default function GuardrailsSettings({ open, onClose, project, showBackgroundInfo }) {
  const [enabledGuardrails, setEnabledGuardrails] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && project) {
      loadConfig();
    }
  }, [open, project]);

  const loadConfig = async () => {
    try {
      const response = await fetch(`/api/guardrails/${project}/input`);
      if (response.ok) {
        const data = await response.json();
        setEnabledGuardrails(data.config?.enabled || []);
      }
    } catch (error) {
      console.error('Failed to load guardrails config:', error);
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
      const response = await fetch(`/api/guardrails/${project}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabledGuardrails }),
      });

      if (response.ok) {
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Input Guardrails
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <BackgroundInfo infoId="input-guardrails" showBackgroundInfo={showBackgroundInfo} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select which types of sensitive information should be automatically detected and redacted from user input before being sent to the AI model.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {GUARDRAIL_OPTIONS.map((option) => (
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
