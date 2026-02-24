import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  FormControlLabel,
  Checkbox,
  Typography
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { apiFetch } from '../services/api';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '\u20AC',
    'USD': '$',
    'GBP': '\u00A3',
    'JPY': '\u00A5'
  };
  return symbols[currency] || currency;
};

export default function BudgetSettings({
  open,
  onClose,
  project,
  budgetSettings,
  currency,
  onSettingsChange
}) {
  const [limit, setLimit] = useState('0');
  const [resetCounters, setResetCounters] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState('');

  const currencySymbol = getCurrencySymbol(currency);

  useEffect(() => {
    if (budgetSettings?.limit !== undefined) {
      setLimit(budgetSettings.limit.toString());
    }
    setNotificationEmail(budgetSettings?.notificationEmail || '');
    // Reset the checkbox default each time the dialog opens
    setResetCounters(true);
  }, [budgetSettings, open]);

  const handleSave = async () => {
    const limitValue = parseFloat(limit) || 0;

    try {
      const response = await apiFetch(`/api/budget-monitoring/${project}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: budgetSettings.enabled,
          limit: limitValue,
          resetCounters,
          notificationEmail: notificationEmail.trim() || undefined
        })
      });

      if (response.ok) {
        if (onSettingsChange) {
          onSettingsChange({
            ...budgetSettings,
            limit: limitValue,
            notificationEmail: notificationEmail.trim() || undefined,
            _reset: resetCounters
          });
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save budget settings:', error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Budget Settings
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={`Budget Limit (${currencySymbol})`}
          type="number"
          fullWidth
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          helperText="Set to 0 for no limit. The limit applies globally across all projects."
          inputProps={{
            step: '0.01',
            min: '0'
          }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={resetCounters}
              onChange={(e) => setResetCounters(e.target.checked)}
            />
          }
          label={
            <Typography variant="body2">
              Reset token counters for all projects
            </Typography>
          }
          sx={{ mt: 1 }}
        />
        <TextField
          margin="dense"
          label="Notification Email"
          type="email"
          fullWidth
          value={notificationEmail}
          onChange={(e) => setNotificationEmail(e.target.value)}
          helperText="Email address for budget threshold alerts (50%, 80%, 100%). Leave empty to disable."
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
