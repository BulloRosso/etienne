import React from 'react';
import { Alert, Box, Button } from '@mui/material';

export default function HealthBanner({ summary, onResolve }) {
  if (!summary) return null;
  if (summary.overall === 'pass' || summary.overall === 'ok') return null;
  const severity = summary.overall === 'fail' ? 'error' : 'warning';
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 1500 }}>
      <Alert
        severity={severity}
        action={
          <Button color="inherit" size="small" onClick={onResolve}>
            Resolve setup issues
          </Button>
        }
        sx={{ borderRadius: 0 }}
      >
        Last setup check {summary.overall === 'fail' ? 'failed' : 'reported warnings'} (
        {new Date(summary.ranAt).toLocaleString()}).
      </Alert>
    </Box>
  );
}
