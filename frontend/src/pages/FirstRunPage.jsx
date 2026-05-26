import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  IoCheckmarkCircle,
  IoCloseCircle,
  IoWarning,
  IoRefresh,
  IoOpenOutline,
  IoKeyOutline,
  IoCloudOutline,
  IoFolderOutline,
  IoHardwareChipOutline,
  IoStarOutline,
  IoLockClosedOutline,
  IoEyeOutline,
} from 'react-icons/io5';
import {
  completeFirstRun,
  openDiagnosticsStream,
  openSupportSessionStream,
  runDiagnostics,
} from '../services/firstRunService';
// runDiagnostics is used by the SSE error fallback.

const STATUS_ICON = {
  ok: <IoCheckmarkCircle color="#2e7d32" size={20} />,
  warn: <IoWarning color="#ed6c02" size={20} />,
  fail: <IoCloseCircle color="#d32f2f" size={20} />,
};

const SEVERITY_COLOR = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'default',
};

const CATEGORY_ICON = {
  connectivity: { Icon: IoCloudOutline, label: 'Connectivity' },
  env: { Icon: IoKeyOutline, label: 'Environment' },
  fs: { Icon: IoFolderOutline, label: 'Filesystem' },
  runtime: { Icon: IoHardwareChipOutline, label: 'Runtime' },
  optional: { Icon: IoStarOutline, label: 'Optional' },
};

// Per-check overrides that win over the category icon.
const CHECK_ICON_OVERRIDES = {
  'oauth.reachable': { Icon: IoLockClosedOutline, label: 'Authentication' },
  'frontend.reachable': { Icon: IoEyeOutline, label: 'Frontend' },
};

