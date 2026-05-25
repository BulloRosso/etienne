import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { apiFetch } from '../../services/api';

export default function DeleteWorkflowDialog({ open, onClose, projectName, workflow, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    if (!workflow?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(workflow.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const msg = await res.text().catch(() => `${res.status}`);
        throw new Error(`Failed to delete: ${msg}`);
      }
      onDeleted?.(workflow.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete workflow</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Typography variant="body2">
          Delete <strong>{workflow?.name}</strong>? This removes the .workflow.json file
          and its history. The action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDelete}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
