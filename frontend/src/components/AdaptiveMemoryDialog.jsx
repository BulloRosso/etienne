import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Paper,
  Button,
  TextField,
  Stack,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Alert,
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import BlockIcon from '@mui/icons-material/Block';
import ReplayIcon from '@mui/icons-material/Replay';
import CloseIcon from '@mui/icons-material/Close';
import { apiFetch } from '../services/api';
import useMultiplexSSE from '../hooks/useMultiplexSSE';

/**
 * AdaptiveMemoryDialog — modal dialog for the Adaptive Memory module.
 *
 * Tabs:
 *   • Task        chat-style runTask UI; subscribes to the 'adaptive-memory' mux channel
 *   • Review      ReviewItem list with verdict buttons
 *   • Skill diff  current dreaming SKILL.md (Ponderer's self-edit target)
 *   • Settings    activation toggle + cron + classification policy
 *
 * All four tabs share one mux subscription so we don't open multiple SSE
 * streams. Live updates flow over the existing multiplexed SSE — no WebSocket.
 *
 * Mirrors the modal pattern of DreamingSettings: `open` + `onClose` props,
 * owned by SettingsModal.jsx.
 */
export default function AdaptiveMemoryDialog({ open, onClose, currentProject }) {
  const [tab, setTab] = useState(0);

  // Reset to the first tab whenever the dialog re-opens.
  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '85vh' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Adaptive Memory
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Triple-P agent memory: Picker / Packer / Ponderer. The within-task
              loop assembles context; the nightly Ponderer reflects on sessions.
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1 }}>
          <Tab label="Task" />
          <Tab label="Review queue" />
          <Tab label="Skill diff" />
          <Tab label="Settings" />
        </Tabs>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 3 }}>
        {!currentProject ? (
          <Alert severity="info">Select a project to use Adaptive Memory.</Alert>
        ) : (
          <>
            {tab === 0 && <TaskPanel project={currentProject} />}
            {tab === 1 && <ReviewPanel project={currentProject} />}
            {tab === 2 && <SkillDiffPanel project={currentProject} />}
            {tab === 3 && <SettingsPanel project={currentProject} />}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// =========================================================================
// Tab 1 — Task
// =========================================================================

function TaskPanel({ project }) {
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const mux = useMultiplexSSE(project);

  useEffect(() => {
    if (!mux) return undefined;
    const handler = (payload, type) => {
      setEvents((prev) => [...prev, { type, payload, at: new Date().toISOString() }]);
    };
    mux.on('adaptive-memory', '*', handler);
    return () => mux.off('adaptive-memory', '*', handler);
  }, [mux]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setEvents([]);
    try {
      const resp = await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (resp.status === 409 && body.error === 'adaptive_memory_inactive') {
          setError(
            'Adaptive Memory is not active for this project. Open the Settings tab and save once to activate.',
          );
        } else {
          setError(body.error || body.message || `HTTP ${resp.status}`);
        }
        return;
      }
      setResult(await resp.json());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  }, [prompt, project, running]);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Prompt</Typography>
        <TextField
          multiline
          minRows={3}
          fullWidth
          placeholder="What should the agent do?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            variant="contained"
            onClick={handleRun}
            disabled={!prompt.trim() || running}
            startIcon={running ? <CircularProgress size={16} /> : null}
          >
            {running ? 'Running…' : 'Run task'}
          </Button>
          {events.length > 0 && (
            <Button variant="text" onClick={() => setEvents([])}>
              Clear events
            </Button>
          )}
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {events.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Live events</Typography>
          <Stack spacing={0.5}>
            {events.map((e, i) => (
              <EventLine key={i} event={e} />
            ))}
          </Stack>
        </Paper>
      )}

      {result && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Result</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
            <Chip label={`session ${result.sessionId}`} size="small" />
            <Chip label={`${result.toolCalls} tool calls`} size="small" />
            <Chip label={`${result.steps} steps`} size="small" />
            <Chip label={`${result.durationMs} ms`} size="small" />
            {result.meta?.droppedForClassification > 0 && (
              <Chip
                label={`${result.meta.droppedForClassification} dropped (classification)`}
                color="warning"
                size="small"
              />
            )}
          </Stack>
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: 13,
              m: 0,
              p: 1,
              background: 'background.default',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {result.text}
          </Box>
        </Paper>
      )}
    </Stack>
  );
}

