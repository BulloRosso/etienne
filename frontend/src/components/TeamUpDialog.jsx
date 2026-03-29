import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import { Close, LinkOutlined, CheckCircle, ErrorOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

/**
 * TeamUpDialog — PIN-based agent pairing dialog
 *
 * Two-phase flow:
 * 1. Enter the URL of the remote agent → sends pairing request
 * 2. Enter the 8-digit PIN (communicated out-of-band by the remote agent's owner)
 *    → verifies PIN and creates counterpart projects on both sides
 *
 * Also shows pending incoming pairing requests with their PINs.
 */
export default function TeamUpDialog({ open, onClose, onPaired }) {
  const { t } = useTranslation();

  // State
  const [agentUrl, setAgentUrl] = useState('');
  const [step, setStep] = useState('url'); // 'url' | 'pin' | 'success'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pairing state
  const [pairingId, setPairingId] = useState(null);
  const [receiverAgentCard, setReceiverAgentCard] = useState(null);
  const [pin, setPin] = useState('');

  // Pending incoming requests (receiver side)
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Poll for pending pairing requests when dialog is open
  useEffect(() => {
    if (!open) return;
    fetchPendingPairings();
    const interval = setInterval(fetchPendingPairings, 5000);
    return () => clearInterval(interval);
  }, [open]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setAgentUrl('');
      setStep('url');
      setLoading(false);
      setError(null);
      setPairingId(null);
      setReceiverAgentCard(null);
      setPin('');
    }
  }, [open]);

  const fetchPendingPairings = async () => {
    try {
      setPendingLoading(true);
      const response = await apiAxios.get('/api/collaboration/pairing/pending');
      setPendingRequests(response.data || []);
    } catch {
      // Silently ignore polling errors
    } finally {
      setPendingLoading(false);
    }
  };

  // Step 1: Send pairing request
  const handleInitiatePairing = async () => {
    if (!agentUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiAxios.post('/api/collaboration/pairing/initiate', {
        agentUrl: agentUrl.trim(),
      });

      const data = response.data;
      setPairingId(data.pairingId);
      setReceiverAgentCard(data.receiverAgentCard);
      setStep('pin');
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || t('teamUp.errorInitiate'),
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify PIN
  const handleVerifyPin = async () => {
    if (!pin || pin.length !== 8) return;

    setLoading(true);
    setError(null);

    try {
      await apiAxios.post('/api/collaboration/pairing/complete', {
        agentUrl: agentUrl.trim(),
        pairingId,
        pin,
      });

      setStep('success');
      if (onPaired) {
        onPaired(receiverAgentCard?.name || agentUrl);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || t('teamUp.errorVerify'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      if (step === 'url') handleInitiatePairing();
      else if (step === 'pin') handleVerifyPin();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {t('teamUp.title')}
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 4, minHeight: 350 }}>
          {/* Left: Image */}
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img
              src="/project-wizard-step-6.png"
              alt={t('teamUp.title')}
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: 350,
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          </Box>

          {/* Right: Form */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('teamUp.heading')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('teamUp.description')}
            </Typography>

            {/* Step: Enter URL */}
            {step === 'url' && (
              <Box>
                <TextField
                  fullWidth
                  label={t('teamUp.agentUrlLabel')}
                  placeholder={t('teamUp.agentUrlPlaceholder')}
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  InputProps={{
                    startAdornment: (
                      <LinkOutlined
                        fontSize="small"
                        sx={{ mr: 1, color: 'text.secondary' }}
                      />
                    ),
                  }}
                  sx={{ mb: 2 }}
                />

                <Button
                  variant="contained"
                  onClick={handleInitiatePairing}
                  disabled={!agentUrl.trim() || loading}
                  fullWidth
                  sx={{ mb: 3 }}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    t('teamUp.sendRequest')
                  )}
                </Button>
              </Box>
            )}

            {/* Step: Enter PIN */}
            {step === 'pin' && (
              <Box>
                {receiverAgentCard && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      {t('teamUp.connectedTo', {
                        name: receiverAgentCard.name,
                      })}
                    </Typography>
                    {receiverAgentCard.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        {receiverAgentCard.description}
                      </Typography>
                    )}
                  </Alert>
                )}

                <Typography variant="body2" sx={{ mb: 2 }}>
                  {t('teamUp.pinInstructions')}
                </Typography>

                <TextField
                  fullWidth
                  label={t('teamUp.pinLabel')}
                  placeholder="00000000"
                  value={pin}
                  onChange={(e) => {
                    // Only allow digits, max 8
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setPin(val);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  inputProps={{
                    maxLength: 8,
                    style: {
                      fontSize: '1.5rem',
                      letterSpacing: '0.5em',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                    },
                  }}
                  sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    onClick={() => {
                      setStep('url');
                      setPin('');
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    {t('common.back')}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleVerifyPin}
                    disabled={pin.length !== 8 || loading}
                    fullWidth
                  >
                    {loading ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      t('teamUp.verifyPin')
                    )}
                  </Button>
                </Box>
              </Box>
            )}

            {/* Step: Success */}
            {step === 'success' && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  py: 3,
                }}
              >
                <CheckCircle color="success" sx={{ fontSize: 64 }} />
                <Typography variant="h6">
                  {t('teamUp.successTitle')}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center' }}
                >
                  {t('teamUp.successDescription', {
                    name: receiverAgentCard?.name || agentUrl,
                  })}
                </Typography>
              </Box>
            )}

            {/* Pending incoming pairing requests (receiver side) */}
            {pendingRequests.length > 0 && step !== 'success' && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('teamUp.pendingTitle')}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 2, display: 'block' }}
                >
                  {t('teamUp.pendingDescription')}
                </Typography>
                {pendingRequests.map((req) => (
                  <Box
                    key={req.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.5,
                      mb: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="body2">
                        {req.initiatorAgentCard?.name || req.initiatorUrl}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {req.initiatorUrl}
                      </Typography>
                    </Box>
                    <Chip
                      label={`PIN: ${req.pin}`}
                      color="primary"
                      variant="outlined"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '1rem',
                        letterSpacing: '0.15em',
                      }}
                    />
                  </Box>
                ))}
              </>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {step === 'success' ? t('common.close') : t('common.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
