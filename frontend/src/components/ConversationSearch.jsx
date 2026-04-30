import React, { useState, useRef, useCallback } from 'react';
import { Dialog, Paper, Box, TextField, Typography, List, ListItemButton, ListItemIcon, ListItemText, CircularProgress, InputAdornment, IconButton, FormControlLabel, Checkbox } from '@mui/material';
import { Search, Close, Person, SmartToy } from '@mui/icons-material';
import { IoClose } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function ConversationSearch({ open, onClose, projectName, sessionId, onSessionSelect }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentChatOnly, setCurrentChatOnly] = useState(true);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (searchQuery, filterCurrentChat) => {
    if (!searchQuery.trim() || !projectName) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      let url = `/api/sessions/${encodeURIComponent(projectName)}/search?q=${encodeURIComponent(searchQuery.trim())}`;
      if (filterCurrentChat && sessionId) {
        url += `&sessionId=${encodeURIComponent(sessionId)}`;
      }

      const response = await apiFetch(url);
      const data = await response.json();

      if (data.success) {
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Conversation search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [projectName, sessionId]);

  const handleQueryChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => doSearch(value, currentChatOnly), 300);
  };

  const handleCurrentChatToggle = (e) => {
    const checked = e.target.checked;
    setCurrentChatOnly(checked);

    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(query, checked), 150);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const handleResultClick = (result) => {
    if (onSessionSelect) onSessionSelect(result.sessionId);
    if (onClose) onClose();
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    if (onClose) onClose();
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays < 1) return t('sessionPane.justNow', 'Today');
      if (diffDays < 7) return t('sessionPane.daysAgo', '{{count}}d ago', { count: diffDays });
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const highlightExcerpt = (excerpt, searchQuery) => {
    if (!searchQuery.trim()) return excerpt;

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = excerpt.split(regex);

    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} style={{ backgroundColor: themeMode === 'dark' ? '#665500' : '#fff3b0', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>{part}</mark>
        : part
    );
  };

  const iconColor = themeMode === 'dark' ? '#777' : '#bbb';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.3)' } },
        paper: { sx: { backgroundColor: 'transparent', boxShadow: 'none', overflow: 'visible' } },
      }}
    >
      <Paper
        elevation={8}
        sx={{
          backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#fff',
          borderRadius: 3,
          height: '60vh',
          maxHeight: 500,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, pt: 2, pb: 1 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {t('conversationSearch.title', 'Search chats')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {sessionId && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={currentChatOnly}
                    onChange={handleCurrentChatToggle}
                    size="small"
                    sx={{ p: 0.5 }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {t('conversationSearch.currentChat', 'Current chat')}
                  </Typography>
                }
                sx={{ m: 0 }}
              />
            )}
            <IconButton onClick={handleClose} size="small">
              <IoClose size={20} />
            </IconButton>
          </Box>
        </Box>

        {/* Search input */}
        <Box sx={{ px: 2.5, pb: 1 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder={t('conversationSearch.placeholder', 'Search conversation history...')}
            value={query}
            onChange={handleQueryChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: query && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClear} sx={{ p: 0.25 }}>
                      <Close sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              }
            }}
          />
        </Box>

        {/* Results */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, pb: 2 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {!loading && searched && results.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 3 }}>
              {t('conversationSearch.noResults', 'No matching messages found')}
            </Typography>
          )}

          {!loading && results.length > 0 && (
            <List disablePadding dense>
              {results.map((result, idx) => (
                <ListItemButton
                  key={`${result.sessionId}-${idx}`}
                  onClick={() => handleResultClick(result)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    py: 0.75,
                    alignItems: 'flex-start',
                    '&:hover': {
                      backgroundColor: themeMode === 'dark' ? '#3a3a3a' : '#f5f5f5',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 28, mt: 0.5 }}>
                    {result.isAgent
                      ? <SmartToy sx={{ fontSize: 16, color: iconColor }} />
                      : <Person sx={{ fontSize: 16, color: iconColor }} />
                    }
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.sessionSummary}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          {formatTimestamp(result.timestamp)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{
                          mt: 0.25,
                          fontSize: '0.75rem',
                          color: themeMode === 'dark' ? '#aaa' : '#666',
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          display: '-webkit-box',
                        }}
                      >
                        {highlightExcerpt(result.excerpt, query)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Paper>
    </Dialog>
  );
}
