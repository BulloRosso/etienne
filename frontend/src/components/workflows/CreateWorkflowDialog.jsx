import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { apiFetch } from '../../services/api';
import { WORKFLOW_TEMPLATES, WORKFLOW_TEMPLATE_OPTIONS } from './workflowTemplates';
import WikiSlugPicker, { commitWikiSlugPick } from './WikiSlugPicker';

export default function CreateWorkflowDialog({ open, onClose, projectName, onCreated }) {
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('hypothesis');
  const [assumptionPick, setAssumptionPick] = useState({ mode: 'link', slug: '', title: '', body: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setTitle('');
    setTemplateId('hypothesis');
    setAssumptionPick({ mode: 'link', slug: '', title: '', body: '' });
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    const template = WORKFLOW_TEMPLATES[templateId];
    if (!template) {
      setError('Pick a workflow type');
      return;
    }

    setSubmitting(true);
    try {
      let assumptionSlug = null;
      if (assumptionPick?.mode === 'create' ? assumptionPick.title : assumptionPick?.slug) {
        assumptionSlug = await commitWikiSlugPick(projectName, assumptionPick);
      }

      const body = {
        name: title.trim(),
        description: template.description,
        machineConfig: template.machineConfig,
        tags: [...(template.defaultTags || [])],
        assumptionWikiSlugs: assumptionSlug ? [assumptionSlug] : undefined,
      };

      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/workflows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const msg = await res.text().catch(() => `${res.status}`);
        throw new Error(`Failed to create workflow: ${msg}`);
      }
      const data = await res.json();
      reset();
      onCreated?.(data);
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create workflow</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Title"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
          <TextField
            label="Type"
            size="small"
            select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            helperText={WORKFLOW_TEMPLATES[templateId]?.description}
          >
            {WORKFLOW_TEMPLATE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
          <WikiSlugPicker
            projectName={projectName}
            value={assumptionPick}
            onChange={setAssumptionPick}
            label="Base assumption"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
