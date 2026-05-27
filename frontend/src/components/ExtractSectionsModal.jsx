import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Article as ArticleIcon, ListAlt as ListAltIcon } from '@mui/icons-material';
import { apiAxios } from '../services/api';

/**
 * ExtractSectionsModal — triggered by the PDF/DOCX file-tree context menu.
 *
 * Parses the source document via LiteParse (server-side), splits on
 * headings, and creates `wiki/topics/planned-response/<slug>.md` per
 * section. Used to seed planned-response material from past bids without
 * the user having to transcribe sections manually.
 */
export default function ExtractSectionsModal({
  open,
  onClose,
  projectName,
  documentPath,
}) {
  const { t } = useTranslation();
  const [maxSections, setMaxSections] = useState(40);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleExtract = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiAxios.post(
        `/api/workspace/${encodeURIComponent(projectName)}/documents/extract-sections/${documentPath}`,
        { maxSections: Number(maxSections) || 40 },
      );
      setResult(response.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setResult(null);
    setError(null);
    onClose?.();
  };

  return (
    <Dialog open={!!open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('extractSections:title', { defaultValue: 'Extract sections into wiki' })}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <DialogContentText>
            {t('extractSections:description', {
              defaultValue:
                'Parses the document via LiteParse, splits on headings, and creates one `planned-response/<slug>.md` wiki stub per section. Existing pages are skipped.',
            })}
          </DialogContentText>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Source
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <ArticleIcon fontSize="small" />
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {documentPath}
              </Typography>
            </Box>
          </Box>

          <TextField
            label={t('extractSections:maxSections', { defaultValue: 'Max sections' })}
            type="number"
            size="small"
            value={maxSections}
            onChange={(e) => setMaxSections(e.target.value)}
            inputProps={{ min: 1, max: 200 }}
            disabled={busy}
            helperText={t('extractSections:maxSectionsHelp', {
              defaultValue:
                'Upper bound. Most past bids land between 10 and 40 sections.',
            })}
          />

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}

          {result && (
            <Stack spacing={1}>
              <Alert severity="success">
                {result.message}
              </Alert>
              {Array.isArray(result.created) && result.created.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Created
                  </Typography>
                  <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto', mt: 0.5 }}>
                    {result.created.map((entry) => (
                      <ListItem key={entry.slug} disableGutters>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <ListAltIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={entry.title}
                          secondary={entry.path}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'monospace' } }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              {result.skipped > 0 && (
                <Chip
                  size="small"
                  label={`Skipped ${result.skipped} pre-existing page(s)`}
                  variant="outlined"
                />
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          {result ? t('common:close', { defaultValue: 'Close' }) : t('common:cancel', { defaultValue: 'Cancel' })}
        </Button>
        {!result && (
          <Button
            onClick={handleExtract}
            disabled={busy || !documentPath}
            variant="contained"
            startIcon={busy ? <CircularProgress size={14} /> : null}
          >
            {busy
              ? t('extractSections:extracting', { defaultValue: 'Extracting…' })
              : t('extractSections:extract', { defaultValue: 'Extract' })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
