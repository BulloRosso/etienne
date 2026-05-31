import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleRounded,
  RadioButtonUncheckedRounded,
  HourglassEmptyRounded,
  ExpandLessRounded,
  ExpandMoreRounded,
  LocalFireDepartmentRounded,
  EmojiEventsRounded,
  DescriptionOutlined,
  TheatersRounded,
} from '@mui/icons-material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

/**
 * ProgressViewer — blue-themed read-only renderer for a user's
 * `progress/<username>.progress.json` file.
 *
 * Shows:
 *   - Header: display name, role, baseline summary, weighted % complete.
 *   - Streak chip (flame icon, only when streak_days >= 3).
 *   - Badge chips (gold).
 *   - Recursive ToC tree with checkmark / half-check / empty circle
 *     icons. Each leaf can be expanded to show its Q/A history with
 *     linked example files.
 *
 * Mutation lives in the agent + the upcoming LearningPath MCP App;
 * this is the look-at-the-data path.
 */

function buildPalette(isDark) {
  return {
    blue: isDark ? '#90caf9' : '#1565c0',
    blueBg: isDark ? '#152230' : '#E3F2FD',
    green: isDark ? '#a5d6a7' : '#2e7d32',
    greenBg: isDark ? '#1b2e1c' : '#E8F5E9',
    red: isDark ? '#ef9a9a' : '#c62828',
    redBg: isDark ? '#2e1b1b' : '#FFEBEE',
    amber: isDark ? '#ffcc80' : '#ef6c00',
    grey: isDark ? '#9e9e9e' : '#9e9e9e',
    headerBg: isDark ? '#152230' : '#E3F2FD',
    rowHover: isDark ? '#1a2a3a' : '#f5f9ff',
    // Purple for roleplay accents — distinct from quiz (blue) and ToC state.
    purple: isDark ? '#ce93d8' : '#6a1b9a',
    purpleBg: isDark ? '#2a1d33' : '#F3E5F5',
    // Gold highlight for the "current topic" row — the leaf the agent
    // routes "What's next?" and the quiz skill to.
    gold: isDark ? '#3a2d10' : '#fff8e1',
    goldHover: isDark ? '#4a3a14' : '#fff3c4',
    goldBorder: isDark ? '#b8860b' : '#ffd54f',
  };
}

function stateIcon(state, palette) {
  if (state === 'done') return <CheckCircleRounded sx={{ color: palette.green }} />;
  if (state === 'in-progress')
    return <HourglassEmptyRounded sx={{ color: palette.amber }} />;
  return <RadioButtonUncheckedRounded sx={{ color: palette.grey }} />;
}

function computePercent(toc) {
  let totalWeight = 0;
  let doneWeight = 0;
  const walk = (nodes, parentWeight = 1) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const w = (node.weight ?? 1) * parentWeight;
      if (node.children && node.children.length) {
        walk(node.children, w / node.children.length);
      } else {
        totalWeight += w;
        if (node.state === 'done') doneWeight += w;
        else if (node.state === 'in-progress') doneWeight += w * 0.5;
      }
    }
  };
  walk(toc);
  if (totalWeight === 0) return 0;
  return Math.round((doneWeight / totalWeight) * 100);
}

// Pick the right FILE_PREVIEW_REQUEST action based on extension so the
// viewerRegistry routes the file to the matching viewer. Matches the
// mapping already used elsewhere in the app.
function previewActionFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown-preview';
  if (ext === 'json') return 'json-preview';
  if (ext === 'html' || ext === 'htm') return 'html-preview';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return 'image-preview';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel-preview';
  if (ext === 'pdf') return 'pdf-preview';
  return 'auto-preview';
}

// Build a Map from topic_id → best RoleplayResult for that topic. "Best"
// means: passed beats not-passed, then higher score%, then more recent.
// A leaf can have several attempts; the chip on the ToC row shows the best.
function indexRoleplayByTopic(results) {
  const map = new Map();
  if (!Array.isArray(results)) return map;
  for (const r of results) {
    if (!r || !r.topic_id) continue;
    const prev = map.get(r.topic_id);
    if (!prev || isBetterRoleplay(r, prev)) map.set(r.topic_id, r);
  }
  return map;
}

function isBetterRoleplay(a, b) {
  if (a.passed !== b.passed) return a.passed === true;
  const pa = a.of > 0 ? a.score / a.of : 0;
  const pb = b.of > 0 ? b.score / b.of : 0;
  if (pa !== pb) return pa > pb;
  return (a.taken_at || '') > (b.taken_at || '');
}

