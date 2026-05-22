import React, { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import { Upload } from '@mui/icons-material';
import { apiAxios } from '../../services/api';

/**
 * Composer toolbar button: pick a .zip built by the composer and apply it
 * to a new project via POST /api/packages/import.
 *
 * The user can override the project folder name (handy when the source
 * zip's name clashes with an existing project on the target machine).
 */
export default function ImportButton({ onImported }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const triggerPick = () => fileInputRef.current?.click();

  const handlePicked = (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    // Default override-name to the zip's stem (before -<hash>.zip).
    const stem = f.name.replace(/\.zip$/i, '').replace(/-[0-9a-f]{6,}$/, '');
    setName(stem);
    // Reset the input value so picking the same file twice still fires onChange.
    ev.target.value = '';
  };

  const handleSubmit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const url = name && name.trim()
        ? `/api/packages/import?name=${encodeURIComponent(name.trim())}`
        : '/api/packages/import';
      const res = await apiAxios.post(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        onImported?.(res.data);
        setFile(null);
        setName('');
      } else {
        const errs = (res.data?.errors || []).join(', ');
        setError(errs || 'Import failed');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="small" startIcon={<Upload />} onClick={triggerPick} sx={{ mr: 1 }}>
        Import…
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: 'none' }}
        onChange={handlePicked}
      />

      <Dialog open={!!file} onClose={() => !busy && setFile(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Import package</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              File: <strong>{file?.name}</strong>
              {file && ` (${Math.round(file.size / 1024)} KB)`}
            </Typography>
            <TextField
              size="small"
              label="Project folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText="Becomes /workspace/<name>/ on this backend. Leave blank to use the package's own name."
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFile(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={14} /> : <Upload />}
            onClick={handleSubmit}
            disabled={busy}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
