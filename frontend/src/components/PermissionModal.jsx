import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  IconButton,
  Chip
} from '@mui/material';
import { Close as CloseIcon, Security as SecurityIcon } from '@mui/icons-material';

/**
 * PermissionModal - Tool Permission Request Dialog
 *
 * Displays a simple dialog for tool permission requests in acceptEdits mode.
 * Shows tool name and action description, with Allow/Deny buttons.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - permission: object - The permission request data { id, toolName, toolInput, suggestions }
 * - onRespond: (response) => void - Callback when user responds
 * - onClose: () => void - Callback when modal is closed without response
 */
export default function PermissionModal({ open, permission, onRespond, onClose }) {
  if (!permission) return null;

  const { id, toolName, toolInput } = permission;

  // Generate a simple description of the tool action
  const getToolDescription = () => {
    switch (toolName) {
      case 'Write':
        return `Write to file: ${toolInput?.file_path || 'unknown'}`;
      case 'Edit':
        return `Edit file: ${toolInput?.file_path || 'unknown'}`;
      case 'MultiEdit':
        return `Edit multiple sections in: ${toolInput?.file_path || 'unknown'}`;
      case 'Bash':
        const cmd = toolInput?.command || '';
        const truncatedCmd = cmd.length > 100 ? cmd.substring(0, 100) + '...' : cmd;
        return `Execute command: ${truncatedCmd}`;
      case 'Read':
        return `Read file: ${toolInput?.file_path || 'unknown'}`;
      case 'Glob':
        return `Search files: ${toolInput?.pattern || 'unknown'}`;
      case 'Grep':
        return `Search content: ${toolInput?.pattern || 'unknown'}`;
      default:
        return `Use tool: ${toolName}`;
    }
  };

  const handleAllow = () => {
    onRespond({
      id,
      action: 'allow',
      updatedInput: toolInput
    });
  };

  const handleDeny = () => {
    onRespond({
      id,
      action: 'deny',
      message: 'User denied permission'
    });
  };

  const handleCancel = () => {
    onRespond({
      id,
      action: 'cancel',
      message: 'User cancelled'
    });
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #2196f3'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon sx={{ color: '#2196f3' }} />
          <Typography variant="h6">Permission Required</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={toolName}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
          <IconButton onClick={handleCancel} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Claude wants to perform the following action:
        </Alert>

        <Box sx={{
          p: 2,
          bgcolor: 'background.default',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider'
        }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {getToolDescription()}
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
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleCancel}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleAllow}
          variant="contained"
          color="primary"
          sx={{ textTransform: 'none' }}
        >
          Allow
        </Button>
      </DialogActions>
    </Dialog>
  );
}
