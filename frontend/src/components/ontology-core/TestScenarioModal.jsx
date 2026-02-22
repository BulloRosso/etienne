import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  PlayArrow as RunIcon,
} from '@mui/icons-material';
import { apiAxios } from '../../services/api';

export default function TestScenarioModal({
  open,
  onClose,
  project,
  graphId,
  palette,
  setToast,
  setNodes,
  setEdges,
}) {
  const C = palette;
  const [entities, setEntities] = useState([]);
  const [editedProps, setEditedProps] = useState({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const logEndRef = useRef(null);

  // Hydrate on open
  useEffect(() => {
    if (!open || !graphId) return;
    setLoading(true);
    setResults([]);
    apiAxios
      .get(`/api/decision-support/graphs/${project}/${graphId}/hydrate`)
      .then((res) => {
        if (res.data.success) {
          setEntities(res.data.entities);
          const initial = {};
          for (const ent of res.data.entities) {
            initial[ent.entityId] = { ...ent.properties };
          }
          setEditedProps(initial);
        }
      })
      .catch((err) =>
        setToast({
          severity: 'error',
          message: `Hydration failed: ${err.message}`,
        }),
      )
      .finally(() => setLoading(false));
  }, [open, graphId, project, setToast]);

  // Scroll log to bottom on new results
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  const handlePropChange = (entityId, propKey, value) => {
    setEditedProps((prev) => ({
      ...prev,
      [entityId]: { ...prev[entityId], [propKey]: value },
    }));
  };

  const resetHighlights = () => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, _testHighlight: null },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
          ...e.style,
          strokeWidth: e.style?.strokeWidth === 4 ? 1.5 : e.style?.strokeWidth,
        },
      })),
    );
  };

  const highlightNode = (nodeId, color) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, _testHighlight: color } }
          : n,
      ),
    );
  };

  const highlightEdges = (edgeIds) => {
    setEdges((eds) =>
      eds.map((e) =>
        edgeIds.includes(e.id)
          ? { ...e, animated: true, style: { ...e.style, strokeWidth: 4 } }
          : e,
      ),
    );
  };

  // Update action status on a node
  const updateNodeStatus = (nodeId, status) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status } }
          : n,
      ),
    );
  };

  const handleRun = async () => {
    setRunning(true);
    setResults([]);
    resetHighlights();

    try {
      const token =
        localStorage.getItem('auth_accessToken') ||
        sessionStorage.getItem('auth_accessToken');
      const response = await fetch(
        `/api/decision-support/graphs/${project}/${graphId}/test-scenario`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            project,
            editedProperties: editedProps,
          }),
        },
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              setResults((prev) => [...prev, data]);

              // Animate the graph
              if (data.nodeId) {
                const color =
                  data.type === 'condition-result'
                    ? data.result
                      ? '#22c55e'
                      : '#dc2626'
                    : data.status === 'DONE'
                      ? '#22c55e'
                      : data.status === 'NOT_ACTIVATED'
                        ? '#64748b'
                        : '#f59e0b';
                highlightNode(data.nodeId, color);
              }
              if (data.edgeIds?.length) {
                highlightEdges(data.edgeIds);
              }
              // Update action node status badge
              if (data.actionId && data.status && data.nodeId) {
                updateNodeStatus(data.nodeId, data.status);
              }
            } catch {
              /* skip parse errors */
            }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      setToast({ severity: 'error', message: `Test failed: ${err.message}` });
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    resetHighlights();
    onClose();
  };

  const resultDotColor = (r) => {
    if (r.type === 'condition-result')
      return r.result ? '#22c55e' : '#dc2626';
    if (r.status === 'DONE') return '#22c55e';
    if (r.status === 'NOT_ACTIVATED') return '#64748b';
    if (r.status === 'PENDING') return '#f59e0b';
    if (r.type === 'test-complete') return '#3b82f6';
    return '#94a3b8';
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            background: C.panel,
            border: `1px solid ${C.panelBorder}`,
            borderTop: `3px solid ${C.accent}`,
            borderRadius: 2,
            maxHeight: '80vh',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1.5,
        }}
      >
        <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
          Test Scenario
        </Typography>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: C.textMuted }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ background: C.surface, borderColor: C.panelBorder }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} sx={{ color: C.accent }} />
          </Box>
        ) : entities.length === 0 ? (
          <Typography
            sx={{ color: C.textMuted, fontSize: 12, textAlign: 'center', py: 4 }}
          >
            No entities referenced by this decision graph. Add targetEntityId to
            conditions or actions.
          </Typography>
        ) : (
          <>
            <Typography
              sx={{
                color: C.textMuted,
                fontSize: 11,
                mb: 1.5,
                lineHeight: 1.5,
              }}
            >
              Entity properties hydrated from the knowledge graph. Edit values
              below to test different scenarios.
            </Typography>

            {/* Entity property grid */}
            {entities.map((ent) => (
              <Box key={ent.entityId} sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 0.75,
                  }}
                >
                  <Typography
                    sx={{
                      color: C.accent,
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    {ent.entityType} / {ent.entityId}
                  </Typography>
                  {ent.referencedBy.length > 0 && (
                    <Typography
                      sx={{ color: C.textDim, fontSize: 9, fontStyle: 'italic' }}
                    >
                      (referenced by{' '}
                      {ent.referencedBy
                        .map(
                          (r) =>
                            r.conditionId
                              ? `cond:${r.conditionId}`
                              : `act:${r.actionId}`,
                        )
                        .join(', ')}
                      )
                    </Typography>
                  )}
                </Box>
                {Object.entries(editedProps[ent.entityId] || {}).map(
                  ([key, value]) => (
                    <Box
                      key={key}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        sx={{
                          color: C.textMuted,
                          fontSize: 11,
                          fontFamily: 'monospace',
                          width: 140,
                          flexShrink: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {key}
                      </Typography>
                      <TextField
                        value={value}
                        onChange={(e) =>
                          handlePropChange(ent.entityId, key, e.target.value)
                        }
                        size="small"
                        fullWidth
                        disabled={running}
                        sx={{
                          '& .MuiInputBase-input': {
                            fontSize: 11,
                            color: C.text,
                            fontFamily: 'monospace',
                            py: 0.5,
                            px: 1,
                          },
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': { borderColor: C.panelBorder },
                            '&:hover fieldset': {
                              borderColor: C.accent + '55',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: C.accent,
                            },
                          },
                        }}
                      />
                    </Box>
                  ),
                )}
                <Divider sx={{ mt: 1, borderColor: C.panelBorder }} />
              </Box>
            ))}

            {/* Results log */}
            {results.length > 0 && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  background: C.bg,
                  borderRadius: 1,
                  border: `1px solid ${C.panelBorder}`,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                <Typography
                  sx={{
                    color: C.textMuted,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    mb: 0.75,
                  }}
                >
                  EXECUTION LOG
                </Typography>
                {results.map((r, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 0.75,
                      mb: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: resultDotColor(r),
                        mt: 0.5,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        sx={{
                          color: C.text,
                          fontSize: 10,
                          fontFamily: 'monospace',
                          lineHeight: 1.4,
                        }}
                      >
                        {r.detail}
                      </Typography>
                      {r.llmResponse && (
                        <Typography
                          sx={{
                            color: C.llm,
                            fontSize: 9,
                            fontFamily: 'monospace',
                            mt: 0.25,
                            lineHeight: 1.4,
                            maxHeight: 60,
                            overflow: 'hidden',
                          }}
                        >
                          LLM: {r.llmResponse.slice(0, 200)}
                          {r.llmResponse.length > 200 ? '...' : ''}
                        </Typography>
                      )}
                      {r.httpResponse && (
                        <Typography
                          sx={{
                            color: C.zmq,
                            fontSize: 9,
                            fontFamily: 'monospace',
                            mt: 0.25,
                          }}
                        >
                          HTTP {r.httpResponse.status}:{' '}
                          {JSON.stringify(r.httpResponse.data).slice(0, 150)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
                <div ref={logEndRef} />
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          background: C.panel,
          borderTop: `1px solid ${C.panelBorder}`,
          px: 2,
          py: 1.5,
        }}
      >
        <Button
          onClick={handleClose}
          sx={{ textTransform: 'none', fontSize: 12, color: C.textMuted }}
        >
          Close
        </Button>
        <Button
          onClick={handleRun}
          disabled={running || loading || entities.length === 0}
          variant="contained"
          startIcon={
            running ? (
              <CircularProgress size={14} sx={{ color: 'inherit' }} />
            ) : (
              <RunIcon sx={{ fontSize: 16 }} />
            )
          }
          sx={{
            textTransform: 'none',
            fontSize: 12,
            fontWeight: 600,
            background: C.accent,
            '&:hover': { background: C.accent + 'dd' },
          }}
        >
          {running ? 'Running...' : 'Run'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
