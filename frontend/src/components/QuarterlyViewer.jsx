import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  CircularProgress,
  Divider,
  LinearProgress,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  ShowChart as ShowChartIcon,
  Flag as FlagIcon,
  Science as ScienceIcon,
  HelpOutline as HelpOutlineIcon,
  Refresh as RefreshIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  ReportProblem as ReportProblemIcon,
  AssignmentLate as AssignmentLateIcon,
} from '@mui/icons-material';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

/**
 * QuarterlyViewer — dashboard for `*.quarterly.json` files.
 *
 * The data shape (see fixtures/quarterly-packet.ts in the seed script):
 *
 *   {
 *     packetId: "2026-Q2",
 *     title: "Q2 2026 Quarterly Review Packet",
 *     fleet: "5-vessel midsize crude tanker fleet",
 *     date: "2026-05-24",
 *     mission: "Compliant and charter-ready through 2035",
 *     acceptanceCriterion: "<=1 vessel off-strategy at any time",
 *     status: { state: "open" | "escalated" | "acknowledged" | "decisions-opened",
 *               actionedAt?: ISOString, actionedBy?: string, note?: string },
 *     expiredAssumptions: [{ id, label, cohort, vessel, what }],
 *     ageingAssumptions: [{ id, label, cohort, vessel }],
 *     freshAssumptions: [{ id, label, cohort, vessel }],
 *     approachingGates: [{ vessel, kind, opensIso, monthsAway, deferredItems: [string] }],
 *     breachedProjections: [{ vessel, label, status, detail }],
 *     vessels: [{ name, alignment, status, note }],
 *     hypotheses: [{ id, statement, state }],
 *     openQuestions: [{ id, label }],
 *     callout: string,
 *   }
 *
 * The three action buttons mutate `status` on disk via PUT
 * /api/workspace/<project>/files/save/<path>. No backend changes needed.
 */
