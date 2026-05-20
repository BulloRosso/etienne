import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { apiFetch } from '../services/api';
import { getIcon } from '../utils/iconRegistry';
import { filePreviewHandler } from '../services/FilePreviewHandler';

export default function QuickActions({ onSelectAction, currentProject, extraActions = [] }) {
  const [actions, setActions] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/quick-actions')
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((data) => {
        if (cancelled) return;
        setActions(Array.isArray(data?.actions) ? data.actions : []);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const handler = () => setReloadKey((k) => k + 1);
    window.addEventListener('quick-actions:changed', handler);
    return () => window.removeEventListener('quick-actions:changed', handler);
  }, []);

  // Filter to: workspace-scoped (no project field) plus actions for the active project.
  const visible = useMemo(() => {
    return actions.filter((a) => !a.project || a.project === currentProject);
  }, [actions, currentProject]);

  const sorted = useMemo(() => {
    const tagged = [
      ...visible,
      ...extraActions.map((a, i) => ({ ...a, id: a.id || `extra-${i}-${a.title}` })),
    ];
    return tagged.sort((a, b) => {
      const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      return ao - bo;
    });
  }, [visible, extraActions]);

  if (sorted.length === 0) return null;

  const handleClick = (action) => {
    if (action.previewFile) {
      filePreviewHandler.handlePreview(action.previewFile, action.project || currentProject);
      return;
    }
    if (onSelectAction && action.prompt) onSelectAction(action.prompt);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        ml: '20px',
        mb: 0,
        pb: 0.75,
        pt: 0.75,
        pr: 1.5,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, whiteSpace: 'nowrap' }}>
        Quick Actions
      </Typography>
      {sorted.map((action) => {
        const IconComp = getIcon(action.icon);

        if (IconComp) {
          return (
            <Tooltip key={action.id} title={action.title || ''}>
              <IconButton
                size="small"
                onClick={() => handleClick(action)}
                aria-label={action.title}
                sx={{ p: 0.5 }}
              >
                <IconComp size={20} />
              </IconButton>
            </Tooltip>
          );
        }

        return (
          <Button
            key={action.id}
            variant="outlined"
            size="small"
            onClick={() => handleClick(action)}
            sx={{
              textTransform: 'none',
              whiteSpace: 'nowrap',
              color: 'text.secondary',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'text.secondary',
                backgroundColor: 'action.hover',
              },
            }}
          >
            {action.title}
          </Button>
        );
      })}
    </Box>
  );
}
