import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

/**
 * CoverageViewer — read-only dashboard for `out/coverage/current.coverage.json`.
 *
 * Shows project header, submission gates, state + chip counts, and the
 * full row table. Mutations live in the interactive compliance-matrix
 * cockpit (the MCP App that opens via the sidebar's "Open the compliance
 * matrix" menu item); this viewer is the plain "look at the data" path.
 */

function buildPalette(isDark) {
  return {
    red: isDark ? '#ef9a9a' : '#c62828',
    redBg: isDark ? '#311b1b' : '#FFEBEE',
    amber: isDark ? '#ffcc80' : '#ef6c00',
    amberBg: isDark ? '#2a2118' : '#FFF3E0',
    green: isDark ? '#a5d6a7' : '#2e7d32',
    greenBg: isDark ? '#1b2a1b' : '#E8F5E9',
    blue: isDark ? '#90caf9' : '#1565c0',
    blueBg: isDark ? '#152230' : '#E3F2FD',
    neutral: isDark ? '#cfd8dc' : '#546e7a',
    neutralBg: isDark ? '#263238' : '#ECEFF1',
    headerBg: isDark ? '#263238' : '#ECEFF1',
  };
}

function stateTone(state) {
  switch (state) {
    case 'committed': return 'green';
    case 'deviation': return 'blue';
    case 'reviewed': return 'blue';
    case 'drafted': return 'amber';
    case 'clarify': return 'amber';
    case 'open': return 'red';
    default: return 'neutral';
  }
}

function reviewTone(r) {
  switch (r) {
    case 'approved': return 'green';
    case 'in-review': return 'amber';
    case 'rejected': return 'red';
    case 'pending':
    default: return 'neutral';
  }
}

function toneColors(palette, tone) {
  switch (tone) {
    case 'red': return { fg: palette.red, bg: palette.redBg };
    case 'amber': return { fg: palette.amber, bg: palette.amberBg };
    case 'green': return { fg: palette.green, bg: palette.greenBg };
    case 'blue': return { fg: palette.blue, bg: palette.blueBg };
    default: return { fg: palette.neutral, bg: palette.neutralBg };
  }
}

export default function CoverageViewer({ filename, projectName }) {
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const palette = useMemo(() => buildPalette(isDark), [isDark]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      setData(JSON.parse(text));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [projectName, filename]);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <CircularProgress size={16} />
        <Typography variant="body2">Loading coverage dashboard…</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load coverage dashboard: {error}</Alert>
      </Box>
    );
  }
  if (!data) return null;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const gates = data.gates || {};

  return (
    <Box sx={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* Header — same vocabulary as the compliance-matrix cockpit: zero-
          elevation Paper, subtitle1 + caption, right-aligned 80px image. */}
      <Paper elevation={0} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Coverage dashboard — {data.project?.name ?? 'untitled'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data.project?.customer ? `${data.project.customer} · ` : ''}
              {rows.length} requirement(s) · generated {data.generatedAt}
            </Typography>
            {data.project?.scope && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {data.project.scope}
              </Typography>
            )}
          </Box>
          <Box
            component="img"
            src="/approaching-gates.png"
            alt=""
            sx={{ height: 80, width: 'auto', display: 'block', flexShrink: 0 }}
          />
        </Stack>
      </Paper>

      <Box sx={{ p: 2, flex: 1, minHeight: 0 }}>

      {/* Gates */}
      {Object.keys(gates).length > 0 && (
        <Paper elevation={1} sx={{ mb: 2, overflow: 'hidden' }}>
          <Box sx={{ p: 1.25, bgcolor: palette.headerBg }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Submission gates
            </Typography>
          </Box>
          <Box sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {Object.entries(gates).map(([key, gate]) => {
                if (typeof gate === 'string') {
                  // submission_due is a bare date string
                  return (
                    <Paper key={key} variant="outlined" sx={{ p: 1, minWidth: 200 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {key.replace(/_/g, ' ')}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                        {gate}
                      </Typography>
                    </Paper>
                  );
                }
                return (
                  <Paper key={key} variant="outlined" sx={{ p: 1, minWidth: 240, flex: '1 1 240px' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {key.replace(/_/g, ' ').replace(/g(\d)/, 'G$1')}
                    </Typography>
                    {gate.dueDate && (
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                        due {gate.dueDate}
                      </Typography>
                    )}
                    {gate.requires && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        {gate.requires}
                      </Typography>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        </Paper>
      )}

      {/* State + chip counts */}
      <Paper elevation={1} sx={{ mb: 2, overflow: 'hidden' }}>
        <Box sx={{ p: 1.25, bgcolor: palette.headerBg }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Counts
          </Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          {data.stateCounts && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, mr: 0.5 }}>
                State
              </Typography>
              {Object.entries(data.stateCounts).map(([k, v]) => {
                const { fg, bg } = toneColors(palette, stateTone(k));
                return (
                  <Chip key={k} size="small" label={`${k} · ${v}`} sx={{ bgcolor: bg, color: fg, fontWeight: 600 }} />
                );
              })}
            </Stack>
          )}
          {data.chipCounts && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, mr: 0.5 }}>
                Chips
              </Typography>
              {Object.entries(data.chipCounts).map(([k, v]) => (
                <Chip key={k} size="small" label={`${k} · ${v}`} variant="outlined" />
              ))}
            </Stack>
          )}
        </Box>
      </Paper>

      {/* Rows */}
      <Paper elevation={1} sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 1.25, bgcolor: palette.headerBg, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
            Requirements
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rows.length} rows
          </Typography>
        </Box>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 80 }}>ID</TableCell>
              <TableCell>Requirement (EARS)</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Source</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Status</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Review</TableCell>
              <TableCell sx={{ minWidth: 160 }}>Owner</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const sTone = toneColors(palette, stateTone(row.state));
              const rTone = toneColors(palette, reviewTone(row.reviewStatus));
              return (
                <TableRow key={row.requirementId} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {row.requirementId}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Typography variant="body2">{row.ears}</Typography>
                    {row.chips?.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        {row.chips.map((c) => (
                          <Chip key={c} size="small" label={c} variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {row.sourceLocation}
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      {(row.sourceVolume || '').replace(/^source-volume-/, 'vol. ')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Chip size="small" label={row.state} sx={{ bgcolor: sTone.bg, color: sTone.fg, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Chip
                      size="small"
                      label={row.reviewStatus ?? 'pending'}
                      sx={{ bgcolor: rTone.bg, color: rTone.fg, fontWeight: 500, height: 20, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Typography variant="caption" color="text.secondary">
                      {row.responsibleEngineer ?? '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

        {/* Hint to switch to the cockpit */}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          This is the read-only coverage dashboard. For filters, status changes,
          and the planned-response preview, open <strong>"Open the compliance matrix"</strong>{' '}
          from the sidebar.
        </Typography>
      </Box>
    </Box>
  );
}
