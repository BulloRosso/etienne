import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function CreateFromTextDialog({ open, onClose, projectName, graphName = 'default', onCreated }) {
  const { mode: themeMode } = useThemeMode();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!text.trim()) {
      setError('Please enter some text to create a scrapbook from.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/create-from-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create scrapbook from text');
      }

      setText('');
      onCreated?.();
      onClose();
    } catch (err) {
      console.error('Failed to create scrapbook:', err);
      setError(err.message || 'Failed to create scrapbook from text');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setText('');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Create Scrapbook from Text
        <IconButton onClick={handleClose} size="small" disabled={loading}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Paste or type text below. The content will be analyzed to extract topics, categories, and items
          which will be organized into a mindmap structure.
        </Typography>

        <Box sx={{ height: 350, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <Editor
            height="350px"
            defaultLanguage="plaintext"
            theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
            value={text}
            onChange={(value) => setText(value || '')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'off',
              wordWrap: 'on',
              fontSize: 14,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: 'none',
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
            }}
          />
        </Box>

        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={loading || !text.trim()}
          startIcon={loading && <CircularProgress size={16} color="inherit" />}
        >
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
