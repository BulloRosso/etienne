import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  Autocomplete,
  Typography,
  Box,
  Alert,
  Divider,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Download as DownloadIcon, SaveAlt as SaveAltIcon, Close as CloseIcon } from '@mui/icons-material';
import { AiOutlinePaperClip } from 'react-icons/ai';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const LS_KEY = 'imapAttachmentSavePath';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AttachmentSaveModal({
  open,
  onClose,
  attachment,
  uid,
  folder,
  currentProject,
}) {
  const { t } = useTranslation();
  const [targetPath, setTargetPath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Load last used path and directories on open
  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setError(null);
    const lastPath = localStorage.getItem(LS_KEY) || '';
    setTargetPath(lastPath);

    if (currentProject) {
      apiFetch(`/api/email/project-directories/${encodeURIComponent(currentProject)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setDirectories(data.directories || []);
          }
        })
        .catch(() => {});
    }
  }, [open, currentProject]);

  const handleBrowserDownload = useCallback(async () => {
    if (!attachment) return;
    try {
      const res = await apiFetch(
        `/api/email/messages/${uid}/attachments/${attachment.index}?folder=${encodeURIComponent(folder || 'INBOX')}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError('Download failed');
    }
  }, [attachment, uid, folder, onClose]);

  const handleSaveToProject = useCallback(async () => {
    if (!attachment || !currentProject) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/email/messages/${uid}/attachments/${attachment.index}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: currentProject,
            targetPath,
            folder: folder || 'INBOX',
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        localStorage.setItem(LS_KEY, targetPath);
        setSaved(true);
        setTimeout(() => onClose(), 1500);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [attachment, uid, folder, currentProject, targetPath, onClose]);

  if (!attachment) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('imapInbox.download')}
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Attachment info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 1 }}>
          <AiOutlinePaperClip size={22} />
          <Box>
            {attachment._all ? (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {attachment.attachments.length} {t('imapInbox.attachments').toLowerCase()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatFileSize(attachment.attachments.reduce((sum, a) => sum + (a.size || 0), 0))}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {attachment.filename}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {attachment.contentType} &mdash; {formatFileSize(attachment.size)}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* Option 1: Save to project directory */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', mr: 1 }}>
            {currentProject}/
          </Typography>
          <Autocomplete
            freeSolo
            options={directories}
            value={targetPath}
            onInputChange={(_, value) => setTargetPath(value || '')}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('imapInbox.targetFolder')}
                fullWidth
                size="small"
              />
            )}
          />
          <Button
            variant="contained"
            onClick={handleSaveToProject}
            disabled={saving || saved || !currentProject}
            sx={{ minWidth: 40, px: 1, ml: 0, height: 40, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, alignSelf: 'flex-start', boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : <SaveAltIcon />}
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {t('imapInbox.or')}
          </Typography>
        </Divider>

        {/* Option 2: Browser download */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleBrowserDownload}
          sx={{ textTransform: 'none' }}
        >
          {t('imapInbox.downloadToBrowser')}
        </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {saved && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {t('imapInbox.saved')}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
