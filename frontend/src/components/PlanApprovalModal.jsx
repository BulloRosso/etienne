import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  CircularProgress
} from '@mui/material';
import { Close as CloseIcon, Assignment as PlanIcon } from '@mui/icons-material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * PlanApprovalModal - Plan Review and Approval Dialog
 *
 * Displays Claude's execution plan for user approval in 'plan' mode.
 * Fetches and renders the plan from the plan file with markdown formatting.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - plan: object - The plan approval request data { id, planFilePath }
 * - onRespond: (response) => void - Callback when user responds
 * - onClose: () => void - Callback when modal is closed without response
 * - currentProject: string - Current project name for API calls
 */
export default function PlanApprovalModal({ open, plan, onRespond, onClose, currentProject }) {
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch plan content when modal opens
  useEffect(() => {
    if (open && plan?.planFilePath && currentProject) {
      setLoading(true);
      setError(null);

      // Fetch the plan file content
      fetch(`/api/content-management/${encodeURIComponent(currentProject)}/files?path=${encodeURIComponent(plan.planFilePath)}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load plan file');
          return res.json();
        })
        .then(async (data) => {
          const markdownText = data.content || 'No plan content available';
          // Parse markdown to HTML
          const rawHtml = await marked.parse(markdownText);
          // Sanitize HTML to prevent XSS
          const cleanHtml = DOMPurify.sanitize(rawHtml);
          setHtmlContent(cleanHtml);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error loading plan:', err);
          setError(err.message);
          setHtmlContent('');
          setLoading(false);
        });
    }
  }, [open, plan, currentProject]);

  if (!plan) return null;

  const { id } = plan;

  const handleApprove = () => {
    onRespond({
      id,
      action: 'allow',
      updatedInput: {
        approved: true,
        message: 'Plan approved by user'
      }
    });
  };

  const handleReject = () => {
    onRespond({
      id,
      action: 'deny',
      message: 'Plan rejected by user'
    });
  };

  const handleCancel = () => {
    onRespond({
      id,
      action: 'cancel',
      message: 'User cancelled plan review'
    });
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #4caf50',
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlanIcon sx={{ color: '#4caf50' }} />
          <Typography variant="h6">Review Etienne's Plan</Typography>
        </Box>
        <IconButton onClick={handleCancel} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="error">{error}</Typography>
          </Box>
        ) : (
          <Box sx={{
            p: 3,
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              mt: 2,
              mb: 1,
              fontWeight: 600
            },
            '& p': {
              mb: 1.5
            },
            '& ul, & ol': {
              pl: 3,
              mb: 1.5
            },
            '& li': {
              mb: 0.5
            },
            '& code': {
              bgcolor: 'grey.100',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.9em'
            },
            '& pre': {
              bgcolor: 'grey.100',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              '& code': {
                bgcolor: 'transparent',
                p: 0
              }
            },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              mb: 2,
              '& th, & td': {
                border: '1px solid',
                borderColor: 'divider',
                p: 1,
                textAlign: 'left'
              },
              '& th': {
                bgcolor: 'grey.50',
                fontWeight: 600
              }
            },
            '& blockquote': {
              borderLeft: '4px solid',
              borderColor: 'primary.main',
              pl: 2,
              ml: 0,
              fontStyle: 'italic',
              color: 'text.secondary'
            },
            '& hr': {
              my: 2,
              border: 'none',
              borderTop: '1px solid',
              borderColor: 'divider'
            }
          }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleReject}
          color="error"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Reject Plan
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleCancel}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApprove}
          variant="contained"
          color="success"
          disabled={loading || !!error}
          sx={{ textTransform: 'none' }}
        >
          Approve Plan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
