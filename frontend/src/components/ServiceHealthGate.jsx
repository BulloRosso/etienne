import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Chip,
} from '@mui/material';
import { MdPlayArrow, MdRefresh } from 'react-icons/md';

const BACKEND_URL = '';

export default function ServiceHealthGate({ onReady }) {
  const [services, setServices] = useState([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/process-manager/health/required`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setServices(data.services || []);
      if (data.ok) {
        onReady();
        return true;
      }
      return false;
    } catch (err) {
      setError('Cannot reach backend. Make sure the backend is running on port 6060.');
      return false;
    }
  }, [onReady]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Poll after starting services
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      const ready = await checkHealth();
      if (ready) {
        setPolling(false);
        setStarting(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, checkHealth]);

  const handleStartServices = async () => {
    setStarting(true);
    setError('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/process-manager/start-required`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPolling(true);
    } catch (err) {
      setError('Failed to start services. Check backend logs.');
      setStarting(false);
    }
  };

  const downServices = services.filter((s) => s.status !== 'running');

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          maxWidth: 600,
          width: '100%',
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Box
          component="img"
          src="/claude-needs-charging.png"
          alt="Services not running"
          sx={{ width: 180, height: 'auto', opacity: 0.9 }}
        />

        <Typography variant="h5" fontWeight="bold" textAlign="center">
          Required Services Not Running
        </Typography>

        <Typography variant="body1" color="text.secondary" textAlign="center">
          The Secrets Manager and OAuth Server need to be running before you can use the application.
        </Typography>

        {downServices.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {services.map((s) => (
              <Chip
                key={s.name}
                label={s.name}
                color={s.status === 'running' ? 'success' : 'error'}
                variant="outlined"
                size="small"
              />
            ))}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        )}

        {starting ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Starting services...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<MdPlayArrow />}
              onClick={handleStartServices}
            >
              Start Services
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<MdRefresh />}
              onClick={checkHealth}
            >
              Retry
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
