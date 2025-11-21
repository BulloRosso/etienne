import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Chip,
  TextField,
  Autocomplete,
  Typography,
  IconButton,
  Alert
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import axios from 'axios';

export default function TagManager({
  open,
  onClose,
  projectName,
  filePath,
  fileName,
  currentTags,
  allTags
}) {
  const [tags, setTags] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTags([...currentTags]);
      setError(null);
    }
  }, [open, currentTags]);

  const getTagColor = (tag) => {
    const colors = ['#1976d2', '#388e3c', '#d32f2f', '#f57c00', '#7b1fa2', '#c2185b', '#0097a7', '#689f38', '#e64a19'];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[Math.abs(hash) % colors.length];
  };

  const handleAddTag = async (newTag) => {
    if (!newTag || !newTag.trim()) return;

    const trimmedTag = newTag.trim();

    // Check if tag already exists
    if (tags.includes(trimmedTag)) {
      setError('Tag already added');
      return;
    }

    try {
      setLoading(true);
      await axios.post(`/api/workspace/${projectName}/tags/file`, {
        path: filePath,
        tags: [trimmedTag]
      });

      setTags([...tags, trimmedTag]);
      setInputValue('');
      setError(null);
    } catch (err) {
      setError(`Failed to add tag: ${err.response?.data?.message || err.message}`);
      console.error('Add tag error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTag = async (tagToRemove) => {
    try {
      setLoading(true);
      await axios.delete(`/api/workspace/${projectName}/tags/file`, {
        data: {
          path: filePath,
          tags: [tagToRemove]
        }
      });

      setTags(tags.filter(tag => tag !== tagToRemove));
      setError(null);
    } catch (err) {
      setError(`Failed to remove tag: ${err.response?.data?.message || err.message}`);
      console.error('Remove tag error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setInputValue('');
    setError(null);
    onClose();
  };

  // Get all existing tag names
  const existingTagNames = allTags.map(t => t.tag);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Manage Tags
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {fileName}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Current Tags */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Current Tags ({tags.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No tags assigned
              </Typography>
            ) : (
              tags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => handleRemoveTag(tag)}
                  disabled={loading}
                  sx={{
                    backgroundColor: getTagColor(tag),
                    color: 'white',
                    '& .MuiChip-deleteIcon': {
                      color: 'rgba(255, 255, 255, 0.7)',
                      '&:hover': {
                        color: 'white'
                      }
                    }
                  }}
                />
              ))
            )}
          </Box>
        </Box>

        {/* Add New Tag */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Add Tags
          </Typography>
          <Autocomplete
            freeSolo
            options={existingTagNames.filter(tag => !tags.includes(tag))}
            value={null}
            inputValue={inputValue}
            onInputChange={(event, newInputValue) => {
              setInputValue(newInputValue);
            }}
            onChange={(event, newValue) => {
              if (newValue) {
                handleAddTag(newValue);
              }
            }}
            disabled={loading}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Type to create new tag or select existing"
                variant="outlined"
                size="small"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValue.trim()) {
                    e.preventDefault();
                    handleAddTag(inputValue);
                  }
                }}
              />
            )}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Press Enter or select from dropdown to add tag
          </Typography>
        </Box>

        {/* All Available Tags */}
        {allTags.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Available Tags
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {allTags
                .filter(tagInfo => !tags.includes(tagInfo.tag))
                .map(tagInfo => (
                  <Chip
                    key={tagInfo.tag}
                    label={`${tagInfo.tag} (${tagInfo.count})`}
                    onClick={() => handleAddTag(tagInfo.tag)}
                    disabled={loading}
                    size="small"
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: getTagColor(tagInfo.tag),
                      color: 'white',
                      '&:hover': {
                        opacity: 0.8
                      }
                    }}
                  />
                ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
