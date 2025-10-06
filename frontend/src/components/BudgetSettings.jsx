import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton
} from '@mui/material';
import { Close } from '@mui/icons-material';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '€',
    'USD': '$',
    'GBP': '£',
    'JPY': '¥'
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

  const currencySymbol = getCurrencySymbol(currency);

  useEffect(() => {
    if (budgetSettings?.limit !== undefined) {
      setLimit(budgetSettings.limit.toString());
    }
  }, [budgetSettings]);

  const handleSave = async () => {
    const limitValue = parseFloat(limit) || 0;

    try {
      const response = await fetch(`/api/budget-monitoring/${project}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: budgetSettings.enabled,
          limit: limitValue
        })
      });

      if (response.ok) {
        // Notify parent component
        if (onSettingsChange) {
          onSettingsChange({
            ...budgetSettings,
            limit: limitValue
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
          helperText="Set to 0 for no limit"
          inputProps={{
            step: '0.01',
            min: '0'
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
