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
import { IoShieldCheckmark } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

export default function TagManager({
  open,
  onClose,
  projectName,
  filePath,
  fileName,
  currentTags,
  allTags,
  releaseEnabled = false,
  releaseComment = '',
  onReleaseCommentSaved,
}) {
  const { t } = useTranslation();
  const [tags, setTags] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTags([...currentTags]);
      setCommentText(releaseComment || '');
      setError(null);
    }
  }, [open, currentTags, releaseComment]);

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
      setError(t('tagManager.tagAlreadyAdded'));
      return;
    }

    try {
      setLoading(true);
      await apiAxios.post(`/api/workspace/${projectName}/tags/file`, {
        path: filePath,
        tags: [trimmedTag]
      });

      setTags([...tags, trimmedTag]);
      setInputValue('');
      setError(null);
    } catch (err) {
      setError(t('tagManager.failedToAddTag', { message: err.response?.data?.message || err.message }));
      console.error('Add tag error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTag = async (tagToRemove) => {
    try {
      setLoading(true);
      await apiAxios.delete(`/api/workspace/${projectName}/tags/file`, {
        data: {
          path: filePath,
          tags: [tagToRemove]
        }
      });

      setTags(tags.filter(tag => tag !== tagToRemove));
      setError(null);
    } catch (err) {
      setError(t('tagManager.failedToRemoveTag', { message: err.response?.data?.message || err.message }));
      console.error('Remove tag error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReleaseComment = async () => {
    if (!commentText.trim()) {
      // If empty, delete the comment
      await handleDeleteReleaseComment();
      return;
    }
    setCommentSaving(true);
    try {
      await apiAxios.post(`/api/compliance/${projectName}/release-comments`, {
        path: filePath,
        comment: commentText.trim(),
      });
      if (onReleaseCommentSaved) onReleaseCommentSaved();
    } catch (err) {
      setError(t('tagManager.failedToSaveReleaseComment', { message: err.response?.data?.message || err.message }));
    } finally {
      setCommentSaving(false);
    }
  };

  const handleDeleteReleaseComment = async () => {
    setCommentSaving(true);
    try {
      await apiAxios.delete(`/api/compliance/${projectName}/release-comments`, {
        data: { path: filePath },
      });
      setCommentText('');
      if (onReleaseCommentSaved) onReleaseCommentSaved();
    } catch (err) {
      setError(t('tagManager.failedToDeleteReleaseComment', { message: err.response?.data?.message || err.message }));
    } finally {
      setCommentSaving(false);
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
        {t('tagManager.dialogTitle')}
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
            {t('tagManager.currentTags', { count: tags.length })}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('tagManager.noTagsAssigned')}
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
            {t('tagManager.addTags')}
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
                placeholder={t('tagManager.inputPlaceholder')}
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
            {t('tagManager.inputHelper')}
          </Typography>
        </Box>

        {/* All Available Tags */}
        {allTags.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('tagManager.availableTags')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {allTags
                .filter(tagInfo => !tags.includes(tagInfo.tag))
                .map(tagInfo => (
                  <Chip
                    key={tagInfo.tag}
                    label={t('tagManager.tagWithCount', { tag: tagInfo.tag, count: tagInfo.count })}
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
        {/* Release Comment Section — only visible after first release */}
        {releaseEnabled && (
          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <IoShieldCheckmark size={18} color="#1976d2" />
              <Typography variant="subtitle2">
                {t('tagManager.releaseCommentTitle')}
              </Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              rows={2}
              size="small"
              placeholder={t('tagManager.releaseCommentPlaceholder')}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              disabled={commentSaving}
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
              {releaseComment && (
                <Button
                  size="small"
                  color="error"
                  onClick={handleDeleteReleaseComment}
                  disabled={commentSaving}
                >
                  {t('common.clear')}
                </Button>
              )}
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveReleaseComment}
                disabled={commentSaving || !commentText.trim()}
              >
                {commentSaving ? t('common.saving') : t('tagManager.saveComment')}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('tagManager.releaseCommentHelper')}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
