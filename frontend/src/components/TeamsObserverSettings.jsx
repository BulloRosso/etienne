import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CloudQueue, Sync, Groups } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiAxios, API_BASE } from '../services/api';

/**
 * Connectivity → MS Teams: configure the Teams channel observer.
 * Backed by /api/msteams-observer/:project/* (channel pickers via Microsoft
 * Graph delegated auth, per-project observed-channel config, sync control).
 * The MS365 connection itself reuses the existing per-project OAuth flow.
 */
export default function TeamsObserverSettings({ projectName }) {
  const { t } = useTranslation(['teamsObserver']);

  const [ms365, setMs365] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [teams, setTeams] = useState([]);
  const [teamChannels, setTeamChannels] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });
  const base = `/api/msteams-observer/${encodeURIComponent(projectName)}`;

  const load = useCallback(async () => {
    if (!projectName) return;
    setLoading(true);
    setError(null);
    try {
      const [statusResp, configResp, syncResp] = await Promise.allSettled([
        apiAxios.get(`/api/ms365/${encodeURIComponent(projectName)}/status`),
        apiAxios.get(`${base}/channels`),
        apiAxios.get(`${base}/status`),
      ]);
      if (statusResp.status === 'fulfilled') setMs365(statusResp.value.data);
      if (configResp.status === 'fulfilled') setConfig(configResp.value.data);
      if (syncResp.status === 'fulfilled') setSyncStatus(syncResp.value.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectName, base]);

  useEffect(() => { load(); }, [load]);

  // OAuth popup completion (same postMessage contract as MS365Connect)
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.data && ev.data.type === 'ms365-oauth') {
        setConnecting(false);
        if (ev.data.success) load();
        else setError(`OAuth failed: ${ev.data.detail}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [load]);

  const handleConnect = () => {
    setConnecting(true);
    setError(null);
    const url = `${API_BASE}/api/ms365/${encodeURIComponent(projectName)}/connect`;
    const popup = window.open(url, 'ms365-oauth', 'width=520,height=720');
    if (!popup) {
      setError(t('teamsObserver:popupBlocked'));
      setConnecting(false);
    }
  };

  const loadTeams = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await apiAxios.get(`${base}/teams`);
      setTeams(resp.data || []);
      if ((resp.data || []).length === 0) showToast(t('teamsObserver:noTeams'), 'info');
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTeamSelect = async (teamId) => {
    setSelectedTeam(teamId);
    setSelectedChannel('');
    setTeamChannels([]);
    if (!teamId) return;
    setBusy(true);
    try {
      const resp = await apiAxios.get(`${base}/teams/${encodeURIComponent(teamId)}/channels`);
      setTeamChannels(resp.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (next) => {
    setBusy(true);
    setError(null);
    try {
      const resp = await apiAxios.put(`${base}/channels`, {
        enabled: next.enabled,
        syncIntervalSec: next.syncIntervalSec,
        channels: next.channels.map((c) => ({
          teamId: c.teamId,
          channelId: c.channelId,
          teamName: c.teamName,
          channelName: c.channelName,
          slug: c.slug,
        })),
      });
      setConfig(resp.data);
      showToast(t('teamsObserver:saved'));
      const syncResp = await apiAxios.get(`${base}/status`).catch(() => null);
      if (syncResp) setSyncStatus(syncResp.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddChannel = () => {
    if (!selectedTeam || !selectedChannel || !config) return;
    const team = teams.find((x) => x.id === selectedTeam);
    const channel = teamChannels.find((x) => x.id === selectedChannel);
    if (!team || !channel) return;
    if (config.channels.some((c) => c.channelId === channel.id)) {
      showToast(t('teamsObserver:alreadyObserved'), 'info');
      return;
    }
    saveConfig({
      ...config,
      channels: [
        ...config.channels,
        { teamId: team.id, channelId: channel.id, teamName: team.displayName, channelName: channel.displayName },
      ],
    });
  };

  const handleRemoveChannel = (channelId) => {
    saveConfig({ ...config, channels: config.channels.filter((c) => c.channelId !== channelId) });
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await apiAxios.post(`${base}/sync-now`);
      const parts = Object.entries(resp.data?.channels || {}).map(
        ([slug, r]) => `${slug}: +${r.new} new, ${r.updated} updated`,
      );
      showToast(parts.length ? parts.join(' · ') : t('teamsObserver:nothingToSync'), 'success');
      const syncResp = await apiAxios.get(`${base}/status`).catch(() => null);
      if (syncResp) setSyncStatus(syncResp.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('teamsObserver:intro')}
      </Typography>

      {!ms365?.connected ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Groups sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="body1" color="text.secondary" sx={{ my: 2 }}>
            {t('teamsObserver:notConnected')}
          </Typography>
          <Button
            variant="contained"
            onClick={handleConnect}
            disabled={connecting}
            startIcon={connecting ? <CircularProgress size={16} /> : <CloudQueue />}
          >
            {connecting ? t('teamsObserver:waiting') : t('teamsObserver:connect')}
          </Button>
        </Box>
      ) : (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" sx={{ flex: 1 }}>
                  {t('teamsObserver:observedChannels')}
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={!!config?.enabled}
                      onChange={(e) => config && saveConfig({ ...config, enabled: e.target.checked })}
                      disabled={busy || !config || config.channels.length === 0}
                    />
                  }
                  label={t('teamsObserver:enabled')}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t('teamsObserver:intervalSec')}
                  value={config?.syncIntervalSec ?? 120}
                  onChange={(e) => setConfig((c) => ({ ...c, syncIntervalSec: Number(e.target.value) }))}
                  onBlur={() => config && saveConfig(config)}
                  inputProps={{ min: 30, max: 3600 }}
                  sx={{ width: 130 }}
                />
                <Tooltip title={t('teamsObserver:syncNowHint')}>
                  <span>
                    <Button
                      size="small"
                      startIcon={busy ? <CircularProgress size={14} /> : <Sync />}
                      onClick={handleSyncNow}
                      disabled={busy || !config?.enabled || (config?.channels?.length ?? 0) === 0}
                    >
                      {t('teamsObserver:syncNow')}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>

              {(config?.channels?.length ?? 0) === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('teamsObserver:noChannels')}
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {config.channels.map((c) => (
                    <Chip
                      key={c.channelId}
                      icon={<Groups />}
                      label={`${c.teamName} › ${c.channelName}`}
                      onDelete={() => handleRemoveChannel(c.channelId)}
                      disabled={busy}
                    />
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>{t('teamsObserver:addChannel')}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" onClick={loadTeams} disabled={busy}>
                  {t('teamsObserver:loadTeams')}
                </Button>
                <FormControl size="small" sx={{ minWidth: 200 }} disabled={teams.length === 0}>
                  <InputLabel>{t('teamsObserver:team')}</InputLabel>
                  <Select
                    value={selectedTeam}
                    label={t('teamsObserver:team')}
                    onChange={(e) => handleTeamSelect(e.target.value)}
                  >
                    {teams.map((tm) => (
                      <MenuItem key={tm.id} value={tm.id}>{tm.displayName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 200 }} disabled={teamChannels.length === 0}>
                  <InputLabel>{t('teamsObserver:channel')}</InputLabel>
                  <Select
                    value={selectedChannel}
                    label={t('teamsObserver:channel')}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                  >
                    {teamChannels.map((ch) => (
                      <MenuItem key={ch.id} value={ch.id}>{ch.displayName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleAddChannel}
                  disabled={busy || !selectedTeam || !selectedChannel}
                >
                  {t('teamsObserver:add')}
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {t('teamsObserver:scopesHint')}
              </Typography>
            </CardContent>
          </Card>

          {syncStatus?.channels?.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>{t('teamsObserver:syncStatus')}</Typography>
                <List dense>
                  {syncStatus.channels.map((c) => (
                    <ListItem key={c.slug} disableGutters>
                      <ListItemText
                        primary={`${c.teamName} › ${c.channelName}`}
                        secondary={
                          `${c.messageCount} ${t('teamsObserver:messages')} · ` +
                          `${c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : t('teamsObserver:neverSynced')}` +
                          (c.lastError ? ` · ${c.lastError}` : '')
                        }
                        secondaryTypographyProps={c.lastError ? { color: 'error' } : undefined}
                      />
                      <Chip size="small" variant="outlined" label={c.mode} />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="caption" color="text.secondary">
                  {syncStatus.polling ? t('teamsObserver:pollingActive') : t('teamsObserver:pollingInactive')}
                </Typography>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
