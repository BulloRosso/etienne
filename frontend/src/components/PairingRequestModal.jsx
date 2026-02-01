import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Chip,
  Divider,
  Avatar,
} from '@mui/material';
import {
  Close as CloseIcon,
  Telegram as TelegramIcon,
  Person as PersonIcon,
  Tag as TagIcon,
} from '@mui/icons-material';

/**
 * PairingRequestModal - Telegram Pairing Approval Dialog
 *
 * Displays a pairing request from a Telegram user for admin approval.
 * Shows user info (username, name, chatId) and allows approve/deny.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - pairing: object - The pairing request data { id, code, provider, remoteSession, expires_at }
 * - onRespond: (response) => void - Callback when admin responds
 * - onClose: () => void - Callback when modal is closed without response
 */
export default function PairingRequestModal({ open, pairing, onRespond, onClose }) {
  if (!pairing) return null;

  const { id, code, provider, remoteSession, expires_at } = pairing;
  const { chatId, userId, username, firstName, lastName } = remoteSession || {};

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || `Chat ${chatId}`;
  const expiresAt = expires_at ? new Date(expires_at) : null;
  const timeLeft = expiresAt ? Math.max(0, Math.round((expiresAt - new Date()) / 1000 / 60)) : 0;

  const handleApprove = () => {
    onRespond({
      id,
      action: 'approve',
    });
  };

  const handleDeny = () => {
    onRespond({
      id,
      action: 'deny',
      message: 'Pairing denied by admin',
    });
    onClose?.();
  };

  const handleClose = () => {
    // Closing without action is same as deny
    handleDeny();
  };

  const getProviderIcon = () => {
    switch (provider) {
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088cc' }} />;
      default:
        return <PersonIcon />;
    }
  };

  const getProviderColor = () => {
    switch (provider) {
      case 'telegram':
        return '#0088cc';
      default:
        return '#9c27b0';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: `4px solid ${getProviderColor()}`,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {getProviderIcon()}
          <Typography variant="h6">New Pairing Request</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Provider badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={provider?.charAt(0).toUpperCase() + provider?.slice(1) || 'Unknown'}
              size="small"
              color="primary"
              variant="outlined"
              icon={getProviderIcon()}
            />
            {timeLeft > 0 && (
              <Typography variant="caption" color="text.secondary">
                Expires in {timeLeft} min
              </Typography>
            )}
          </Box>

          <Divider />

          {/* User info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: getProviderColor(), width: 56, height: 56 }}>
              {firstName ? firstName.charAt(0).toUpperCase() : <PersonIcon />}
            </Avatar>
            <Box>
              <Typography variant="h6">{displayName}</Typography>
              {username && (
                <Typography variant="body2" color="text.secondary">
                  @{username}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Details */}
          <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ color: 'text.secondary' }}>
              Session Details
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Chat ID:</Typography>
                <Typography variant="body2" fontFamily="monospace">{chatId}</Typography>
              </Box>

              {userId && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">User ID:</Typography>
                  <Typography variant="body2" fontFamily="monospace">{userId}</Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Pairing Code:</Typography>
                <Chip
                  label={code}
                  size="small"
                  sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                />
              </Box>
            </Box>
          </Box>

          {/* Warning */}
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Approving this request will allow this user to interact with your Claude Code projects via {provider}.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleDeny}
          color="error"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Deny
        </Button>
        <Button
          onClick={handleApprove}
          variant="contained"
          color="primary"
          sx={{ textTransform: 'none' }}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
