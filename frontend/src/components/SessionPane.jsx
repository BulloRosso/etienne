import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert, TextField, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { PiChatsThin, PiRobotThin } from 'react-icons/pi';
import { AiOutlineDelete, AiOutlineEdit, AiOutlineStar, AiFillStar } from 'react-icons/ai';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function SessionPane({ open, onClose, projectName, onSessionSelect, currentSessionId }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    if (editingSessionId) return;
    onSessionSelect(session.sessionId);
    onClose();
  };

  const handleEditClick = (e, session) => {
    e.stopPropagation();
    setEditingSessionId(session.sessionId);
    setEditValue(session.summary || '');
  };

  const handleEditSave = async (sessionId) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }

    try {
      const response = await apiFetch(
        `/api/sessions/${encodeURIComponent(projectName)}/${sessionId}/summary`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: trimmed })
        }
      );
      const data = await response.json();

      if (data.success) {
        setSessions(prev => prev.map(s =>
          s.sessionId === sessionId ? { ...s, summary: trimmed } : s
        ));
      } else {
        setError(data.error || t('sessionPane.editError'));
      }
    } catch (err) {
      setError(err.message || t('sessionPane.editError'));
    } finally {
      setEditingSessionId(null);
    }
  };

  const handleEditCancel = () => {
    setEditingSessionId(null);
  };

  const handleEditKeyDown = (e, sessionId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSave(sessionId);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  const handleDeleteClick = (e, session) => {
    e.stopPropagation();
    setDeleteTarget(session);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const sessionId = deleteTarget.sessionId;
    setDeleteTarget(null);

    try {
      const response = await apiFetch(
        `/api/sessions/${encodeURIComponent(projectName)}/${sessionId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();

      if (data.success) {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      } else {
        setError(data.error || t('sessionPane.deleteError'));
      }
    } catch (err) {
      setError(err.message || t('sessionPane.deleteError'));
    }
  };

  const handleStarClick = async (e, session) => {
    e.stopPropagation();
    try {
      const response = await apiFetch(
        `/api/sessions/${encodeURIComponent(projectName)}/${session.sessionId}/star`,
        { method: 'PATCH' }
      );
      const data = await response.json();

      if (data.success) {
        setSessions(prev => {
          const updated = prev.map(s =>
            s.sessionId === session.sessionId ? { ...s, starred: data.starred } : s
          );
          // Re-sort: pinned first, then starred, then regular by timestamp desc
          return updated.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            if (a.pinned && b.pinned) return (a.sessionName || '').localeCompare(b.sessionName || '');
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
        });
      }
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
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
                const isStarred = !!session.starred;

                return (
                  <ListItem
                    key={session.sessionId}
                    button
                    onClick={() => handleSessionClick(session)}
                    sx={{
                      border: '1px solid',
                      borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
                      borderLeft: isPinned ? '3px solid #1976d2' : isStarred ? '3px solid #f5a623' : '1px solid',
                      borderLeftColor: isPinned ? '#1976d2' : isStarred ? '#f5a623' : (themeMode === 'dark' ? '#555' : '#e0e0e0'),
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: isPinned
                        ? (themeMode === 'dark' ? '#1a2332' : '#f0f6ff')
                        : isStarred
                          ? (themeMode === 'dark' ? '#2a2518' : '#fffbf0')
                          : (themeMode === 'dark' ? '#383838' : '#fafafa'),
                      '&:hover': {
                        backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5',
                        '& .session-actions': { opacity: 1 }
                      },
                      alignItems: 'flex-start',
                      position: 'relative',
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
                        editingSessionId === session.sessionId ? (
                          <TextField
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleEditKeyDown(e, session.sessionId)}
                            onBlur={() => handleEditSave(session.sessionId)}
                            autoFocus
                            size="small"
                            fullWidth
                            variant="outlined"
                            multiline
                            maxRows={4}
                            onClick={(e) => e.stopPropagation()}
                            sx={{ mb: 0.5 }}
                          />
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: isPinned ? 600 : 500, mb: 0.5, pr: !isPinned ? 6 : 0 }}>
                            {isPinned
                              ? (session.sessionName || session.summary || t('sessionPane.noSummary'))
                              : (session.summary || t('sessionPane.noSummary'))
                            }
                          </Typography>
                        )
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {formatTimestamp(session.timestamp)}
                          </Typography>
                        </Box>
                      }
                    />
                    {!isPinned && editingSessionId !== session.sessionId && (
                      <Box
                        className="session-actions"
                        sx={{
                          position: 'absolute',
                          right: 8,
                          top: 8,
                          display: 'flex',
                          gap: 0.25,
                          opacity: isStarred ? 1 : 0,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => handleStarClick(e, session)}
                          sx={{ p: 0.5, color: isStarred ? '#f5a623' : undefined }}
                        >
                          {isStarred ? <AiFillStar size={16} /> : <AiOutlineStar size={16} />}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => handleEditClick(e, session)}
                          sx={{ p: 0.5 }}
                        >
                          <AiOutlineEdit size={16} />
                        </IconButton>
                        {session.sessionId !== currentSessionId && (
                          <IconButton
                            size="small"
                            onClick={(e) => handleDeleteClick(e, session)}
                            sx={{ p: 0.5 }}
                          >
                            <AiOutlineDelete size={16} />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogTitle>{t('sessionPane.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('sessionPane.deleteConfirm')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">{t('common.delete')}</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
