import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  RadioGroup,
  Radio,
  Button,
  Link as MuiLink,
  Alert,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const EVENT_LOG_CAP = 200;
const STAGE_LABELS = {
  harvest: 'HARVEST',
  segment: 'SEGMENT',
  reflect: 'REFLECT',
  distill: 'DISTILL',
  ground: 'GROUND',
  consolidate: 'CONSOLIDATE',
  promote: 'PROMOTE',
  index: 'INDEX',
};
const TYPE_COLORS = {
  'run-enqueued': 'info',
  'run-skipped': 'warning',
  'stage-start': 'default',
  'stage-complete': 'success',
  'stage-failed': 'error',
  'item-promoted': 'success',
  'item-rejected': 'default',
  'run-finalized': 'primary',
};

const DEFAULT_SETTINGS = {
  enabled: false,
  cronExpression: '0 22 * * *',
  timeZone: 'UTC',
  maxItems: 10,
  maxLlmCalls: undefined,
  maxBudget: undefined,
  skillName: 'dreaming',
};

/**
 * Render the event's detail object as a single compact string for the activity log.
 * Picks fields commonly present (durationMs, error, reason, fileName, jobCounts) and
 * falls back to a JSON dump for everything else.
 */
function formatDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  const parts = [];
  if (typeof detail.durationMs === 'number') parts.push(`${detail.durationMs}ms`);
  if (typeof detail.candidates === 'number') parts.push(`candidates=${detail.candidates}`);
  if (typeof detail.candidatesIn === 'number' && typeof detail.clustersOut === 'number') {
    parts.push(`${detail.candidatesIn}→${detail.clustersOut} clusters`);
  }
  if (typeof detail.promoted === 'boolean') parts.push(detail.promoted ? 'PROMOTED' : 'rejected');
  if (detail.title) parts.push(`"${detail.title}"`);
  if (typeof detail.items === 'number') parts.push(`items=${detail.items}`);
  if (detail.reason) parts.push(`reason=${detail.reason}`);
  if (detail.error) parts.push(`error=${detail.error}`);
  if (detail.fileName) parts.push(`file=${detail.fileName}`);
  if (detail.willRetry === true && typeof detail.retryInSec === 'number') parts.push(`retry in ${detail.retryInSec}s`);
  if (detail.jobCounts && typeof detail.jobCounts === 'object') {
    const counts = Object.entries(detail.jobCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ');
    if (counts) parts.push(counts);
  }
  if (parts.length === 0) {
    try {
      return JSON.stringify(detail);
    } catch {
      return '';
    }
  }
  return parts.join(' ');
}

/**
 * Dreaming settings modal. Renders the dreaming.png hero image, a brief description,
 * a link to the dreaming SKILL.md editor, and the configurable knobs from the PRD.
 */
