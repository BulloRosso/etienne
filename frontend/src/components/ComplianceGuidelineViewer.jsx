import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  CircularProgress,
  Alert,
  IconButton,
  Typography,
} from '@mui/material';
import { MdClose } from 'react-icons/md';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function ComplianceGuidelineViewer({ open, onClose }) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && !content) {
      loadGuideline();
    }
  }, [open]);

  const loadGuideline = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/compliance/guideline');
      if (!response.ok) throw new Error('Failed to load guideline');
      const data = await response.json();
      setContent(data.content);
    } catch (err) {
      setError(err.message || 'Failed to load compliance guideline');
    } finally {
      setLoading(false);
    }
  };

  const renderedHtml = content
    ? DOMPurify.sanitize(marked.parse(content))
    : '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '80vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <Typography variant="h6">{t('complianceGuidelineViewer.title')}</Typography>
        <IconButton onClick={onClose} size="small">
          <MdClose />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ overflow: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}
        {!loading && !error && renderedHtml && (
          <Box
            sx={{
              '& h1': { fontSize: '1.5rem', mt: 2, mb: 1 },
              '& h2': { fontSize: '1.25rem', mt: 2, mb: 1 },
              '& h3': { fontSize: '1.1rem', mt: 1.5, mb: 0.5 },
              '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
              '& th, & td': { border: '1px solid #ddd', p: 1, fontSize: '0.875rem' },
              '& th': { backgroundColor: '#f5f5f5', fontWeight: 600 },
              '& code': { backgroundColor: '#f5f5f5', px: 0.5, borderRadius: 1, fontSize: '0.85rem' },
              '& pre': { backgroundColor: '#f5f5f5', p: 1.5, borderRadius: 1, overflow: 'auto' },
              '& blockquote': { borderLeft: '4px solid #1976d2', pl: 2, ml: 0, color: '#555' },
              '& ul, & ol': { pl: 3 },
              '& li': { mb: 0.5 },
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
