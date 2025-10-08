import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { TbTimelineEvent } from 'react-icons/tb';
import { AiOutlineDelete } from 'react-icons/ai';
import BackgroundInfo from './BackgroundInfo';

export default function MemoryPanel({ projectName, onClose, showBackgroundInfo, isOpen }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMemories();
  }, [projectName]);

  // Refresh memories whenever the panel is opened
  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen]);

  const loadMemories = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = 'user'; // Default user ID for single-user system
      const url = `/api/memories/${userId}?project=${encodeURIComponent(projectName)}&limit=100`;
      console.log('Loading memories from:', url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Memory API error:', response.status, errorText);
        throw new Error(`Failed to load memories: ${response.status}`);
      }

      const data = await response.json();
      console.log('Memories loaded:', data);
      setMemories(data.results || []);
    } catch (err) {
      console.error('Failed to load memories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    try {
      const userId = 'user';
      const url = `/api/memories/${memoryId}?user_id=${userId}&project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete memory');
      }

      // Refresh the list
      await loadMemories();
    } catch (err) {
      console.error('Failed to delete memory:', err);
      setError(err.message);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        p: 1
      }}>
        <Typography variant="h6" sx={{ fontWeight: 600, marginLeft: '14px' }}>
          Long Term Memory
        </Typography>
        <IconButton onClick={onClose} size="small">
          <IoClose size={24} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <BackgroundInfo infoId="memory" showBackgroundInfo={showBackgroundInfo} />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && memories.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography variant="body1">
              No memories stored yet.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Enable Long Term Memory in settings and start chatting to build a memory base.
            </Typography>
          </Box>
        )}

        {!loading && !error && memories.length > 0 && (
          <List>
            {memories.map((memory) => (
              <ListItem
                key={memory.id}
                sx={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: '#fafafa',
                  '&:hover': {
                    backgroundColor: '#f5f5f5',
                    '& .delete-icon': {
                      opacity: 1
                    }
                  },
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                  position: 'relative'
                }}
              >
                <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                    <TbTimelineEvent size={20} color="#1976d2" />
                  </ListItemIcon>
                  <ListItemText
                    primary={memory.memory}
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Created: {formatDate(memory.created_at)}
                        </Typography>
                        {memory.updated_at && memory.updated_at !== memory.created_at && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>
                            Updated: {formatDate(memory.updated_at)}
                          </Typography>
                        )}
                      </Box>
                    }
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { fontWeight: 500 }
                    }}
                    sx={{ pr: 5 }}
                  />
                  <IconButton
                    className="delete-icon"
                    onClick={() => handleDeleteMemory(memory.id)}
                    size="small"
                    sx={{
                      position: 'absolute',
                      right: 8,
                      top: 8,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      color: '#d32f2f',
                      '&:hover': {
                        backgroundColor: 'rgba(211, 47, 47, 0.08)'
                      }
                    }}
                  >
                    <AiOutlineDelete size={20} />
                  </IconButton>
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Footer */}
      {!loading && !error && memories.length > 0 && (
        <Box sx={{
          p: 2,
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#f5f5f5'
        }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'} stored
          </Typography>
        </Box>
      )}
    </Box>
  );
}
