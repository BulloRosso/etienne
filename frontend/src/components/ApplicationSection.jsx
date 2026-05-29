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
import { useAuth } from '../contexts/AuthContext.jsx';

function resolveIcon(name) {
  if (!name) return null;
  const Icon = MuiIcons[name];
  return Icon || null;
}

export default function ApplicationSection({ currentProject, collapsed = false }) {
  const { i18n } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const openModal = useAppTypeModalStore((s) => s.openModal);

  const lng = useMemo(() => (i18n.language || 'en').split('-')[0], [i18n.language]);

  // Filter menu items by the new optional `roles` field. An item with
  // `roles: ['guest']` only shows to guests; an item with `roles: ['user', 'admin']`
  // shows to user + admin. Items with no `roles` field show to everyone
  // (preserves existing behavior for application types that don't use it).
  const visibleMenuItems = useMemo(() => {
    if (!config?.menuItems) return [];
    const role = user?.role || null;
    return config.menuItems.filter((item) => {
      if (!Array.isArray(item.roles) || item.roles.length === 0) return true;
      return role ? item.roles.includes(role) : false;
    });
  }, [config, user]);

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

  // Substitute ${username} (and a small set of related placeholders) in
  // payload strings so application-type configs can use per-user paths
  // (e.g. "progress/${username}.progress.json") without the backend
  // needing to know about user identity. Falls back to the literal
  // placeholder when no user is signed in — matches the original behavior.
  const interpolate = useCallback((value) => {
    if (typeof value !== 'string' || !value.includes('${')) return value;
    const name = user?.username || '';
    const display = user?.displayName || name;
    const role = user?.role || '';
    return value
      .replace(/\$\{username\}/g, name)
      .replace(/\$\{displayName\}/g, display)
      .replace(/\$\{role\}/g, role);
  }, [user]);

  const handleItemClick = useCallback((item) => {
    const payload = item.payload || {};
    switch (item.type) {
      case 'url': {
        const url = interpolate(payload.url);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        break;
      }
      case 'document': {
        const path = interpolate(payload.path);
        if (path && currentProject) {
          filePreviewHandler.handlePreview(path, currentProject);
        }
        break;
      }
      case 'modal': {
        openModal({ payload, project: currentProject, title: item.label });
        break;
      }
      case 'subagent': {
        const prompt = interpolate(payload.prompt);
        if (prompt) {
          window.dispatchEvent(new CustomEvent('viewer-auto-prompt', {
            detail: { message: prompt, fresh: true }
          }));
        }
        break;
      }
      default:
        break;
    }
  }, [currentProject, openModal, interpolate]);

  if (loading || !config) return null;
  if (!visibleMenuItems || visibleMenuItems.length === 0) return null;

  const sectionBg = themeMode === 'dark' ? '#000' : config.sidebar.bgColor;

  if (collapsed) {
    // Collapsed sidebar: show just the icons in a coloured stripe
    return (
      <Box sx={{ bgcolor: sectionBg, py: 1, mb: 1 }}>
        <List dense disablePadding>
          {visibleMenuItems.map((item) => {
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
        {visibleMenuItems.map((item) => {
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
