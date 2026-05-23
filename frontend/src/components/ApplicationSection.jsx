import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getEffectiveApplicationType } from '../services/applicationTypes';
import useAppTypeModalStore from '../stores/useAppTypeModalStore';
import { filePreviewHandler } from '../services/FilePreviewHandler';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

function resolveIcon(name) {
  if (!name) return null;
  const Icon = MuiIcons[name];
  return Icon || null;
}

export default function ApplicationSection({ currentProject, collapsed = false }) {
  const { i18n } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const openModal = useAppTypeModalStore((s) => s.openModal);

  const lng = useMemo(() => (i18n.language || 'en').split('-')[0], [i18n.language]);

  useEffect(() => {
    if (!currentProject) {
      setConfig(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getEffectiveApplicationType(currentProject, lng)
      .then((c) => { if (!cancelled) setConfig(c); })
      .catch(() => { if (!cancelled) setConfig(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentProject, lng]);

  const handleItemClick = useCallback((item) => {
    const payload = item.payload || {};
    switch (item.type) {
      case 'url': {
        if (payload.url) {
          window.open(payload.url, '_blank', 'noopener,noreferrer');
        }
        break;
      }
      case 'document': {
        if (payload.path && currentProject) {
          filePreviewHandler.handlePreview(payload.path, currentProject);
        }
        break;
      }
      case 'modal': {
        openModal({ payload, project: currentProject, title: item.label });
        break;
      }
      case 'subagent': {
        if (payload.prompt) {
          window.dispatchEvent(new CustomEvent('viewer-auto-prompt', {
            detail: { message: payload.prompt, fresh: true }
          }));
        }
        break;
      }
      default:
        break;
    }
  }, [currentProject, openModal]);

  if (loading || !config) return null;
  if (!config.menuItems || config.menuItems.length === 0) return null;

  const sectionBg = themeMode === 'dark' ? '#000' : config.sidebar.bgColor;

  if (collapsed) {
    // Collapsed sidebar: show just the icons in a coloured stripe
    return (
      <Box sx={{ bgcolor: sectionBg, py: 1, mb: 1 }}>
        <List dense disablePadding>
          {config.menuItems.map((item) => {
            const Icon = resolveIcon(item.icon);
            return (
              <ListItemButton
                key={item.id}
                onClick={() => handleItemClick(item)}
                title={item.label}
                sx={{ justifyContent: 'center', px: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 0 }}>
                  {Icon ? <Icon fontSize="small" /> : null}
                </ListItemIcon>
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: sectionBg, p: 1, mb: 1 }}>
      {config.sidebar.heading && (
        <Typography
          variant="overline"
          sx={{ px: 1, opacity: 0.75, fontWeight: 600, display: 'block' }}
        >
          {config.sidebar.heading}
        </Typography>
      )}
      <List dense disablePadding>
        {config.menuItems.map((item) => {
          const Icon = resolveIcon(item.icon);
          return (
            <ListItemButton
              key={item.id}
              onClick={() => handleItemClick(item)}
              sx={{ borderRadius: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {Icon ? <Icon fontSize="small" /> : null}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: '0.875rem' }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
