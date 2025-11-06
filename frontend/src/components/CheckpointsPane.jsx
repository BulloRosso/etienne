import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Alert
} from '@mui/material';
import { MdOutlineRestorePage, MdClose } from 'react-icons/md';
import { IoMdAdd } from 'react-icons/io';
import { RiDeleteBinLine } from 'react-icons/ri';
import axios from 'axios';
import BackgroundInfo from './BackgroundInfo';

export default function CheckpointsPane({ projectName, showBackgroundInfo, onRestoreComplete }) {
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newCheckpointMessage, setNewCheckpointMessage] = useState('');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6060';

  // Load checkpoints on mount and when projectName changes
  useEffect(() => {
    if (projectName) {
      loadCheckpoints();
    }
  }, [projectName]);

  const loadCheckpoints = async () => {
    if (!projectName) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE}/api/checkpoints/${projectName}/list`);
      if (response.data.success) {
        setCheckpoints(response.data.checkpoints || []);
      } else {
        setError(response.data.message || 'Failed to load checkpoints');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  };

  const createCheckpoint = async () => {
    if (!newCheckpointMessage.trim() || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/api/checkpoints/${projectName}/create`, {
        message: newCheckpointMessage
      });

      if (response.data.success) {
        setNewCheckpointMessage('');
        await loadCheckpoints();
      } else {
        setError(response.data.message || 'Failed to create checkpoint');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create checkpoint');
    } finally {
      setActionLoading(false);
    }
  };

  const restoreCheckpoint = async () => {
    if (!selectedCheckpoint || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/api/checkpoints/${projectName}/restore`, {
        commitHash: selectedCheckpoint.gitId
      });

      if (response.data.success) {
        setDialogOpen(false);
        setSelectedCheckpoint(null);
        // Switch to Files tab to show restored content
        if (onRestoreComplete) {
          onRestoreComplete();
        }
      } else {
        setError(response.data.message || 'Failed to restore checkpoint');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to restore checkpoint');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteCheckpoint = async () => {
    if (!selectedCheckpoint || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await axios.delete(
        `${API_BASE}/api/checkpoints/${projectName}/${selectedCheckpoint.gitId}`
      );

      if (response.data.success) {
        setDialogOpen(false);
        setSelectedCheckpoint(null);
        await loadCheckpoints();
      } else {
        setError(response.data.message || 'Failed to delete checkpoint');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete checkpoint');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckpointClick = (checkpoint) => {
    setSelectedCheckpoint(checkpoint);
    setDialogOpen(true);
    setError(null);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedCheckpoint(null);
    setError(null);
  };

  if (!projectName) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: '#999' }}>
        <Typography>No project selected</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <BackgroundInfo infoId="checkpoints" showBackgroundInfo={showBackgroundInfo} />

      {/* Create new checkpoint */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="describe this checkpoint"
          value={newCheckpointMessage}
          onChange={(e) => setNewCheckpointMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !actionLoading) {
              createCheckpoint();
            }
          }}
          disabled={actionLoading}
        />
        <IconButton
          color="primary"
          onClick={createCheckpoint}
          disabled={!newCheckpointMessage.trim() || actionLoading}
        >
          {actionLoading ? <CircularProgress size={24} /> : <IoMdAdd />}
        </IconButton>
      </Box>

      {/* Error display */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Checkpoints list */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : checkpoints.length === 0 ? (
          <Box sx={{ textAlign: 'center', color: '#999', p: 4 }}>
            <MdOutlineRestorePage size={48} />
            <Typography sx={{ mt: 2 }}>No checkpoints yet</Typography>
            <Typography variant="body2">Create your first checkpoint above</Typography>
          </Box>
        ) : (
          <List dense>
            {checkpoints.map((checkpoint) => (
              <ListItem key={checkpoint.gitId} disablePadding>
                <ListItemButton onClick={() => handleCheckpointClick(checkpoint)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <MdOutlineRestorePage size={20} />
                    <ListItemText
                      primary={checkpoint.commit}
                      secondary={new Date(checkpoint.timestamp_created).toLocaleString()}
                    />
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Checkpoint actions dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { overflowX: 'hidden' }
        }}
      >
        <DialogTitle sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 1,
          minWidth: 0
        }}>
          <Box sx={{
            flexGrow: 1,
            minWidth: 0,
            mr: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            Restore Content to {selectedCheckpoint?.commit}
          </Box>
          <IconButton
            edge="end"
            color="inherit"
            onClick={handleCloseDialog}
            disabled={actionLoading}
            aria-label="close"
            sx={{ flexShrink: 0 }}
          >
            <MdClose />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ overflowX: 'hidden' }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            Created: {selectedCheckpoint && new Date(selectedCheckpoint.timestamp_created).toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all' }}>
            Hash: {selectedCheckpoint?.gitId?.substring(0, 8)}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          <IconButton
            onClick={deleteCheckpoint}
            disabled={actionLoading}
            color="error"
            aria-label="delete checkpoint"
          >
            <RiDeleteBinLine />
          </IconButton>
          <Button
            onClick={restoreCheckpoint}
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Restore filesystem now'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