export default function DreamingSettings({ open, onClose, currentProject, onOpenSkill }) {
  const { t } = useTranslation(['dreaming', 'common']);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [limitMode, setLimitMode] = useState('budget');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const eventSourceRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    if (!open || !currentProject) return;
    apiFetch(`/api/dreaming/${currentProject}/settings`)
      .then((res) => (res.ok ? res.json() : DEFAULT_SETTINGS))
      .then((data) => {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
        if (data?.maxBudget) setLimitMode('budget');
        else if (data?.maxLlmCalls) setLimitMode('calls');
        else setLimitMode('budget');
      })
      .catch(() => setError(t('dreaming:loadError', 'Failed to load dreaming settings')));
  }, [open, currentProject, t]);

  // Subscribe to the per-project dreaming SSE stream while the dialog is open.
  // Any pipeline activity for this project — kicked off by Run-now or by the
  // nightly cron — flows in here as it happens.
  useEffect(() => {
    if (!open || !currentProject) return undefined;
    const url = new URL(`/api/dreaming/${encodeURIComponent(currentProject)}/events`, window.location.origin);
    const token = localStorage.getItem('auth_accessToken') || sessionStorage.getItem('auth_accessToken');
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString());
    eventSourceRef.current = es;

    es.onopen = () => setStreamConnected(true);
    es.onerror = () => setStreamConnected(false);

    const onMessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        setEvents((prev) => {
          const next = [...prev, evt];
          return next.length > EVENT_LOG_CAP ? next.slice(next.length - EVENT_LOG_CAP) : next;
        });
      } catch (err) {
        console.warn('[DreamingSettings] failed to parse event', err);
      }
    };
    // Nest emits typed events with the `type` field passed to MessageEvent.
    es.addEventListener('dreaming-event', onMessage);
    es.addEventListener('message', onMessage);

    return () => {
      es.removeEventListener('dreaming-event', onMessage);
      es.removeEventListener('message', onMessage);
      es.close();
      eventSourceRef.current = null;
      setStreamConnected(false);
    };
  }, [open, currentProject]);

  // Auto-scroll the activity log to the newest entry.
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length]);

  /**
   * Derive the "currently active" stage. We treat a stage as active if its most
   * recent event for the latest run is `stage-start` and no matching `stage-complete`
   * or `stage-failed` has arrived for the same jobId.
   */
  const activeStages = useMemo(() => {
    const inFlight = new Map(); // jobId -> stage
    for (const e of events) {
      if (e.type === 'stage-start' && e.jobId != null) inFlight.set(e.jobId, e.stage);
      else if ((e.type === 'stage-complete' || e.type === 'stage-failed') && e.jobId != null) inFlight.delete(e.jobId);
      else if (e.type === 'run-finalized') inFlight.clear();
    }
    return Array.from(new Set(inFlight.values()));
  }, [events]);

  const latestRunId = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].runId) return events[i].runId;
    }
    return null;
  }, [events]);

  const clearActivityLog = () => setEvents([]);

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    const payload = {
      ...settings,
      maxBudget: limitMode === 'budget' ? Number(settings.maxBudget) || undefined : undefined,
      maxLlmCalls: limitMode === 'calls' ? Number(settings.maxLlmCalls) || undefined : undefined,
    };
    try {
      const res = await apiFetch(`/api/dreaming/${currentProject}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      } else {
        setError(t('dreaming:saveError', 'Failed to save settings'));
      }
    } catch {
      setError(t('dreaming:saveError', 'Failed to save settings'));
    }
  };

  const handleRunNow = async () => {
    if (!currentProject) return;
    setRunning(true);
    try {
      const res = await apiFetch(`/api/dreaming/${currentProject}/run-now`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (!data.enqueued) {
          setError(t(`dreaming:runReason.${data.reason}`, data.reason || 'Skipped'));
        } else {
          setSuccess(true);
          setTimeout(() => setSuccess(false), 2000);
        }
      } else {
        setError(t('dreaming:runError', 'Failed to start dream run'));
      }
    } catch {
      setError(t('dreaming:runError', 'Failed to start dream run'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('dreaming:title', 'Dreaming')}
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box sx={{ flexShrink: 0, width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <img src="/dreaming.png" alt="Dreaming" style={{ width: '180px', height: 'auto' }} />
            <Typography variant="caption" color="text.secondary" align="center">
              {t('dreaming:imageCaption', 'Offline reflection on recent sessions')}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t(
                'dreaming:description',
                'Each night the agent reflects on your recent sessions, distills strategy candidates, ' +
                'web-grounds them, and surfaces the top items for your review. Strategies live as Anthropic-format ' +
                'SKILL.md cards under .claude/skills/strategies/, indexed by their description.',
              )}
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('dreaming:skillLinkLabel', 'Skill used for dreaming:')}
              </Typography>{' '}
              <MuiLink
                component="button"
                type="button"
                onClick={() => { if (onOpenSkill) onOpenSkill(settings.skillName || 'dreaming'); }}
                sx={{ verticalAlign: 'baseline' }}
              >
                {settings.skillName || 'dreaming'}
              </MuiLink>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{t('common:saved', 'Saved')}</Alert>}

            <FormControlLabel
              control={<Switch checked={!!settings.enabled} onChange={(e) => update({ enabled: e.target.checked })} />}
              label={t('dreaming:enabledLabel', 'Enable nightly dreaming')}
              sx={{ mb: 1 }}
            />

            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
            >
              <Tab label={t('dreaming:tabResourceLimits', 'Resource limits')} />
              <Tab label={t('dreaming:tabSchedule', 'Schedule')} />
              <Tab label={t('dreaming:tabRunNow', 'Run Now')} />
            </Tabs>

            {activeTab === 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  {t('dreaming:limitsHeading', 'Per-run limit')}
                </Typography>
                <RadioGroup row value={limitMode} onChange={(e) => setLimitMode(e.target.value)}>
                  <FormControlLabel value="budget" control={<Radio size="small" />} label={t('dreaming:limitByBudget', 'Daily budget')} />
                  <FormControlLabel value="calls" control={<Radio size="small" />} label={t('dreaming:limitByCalls', 'Max LLM calls')} />
                </RadioGroup>
                {limitMode === 'budget' ? (
                  <TextField
                    label={t('dreaming:maxBudgetLabel', 'Maximum daily budget (project currency)')}
                    type="number"
                    size="small"
                    value={settings.maxBudget ?? ''}
                    onChange={(e) => update({ maxBudget: e.target.value === '' ? undefined : Number(e.target.value) })}
                    inputProps={{ step: '0.01', min: 0 }}
                    sx={{ mt: 1, width: 320 }}
                  />
                ) : (
                  <TextField
                    label={t('dreaming:maxLlmCallsLabel', 'Maximum LLM calls per run')}
                    type="number"
                    size="small"
                    value={settings.maxLlmCalls ?? ''}
                    onChange={(e) => update({ maxLlmCalls: e.target.value === '' ? undefined : Number(e.target.value) })}
                    inputProps={{ min: 1 }}
                    sx={{ mt: 1, width: 320 }}
                  />
                )}

                <TextField
                  label={t('dreaming:maxItemsLabel', 'Maximum items per dream')}
                  type="number"
                  size="small"
                  value={settings.maxItems}
                  onChange={(e) => update({ maxItems: Number(e.target.value) || 10 })}
                  inputProps={{ min: 1, max: 50 }}
                  sx={{ mt: 3, width: 240, display: 'block' }}
                />
              </Box>
            )}

            {activeTab === 1 && (
              <Box>
                <TextField
                  label={t('dreaming:cronLabel', 'Cron expression (5 fields)')}
                  fullWidth
                  size="small"
                  value={settings.cronExpression}
                  onChange={(e) => update({ cronExpression: e.target.value })}
                  helperText={t('dreaming:cronHelper', 'Default: 0 22 * * * (every day at 22:00)')}
                  sx={{ mb: 2 }}
                />
                <TextField
                  label={t('dreaming:timeZoneLabel', 'Time zone (IANA)')}
                  fullWidth
                  size="small"
                  value={settings.timeZone || 'UTC'}
                  onChange={(e) => update({ timeZone: e.target.value })}
                />
              </Box>
            )}

            {activeTab === 2 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleRunNow}
                    disabled={running || !currentProject}
                  >
                    {running
                      ? t('dreaming:starting', 'Starting…')
                      : t('dreaming:runNow', 'Run now')}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    {t('dreaming:runNowHelper', 'Triggers a HARVEST run immediately. Subject to the soft budget pre-flight check.')}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2">
                    {t('dreaming:activityHeading', 'Pipeline activity')}
                  </Typography>
                  <Chip
                    size="small"
                    label={streamConnected
                      ? t('dreaming:streamConnected', 'live')
                      : t('dreaming:streamDisconnected', 'offline')}
                    color={streamConnected ? 'success' : 'default'}
                    variant="outlined"
                  />
                  {activeStages.length > 0 && (
                    <>
                      <CircularProgress size={14} thickness={5} sx={{ ml: 0.5 }} />
                      {activeStages.map((stage) => (
                        <Chip
                          key={stage}
                          size="small"
                          label={STAGE_LABELS[stage] || String(stage).toUpperCase()}
                          color="info"
                        />
                      ))}
                    </>
                  )}
                  {latestRunId && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {t('dreaming:latestRun', 'Run')}: {latestRunId}
                    </Typography>
                  )}
                  <Button size="small" onClick={clearActivityLog} disabled={events.length === 0}>
                    {t('common:clear', 'Clear')}
                  </Button>
                </Box>

                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.default',
                    maxHeight: 260,
                    overflowY: 'auto',
                    p: 1,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.78rem',
                  }}
                >
                  {events.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      {t('dreaming:noActivity', 'No activity yet. Click “Run now” or wait for the cron trigger.')}
                    </Typography>
                  ) : (
                    events.map((e, i) => {
                      const ts = new Date(e.timestamp).toLocaleTimeString();
                      const stageLabel = e.stage ? STAGE_LABELS[e.stage] || e.stage.toUpperCase() : '';
                      const detailStr = e.detail ? formatDetail(e.detail) : '';
                      return (
                        <Box key={`${e.timestamp}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.25 }}>
                          <Typography component="span" variant="caption" color="text.disabled" sx={{ flexShrink: 0, minWidth: 64 }}>
                            {ts}
                          </Typography>
                          <Chip
                            size="small"
                            label={e.type}
                            color={TYPE_COLORS[e.type] || 'default'}
                            sx={{ height: 18, fontSize: '0.65rem', flexShrink: 0 }}
                          />
                          {stageLabel && (
                            <Typography component="span" variant="caption" sx={{ flexShrink: 0, fontWeight: 600 }}>
                              {stageLabel}
                            </Typography>
                          )}
                          {e.domain && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                              {e.domain}
                            </Typography>
                          )}
                          {detailStr && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                              {detailStr}
                            </Typography>
                          )}
                        </Box>
                      );
                    })
                  )}
                  <div ref={logEndRef} />
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('common:cancel', 'Cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!currentProject}>
          {t('common:save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
