import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { PiChatsThin, PiRobotThin } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function SessionPane({ open, onClose, projectName, onSessionSelect }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && projectName) {
      loadSessions();
    }
  }, [open, projectName]);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const response = await apiFetch(`/api/sessions/${encodeURIComponent(projectName)}`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (data.success) {
        setSessions(data.sessions || []);
      } else {
        setError(data.error || t('sessionPane.errorLoadFailed'));
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError(t('sessionPane.errorTimeout'));
      } else {
        setError(err.message || t('sessionPane.errorLoadFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSessionClick = (session) => {
    onSessionSelect(session.sessionId);
    onClose();
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return t('sessionPane.justNow');
      if (diffMins < 60) return t('sessionPane.minutesAgo', { count: diffMins });
      if (diffHours < 24) return t('sessionPane.hoursAgo', { count: diffHours });
      if (diffDays < 7) return t('sessionPane.daysAgo', { count: diffDays });

      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          maxWidth: '90vw'
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2
        }}>
          <Typography variant="h6">{t('sessionPane.title')}</Typography>
          <IconButton onClick={onClose} size="small">
            <IoClose size={20} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 0 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          {!loading && !error && sessions.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('sessionPane.emptyState')}
              </Typography>
            </Box>
          )}

          {!loading && !error && sessions.length > 0 && (
            <List sx={{ p: 2 }}>
              {sessions.map((session, index) => {
                const isPinned = !!session.pinned;

                return (
                  <ListItem
                    key={session.sessionId}
                    button
                    onClick={() => handleSessionClick(session)}
                    sx={{
                      border: '1px solid',
                      borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
                      borderLeft: isPinned ? '3px solid #1976d2' : '1px solid',
                      borderLeftColor: isPinned ? '#1976d2' : (themeMode === 'dark' ? '#555' : '#e0e0e0'),
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: isPinned
                        ? (themeMode === 'dark' ? '#1a2332' : '#f0f6ff')
                        : (themeMode === 'dark' ? '#383838' : '#fafafa'),
                      '&:hover': {
                        backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5'
                      },
                      alignItems: 'flex-start',
                    }}
                  >
                    <ListItemIcon sx={{ mt: 0.5 }}>
                      {isPinned
                        ? <PiRobotThin size={24} color="#1976d2" />
                        : <PiChatsThin size={24} />
                      }
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: isPinned ? 600 : 500, mb: 0.5 }}>
                          {isPinned
                            ? (session.sessionName || session.summary || t('sessionPane.noSummary'))
                            : (session.summary || t('sessionPane.noSummary'))
                          }
                        </Typography>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {formatTimestamp(session.timestamp)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
