import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { TbPlus, TbTrash, TbArrowUp, TbArrowDown, TbPhoto, TbX } from 'react-icons/tb';
import { apiFetch } from '../services/api';
import IconPickerDialog from './IconPickerDialog';
import { getIcon } from '../utils/iconRegistry';

function makeId() {
  return `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function QuickActionsAdmin({ onSave }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/quick-actions')
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((data) => {
        if (cancelled) return;
        const incoming = Array.isArray(data?.actions) ? data.actions : [];
        const sorted = [...incoming].sort((a, b) => {
          const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          return ao - bo;
        });
        setActions(sorted.map((a) => ({ ...a, id: a.id || makeId() })));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load quick actions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (index, field, value) => {
    setActions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addAction = () => {
    setActions((prev) => [
      ...prev,
      { id: makeId(), title: '', prompt: '', icon: '', sortOrder: prev.length + 1 },
    ]);
  };

  const removeAction = (index) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index, delta) => {
    setActions((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    const payload = {
      actions: actions.map((a, i) => ({
        id: a.id,
        title: a.title || '',
        prompt: a.prompt || '',
        icon: a.icon || undefined,
        sortOrder: i + 1,
      })),
    };
    try {
      const res = await apiFetch('/api/quick-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccess(true);
        window.dispatchEvent(new CustomEvent('quick-actions:changed'));
        if (onSave) onSave(payload);
        setTimeout(() => setSuccess(false), 2000);
      } else {
        setError('Failed to save quick actions');
      }
    } catch (err) {
      setError('Failed to save quick actions');
    }
  };

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Box sx={{ width: '100%' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Saved</Alert>}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Quick actions appear above the chat input. Items with an icon render as a bare icon with the title as a tooltip; items without an icon render as a button with the title as label.
      </Typography>

      <Stack spacing={2}>
        {actions.map((action, index) => {
          const IconComp = getIcon(action.icon);
          return (
            <Paper key={action.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <Stack spacing={0.5}>
                  <Tooltip title="Move up">
                    <span>
                      <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}>
                        <TbArrowUp />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        disabled={index === actions.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <TbArrowDown />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <TextField
                    label="Title"
                    value={action.title}
                    onChange={(e) => updateField(index, 'title', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Prompt"
                    value={action.prompt}
                    onChange={(e) => updateField(index, 'prompt', e.target.value)}
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={IconComp ? <IconComp size={18} /> : <TbPhoto />}
                      onClick={() => setPickerIndex(index)}
                    >
                      {action.icon ? action.icon : 'Choose icon (optional)'}
                    </Button>
                    {action.icon && (
                      <Tooltip title="Clear icon">
                        <IconButton size="small" onClick={() => updateField(index, 'icon', '')}>
                          <TbX />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>

                <Tooltip title="Remove">
                  <IconButton size="small" color="error" onClick={() => removeAction(index)}>
                    <TbTrash />
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>
          );
        })}
      </Stack>

      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        <Button variant="outlined" startIcon={<TbPlus />} onClick={addAction}>
          Add action
        </Button>
        <Button variant="contained" onClick={handleSave} sx={{ ml: 'auto' }}>
          Save
        </Button>
      </Box>

      <IconPickerDialog
        open={pickerIndex !== null}
        currentIcon={pickerIndex !== null ? actions[pickerIndex]?.icon : ''}
        title="Select icon for quick action"
        onSelect={(name) => {
          if (pickerIndex !== null) updateField(pickerIndex, 'icon', name);
          setPickerIndex(null);
        }}
        onClose={() => setPickerIndex(null)}
      />
    </Box>
  );
}