function EventLine({ event }) {
  const time = event.at.slice(11, 19);
  const summary = summariseEventPayload(event.type, event.payload);
  return (
    <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
      <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>{time}</Box>
      <Box component="span" sx={{ color: 'primary.main', mr: 1 }}>{event.type}</Box>
      <Box component="span">{summary}</Box>
    </Box>
  );
}

function summariseEventPayload(type, p) {
  if (!p?.payload) return '';
  const body = p.payload;
  switch (type) {
    case 'task-started':
      return body.prompt?.slice(0, 80) ?? '';
    case 'frame':
      return `intent=${(body.intent ?? '').slice(0, 40)} skills=[${(body.activeSkillIds ?? []).join(',')}]`;
    case 'pick':
      return `wiki=${body.wikiPages} kg=${body.kgEntities}/${body.kgEdges} rag=${body.ragFragments} prefs=${body.preferences} sor=${body.sorRecords}`;
    case 'pack':
      return `tokens=${body.totalTokens} dropped=${body.droppedForClassification}`;
    case 'tool-use':
      return `${body.tool}${body.ok ? ` ok ${body.entryId ?? ''}` : ` ✕ ${body.error ?? ''}`}`;
    case 'task-completed':
      return `steps=${body.steps} tools=${body.toolCalls} ${body.durationMs}ms`;
    case 'task-failed':
      return body.error ?? '';
    case 'cycle-started':
    case 'cycle-completed':
      return '';
    case 'stage-completed':
      return `${body.stage}: ${JSON.stringify(omit(body, ['stage']))}`;
    default:
      return JSON.stringify(body).slice(0, 80);
  }
}

function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

// =========================================================================
// Tab 2 — Review queue
// =========================================================================

