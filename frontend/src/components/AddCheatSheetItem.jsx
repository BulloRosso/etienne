import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Autocomplete,
  Button,
  Box,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

function normalizeCheatsheet(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return { groups: [] };
  return {
    groups: raw.groups
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({
        name: typeof g.name === 'string' ? g.name : '',
        items: Array.isArray(g.items)
          ? g.items
              .filter((i) => i && typeof i === 'object')
              .map((i) => ({
                title: typeof i.title === 'string' ? i.title : '',
                content: typeof i.content === 'string' ? i.content : '',
              }))
          : [],
      })),
  };
}

/**
 * Modal that takes a chat-bubble text snippet, asks the backend LLM to extract
 * { group, title, content }, lets the user edit, then appends the item to the
 * authenticated user's cheatsheet (backend derives the per-user file path).
 */
export default function AddCheatSheetItem({ open, onClose, bubbleText, projectName }) {
  const { t } = useTranslation(['cheatsheet', 'common']);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState({ groups: [] });
  const [group, setGroup] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open || !projectName) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setGroup('');
      setTitle('');
      setContent('');

      let existingCheatsheet = { groups: [] };
      try {
        const res = await apiFetch(`/api/cheatsheet/${encodeURIComponent(projectName)}?v=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          existingCheatsheet = normalizeCheatsheet(data?.cheatsheet);
        }
      } catch {
        /* network error: treat as empty */
      }
      if (cancelled) return;
      setExisting(existingCheatsheet);

      try {
        const res = await apiFetch('/api/cheatsheet/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bubbleText, existingCheatsheet }),
        });
        if (!res.ok) throw new Error(`Extraction failed: ${res.statusText}`);
        const data = await res.json();
        if (cancelled) return;
        setGroup((data?.group || '').toString());
        setTitle((data?.title || '').toString());
        setContent((data?.content || bubbleText || '').toString());
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setContent(bubbleText || '');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open, bubbleText, projectName]);

  const handleSubmit = async () => {
    const g = (group || '').trim();
    const ti = (title || '').trim();
    if (!g || !ti) {
      setError(t('cheatsheet:groupTitleRequired', 'Group and title are required'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Re-read just before save to reduce last-write-wins risk for concurrent adds.
      let current = { groups: [] };
      const readRes = await apiFetch(`/api/cheatsheet/${encodeURIComponent(projectName)}?v=${Date.now()}`);
      if (readRes.ok) {
        const data = await readRes.json();
        current = normalizeCheatsheet(data?.cheatsheet);
      }

      const groupIdx = current.groups.findIndex((x) => x.name === g);
      if (groupIdx === -1) {
        current.groups.push({ name: g, items: [{ title: ti, content }] });
      } else {
        current.groups[groupIdx] = {
          ...current.groups[groupIdx],
          items: [...current.groups[groupIdx].items, { title: ti, content }],
        };
      }

      const saveRes = await apiFetch(`/api/cheatsheet/${encodeURIComponent(projectName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cheatsheet: current }),
      });
      if (!saveRes.ok) throw new Error(`Save failed: ${saveRes.statusText}`);

      claudeEventBus.publish(ClaudeEvents.CHEATSHEET_UPDATED, { projectName });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const groupOptions = existing.groups.map((g) => g.name).filter(Boolean);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <Typography component="span" sx={{ fontWeight: 600 }}>
          {t('cheatsheet:addModalTitle', 'Add to cheat sheet')}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label={t('common:close', 'Close')}>
          <IoClose />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('cheatsheet:extracting', 'Extracting…')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && (
              <Alert severity="warning" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <Autocomplete
              freeSolo
              options={groupOptions}
              value={group}
              onChange={(_, v) => setGroup(v || '')}
              onInputChange={(_, v) => setGroup(v)}
              renderInput={(params) => (
                <TextField {...params} label={t('cheatsheet:groupLabel', 'Group')} size="small" autoFocus />
              )}
            />
            <TextField
              label={t('cheatsheet:itemTitleLabel', 'Title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label={t('cheatsheet:itemContentLabel', 'Content (Markdown)')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              size="small"
              multiline
              minRows={6}
              fullWidth
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('common:cancel', 'Cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || submitting || !group.trim() || !title.trim()}
          startIcon={submitting ? <CircularProgress size={14} /> : null}
        >
          {t('cheatsheet:addItemButton', 'Add to cheat sheet')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