// Render the agent-written markdown answer. Sanitised via DOMPurify;
// constrained styling so a 6-paragraph answer doesn't blow out the row.
function QAMarkdown({ md }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(md || '', { breaks: true, gfm: true })),
    [md],
  );
  return (
    <Box
      sx={{
        mt: 0.5,
        color: 'text.secondary',
        fontSize: '0.85rem',
        '& p': { my: 0.5 },
        '& p:first-of-type': { mt: 0 },
        '& p:last-of-type': { mb: 0 },
        '& ul, & ol': { pl: 3, my: 0.5 },
        '& li': { mb: 0.25 },
        '& code': {
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          bgcolor: 'action.selected',
          px: 0.5,
          py: 0.1,
          borderRadius: 0.5,
        },
        '& pre': {
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          bgcolor: 'action.selected',
          p: 1,
          borderRadius: 1,
          overflow: 'auto',
          my: 0.5,
        },
        '& pre code': { bgcolor: 'transparent', p: 0 },
        '& h1, & h2, & h3, & h4': { my: 0.5, fontSize: '0.95rem', fontWeight: 600 },
        '& blockquote': {
          borderLeft: 3,
          borderColor: 'divider',
          pl: 1.5,
          ml: 0,
          color: 'text.secondary',
        },
        '& a': { color: 'primary.main' },
        '& table': { borderCollapse: 'collapse', my: 0.5 },
        '& th, & td': { border: 1, borderColor: 'divider', px: 0.75, py: 0.25 },
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function QABlock({ qa, palette, projectName, t }) {
  if (!qa || qa.length === 0) return null;
  const kindLabel = (k) =>
    k === 'check' ? t('qaTagCheck') : k === 'recall' ? t('qaTagRecall') : t('qaTagQA');

  const openFile = (path) => {
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      action: previewActionFor(path),
      filePath: path,
      projectName,
    });
  };

  return (
    <Stack spacing={1} sx={{ mt: 1, pl: 4, pr: 1, pb: 1 }}>
      {qa.map((entry, i) => (
        <Box
          key={i}
          sx={{
            pl: 1.5,
            borderLeft: `3px solid ${palette.blue}`,
            bgcolor: palette.blueBg,
            borderRadius: 0.5,
            py: 0.75,
            pr: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: palette.blue, fontWeight: 600 }}>
            {kindLabel(entry.kind)}
            {entry.asked_at ? ` · ${entry.asked_at.split('T')[0]}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 500 }}>
            {entry.q}
          </Typography>
          {entry.a_md && <QAMarkdown md={entry.a_md} />}
          {entry.files && entry.files.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
              {entry.files.map((f) => {
                const basename = f.split('/').pop() || f;
                return (
                  <Chip
                    key={f}
                    label={basename}
                    title={f}
                    icon={<DescriptionOutlined sx={{ fontSize: 12 }} />}
                    size="small"
                    clickable
                    onClick={(e) => { e.stopPropagation(); openFile(f); }}
                    sx={{
                      height: 'auto',
                      fontSize: '0.7rem',
                      bgcolor: 'transparent',
                      border: `1px solid ${palette.blue}`,
                      color: palette.blue,
                      '& .MuiChip-icon': { color: palette.blue, ml: 0.5, mr: '3px' },
                      '& .MuiChip-label': { pl: '3px', pr: '4px', py: '3px' },
                      '&:hover': { bgcolor: palette.blueBg },
                    }}
                  />
                );
              })}
            </Stack>
          )}
        </Box>
      ))}
    </Stack>
  );
}

function NodeRow({
  node,
  palette,
  depth,
  projectName,
  t,
  isOpen,
  toggleNode,
  currentNodeId,
  roleplayByTopic,
}) {
  const hasChildren = node.children && node.children.length > 0;
  const hasQA = node.qa && node.qa.length > 0;
  const open = isOpen(node, depth);
  const isCurrent = node.id === currentNodeId;
  const roleplay = roleplayByTopic ? roleplayByTopic.get(node.id) : null;
  const roleplayPercent = roleplay && roleplay.of > 0
    ? Math.round((roleplay.score / roleplay.of) * 100)
    : null;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 1 + depth * 2.5,
          pr: 1,
          py: 0.5,
          borderRadius: 0.5,
          cursor: hasChildren || hasQA ? 'pointer' : 'default',
          ...(isCurrent && {
            bgcolor: palette.gold,
            border: `1px solid ${palette.goldBorder}`,
          }),
          '&:hover': { bgcolor: isCurrent ? palette.goldHover : palette.rowHover },
        }}
        onClick={() => (hasChildren || hasQA) && toggleNode(node.id, depth)}
      >
        {stateIcon(node.state, palette)}
        <Typography
          variant={depth === 0 ? 'subtitle2' : 'body2'}
          sx={{ flex: 1, fontWeight: depth === 0 ? 700 : 400 }}
        >
          <Box component="span" sx={{ color: palette.blue, mr: 1, fontFamily: 'monospace' }}>
            {node.id}
          </Box>
          {node.title}
        </Typography>
        {hasQA && (
          <Chip
            label={t('qaCount', { count: node.qa.length })}
            size="small"
            sx={{ height: 18, fontSize: '0.7rem', bgcolor: palette.blueBg, color: palette.blue }}
          />
        )}
        {roleplay && (
          <Tooltip
            arrow
            placement="top"
            title={t('roleplayLeafChipTooltip', {
              scenarioId: roleplay.scenario_id,
              persona: roleplay.persona_name,
              score: roleplay.score,
              of: roleplay.of,
              mandatoryHits: roleplay.mandatory_hits,
              mandatoryTotal: roleplay.mandatory_total,
              date: roleplay.taken_at?.split('T')[0] ?? '',
            })}
          >
            <Chip
              icon={<TheatersRounded sx={{ fontSize: 12 }} />}
              label={t(
                roleplay.passed ? 'roleplayLeafChipPassed' : 'roleplayLeafChipFailed',
                { percent: roleplayPercent ?? 0 },
              )}
              size="small"
              onClick={(e) => e.stopPropagation()}
              sx={{
                height: 18,
                fontSize: '0.7rem',
                bgcolor: roleplay.passed ? palette.greenBg : palette.redBg,
                color: roleplay.passed ? palette.green : palette.red,
                border: `1px solid ${roleplay.passed ? palette.green : palette.red}`,
                '& .MuiChip-icon': {
                  color: roleplay.passed ? palette.green : palette.red,
                  ml: 0.5,
                  mr: '-2px',
                },
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Tooltip>
        )}
        {(hasChildren || hasQA) && (
          <IconButton size="small" sx={{ p: 0 }}>
            {open ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
          </IconButton>
        )}
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        {hasQA && <QABlock qa={node.qa} palette={palette} projectName={projectName} t={t} />}
        {hasChildren && (
          <Box>
            {node.children.map((child) => (
              <NodeRow
                key={child.id}
                node={child}
                palette={palette}
                depth={depth + 1}
                projectName={projectName}
                t={t}
                isOpen={isOpen}
                toggleNode={toggleNode}
                currentNodeId={currentNodeId}
                roleplayByTopic={roleplayByTopic}
              />
            ))}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}

// Find the "current topic" the trainee is working on. Definition matches
// the agent's own routing: deepest leaf with state === 'in-progress';
// fall back to the first 'not-started' leaf if nothing is in-progress;
// return null when everything is done (then nothing should be highlighted).
// Returns the path of node ids from the root down to the current leaf,
// not just the leaf id — the caller uses the path to auto-expand the
// ancestors so the highlighted row is visible.
function findCurrentPath(toc) {
  const found = { path: null, depth: -1, type: null }; // type: 'in-progress' | 'not-started'
  const walk = (nodes, ancestors) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const path = [...ancestors, node.id];
      const isLeaf = !node.children || node.children.length === 0;
      if (isLeaf) {
        if (node.state === 'in-progress') {
          if (found.type !== 'in-progress' || path.length > found.depth) {
            found.path = path;
            found.depth = path.length;
            found.type = 'in-progress';
          }
        } else if (node.state !== 'done' && found.type !== 'in-progress' && !found.path) {
          // First not-started leaf, only if we haven't found in-progress yet.
          found.path = path;
          found.depth = path.length;
          found.type = 'not-started';
        }
      }
      if (node.children) walk(node.children, path);
    }
  };
  walk(toc, []);
  return found.path;
}

// Resolve a tooltip string for a badge id. Direct match first
// (`badge.first-question`); then family-pattern fallback for ids with a
// suffix (`completionist-1` → `badge.completionist` with `{ suffix: '1' }`,
// `simulator-sap-md04` → `badge.simulator` with `{ suffix: 'sap-md04' }`).
// Returns null when no description is available, so the caller can skip
// the Tooltip wrapper rather than show an empty one.
const BADGE_FAMILIES = ['completionist', 'simulator'];
function badgeTooltip(badgeId, t) {
  const direct = t(`badge.${badgeId}`, { defaultValue: null });
  if (direct) return direct;
  for (const family of BADGE_FAMILIES) {
    if (badgeId.startsWith(`${family}-`)) {
      const suffix = badgeId.slice(family.length + 1);
      const familyText = t(`badge.${family}`, { suffix, defaultValue: null });
      if (familyText) return familyText;
    }
  }
  return null;
}

// Persistent per-file open/closed map. Stored as { [nodeId]: boolean } —
// boolean *overrides* the default-open-at-depth-0 fallback. Scoped per
// project + filename so two open progress files don't collide.
const EXPANDED_STORAGE_PREFIX = 'progressViewer.expanded.';

function loadExpanded(storageKey) {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_PREFIX + storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveExpanded(storageKey, map) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_PREFIX + storageKey, JSON.stringify(map));
  } catch {
    // ignore quota / disabled-storage errors — falls back to in-memory state
  }
}

export default function ProgressViewer({ filename, projectName }) {
  const { t } = useTranslation('progressViewer');
  const { mode: themeMode } = useThemeMode();
  const palette = useMemo(() => buildPalette(themeMode === 'dark'), [themeMode]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const storageKey = `${projectName}::${filename}`;
  const [expanded, setExpanded] = useState(() => loadExpanded(storageKey));

  // Reload the persisted map when the source file changes (e.g. switching
  // between two open progress files).
  useEffect(() => {
    setExpanded(loadExpanded(storageKey));
  }, [storageKey]);

  // Path from the root to the "current topic" leaf. Used to highlight
  // the leaf gold AND to auto-expand its ancestors so the row is visible
  // when the viewer opens.
  const currentPath = useMemo(() => findCurrentPath(data?.toc || []), [data]);
  const currentNodeId = currentPath ? currentPath[currentPath.length - 1] : null;
  const currentAncestors = useMemo(
    () => (currentPath ? new Set(currentPath.slice(0, -1)) : new Set()),
    [currentPath],
  );

  const isOpen = useCallback(
    (node, depth) => {
      const override = expanded[node.id];
      if (typeof override === 'boolean') return override;
      // No explicit user choice: default open for depth 0 OR for any
      // ancestor of the current topic, so the gold-highlighted leaf is
      // visible without the user having to expand manually.
      return depth === 0 || currentAncestors.has(node.id);
    },
    [expanded, currentAncestors],
  );

  const toggleNode = useCallback(
    (nodeId, depth) => {
      setExpanded((prev) => {
        const current = typeof prev[nodeId] === 'boolean' ? prev[nodeId] : depth === 0;
        const next = { ...prev, [nodeId]: !current };
        saveExpanded(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const fetchProgress = useCallback(async () => {
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

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Indexed BEFORE the early returns — hook order must stay stable across
  // loading → loaded transitions. Falls back to an empty Map when data is
  // not yet available.
  const roleplayByTopic = useMemo(
    () => indexRoleplayByTopic(data?.roleplay_results || []),
    [data],
  );

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <CircularProgress size={16} />
        <Typography variant="body2">{t('loadingProgress')}</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{t('failedToLoad', { error })}</Alert>
      </Box>
    );
  }
  if (!data) return null;

  const percent = computePercent(data.toc || []);
  const streakDays = data.streak_days || 0;
  const badges = data.badges || [];
  const roleplayResults = data.roleplay_results || [];

  return (
    <Box sx={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <Paper
        elevation={0}
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: palette.headerBg }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: palette.blue, letterSpacing: 1 }}>
              {t('onboardingProgress')}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {data.display_name || data.user || t('trainee')}{' '}
              <Box
                component="span"
                sx={{ fontSize: '0.7em', color: palette.blue, fontWeight: 400, ml: 1 }}
              >
                {data.role}
              </Box>
            </Typography>
            {data.baseline && (
              <Typography variant="caption" color="text.secondary">
                {data.baseline.prior_knowledge
                  ? t('baselineWithPriorKnowledge', {
                      language: data.baseline.language || '?',
                      learningStyle: data.baseline.learning_style || '?',
                      priorKnowledge:
                        data.baseline.prior_knowledge.length > 80
                          ? `${data.baseline.prior_knowledge.slice(0, 80)}…`
                          : data.baseline.prior_knowledge,
                    })
                  : t('baseline', {
                      language: data.baseline.language || '?',
                      learningStyle: data.baseline.learning_style || '?',
                    })}
              </Typography>
            )}
          </Box>
          {streakDays >= 3 && (
            <Chip
              icon={<LocalFireDepartmentRounded />}
              label={t('streak', { count: streakDays })}
              sx={{ bgcolor: '#fff3e0', color: '#ef6c00', fontWeight: 600 }}
            />
          )}
        </Stack>

        <Box sx={{ mt: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LinearProgress
              variant="determinate"
              value={percent}
              sx={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                bgcolor: '#cfd8dc40',
                '& .MuiLinearProgress-bar': { bgcolor: palette.blue, borderRadius: 5 },
              }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: palette.blue, minWidth: 48, textAlign: 'right' }}>
              {percent}%
            </Typography>
          </Stack>
        </Box>

        {badges.length > 0 && (
          <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.75 }}>
            {badges.map((b) => {
              const tip = badgeTooltip(b, t);
              const chip = (
                <Chip
                  icon={<EmojiEventsRounded sx={{ fontSize: 14, color: '#b8860b !important' }} />}
                  label={b}
                  size="small"
                  sx={{
                    bgcolor: '#fffde7',
                    color: '#5d4037',
                    fontSize: '0.7rem',
                    height: 22,
                    border: '1px solid #ffd54f',
                    '& .MuiChip-icon': { color: '#b8860b' },
                  }}
                />
              );
              return tip ? (
                <Tooltip key={b} title={tip} arrow placement="top">
                  {chip}
                </Tooltip>
              ) : (
                <React.Fragment key={b}>{chip}</React.Fragment>
              );
            })}
          </Stack>
        )}
      </Paper>

      <Box sx={{ flex: 1, p: 1.5 }}>
        {(data.toc || []).map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            palette={palette}
            depth={0}
            projectName={projectName}
            t={t}
            isOpen={isOpen}
            toggleNode={toggleNode}
            currentNodeId={currentNodeId}
            roleplayByTopic={roleplayByTopic}
          />
        ))}
      </Box>

      {data.quiz_results && data.quiz_results.length > 0 && (
        <Paper elevation={0} sx={{ borderTop: 1, borderColor: 'divider', p: 1.5 }}>
          <Typography variant="overline" sx={{ color: palette.blue, letterSpacing: 1 }}>
            {t('quizHistory')}
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {data.quiz_results.map((q, i) => (
              <Typography key={i} variant="body2" sx={{ color: 'text.secondary' }}>
                {t('quizResultLine', {
                  topicId: q.topic_id,
                  score: q.score,
                  of: q.of,
                  percent: Math.round((q.score / q.of) * 100),
                  date: q.taken_at?.split('T')[0] ?? '',
                })}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}

      {roleplayResults.length > 0 && (
        <Paper elevation={0} sx={{ borderTop: 1, borderColor: 'divider', p: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <TheatersRounded sx={{ fontSize: 16, color: palette.purple }} />
            <Typography variant="overline" sx={{ color: palette.purple, letterSpacing: 1 }}>
              {t('roleplayHistory')}
            </Typography>
          </Stack>
          <Stack spacing={1} sx={{ mt: 0.75 }}>
            {roleplayResults.map((r, i) => {
              const pct = r.of > 0 ? Math.round((r.score / r.of) * 100) : 0;
              return (
                <Box
                  key={i}
                  sx={{
                    pl: 1.25,
                    borderLeft: `3px solid ${r.passed ? palette.green : palette.red}`,
                    bgcolor: palette.purpleBg,
                    borderRadius: 0.5,
                    py: 0.75,
                    pr: 1,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t('roleplayResultLine', {
                        scenarioId: r.scenario_id,
                        persona: r.persona_name,
                      })}
                    </Typography>
                    {r.topic_id && (
                      <Chip
                        label={r.topic_id}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.7rem',
                          bgcolor: palette.blueBg,
                          color: palette.blue,
                          fontFamily: 'monospace',
                        }}
                      />
                    )}
                    <Chip
                      label={t(r.passed ? 'roleplayPassed' : 'roleplayFailed')}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: r.passed ? palette.greenBg : palette.redBg,
                        color: r.passed ? palette.green : palette.red,
                        border: `1px solid ${r.passed ? palette.green : palette.red}`,
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('roleplayResultScore', {
                      score: r.score,
                      of: r.of,
                      percent: pct,
                      mandatoryHits: r.mandatory_hits,
                      mandatoryTotal: r.mandatory_total,
                      turns: r.turns,
                      date: r.taken_at?.split('T')[0] ?? '',
                    })}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