// Renders agent output (markdown) safely. Uses the same marked + DOMPurify
// pipeline as MarkdownViewer elsewhere in the app for consistency.
function MarkdownBlock({ source, sx }) {
  const html = useMemo(() => {
    if (!source) return '';
    try {
      const raw = marked.parse(source, { breaks: true, gfm: true });
      return DOMPurify.sanitize(raw);
    } catch {
      return '';
    }
  }, [source]);
  return (
    <Box
      sx={{
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word',
        '& p': { my: 0.5 },
        '& ul, & ol': { my: 0.5, pl: 3 },
        '& li': { mb: 0.25 },
        '& code': {
          fontFamily: 'monospace',
          fontSize: 12,
          backgroundColor: 'action.selected',
          px: 0.5,
          py: 0.1,
          borderRadius: 0.5,
        },
        '& pre': {
          fontFamily: 'monospace',
          fontSize: 12,
          backgroundColor: 'action.selected',
          p: 1,
          borderRadius: 1,
          overflow: 'auto',
          my: 0.5,
        },
        '& pre code': { backgroundColor: 'transparent', p: 0 },
        '& h1, & h2, & h3, & h4': { my: 0.5, fontSize: '1em', fontWeight: 600 },
        '& a': { color: 'primary.main' },
        ...sx,
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CheckRow({ check, onFixIt, fixState }) {
  const meta = CHECK_ICON_OVERRIDES[check.id] || CATEGORY_ICON[check.category];
  const CategoryIcon = meta?.Icon;
  const showFix = check.status === 'fail';
  const isRunning = fixState?.running;
  const chunks = fixState?.chunks || [];
  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ pt: 0.25 }}>{STATUS_ICON[check.status]}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2">{check.title}</Typography>
              <Chip
                label={check.severity}
                size="small"
                color={SEVERITY_COLOR[check.severity] || 'default'}
                variant="outlined"
              />
            </Stack>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {check.message}
            </Typography>
            {check.remediation?.summary && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Suggested fix: {check.remediation.summary}
              </Typography>
            )}
            {showFix && (
              <Box sx={{ mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={isRunning}
                  onClick={() => onFixIt(check.id)}
                  startIcon={isRunning ? <CircularProgress size={14} /> : null}
                >
                  {isRunning ? 'Agent working…' : 'Fix it now'}
                </Button>
              </Box>
            )}
            {(isRunning || chunks.length > 0) && (
              <Box
                sx={{
                  mt: 1,
                  maxHeight: 320,
                  overflow: 'auto',
                  p: 1,
                  backgroundColor: 'action.hover',
                  borderRadius: 1,
                }}
              >
                {chunks.length > 0 ? (
                  <MarkdownBlock source={chunks.join('')} />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Waiting for agent response…
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          {CategoryIcon && (
            <Tooltip title={meta.label} placement="left">
              <Box sx={{ pt: 0.25, color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                <CategoryIcon size={20} />
              </Box>
            </Tooltip>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function AgentTranscript({ chunks }) {
  const text = chunks.join('');
  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          Support agent
        </Typography>
        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          {text ? (
            <MarkdownBlock source={text} />
          ) : (
            <Typography variant="caption" color="text.secondary">
              Waiting for agent response…
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function FirstRunPage({ onComplete }) {
  const [checks, setChecks] = useState([]);
  const [overall, setOverall] = useState(null); // 'ok' | 'warn' | 'fail' | null
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentChunks, setAgentChunks] = useState([]);
  const [completing, setCompleting] = useState(false);
  // Per-check fix sessions: { [checkId]: { running, chunks: string[] } }
  const [fixState, setFixState] = useState({});
  const esRef = useRef(null);
  const agentEsRef = useRef(null);
  const fixEsRef = useRef({}); // { [checkId]: EventSource }

  const startStreaming = async () => {
    setRunning(true);
    setError(null);
    setChecks([]);
    setOverall(null);
    if (esRef.current) esRef.current.close();
    const es = openDiagnosticsStream();
    esRef.current = es;
    let finished = false;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data?.kind) return;
        if (data.kind === 'check_result' && data.result) {
          setChecks((prev) => [...prev, data.result]);
        } else if (data.kind === 'completed' && data.report) {
          setOverall(data.report.overall);
          setRunning(false);
          finished = true;
          es.close();
          esRef.current = null;
        } else if (data.kind === 'error') {
          setError(data.message || 'Diagnostic stream error');
          setRunning(false);
          finished = true;
          es.close();
          esRef.current = null;
        }
      } catch {
        // swallow parse error — keepalives etc.
      }
    };
    es.onerror = async () => {
      if (esRef.current === es) {
        es.close();
        esRef.current = null;
      }
      if (finished) return;
      // SSE failed before completing. Fall back to the synchronous POST so the user
      // still sees results even when the streaming path is unhappy.
      try {
        const report = await runDiagnostics();
        setChecks(report.checks || []);
        setOverall(report.overall);
      } catch (fallbackErr) {
        setError(fallbackErr.message || 'Diagnostics failed');
      } finally {
        setRunning(false);
      }
    };
  };

  useEffect(() => {
    startStreaming();
    return () => {
      if (esRef.current) esRef.current.close();
      if (agentEsRef.current) agentEsRef.current.close();
      Object.values(fixEsRef.current).forEach((es) => es?.close?.());
      fixEsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFixIt = (checkId) => {
    // Close any prior fix session for this check id
    const prior = fixEsRef.current[checkId];
    if (prior) prior.close();
    setFixState((prev) => ({ ...prev, [checkId]: { running: true, chunks: [] } }));
    const es = openSupportSessionStream({ applyItemId: checkId });
    fixEsRef.current[checkId] = es;

    const appendChunk = (chunk) =>
      setFixState((prev) => ({
        ...prev,
        [checkId]: {
          running: prev[checkId]?.running ?? true,
          chunks: [...(prev[checkId]?.chunks || []), chunk],
        },
      }));
    const stop = () =>
      setFixState((prev) => ({
        ...prev,
        [checkId]: { running: false, chunks: prev[checkId]?.chunks || [] },
      }));

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data?.kind) return;
        if (data.kind === 'stdout' && data.chunk) {
          appendChunk(data.chunk);
        } else if (data.kind === 'tool') {
          appendChunk(`\n[tool: ${data.toolName}]\n`);
        } else if (data.kind === 'completed') {
          stop();
          es.close();
          delete fixEsRef.current[checkId];
        } else if (data.kind === 'error') {
          appendChunk(`\n\n[error] ${data.message || 'unknown error'}`);
          stop();
          es.close();
          delete fixEsRef.current[checkId];
        }
      } catch {
        /* keepalive */
      }
    };
    es.onerror = () => {
      if (fixEsRef.current[checkId] === es) {
        es.close();
        delete fixEsRef.current[checkId];
      }
      stop();
    };
  };

  const grouped = useMemo(() => {
    const byStatus = { fail: [], warn: [], ok: [] };
    for (const c of checks) byStatus[c.status]?.push(c);
    return byStatus;
  }, [checks]);

  const handleContinue = async () => {
    setCompleting(true);
    try {
      await completeFirstRun({
        ranAt: new Date().toISOString(),
        overall: overall === 'ok' ? 'pass' : overall,
      });
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Failed to mark first-run complete');
    } finally {
      setCompleting(false);
    }
  };

  const handleAskAgent = () => {
    if (agentEsRef.current) agentEsRef.current.close();
    setAgentChunks([]);
    setAgentRunning(true);
    const es = openSupportSessionStream();
    agentEsRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data?.kind) return;
        if (data.kind === 'stdout' && data.chunk) {
          setAgentChunks((prev) => [...prev, data.chunk]);
        } else if (data.kind === 'completed') {
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        } else if (data.kind === 'error') {
          setAgentChunks((prev) => [...prev, `\n\n[error] ${data.message || 'unknown error'}`]);
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        }
      } catch {
        /* keepalive */
      }
    };
    es.onerror = () => {
      if (agentEsRef.current === es) {
        es.close();
        agentEsRef.current = null;
      }
      setAgentRunning(false);
    };
  };

  const hasCriticalIssue = overall === 'fail';
  const hasAnyIssue = overall === 'fail' || overall === 'warn';

  return (
    <Box
      sx={{
        height: '100vh',
        overflow: 'auto',
        backgroundColor: 'background.default',
        p: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" gutterBottom>
              Welcome — let's check your setup
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Running diagnostics on your environment. This usually takes a few seconds.
            </Typography>
          </Box>
          <Box
            component="img"
            src={overall === 'ok' ? '/claude-is-charged.png' : '/claude-needs-charging.png'}
            alt={overall === 'ok' ? 'Claude is charged' : 'Claude needs charging'}
            sx={{
              width: 200,
              height: 'auto',
              flexShrink: 0,
              opacity: overall ? 1 : 0.4,
              transition: 'opacity 200ms',
            }}
          />
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          {running ? (
            <CircularProgress size={20} />
          ) : (
            <IconButton size="small" onClick={startStreaming} title="Re-run diagnostics">
              <IoRefresh />
            </IconButton>
          )}
          <Typography variant="body2" color="text.secondary">
            {running ? 'Running checks…' : `Completed (${checks.length} checks)`}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {overall && (
            <Chip
              label={`Overall: ${overall}`}
              size="small"
              color={overall === 'ok' ? 'success' : overall === 'warn' ? 'warning' : 'error'}
            />
          )}
        </Stack>

        {grouped.fail.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Failed ({grouped.fail.length})
            </Typography>
            {grouped.fail.map((c) => (
              <CheckRow key={c.id} check={c} onFixIt={handleFixIt} fixState={fixState[c.id]} />
            ))}
          </Box>
        )}
        {grouped.warn.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Warnings ({grouped.warn.length})
            </Typography>
            {grouped.warn.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </Box>
        )}
        {grouped.ok.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Passing ({grouped.ok.length})
            </Typography>
            {grouped.ok.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </Box>
        )}

        {!running && hasAnyIssue && (
          <Card variant="outlined" sx={{ mt: 2, borderColor: 'warning.main' }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Ask the support agent for help
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Our embedded support agent can interpret these issues and propose a remediation plan.
                It cannot modify your user projects and will ask for your approval before any
                potentially impactful change.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                disabled={agentRunning}
                onClick={handleAskAgent}
                startIcon={agentRunning ? <CircularProgress size={16} /> : <IoOpenOutline />}
              >
                {agentRunning ? 'Agent thinking…' : 'Ask the support agent'}
              </Button>
              {(agentRunning || agentChunks.length > 0) && <AgentTranscript chunks={agentChunks} />}
            </CardContent>
          </Card>
        )}

        <Divider sx={{ my: 3 }} />

        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
          {hasCriticalIssue && (
            <Typography variant="caption" color="error.main">
              Critical issues detected — you can still continue but features may not work.
            </Typography>
          )}
          <Button onClick={startStreaming} disabled={running}>
            Re-run diagnostics
          </Button>
          <Button
            variant="contained"
            color={hasCriticalIssue ? 'warning' : 'primary'}
            onClick={handleContinue}
            disabled={running || completing || overall === null}
          >
            {completing ? 'Saving…' : hasCriticalIssue ? 'Continue anyway' : 'Continue to app'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
