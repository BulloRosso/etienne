import React, { useState, useEffect, useMemo } from 'react';
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
  Typography,
} from '@mui/material';
import { apiFetch } from '../../services/api';
import WikiSlugPicker, { commitWikiSlugPick } from './WikiSlugPicker';

/**
 * "Progress manually to the next state" dialog. Opens with the available
 * events for the workflow's current state and lets the user attach a wiki
 * page (linked or freshly created) as the rationale evidence.
 */
export default function ProgressStateDialog({ open, onClose, projectName, workflow, initialEvent, onTransitioned }) {
  const [definition, setDefinition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [eventName, setEventName] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [evidencePick, setEvidencePick] = useState({ mode: 'link', slug: '', title: '', body: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !workflow?.id || !projectName) return;
    setLoading(true);
    setError(null);
    setEventName('');
    setReasoning('');
    setEvidencePick({ mode: 'link', slug: '', title: '', body: '' });

    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(workflow.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`load failed: ${r.status}`))))
      .then((data) => {
        setDefinition(data);
        if (initialEvent) {
          const states = data.machineConfig?.states || {};
          const cur = states[data.currentState];
          if (cur?.on?.[initialEvent]) setEventName(initialEvent);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, workflow?.id, projectName, initialEvent]);

  const eventOptions = useMemo(() => {
    if (!definition) return [];
    const states = definition.machineConfig?.states || {};
    const cur = states[definition.currentState];
    if (!cur?.on) return [];
    return Object.entries(cur.on).map(([eventKey, targetSpec]) => {
      const targetState = typeof targetSpec === 'string' ? targetSpec : targetSpec?.target;
      const targetMeta = states[targetState]?.meta;
      return {
        event: eventKey,
        target: targetState,
        targetLabel: targetMeta?.label || targetState,
      };
    });
  }, [definition]);

  const isFinal = definition && definition.machineConfig?.states?.[definition.currentState]?.type === 'final';

  const handleSubmit = async () => {
    setError(null);
    if (!eventName) {
      setError('Pick a target event');
      return;
    }

    setSubmitting(true);
    try {
      const evidenceSlug = (evidencePick?.mode === 'create' ? evidencePick.title : evidencePick?.slug)
        ? await commitWikiSlugPick(projectName, evidencePick)
        : null;

      const rationale = (reasoning.trim() || evidenceSlug)
        ? {
            reasoning: reasoning.trim() || `Manual transition: ${eventName}`,
            evidenceDocuments: evidenceSlug ? [`wiki/topics/${evidenceSlug}.md`] : [],
            recordedAt: new Date().toISOString(),
            recordedBy: 'user',
          }
        : undefined;

      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(workflow.id)}/event`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: eventName,
            rationale,
            decidedBy: 'human',
          }),
        }
      );

      if (!res.ok) {
        const msg = await res.text().catch(() => `${res.status}`);
        throw new Error(`Failed to send event: ${msg}`);
      }
      const data = await res.json();
      onTransitioned?.(data);
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Progress workflow</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading workflow...</Typography>
            </Stack>
          ) : definition ? (
            <>
              <Typography variant="body2" color="text.secondary">
                <strong>{workflow.name}</strong> — currently in{' '}
                <strong>{definition.machineConfig?.states?.[definition.currentState]?.meta?.label || definition.currentState}</strong>
              </Typography>
              {isFinal ? (
                <Alert severity="info">This workflow is in a final state; no further transitions are available.</Alert>
              ) : eventOptions.length === 0 ? (
                <Alert severity="warning">No transitions defined from the current state.</Alert>
              ) : (
                <TextField
                  label="Next state"
                  size="small"
                  select
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                >
                  {eventOptions.map((opt) => (
                    <MenuItem key={opt.event} value={opt.event}>
                      {opt.event} → {opt.targetLabel}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                label="Reasoning"
                size="small"
                multiline
                minRows={2}
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder="Why are you transitioning manually?"
              />
              <WikiSlugPicker
                projectName={projectName}
                value={evidencePick}
                onChange={setEvidencePick}
                label="Evidence wiki page"
              />
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || loading || isFinal || !eventName}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          Progress
        </Button>
      </DialogActions>
    </Dialog>
  );
}
