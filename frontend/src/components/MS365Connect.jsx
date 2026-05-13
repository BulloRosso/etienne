import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  CloudQueue,
  Refresh,
  Add,
  Delete,
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Close,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { apiAxios, API_BASE } from '../services/api';
import { callMcp as callMcpShared } from '../services/mcpClient';

// Thin wrapper binding this file's calls to the 'ms365' MCP group.
const callMcp = (project, toolName, args = {}) => callMcpShared(project, 'ms365', toolName, args);

export default function MS365Connect({ projectName, open, onClose }) {
  const asDialog = typeof open === 'boolean';

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [drives, setDrives] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [roots, setRoots] = useState([]);
  const [autoSync, setAutoSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newRoot, setNewRoot] = useState({ drive_id: '', remote_path: '', label: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [sharepointOpen, setSharepointOpen] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', danger: false, onConfirm: null });

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  const askConfirm = (opts) => new Promise((resolve) => {
    setConfirmState({
      open: true,
      title: opts.title || 'Confirm',
      message: opts.message,
      confirmLabel: opts.confirmLabel || 'Confirm',
      danger: !!opts.danger,
      onConfirm: (ok) => {
        setConfirmState(s => ({ ...s, open: false }));
        resolve(ok);
      },
    });
  });

  const loadStatus = useCallback(async () => {
    if (!projectName) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiAxios.get(`/api/ms365/${encodeURIComponent(projectName)}/status`);
      setStatus(resp.data);
      if (resp.data.connected) {
        await refreshSyncState();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const refreshSyncState = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        callMcp(projectName, 'list_sync_roots'),
        callMcp(projectName, 'get_auto_sync'),
        callMcp(projectName, 'list_drives'),
      ]);
      setRoots(r1.roots || []);
      if (typeof r2?.enabled === 'boolean') setAutoSync(r2.enabled);
      const driveList = r3.drives || [];
      setDrives(driveList);
      setNewRoot(prev => prev.drive_id ? prev : { ...prev, drive_id: driveList[0]?.id || '' });
    } catch (e) {
      // swallow — not connected yet
    }
  }, [projectName]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.data && ev.data.type === 'ms365-oauth') {
        setConnecting(false);
        if (ev.data.success) {
          loadStatus();
        } else {
          setError(`OAuth failed: ${ev.data.detail}`);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadStatus]);

  const handleConnect = () => {
    setConnecting(true);
    setError(null);
    const url = `${API_BASE}/api/ms365/${encodeURIComponent(projectName)}/connect`;
    const popup = window.open(url, 'ms365-oauth', 'width=520,height=720');
    if (!popup) {
      setError('Popup blocked. Allow popups for this site.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await askConfirm({
      title: 'Disconnect Microsoft 365?',
      message: 'Tokens for this project will be deleted. Sync roots stay configured but auto-sync will fail until you reconnect.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiAxios.post(`/api/ms365/${encodeURIComponent(projectName)}/disconnect`);
      await loadStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleListSites = async () => {
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'list_sites', siteSearch ? { query: siteSearch } : {});
      setSites(r.sites || []);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleAddRoot = async () => {
    if (!newRoot.label) { setError('Label required'); return; }
    setBusy(true); setError(null);
    try {
      await callMcp(projectName, 'add_sync_root', {
        drive_id: newRoot.drive_id || undefined,
        remote_path: newRoot.remote_path,
        label: newRoot.label,
      });
      setNewRoot({ drive_id: '', remote_path: '', label: '' });
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleRemoveRoot = async (label) => {
    const ok = await askConfirm({
      title: `Remove sync root "${label}"?`,
      message: 'This deletes the local mirror folder and clears mapping entries for this root. Files in OneDrive are not touched.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'remove_sync_root', { label });
      showToast(`Removed "${label}" (${r.purgedEntries || 0} entries purged)`, 'success');
      await refreshSyncState();
    } catch (e) {
      setError(`Remove failed: ${e.message}`);
      showToast(`Remove failed: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStubTree = async (label) => {
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'stub_tree', label ? { root_label: label } : {});
      const parts = [];
      if (r.files) parts.push(`${r.files} file${r.files === 1 ? '' : 's'}`);
      if (r.folders) parts.push(`${r.folders} folder${r.folders === 1 ? '' : 's'}`);
      if (r.stubs) parts.push(`${r.stubs} stub${r.stubs === 1 ? '' : 's'} (download failed)`);
      if (r.skipped) parts.push(`${r.skipped} skipped (too large)`);
      showToast(`Synced: ${parts.join(', ') || 'nothing'}`, r.stubs ? 'warning' : 'success');
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleRunDelta = async () => {
    setBusy(true);
    try {
      const r = await callMcp(projectName, 'run_delta');
      const parts = [];
      if (r.added) parts.push(`${r.added} added`);
      if (r.renamed) parts.push(`${r.renamed} renamed`);
      if (r.removed) parts.push(`${r.removed} removed`);
      const summary = parts.length ? parts.join(', ') : 'no remote changes';
      showToast(`Delta: ${summary}`, parts.length ? 'success' : 'info');
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handlePush = async () => {
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'push_now');
      const parts = [];
      if (r.uploaded) parts.push(`${r.uploaded} uploaded`);
      if (r.deleted) parts.push(`${r.deleted} deleted`);
      if (r.failed) parts.push(`${r.failed} failed`);
      if (r.skipped) parts.push(`${r.skipped} skipped`);
      const summary = parts.length ? parts.join(', ') : 'nothing to push';
      showToast(`Push: ${summary}`, r.failed ? 'warning' : (parts.length ? 'success' : 'info'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleSetAutoSync = async (enabled) => {
    setAutoSync(enabled); // optimistic
    try {
      await callMcp(projectName, 'set_auto_sync', { enabled });
    } catch (e) {
      setAutoSync(!enabled);
      setError(e.message);
    }
  };

  const body = loading ? (
    <Box sx={{ p: 3 }}><CircularProgress /></Box>
  ) : (
    <Box sx={{ p: asDialog ? 0 : 2, maxWidth: 900 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {!status?.connected && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Not connected. Connect to mirror OneDrive/SharePoint into the project workspace.
          </Typography>
          <Button variant="contained" onClick={handleConnect} disabled={connecting} startIcon={connecting ? <CircularProgress size={16} /> : <CloudQueue />}>
            {connecting ? 'Waiting…' : 'Connect Microsoft 365'}
          </Button>
        </Box>
      )}

      {status?.connected && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Sync roots</Typography>
              <List dense>
                {roots.length === 0 && <Typography variant="body2" color="text.secondary">No roots configured yet.</Typography>}
                {roots.map((r) => (
                  <ListItem key={r.label}>
                    <ListItemText
                      primary={<><strong>{r.label}</strong>{r.driveId ? ` · drive ${r.driveId.substring(0, 8)}…` : ' · /me/drive'}</>}
                      secondary={`remote: ${r.remotePath || '/'} → local: ${r.localRoot}`}
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Sync this tree (download all files and create folders locally)">
                        <IconButton onClick={() => handleStubTree(r.label)} disabled={busy}><FolderOpen /></IconButton>
                      </Tooltip>
                      <IconButton onClick={() => handleRemoveRoot(r.label)} disabled={busy}><Delete /></IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2">Add a sync root</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                <TextField size="small" label="Label" value={newRoot.label} onChange={(e) => setNewRoot({ ...newRoot, label: e.target.value })} sx={{ width: 200 }} />
                <FormControl size="small" sx={{ flex: 1, minWidth: 220 }}>
                  <InputLabel id="ms365-drive-label">Drive</InputLabel>
                  <Select
                    labelId="ms365-drive-label"
                    label="Drive"
                    value={newRoot.drive_id}
                    onChange={(e) => setNewRoot({ ...newRoot, drive_id: e.target.value })}
                    displayEmpty
                  >
                    <MenuItem value=""><em>/me/drive (default)</em></MenuItem>
                    {drives.map(d => (
                      <MenuItem key={d.id} value={d.id}>{d.name || '(no name)'}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField size="small" label="Remote path (e.g. Documents)" value={newRoot.remote_path} onChange={(e) => setNewRoot({ ...newRoot, remote_path: e.target.value })} sx={{ flex: 1 }} />
                <Button variant="contained" startIcon={<Add />} onClick={handleAddRoot} disabled={busy || !newRoot.label}>Add</Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ pb: '16px !important' }}>
              <Stack direction="row" alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setSharepointOpen(o => !o)}>
                <Typography variant="subtitle1" sx={{ flex: 1 }}>Browse SharePoint sites (org mode)</Typography>
                <IconButton size="small">{sharepointOpen ? <ExpandLess /> : <ExpandMore />}</IconButton>
              </Stack>
              <Collapse in={sharepointOpen}>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField size="small" label="Search (optional)" value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} sx={{ flex: 1 }} />
                  <Button onClick={handleListSites} disabled={busy}>Search</Button>
                </Stack>
                <List dense>
                  {sites.map(s => (
                    <ListItem key={s.id}>
                      <ListItemText primary={s.displayName} secondary={s.webUrl} />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </CardContent>
          </Card>
        </>
      )}
      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(s => ({ ...s, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={confirmState.open}
        onClose={() => confirmState.onConfirm && confirmState.onConfirm(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{confirmState.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmState.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => confirmState.onConfirm && confirmState.onConfirm(false)}>Cancel</Button>
          <Button
            onClick={() => confirmState.onConfirm && confirmState.onConfirm(true)}
            variant="contained"
            color={confirmState.danger ? 'error' : 'primary'}
            autoFocus
          >
            {confirmState.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  if (!asDialog) return body;

  const expiryText = status?.expiresAt ? `Token expires ${new Date(status.expiresAt).toLocaleString()}` : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>Microsoft 365 / OneDrive</Box>
        {status?.connected && (
          <>
            <Tooltip title="Pull (run delta now)">
              <span>
                <IconButton onClick={handleRunDelta} disabled={busy} size="small"><CloudDownload /></IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Push (upload local adds, delete local removes on OneDrive)">
              <span>
                <IconButton onClick={handlePush} disabled={busy} size="small"><CloudUpload /></IconButton>
              </span>
            </Tooltip>
            <FormControlLabel
              control={<Checkbox size="small" checked={autoSync} onChange={(e) => handleSetAutoSync(e.target.checked)} />}
              label="auto-sync"
              sx={{ ml: 0.5, mr: 0 }}
            />
          </>
        )}
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {body}
      </DialogContent>
      {status?.connected && (
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
          <Tooltip title={expiryText} arrow placement="top-start">
            <Typography variant="body2" color="text.secondary">
              Connected as <strong>{status.accountEmail || 'unknown'}</strong>
            </Typography>
          </Tooltip>
          <Stack direction="row" spacing={1}>
            <Button onClick={loadStatus} startIcon={<Refresh />} disabled={busy} size="small">Refresh</Button>
            <Button onClick={handleDisconnect} color="error" disabled={busy} size="small">Disconnect</Button>
          </Stack>
        </DialogActions>
      )}
    </Dialog>
  );
}
