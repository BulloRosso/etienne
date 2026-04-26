import React, { useState } from 'react';
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
  Chip,
  Collapse,
} from '@mui/material';
import {
  Close as CloseIcon,
  VerifiedUser as VerifiedUserIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const ACCENT_COLOR = '#00897b';

const POLICY_COLORS = {
  optional: 'success',
  required: 'error',
  step_up_only: 'warning',
};

/**
 * HITLApprovalModal - HITL Protocol v0.8 Verification Request Dialog
 *
 * Displays a dialog for external HITL verification requests.
 * Shows service identity, action type, description, verification policy,
 * and payload details with Approve/Deny buttons.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - hitlRequest: object - The HITL request data { id, service_id, action_type, action_description, verification_policy, payload, metadata }
 * - onRespond: (response) => void - Callback when user responds
 * - onClose: () => void - Callback when modal is closed without response
 */
export default function HITLApprovalModal({ open, hitlRequest, onRespond, onClose }) {
  const { t } = useTranslation();
  const [showPayload, setShowPayload] = useState(false);

  if (!hitlRequest) return null;

  const {
    id,
    service_id,
    action_type,
    action_description,
    verification_policy,
    payload,
    metadata,
  } = hitlRequest;

  const handleApprove = () => {
    onRespond({
      request_id: id,
      decision: 'approve',
    });
  };

  const handleDeny = () => {
    onRespond({
      request_id: id,
      decision: 'deny',
    });
  };

  const handleCancel = () => {
    onRespond({
      request_id: id,
      decision: 'deny',
    });
    onClose?.();
  };

  const hasPayload = payload && Object.keys(payload).length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: `4px solid ${ACCENT_COLOR}`,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VerifiedUserIcon sx={{ color: ACCENT_COLOR }} />
          <Typography variant="h6">
            {t('hitl.title', 'HITL Verification Request')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={verification_policy}
            size="small"
            color={POLICY_COLORS[verification_policy] || 'default'}
            variant="outlined"
            sx={{ fontSize: '0.7rem', textTransform: 'uppercase' }}
          />
          <IconButton onClick={handleCancel} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }} icon={<VerifiedUserIcon />}>
          {t(
            'hitl.actionAlert',
            'An external service is requesting human verification for the following action.'
          )}
        </Alert>

        {/* Service & Action info */}
        <Box
          sx={{
            p: 2,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            mb: 2,
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Chip
              label={service_id}
              size="small"
              sx={{ fontSize: '0.75rem', bgcolor: `${ACCENT_COLOR}18`, color: ACCENT_COLOR }}
            />
            <Chip
              label={action_type}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.75rem' }}
            />
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {action_description}
          </Typography>
        </Box>

        {/* Collapsible payload details */}
        {hasPayload && (
          <Box>
            <Button
              size="small"
              onClick={() => setShowPayload(!showPayload)}
              endIcon={showPayload ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', color: 'text.secondary', mb: 0.5 }}
            >
              {t('hitl.payloadDetails', 'Payload details')}
            </Button>
            <Collapse in={showPayload}>
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(payload, null, 2)}
              </Box>
            </Collapse>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleDeny}
          color="error"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          {t('common.deny', 'Deny')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleCancel}
          sx={{ textTransform: 'none' }}
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleApprove}
          variant="contained"
          sx={{
            textTransform: 'none',
            bgcolor: ACCENT_COLOR,
            '&:hover': { bgcolor: '#00695c' },
          }}
        >
          {t('common.approve', 'Approve')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
