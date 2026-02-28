import React, { useState, useMemo } from 'react';
import {
  Box,
  Chip,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Paper,
} from '@mui/material';
import { TbPlus } from 'react-icons/tb';
import { useTranslation } from 'react-i18next';

const DISABLED_VIEWER = 'none';

export default function AutoFilePreviewExtensions({
  value = [],
  onChange,
  registeredPreviewers = [],
}) {
  const { t } = useTranslation();
  const [newExtension, setNewExtension] = useState('');
  const [newViewer, setNewViewer] = useState('');

  // Build merged view: system defaults + project overrides
  const { mergedMappings, viewerNames } = useMemo(() => {
    const map = new Map(); // extension -> { viewer, source, originalViewer? }

    // System defaults first
    for (const previewer of registeredPreviewers) {
      for (const ext of previewer.extensions) {
        map.set(ext.toLowerCase(), { viewer: previewer.viewer, source: 'system' });
      }
    }

    // Project overrides on top
    for (const override of value) {
      const ext = override.extension.toLowerCase();
      const existing = map.get(ext);
      if (existing && existing.source === 'system') {
        map.set(ext, {
          viewer: override.viewer,
          source: 'override',
          originalViewer: existing.viewer,
        });
      } else {
        map.set(ext, { viewer: override.viewer, source: 'override' });
      }
    }

    const viewers = [...new Set(registeredPreviewers.map(p => p.viewer))];

    return {
      mergedMappings: [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      viewerNames: viewers,
    };
  }, [registeredPreviewers, value]);

  const handleAdd = () => {
    if (!newExtension || !newViewer) return;

    const ext = newExtension.startsWith('.') ? newExtension : `.${newExtension}`;
    const extLower = ext.toLowerCase();

    const updated = value.filter(m => m.extension.toLowerCase() !== extLower);
    updated.push({ extension: extLower, viewer: newViewer });
    onChange(updated);
    setNewExtension('');
    setNewViewer('');
  };

  const handleDeleteChip = (extension) => {
    const extLower = extension.toLowerCase();
    const isSystemDefault = registeredPreviewers.some(p =>
      p.extensions.some(e => e.toLowerCase() === extLower)
    );

    if (isSystemDefault) {
      const currentOverride = value.find(m => m.extension.toLowerCase() === extLower);
      if (currentOverride && currentOverride.viewer === DISABLED_VIEWER) {
        // Re-enable: remove the "none" override so system default takes effect
        const updated = value.filter(m => m.extension.toLowerCase() !== extLower);
        onChange(updated);
      } else {
        // Disable: store a "none" override to suppress the system default
        const updated = value.filter(m => m.extension.toLowerCase() !== extLower);
        updated.push({ extension: extLower, viewer: DISABLED_VIEWER });
        onChange(updated);
      }
    } else {
      // Pure custom override — just remove it entirely
      const updated = value.filter(m => m.extension.toLowerCase() !== extLower);
      onChange(updated);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && newExtension && newViewer) {
      e.preventDefault();
      handleAdd();
    }
  };

  const getChipProps = (ext, { viewer, source, originalViewer }) => {
    const isDisabled = viewer === DISABLED_VIEWER;

    if (isDisabled) {
      return {
        label: `${ext} \u2192 disabled (default: ${originalViewer})`,
        color: 'default',
        variant: 'filled',
        sx: {
          cursor: 'pointer',
          textDecoration: 'line-through',
          opacity: 0.6,
        },
      };
    }

    if (source === 'override' && originalViewer) {
      return {
        label: `${ext} \u2192 ${viewer} (was: ${originalViewer})`,
        color: 'warning',
        variant: 'filled',
        sx: { cursor: 'pointer' },
      };
    }

    if (source === 'override') {
      return {
        label: `${ext} \u2192 ${viewer}`,
        color: 'warning',
        variant: 'filled',
        sx: { cursor: 'pointer' },
      };
    }

    // system default
    return {
      label: `${ext} \u2192 ${viewer}`,
      color: 'default',
      variant: 'outlined',
      sx: { cursor: 'pointer' },
    };
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t('autoFilePreview.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('autoFilePreview.description')}
      </Typography>

      {/* Current mappings */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {mergedMappings.map(([ext, info]) => {
          const chipProps = getChipProps(ext, info);
          return (
            <Chip
              key={ext}
              {...chipProps}
              onDelete={() => handleDeleteChip(ext)}
              onClick={() => {
                if (info.viewer !== DISABLED_VIEWER) {
                  setNewExtension(ext);
                  setNewViewer(info.viewer);
                } else {
                  // Clicking a disabled chip re-enables it
                  handleDeleteChip(ext);
                }
              }}
            />
          );
        })}
      </Box>

      {/* Add / edit mapping */}
      <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label={t('autoFilePreview.extension')}
            value={newExtension}
            onChange={(e) => setNewExtension(e.target.value.toLowerCase())}
            onKeyDown={handleKeyDown}
            placeholder=".csv"
            sx={{ width: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>{t('autoFilePreview.viewer')}</InputLabel>
            <Select
              value={newViewer}
              onChange={(e) => setNewViewer(e.target.value)}
              label="Viewer"
            >
              {viewerNames.map(viewer => (
                <MenuItem key={viewer} value={viewer}>{viewer}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="text"
            startIcon={<TbPlus />}
            onClick={handleAdd}
            disabled={!newExtension || !newViewer}
          >
            {t('common.add')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
