import React, { useState, useEffect } from 'react';
import { IconButton, Menu, MenuItem, Checkbox, ListItemText, TextField, Typography, Box, Divider } from '@mui/material';
import { PiBellRinging, PiBell } from 'react-icons/pi';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function NotificationMenu({ projectName }) {
  const { mode: themeMode } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState(null);
  const [channels, setChannels] = useState([]);
  const [enabledChannels, setEnabledChannels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('notificationChannels') || '[]');
    } catch { return []; }
  });
  const [notificationEmail, setNotificationEmail] = useState(
    () => localStorage.getItem('notificationEmail') || ''
  );

  const open = Boolean(anchorEl);

  // Fetch channel availability when menu opens
  useEffect(() => {
    if (open && projectName) {
      apiFetch(`/api/user-notifications?projectName=${encodeURIComponent(projectName)}`)
        .then(res => res.json())
        .then(data => setChannels(data.channels || []))
        .catch(err => console.error('Failed to fetch notification channels:', err));
    }
  }, [open, projectName]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const toggleChannel = async (channelId) => {
    const wasEnabled = enabledChannels.includes(channelId);

    // Request browser permission before enabling desktop notifications
    if (!wasEnabled && channelId === 'desktop' && 'Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return; // Don't enable if denied
    }

    setEnabledChannels(prev => {
      const updated = prev.includes(channelId)
        ? prev.filter(c => c !== channelId)
        : [...prev, channelId];
      localStorage.setItem('notificationChannels', JSON.stringify(updated));
      return updated;
    });
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setNotificationEmail(value);
    localStorage.setItem('notificationEmail', value);
  };

  const hasActiveChannels = enabledChannels.length > 0;
  const iconColor = hasActiveChannels
    ? '#4caf50'
    : themeMode === 'dark' ? '#fff' : '#333';

  return (
    <>
      <IconButton
        onClick={handleClick}
        title="Notifications"
        sx={{ color: iconColor }}
      >
        {hasActiveChannels ? <PiBellRinging size={20} /> : <PiBell size={20} />}
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            minWidth: 280,
            backgroundColor: themeMode === 'dark' ? '#383838' : '#fff',
            color: themeMode === 'dark' ? '#fff' : '#333',
          }
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Notify me when task completes
          </Typography>
        </Box>
        <Divider />
        {channels.map((channel) => {
          const isAvailable = channel.status === 'available';
          const isEnabled = enabledChannels.includes(channel.id);

          return (
            <Box key={channel.id}>
              <MenuItem
                onClick={() => isAvailable && toggleChannel(channel.id)}
                disabled={!isAvailable}
                sx={{ py: 0.5 }}
              >
                <Checkbox
                  checked={isEnabled && isAvailable}
                  disabled={!isAvailable}
                  size="small"
                  sx={{ mr: 1, p: 0.5 }}
                />
                <ListItemText
                  primary={channel.name}
                  secondary={!isAvailable ? 'Service not running' : undefined}
                  primaryTypographyProps={{
                    sx: { color: !isAvailable ? 'text.disabled' : 'inherit' }
                  }}
                  secondaryTypographyProps={{
                    sx: { fontSize: '0.75rem' }
                  }}
                />
              </MenuItem>
              {channel.id === 'email' && isEnabled && isAvailable && (
                <Box sx={{ px: 2, pb: 1 }}>
                  <TextField
                    size="small"
                    placeholder="your@email.com"
                    value={notificationEmail}
                    onChange={handleEmailChange}
                    onClick={(e) => e.stopPropagation()}
                    fullWidth
                    sx={{ mt: 0.5 }}
                    InputProps={{
                      sx: { fontSize: '0.85rem' }
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Menu>
    </>
  );
}
