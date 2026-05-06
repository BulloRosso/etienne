import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';

export default function ExportFilenameModal({
  open,
  onClose,
  onConfirm,
  defaultFilename,
  format,
  exporting,
}) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState('');

  // Reset filename when the modal opens or defaultFilename changes
  useEffect(() => {
    if (open) {
      setFilename(defaultFilename || 'document');
    }
  }, [open, defaultFilename]);

  const handleConfirm = () => {
    const trimmed = filename.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && filename.trim() && !exporting) {
      handleConfirm();
    }
  };

  const formatLabel = format === 'pdf' ? 'PDF' : 'Word (DOCX)';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          {t('markdownViewer.exportFilenameTitle', 'Enter Filename')}
        </Typography>
        <IconButton size="small" onClick={onClose} disabled={exporting}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t('markdownViewer.exportFilenameLabel', 'Filename')}
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={exporting}
          sx={{ mt: 1 }}
          slotProps={{
            input: {
              endAdornment: (
                <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  .{format === 'pdf' ? 'pdf' : 'docx'}
                </Typography>
              ),
            },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={exporting}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!filename.trim() || exporting}
          startIcon={exporting ? <CircularProgress size={16} /> : null}
        >
          {exporting
            ? t('markdownViewer.exporting', 'Exporting...')
            : t('markdownViewer.exportButton', 'Export')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
