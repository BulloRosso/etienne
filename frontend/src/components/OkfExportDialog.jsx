import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
 * Export a project (or a subfolder) as an OKF (Open Knowledge Format) bundle
 * zip. Streams POST /api/workspace/:project/okf/export to a blob download;
 * warnings arrive via the X-OKF-Warnings response header.
 */
export default function OkfExportDialog({ open, onClose, projectName, initialPath = '', folderOptions = [] }) {
  const { t } = useTranslation('okf');
  const [scopePath, setScopePath] = useState(initialPath);
  const [extractText, setExtractText] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    if (open) {
      setScopePath(initialPath);
      setError(null);
      setWarnings([]);
    }
  }, [open, initialPath]);

  const options = ['', ...folderOptions.filter(Boolean)];

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await apiAxios.post(
        `/api/workspace/${projectName}/okf/export`,
        { path: scopePath || undefined, extractText },
        { responseType: 'blob' },
      );
      const blob = new Blob([res.data], { type: 'application/zip' });
      const cd = res.headers?.['content-disposition'] || '';
      const m = /filename="?([^";]+)"?/.exec(cd);
      const filename = m ? m[1] : `${projectName}-okf.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      let exportWarnings = [];
      const headerVal = res.headers?.['x-okf-warnings'];
      if (headerVal) {
        try {
          exportWarnings = JSON.parse(headerVal);
        } catch {
          // ignore parse errors
        }
      }
      if (exportWarnings.length > 0) {
        setWarnings(exportWarnings);
      } else {
        onClose?.();
      }
    } catch (err) {
      // The error body is a blob on responseType:'blob' requests.
      let message = err?.message || 'Export failed';
      try {
        const text = await err?.response?.data?.text?.();
        if (text) message = JSON.parse(text)?.message || message;
      } catch {
        // keep fallback message
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose?.()} maxWidth="sm" fullWidth>
      <DialogTitle>{t('exportTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('exportDescription')}
          </Typography>
          <Autocomplete
            size="small"
            options={options}
            value={scopePath}
            onChange={(_e, value) => setScopePath(value ?? '')}
            getOptionLabel={(p) => (p === '' ? t('wholeProject') : p)}
            renderInput={(params) => <TextField {...params} label={t('exportScope')} />}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={extractText}
                onChange={(e) => setExtractText(e.target.checked)}
              />
            }
            label={t('extractText')}
          />
          {error && <Alert severity="error">{error}</Alert>}
          {warnings.length > 0 && (
            <Alert severity="warning">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('exportWarnings')}
              </Typography>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {warnings.map((w, i) => (
                  <li key={i}>
                    <Typography variant="body2">{w}</Typography>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose?.()} disabled={busy}>
          {warnings.length > 0 ? t('close') : t('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : null}
        >
          {busy ? t('exporting') : t('exportButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