function ReviewPanel({ project }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/review`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.error || body.message || `HTTP ${resp.status}`);
        setItems([]);
        return;
      }
      setItems(await resp.json());
    } catch (err) {
      setError(err.message || String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => { refresh(); }, [refresh]);

  const setVerdict = useCallback(async (itemId, verdict) => {
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === itemId ? { ...i, status: verdict } : i)) : prev,
    );
    try {
      await apiFetch(
        `/api/adaptive-memory/${encodeURIComponent(project)}/review/${encodeURIComponent(itemId)}/verdict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verdict }),
        },
      );
    } catch {
      refresh();
    }
  }, [project, refresh]);

  const triggerCycle = useCallback(async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/run-now`, {
        method: 'POST',
      });
    } finally {
      refresh();
    }
  }, [project, refresh]);

  if (loading && items === null) {
    return <CircularProgress size={20} />;
  }

  const pending = (items ?? []).filter((i) => i.status === 'pending');

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">
          {(items ?? []).length} item{(items ?? []).length === 1 ? '' : 's'}
          {' · '}
          {pending.length} pending
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="small" onClick={triggerCycle} startIcon={<ReplayIcon />}>
          Run cycle now
        </Button>
        <Button variant="text" size="small" onClick={refresh}>
          Refresh
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {(items ?? []).length === 0 ? (
        <Alert severity="info">
          No review items yet. Trigger a Ponderer cycle ("Run cycle now") to populate the queue.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {items.map((item) => (
            <ReviewItemCard key={item.id} item={item} onVerdict={setVerdict} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ReviewItemCard({ item, onVerdict }) {
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 0.5, flexWrap: 'wrap' }}>
            <Chip label={item.kind} size="small" color="primary" variant="outlined" />
            <Chip
              label={item.status}
              size="small"
              color={statusColor(item.status)}
            />
            {item.cycleId && (
              <Chip label={item.cycleId} size="small" variant="outlined" />
            )}
            {item.provenance?.inferenceTag && (
              <Chip
                label={item.provenance.inferenceTag}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
          <Typography variant="body2">{item.summary}</Typography>
          <Collapse in={open} unmountOnExit>
            <Box
              component="pre"
              sx={{
                mt: 1,
                fontFamily: 'monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                m: 0,
                p: 1,
                background: 'background.default',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(item.details, null, 2)}
            </Box>
          </Collapse>
        </Box>
        <IconButton size="small" onClick={() => setOpen((o) => !o)}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Tooltip title="The reasoning was sound and the proposal is useful.">
          <Button
            size="small"
            variant={item.status === 'good' ? 'contained' : 'outlined'}
            color="success"
            startIcon={<ThumbUpIcon />}
            onClick={() => onVerdict(item.id, 'good')}
          >
            Good
          </Button>
        </Tooltip>
        <Tooltip title="The reasoning was wrong; the Ponderer should rewrite this tag.">
          <Button
            size="small"
            variant={item.status === 'badly_reasoned' ? 'contained' : 'outlined'}
            color="warning"
            startIcon={<ThumbDownIcon />}
            onClick={() => onVerdict(item.id, 'badly_reasoned')}
          >
            Badly reasoned
          </Button>
        </Tooltip>
        <Tooltip title="The principle is unactionable. The Ponderer should retire this tag.">
          <Button
            size="small"
            variant={item.status === 'unusable' ? 'contained' : 'outlined'}
            color="error"
            startIcon={<BlockIcon />}
            onClick={() => onVerdict(item.id, 'unusable')}
          >
            Unusable
          </Button>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

function statusColor(status) {
  switch (status) {
    case 'good': return 'success';
    case 'badly_reasoned': return 'warning';
    case 'unusable': return 'error';
    case 'pending': return 'default';
    default: return 'default';
  }
}

// =========================================================================
// Tab 3 — Skill diff
// =========================================================================

function SkillDiffPanel({ project }) {
  const [body, setBody] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiFetch(
          `/api/skills/${encodeURIComponent(project)}/dreaming`,
        );
        if (!resp.ok) {
          setError(`Could not load dreaming SKILL.md (${resp.status}).`);
          return;
        }
        const data = await resp.json();
        if (!cancelled) setBody(data?.content ?? data?.body ?? JSON.stringify(data, null, 2));
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [project]);

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">Dreaming skill — current SKILL.md</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        The Ponderer's self-edit stage rewrites this skill body based on the
        verdicts you set in the Review tab. The originalHash → currentHash
        diff is tracked at <code>workspace/.agent/adaptive-memory/skills.state.json</code>.
      </Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {body !== null ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: 13,
              m: 0,
              maxHeight: 540,
              overflow: 'auto',
            }}
          >
            {body}
          </Box>
        </Paper>
      ) : (
        !error && <CircularProgress size={20} />
      )}
    </Stack>
  );
}

// =========================================================================
// Tab 4 — Settings
// =========================================================================

function SettingsPanel({ project }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [draft, setDraft] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const resp = await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/settings`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.error || body.message || `HTTP ${resp.status}`);
        return;
      }
      const r = await resp.json();
      setData(r);
      setDraft({
        schedule: r.config?.ponderer?.schedule ?? '0 22 * * *',
        timeZone: r.config?.ponderer?.timeZone ?? 'UTC',
        qualityThresholdForInduction: r.config?.ponderer?.qualityThresholdForInduction ?? 0.7,
        maxReviewItemsPerCycle: r.config?.ponderer?.maxReviewItemsPerCycle ?? 25,
        defaultForAgentWrites: r.config?.classificationPolicy?.defaultForAgentWrites ?? 'private',
        tokenBudget: r.config?.tokenBudget ?? 100000,
      });
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [project]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        ponderer: {
          schedule: draft.schedule,
          timeZone: draft.timeZone,
          qualityThresholdForInduction: Number(draft.qualityThresholdForInduction),
          maxReviewItemsPerCycle: Number(draft.maxReviewItemsPerCycle),
        },
        classificationPolicy: {
          defaultForAgentWrites: draft.defaultForAgentWrites,
        },
        tokenBudget: Number(draft.tokenBudget),
      };
      const resp = await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const r = await resp.json().catch(() => ({}));
        setError(r.error || r.message || `HTTP ${resp.status}`);
        return;
      }
      setSuccess('Settings saved. Adaptive Memory is now active for this project.');
      refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, project, refresh]);

  const deactivate = useCallback(async () => {
    if (!confirm('Deactivate Adaptive Memory for this project? The config file will be deleted and the cron unregistered.')) return;
    setSaving(true);
    try {
      await apiFetch(`/api/adaptive-memory/${encodeURIComponent(project)}/settings`, {
        method: 'DELETE',
      });
      setSuccess('Deactivated.');
      refresh();
    } finally {
      setSaving(false);
    }
  }, [project, refresh]);

  if (!data || !draft) return <CircularProgress size={20} />;

  return (
    <Stack spacing={2}>
      <Alert severity={data.active ? 'success' : 'info'}>
        {data.active
          ? 'Adaptive Memory is active. Saving will update the config; deleting deactivates and unregisters the cron.'
          : 'Adaptive Memory is not active for this project. Save settings to activate (creates the config file under .etienne/).'}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>Ponderer schedule</Typography>
        <Stack spacing={2}>
          <TextField
            label="Cron schedule"
            value={draft.schedule}
            onChange={(e) => setDraft({ ...draft, schedule: e.target.value })}
            helperText="Default: 0 22 * * * (10pm)"
            size="small"
          />
          <TextField
            label="Time zone"
            value={draft.timeZone}
            onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}
            size="small"
          />
          <TextField
            label="Quality threshold for induction (0–1)"
            type="number"
            inputProps={{ min: 0, max: 1, step: 0.05 }}
            value={draft.qualityThresholdForInduction}
            onChange={(e) =>
              setDraft({ ...draft, qualityThresholdForInduction: e.target.value })
            }
            size="small"
          />
          <TextField
            label="Max review items per cycle"
            type="number"
            inputProps={{ min: 1 }}
            value={draft.maxReviewItemsPerCycle}
            onChange={(e) =>
              setDraft({ ...draft, maxReviewItemsPerCycle: e.target.value })
            }
            size="small"
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          Classification policy
        </Typography>
        <Stack spacing={2}>
          <TextField
            select
            label="Default classification for agent writes"
            value={draft.defaultForAgentWrites}
            onChange={(e) =>
              setDraft({ ...draft, defaultForAgentWrites: e.target.value })
            }
            SelectProps={{ native: true }}
            size="small"
          >
            <option value="public">public</option>
            <option value="private">private</option>
            <option value="secret">secret</option>
          </TextField>
          <TextField
            label="Token budget for Packer"
            type="number"
            inputProps={{ min: 1000 }}
            value={draft.tokenBudget}
            onChange={(e) => setDraft({ ...draft, tokenBudget: e.target.value })}
            size="small"
          />
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : data.active ? 'Save' : 'Activate'}
        </Button>
        {data.active && (
          <Button variant="outlined" color="error" onClick={deactivate} disabled={saving}>
            Deactivate
          </Button>
        )}
      </Stack>

      <Divider />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Config file location:{' '}
        <code>workspace/{project}/.etienne/adaptive-memory.config.json</code>.
        The file's existence is the activation switch.
      </Typography>
    </Stack>
  );
}
