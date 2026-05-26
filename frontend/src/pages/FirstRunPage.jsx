import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function CheckRow({ check }) {
  const meta = CHECK_ICON_OVERRIDES[check.id] || CATEGORY_ICON[check.category];
  const CategoryIcon = meta?.Icon;
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
              <Typography variant="caption" color="text.secondary">
                ({check.id})
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {check.message}
            </Typography>
            {check.remediation?.summary && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Suggested fix: {check.remediation.summary}
              </Typography>
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
  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          Support agent
        </Typography>
        <Box
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {chunks.join('') || 'Waiting for agent response…'}
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
  const esRef = useRef(null);
  const agentEsRef = useRef(null);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h5">Welcome — let's check your setup</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Running diagnostics on your environment. This usually takes a few seconds.
        </Typography>

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
              <CheckRow key={c.id} check={c} />
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