export default function QuarterlyViewer({ filename, projectName }) {
  const { mode: themeMode } = useThemeMode();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actioning, setActioning] = useState(false);

  const fetchPacket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      setData(JSON.parse(text));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectName, filename, refreshKey]);

  useEffect(() => { fetchPacket(); }, [fetchPacket]);

  const setStatus = useCallback(async (state, note) => {
    if (!data) return;
    setActioning(true);
    try {
      const next = {
        ...data,
        status: {
          state,
          actionedAt: new Date().toISOString(),
          actionedBy: 'user',
          ...(note ? { note } : {}),
        },
      };
      const resp = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${filename}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify(next, null, 2) }),
        }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(next);
    } catch (err) {
      setError(`Failed to update status: ${err.message}`);
    } finally {
      setActioning(false);
    }
  }, [data, projectName, filename]);

  const isDark = themeMode === 'dark';
  const palette = useMemo(() => ({
    red: isDark ? '#ef9a9a' : '#c62828',
    redBg: isDark ? '#311b1b' : '#FFEBEE',
    amber: isDark ? '#ffcc80' : '#ef6c00',
    amberBg: isDark ? '#2a2118' : '#FFF3E0',
    green: isDark ? '#a5d6a7' : '#2e7d32',
    greenBg: isDark ? '#1b2a1b' : '#E8F5E9',
    blue: isDark ? '#90caf9' : '#1565c0',
    blueBg: isDark ? '#152230' : '#E3F2FD',
    surfaceBg: isDark ? '#1e1e1e' : '#fafafa',
    headerBg: isDark ? '#263238' : '#ECEFF1',
  }), [isDark]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <IconButton size="small" onClick={() => setRefreshKey((k) => k + 1)}><RefreshIcon /></IconButton>
        }>
          {error}
        </Alert>
      </Box>
    );
  }
  if (!data) return null;

  const status = data.status?.state || 'open';
  const statusChip = STATUS_CHIPS[status] || STATUS_CHIPS.open;

  return (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: palette.surfaceBg, p: 2 }}>
      {/* Header card */}
      <Paper elevation={2} sx={{ p: 2.5, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={1}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {data.fleet} · Date: {fmtDate(data.date)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>Mission:</strong> {data.mission}
            </Typography>
            <Typography variant="body2">
              <strong>Acceptance criterion:</strong> {data.acceptanceCriterion}
            </Typography>
          </Box>
          <Stack alignItems={{ md: 'flex-end' }} spacing={1}>
            <Chip
              icon={statusChip.icon}
              label={statusChip.label}
              sx={{ bgcolor: statusChip.bg, color: statusChip.fg, fontWeight: 600 }}
            />
            {data.status?.actionedAt && (
              <Typography variant="caption" color="text.secondary">
                {fmtDateTime(data.status.actionedAt)} · {data.status.actionedBy || 'user'}
              </Typography>
            )}
          </Stack>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Scorecard label="Expired" value={data.expiredAssumptions?.length || 0} color={palette.red} bg={palette.redBg} />
          <Scorecard label="Ageing" value={data.ageingAssumptions?.length || 0} color={palette.amber} bg={palette.amberBg} />
          <Scorecard label="Fresh" value={data.freshAssumptions?.length || 0} color={palette.green} bg={palette.greenBg} />
          <Scorecard label="Gates ≤18mo" value={data.approachingGates?.length || 0} color={palette.amber} bg={palette.amberBg} />
          <Scorecard label="Breached projections" value={(data.breachedProjections || []).filter((p) => /review|breached/i.test(p.status)).length} color={palette.red} bg={palette.redBg} />
          <Scorecard label="Off-strategy" value={(data.vessels || []).filter((v) => /off-strategy/i.test(v.status)).length} color={palette.red} bg={palette.redBg} />
        </Stack>
      </Paper>

      {/* 1 · Expired assumptions */}
      <Section
        icon={<WarningIcon sx={{ color: palette.red }} />}
        title="1 · Expired Assumptions"
        subtitle={`${(data.expiredAssumptions || []).length} red · ${(data.ageingAssumptions || []).length} amber · ${(data.freshAssumptions || []).length} green`}
        headerBg={palette.headerBg}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={32}>#</TableCell>
              <TableCell>Assumption</TableCell>
              <TableCell width={88}>Cohort</TableCell>
              <TableCell width={120}>Vessel</TableCell>
              <TableCell>What happened</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.expiredAssumptions || []).map((a, i) => (
              <TableRow key={a.id} sx={{ '&:nth-of-type(odd)': { bgcolor: palette.surfaceBg } }}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.label}</Typography>
                </TableCell>
                <TableCell><Chip size="small" label={a.cohort} variant="outlined" /></TableCell>
                <TableCell>{a.vessel}</TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{a.what}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(data.ageingAssumptions?.length || data.freshAssumptions?.length) ? (
          <Box sx={{ mt: 1.5, px: 2, py: 1, bgcolor: palette.amberBg, borderRadius: 1 }}>
            <Typography variant="caption">
              <strong>Amber (ageing):</strong>{' '}
              {(data.ageingAssumptions || []).map((a) => `${a.label} (${a.cohort})`).join('; ') || '—'}
              {' · '}
              <strong>Green (fresh):</strong>{' '}
              {(data.freshAssumptions || []).map((a) => `${a.label} (${a.cohort})`).join('; ') || '—'}
            </Typography>
          </Box>
        ) : null}
      </Section>

      {/* 2 · Approaching gates */}
      <Section
        icon={<ScheduleIcon sx={{ color: palette.amber }} />}
        title="2 · Approaching Gates (≤ 18 months)"
        subtitle="Cheap windows to act — out-of-cycle costs multiples"
        headerBg={palette.headerBg}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={140}>Vessel</TableCell>
              <TableCell>Gate</TableCell>
              <TableCell width={140}>Opens</TableCell>
              <TableCell width={120}>Time to gate</TableCell>
              <TableCell>Deferred items</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.approachingGates || []).map((g) => (
              <TableRow key={`${g.vessel}-${g.opensIso}`}>
                <TableCell sx={{ fontWeight: 600 }}>{g.vessel}</TableCell>
                <TableCell>{g.kind}</TableCell>
                <TableCell>{fmtDate(g.opensIso, 'short')}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={`~${g.monthsAway} months`}
                    sx={{ bgcolor: g.monthsAway <= 18 ? palette.amberBg : 'transparent', color: g.monthsAway <= 18 ? palette.amber : 'inherit' }}
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(g.deferredItems || []).map((item) => (
                      <Chip key={item} size="small" label={item} variant="outlined" />
                    ))}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {(data.approachingGates || []).length === 0 && (
              <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>No gates inside the 18-month window.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      {/* 3 · Breached projections */}
      <Section
        icon={<ShowChartIcon sx={{ color: palette.red }} />}
        title="3 · Breached Projections"
        subtitle="Actuals vs the original uncertainty cone"
        headerBg={palette.headerBg}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={180}>Vessel</TableCell>
              <TableCell width={180}>Projection</TableCell>
              <TableCell width={160}>Status</TableCell>
              <TableCell>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.breachedProjections || []).map((p) => {
              const tone = projectionTone(p.status);
              return (
                <TableRow key={p.vessel}>
                  <TableCell sx={{ fontWeight: 600 }}>{p.vessel}</TableCell>
                  <TableCell>{p.label}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={p.status}
                      sx={{ bgcolor: tone === 'red' ? palette.redBg : tone === 'amber' ? palette.amberBg : palette.greenBg,
                             color: tone === 'red' ? palette.red : tone === 'amber' ? palette.amber : palette.green,
                             fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{p.detail}</Typography></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      {/* 4 · Vessels off-strategy */}
      <Section
        icon={<FlagIcon sx={{ color: palette.red }} />}
        title="4 · Vessels Off-Strategy"
        subtitle="Mission accepts ≤1 off-strategy at any time"
        headerBg={palette.headerBg}
      >
        <Stack spacing={1}>
          {(data.vessels || []).map((v) => {
            const tone = vesselTone(v.status);
            return (
              <Box key={v.name} sx={{ p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ width: 140 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{v.name}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.max(0, Math.min(100, v.alignment))}
                      sx={{
                        height: 10,
                        borderRadius: 5,
                        bgcolor: 'action.hover',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: tone === 'red' ? palette.red : tone === 'amber' ? palette.amber : palette.green,
                        },
                      }}
                    />
                  </Box>
                  <Box sx={{ width: 56, textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{v.alignment}%</Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={v.status}
                    sx={{ bgcolor: tone === 'red' ? palette.redBg : tone === 'amber' ? palette.amberBg : palette.greenBg,
                           color: tone === 'red' ? palette.red : tone === 'amber' ? palette.amber : palette.green,
                           fontWeight: 600, minWidth: 110, justifyContent: 'center' }}
                  />
                </Stack>
                {v.note && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 18 }}>
                    {v.note}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </Section>

      {/* 5 · Hypotheses */}
      <Section
        icon={<ScienceIcon sx={{ color: palette.blue }} />}
        title="5 · Active Hypothesis Workflows"
        subtitle={`${(data.hypotheses || []).length} live`}
        headerBg={palette.headerBg}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={260}>Hypothesis</TableCell>
              <TableCell>Statement</TableCell>
              <TableCell width={140}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.hypotheses || []).map((h) => {
              const tone = hypothesisTone(h.state);
              return (
                <TableRow key={h.id}>
                  <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{h.id}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{h.statement}</Typography></TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={h.state}
                      sx={{ bgcolor: tone === 'red' ? palette.redBg : tone === 'amber' ? palette.amberBg : tone === 'green' ? palette.greenBg : palette.blueBg,
                             color: tone === 'red' ? palette.red : tone === 'amber' ? palette.amber : tone === 'green' ? palette.green : palette.blue,
                             fontWeight: 600 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      {/* 6 · Open questions */}
      <Section
        icon={<HelpOutlineIcon sx={{ color: palette.amber }} />}
        title="6 · Open Questions Requiring Human Decision"
        headerBg={palette.headerBg}
      >
        <Stack spacing={1}>
          {(data.openQuestions || []).map((q) => (
            <Box key={q.id} sx={{ p: 1.5, bgcolor: palette.amberBg, borderRadius: 1, borderLeft: 4, borderColor: palette.amber }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{q.label}</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{q.id}</Typography>
            </Box>
          ))}
        </Stack>
      </Section>

      {/* Callout */}
      {data.callout && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<AssignmentLateIcon />}>
          <Typography variant="body2">{data.callout}</Typography>
        </Alert>
      )}

      {/* Action footer */}
      <Paper elevation={3} sx={{ p: 2, position: 'sticky', bottom: 0, mt: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Per the review cadence: <strong>Escalate</strong>, <strong>Acknowledge</strong>, or <strong>Open Decisions</strong>.
              No silent default — the packet does not roll forward un-actioned.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="warning"
              disabled={actioning}
              onClick={() => setStatus('escalated', 'Escalated from quarterly viewer')}
            >Escalate</Button>
            <Button
              variant="outlined"
              disabled={actioning}
              onClick={() => setStatus('acknowledged', 'Acknowledged from quarterly viewer')}
            >Acknowledge</Button>
            <Button
              variant="contained"
              color="primary"
              disabled={actioning}
              onClick={() => setStatus('decisions-opened', 'Opened for decision from quarterly viewer')}
            >Open Decisions</Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

// ─── small bits ────────────────────────────────────────────────────────────

const STATUS_CHIPS = {
  open: { label: 'Open', bg: '#FFF3E0', fg: '#ef6c00', icon: <ReportProblemIcon fontSize="small" /> },
  escalated: { label: 'Escalated', bg: '#FFEBEE', fg: '#c62828', icon: <ReportProblemIcon fontSize="small" /> },
  acknowledged: { label: 'Acknowledged', bg: '#E3F2FD', fg: '#1565c0', icon: <CheckCircleOutlineIcon fontSize="small" /> },
  'decisions-opened': { label: 'Decisions opened', bg: '#E8F5E9', fg: '#2e7d32', icon: <CheckCircleOutlineIcon fontSize="small" /> },
};

function Scorecard({ label, value, color, bg }) {
  return (
    <Box sx={{ minWidth: 130, p: 1.5, bgcolor: bg, borderRadius: 1 }}>
      <Typography variant="caption" sx={{ color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
      <Typography variant="h4" sx={{ color, fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

function Section({ icon, title, subtitle, children, headerBg }) {
  return (
    <Paper elevation={1} sx={{ mb: 2, overflow: 'hidden' }}>
      <Box sx={{ p: 1.5, bgcolor: headerBg, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon}
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
      </Box>
      <Box sx={{ p: 1 }}>{children}</Box>
    </Paper>
  );
}

function fmtDate(iso, style = 'long') {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (style === 'short') {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function vesselTone(status = '') {
  const s = status.toLowerCase();
  if (s.includes('off-strategy')) return 'red';
  if (s.includes('watch')) return 'amber';
  return 'green';
}

function projectionTone(status = '') {
  const s = status.toLowerCase();
  if (s.includes('breached') || s.includes('review')) return 'red';
  if (s.includes('lower edge') || s.includes('watch')) return 'amber';
  return 'green';
}

function hypothesisTone(state = '') {
  const s = state.toLowerCase();
  if (s.includes('refuted')) return 'red';
  if (s.includes('stalled')) return 'amber';
  if (s.includes('supported')) return 'green';
  return 'blue';
}
