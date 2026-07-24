import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

/**
 * Import an OKF (Open Knowledge Format) bundle zip into the project
 * workspace via POST /api/workspace/:project/okf/import, optionally
 * indexing the imported concepts into the project's RAG store.
 */
export default function OkfImportDialog({ open, onClose, projectName, onImported }) {
  const { t } = useTranslation('okf');
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [targetPath, setTargetPath] = useState('');
  const [indexRag, setIndexRag] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setTargetPath('');
      setIndexRag(true);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const handlePicked = (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setResult(null);
    setTargetPath(`okf/${f.name.replace(/\.zip$/i, '')}`);
    // Reset the input value so picking the same file twice still fires onChange.
    ev.target.value = '';
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (targetPath.trim()) form.append('targetPath', targetPath.trim());
      form.append('indexRag', indexRag ? '1' : '0');
      const res = await apiAxios.post(`/api/workspace/${projectName}/okf/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        setResult(res.data);
        onImported?.(res.data);
      } else {
        setError((res.data?.errors || []).join(', ') || 'Import failed');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose?.()} maxWidth="sm" fullWidth>
      <DialogTitle>{t('importTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('importDescription')}
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              {t('chooseFile')}
            </Button>
            <Typography variant="body2">
              {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : t('noFileChosen')}
            </Typography>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={handlePicked}
          />
          <TextField
            size="small"
            label={t('targetFolder')}
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            helperText={t('targetFolderHelp')}
            disabled={busy}
          />
          <FormControlLabel
            control={<Checkbox checked={indexRag} onChange={(e) => setIndexRag(e.target.checked)} />}
            label={t('indexRag')}
          />
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Alert severity={result.indexFailures?.length ? 'warning' : 'success'}>
              <Typography variant="body2">
                {t('importSummary', {
                  files: result.filesWritten,
                  target: result.targetPath,
                  indexed: result.indexed,
                })}
              </Typography>
              {result.indexFailures?.length > 0 && (
                <Typography variant="body2">
                  {t('indexFailures', { count: result.indexFailures.length })}
                </Typography>
              )}
              {(result.warnings || []).map((w, i) => (
                <Typography key={i} variant="body2">
                  {w}
                </Typography>
              ))}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose?.()} disabled={busy}>
          {result ? t('close') : t('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={busy || !file || !!result}
          startIcon={busy ? <CircularProgress size={14} /> : null}
        >
          {busy ? t('importing') : t('importButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
