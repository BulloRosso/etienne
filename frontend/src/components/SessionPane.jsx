import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { PiChatsThin } from 'react-icons/pi';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function SessionPane({ open, onClose, projectName, onSessionSelect }) {
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
        setError(data.error || 'Failed to load sessions');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Session loading took too long.');
      } else {
        setError(err.message || 'Failed to load sessions');
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

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

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
          p: 2,
          borderBottom: '1px solid #e0e0e0'
        }}>
          <Typography variant="h6">Recent Sessions</Typography>
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
                No previous sessions found.
              </Typography>
            </Box>
          )}

          {!loading && !error && sessions.length > 0 && (
            <List sx={{ p: 0 }}>
              {sessions.map((session, index) => (
                <ListItem
                  key={session.sessionId}
                  button
                  onClick={() => handleSessionClick(session)}
                  sx={{
                    borderBottom: index < sessions.length - 1 ? '1px solid #e0e0e0' : 'none',
                    '&:hover': {
                      backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5'
                    },
                    alignItems: 'flex-start'
                  }}
                >
                  <ListItemIcon sx={{ mt: 0.5 }}>
                    <PiChatsThin size={24} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                        {session.summary || 'No summary available'}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {formatTimestamp(session.timestamp)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                          {session.sessionId}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
