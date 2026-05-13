import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Divider,
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
  CloudOff,
  Refresh,
  Add,
  Delete,
  Sync,
  PlayArrow,
  Stop,
  FolderOpen,
} from '@mui/icons-material';
import { apiAxios, API_BASE } from '../services/api';

const MCP_TOKEN = 'test123';

function callMcp(project, toolName, args = {}) {
  return apiAxios.post(
    `/mcp/ms365`,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    },
    {
      headers: {
        'X-Project-Name': project,
        Authorization: `Bearer ${MCP_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    },
  ).then(r => {
    const text = r.data?.result?.content?.[0]?.text;
    if (text) {
      try { return JSON.parse(text); } catch { return text; }
    }
    return r.data;
  });
}

export default function MS365Connect({ projectName }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [drives, setDrives] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [roots, setRoots] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newRoot, setNewRoot] = useState({ drive_id: '', remote_path: '', label: '' });

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
      const [r1, r2] = await Promise.all([
        callMcp(projectName, 'list_sync_roots'),
        callMcp(projectName, 'sync_status'),
      ]);
      setRoots(r1.roots || []);
      setSyncStatus(r2);
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
    if (!confirm('Disconnect Microsoft 365 for this project? Sync roots stay; tokens are deleted.')) return;
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

  const handleListDrives = async () => {
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'list_drives');
      setDrives(r.drives || []);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
    setBusy(true);
    try {
      await callMcp(projectName, 'remove_sync_root', { label });
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleStubTree = async (label) => {
    setBusy(true); setError(null);
    try {
      const r = await callMcp(projectName, 'stub_tree', label ? { root_label: label } : {});
      alert(`Stubbed ${r.stubs} files, ${r.folders} folders`);
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleRunDelta = async () => {
    setBusy(true);
    try {
      const r = await callMcp(projectName, 'run_delta');
      alert(`Delta processed ${r.changed} changes`);
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleToggleWriteback = async () => {
    setBusy(true);
    try {
      const tool = syncStatus?.writebackActive ? 'stop_writeback' : 'start_writeback';
      await callMcp(projectName, tool);
      await refreshSyncState();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (loading) {
    return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2}>
            {status?.connected ? <CloudQueue color="primary" /> : <CloudOff color="disabled" />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">Microsoft 365</Typography>
              {status?.connected ? (
                <Typography variant="body2" color="text.secondary">
                  Connected as <strong>{status.accountEmail || 'unknown'}</strong>
                  {status.expiresAt && (
                    <> · token expires {new Date(status.expiresAt).toLocaleString()}</>
                  )}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not connected. Connect to mirror OneDrive/SharePoint into the project workspace.
                </Typography>
              )}
            </Box>
            {status?.connected ? (
              <>
                <Button onClick={loadStatus} startIcon={<Refresh />} disabled={busy}>Refresh</Button>
                <Button onClick={handleDisconnect} color="error" disabled={busy}>Disconnect</Button>
              </>
            ) : (
              <Button variant="contained" onClick={handleConnect} disabled={connecting} startIcon={connecting ? <CircularProgress size={16} /> : <CloudQueue />}>
                {connecting ? 'Waiting…' : 'Connect Microsoft 365'}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {status?.connected && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Sync status</Typography>
              {syncStatus ? (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip label={`${syncStatus.roots.length} roots`} />
                  <Chip label={`${syncStatus.entries} entries`} />
                  <Chip label={`${syncStatus.hydrated} hydrated`} color="primary" variant="outlined" />
                  <Chip label={`${syncStatus.pendingUploads} pending`} color={syncStatus.pendingUploads > 0 ? 'warning' : 'default'} />
                  <Chip label={`${syncStatus.conflicts} conflicts`} color={syncStatus.conflicts > 0 ? 'error' : 'default'} />
                  <Chip label={syncStatus.deltaPolling ? 'delta polling on' : 'delta polling off'} />
                  <Chip label={syncStatus.writebackActive ? 'write-back on' : 'write-back off'} color={syncStatus.writebackActive ? 'success' : 'default'} />
                </Stack>
              ) : <Typography variant="body2" color="text.secondary">Loading…</Typography>}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button startIcon={<Sync />} onClick={handleRunDelta} disabled={busy}>Run delta now</Button>
                <Button startIcon={syncStatus?.writebackActive ? <Stop /> : <PlayArrow />} onClick={handleToggleWriteback} disabled={busy}>
                  {syncStatus?.writebackActive ? 'Stop write-back' : 'Start write-back'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

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
                      <Tooltip title="Stub this tree (materialize file structure as empty placeholders)">
                        <IconButton onClick={() => handleStubTree(r.label)} disabled={busy}><FolderOpen /></IconButton>
                      </Tooltip>
                      <IconButton onClick={() => handleRemoveRoot(r.label)} disabled={busy}><Delete /></IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2">Add a sync root</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" label="Label" value={newRoot.label} onChange={(e) => setNewRoot({ ...newRoot, label: e.target.value })} sx={{ width: 200 }} />
                <TextField size="small" label="Drive ID (blank = /me/drive)" value={newRoot.drive_id} onChange={(e) => setNewRoot({ ...newRoot, drive_id: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" label="Remote path (e.g. Documents)" value={newRoot.remote_path} onChange={(e) => setNewRoot({ ...newRoot, remote_path: e.target.value })} sx={{ flex: 1 }} />
                <Button startIcon={<Add />} onClick={handleAddRoot} disabled={busy}>Add</Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Browse drives</Typography>
              <Button onClick={handleListDrives} disabled={busy}>List my drives</Button>
              <List dense>
                {drives.map(d => (
                  <ListItem key={d.id}>
                    <ListItemText primary={d.name || '(no name)'} secondary={`ID: ${d.id}`} />
                    <ListItemSecondaryAction>
                      <Button size="small" onClick={() => setNewRoot({ drive_id: d.id, remote_path: '', label: d.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'drive' })}>Use</Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Browse SharePoint sites (org mode)</Typography>
              <Stack direction="row" spacing={1}>
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
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
