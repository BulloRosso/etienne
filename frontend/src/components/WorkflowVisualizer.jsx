import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  Paper,
} from '@mui/material';
import { AccountTree, Refresh } from '@mui/icons-material';
import WorkflowStateNode from './WorkflowStateNode';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const nodeTypes = { workflowState: WorkflowStateNode };

/**
 * WorkflowVisualizer - Read-only visualization of XState workflows.
 *
 * Props:
 * - projectName: string - the current project name
 * - workflowFile: string (optional) - specific workflow file path (e.g., "workflows/abc.workflow.json")
 *   If provided, auto-selects that workflow. Otherwise shows a dropdown to pick one.
 */
export default function WorkflowVisualizer({ projectName, workflowFile }) {
  return (
    <ReactFlowProvider>
      <WorkflowVisualizerInner projectName={projectName} workflowFile={workflowFile} />
    </ReactFlowProvider>
  );
}

function WorkflowVisualizerInner({ projectName, workflowFile }) {
  const { t } = useTranslation(["workflowVisualizer"]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Two-pass layout: re-run dagre with measured node sizes once mounted.
  const nodesInitialized = useNodesInitialized();
  const { getNodes, fitView } = useReactFlow();
  const relaidOutForRef = useRef(null);

  // Extract workflow ID from file path if provided
  const fileWorkflowId = useMemo(() => {
    if (!workflowFile) return null;
    const filename = workflowFile.split('/').pop()?.split('\\').pop();
    if (filename?.endsWith('.workflow.json')) {
      return filename.replace('.workflow.json', '');
    }
    return null;
  }, [workflowFile]);

  // Fetch workflow list
  useEffect(() => {
    if (!projectName) return;
    setLoading(true);
    setError(null);

    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/workflows`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load workflows: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setWorkflows(data);
        // Auto-select from file path or first workflow
        if (fileWorkflowId && data.some(w => w.id === fileWorkflowId)) {
          setSelectedWorkflowId(fileWorkflowId);
        } else if (data.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(data[0].id);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectName, fileWorkflowId]);

  // Fetch graph + status for selected workflow
  useEffect(() => {
    if (!projectName || !selectedWorkflowId) {
      setGraphData(null);
      setStatusData(null);
      return;
    }

    const base = `/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(selectedWorkflowId)}`;

    Promise.all([
      apiFetch(`${base}/graph`).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load graph'))),
      apiFetch(`${base}/status`).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load status'))),
    ])
      .then(([graph, status]) => {
        setGraphData(graph);
        setStatusData(status);
        setError(null);
      })
      .catch(err => setError(err.message));
  }, [projectName, selectedWorkflowId]);

  // Convert graph data to React Flow nodes/edges with auto-layout
  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: graphNodes, edges: graphEdges, currentState } = graphData;

    // Provisional layered layout with default node sizes. A second pass
    // (see the relayout effect below) re-runs dagre once React Flow has
    // measured the real node dimensions, so variable-height nodes pack
    // without overlap.
    const stateOrder = layoutWithDagre(graphNodes, graphEdges);

    const rfNodes = graphNodes.map((node) => {
      const pos = stateOrder.get(node.id) || { x: 0, y: 0 };
      return {
        id: node.id,
        type: 'workflowState',
        position: { x: pos.x, y: pos.y },
        data: {
          label: node.label,
          description: node.description,
          nodeType: node.type,
          isCurrent: node.isCurrent,
          waitingFor: node.waitingFor,
        },
        draggable: true,
      };
    });

    const rfEdges = graphEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      pathOptions: { borderRadius: 12 },
      animated: edge.source === currentState,
      style: { strokeWidth: 2, stroke: edge.source === currentState ? '#1976d2' : '#9e9e9e' },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: '#555' },
      labelShowBg: true,
      // Opaque background so an overlapping label stays fully readable
      // rather than translucently merging with the one beneath it.
      labelBgStyle: { fill: '#fff', fillOpacity: 1 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 3,
    }));

    // New graph -> allow the measured relayout pass to run again.
    relaidOutForRef.current = null;
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData]);

  // Pass 2: once React Flow has measured the real node sizes, re-run dagre
  // with those dimensions so variable-height nodes pack without overlap.
  // Guarded to run once per graphData (avoids measure -> layout -> measure loop).
  useEffect(() => {
    if (!graphData || !nodesInitialized) return;
    if (relaidOutForRef.current === graphData) return;

    const measured = getNodes();
    const nodeSize = {};
    for (const n of measured) {
      const w = n.measured?.width;
      const h = n.measured?.height;
      if (w && h) nodeSize[n.id] = { width: w, height: h };
    }
    if (Object.keys(nodeSize).length === 0) return;

    const positions = layoutWithDagre(graphData.nodes, graphData.edges, nodeSize);
    relaidOutForRef.current = graphData;
    setNodes((prev) =>
      prev.map((node) => {
        const p = positions.get(node.id);
        return p ? { ...node, position: p } : node;
      })
    );
    // Frame the freshly laid-out graph on the next tick.
    window.requestAnimationFrame(() => fitView({ padding: 0.3 }));
  }, [graphData, nodesInitialized, getNodes, setNodes, fitView]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    if (!projectName || !selectedWorkflowId) return;
    const base = `/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(selectedWorkflowId)}`;
    Promise.all([
      apiFetch(`${base}/graph`).then(r => r.json()),
      apiFetch(`${base}/status`).then(r => r.json()),
    ]).then(([graph, status]) => {
      setGraphData(graph);
      setStatusData(status);
    }).catch(err => setError(err.message));
  }, [projectName, selectedWorkflowId]);

  // Listen for claudeHook events to auto-refresh
  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.hook === 'PostHook') {
        handleRefresh();
      }
    };
    window.addEventListener('claudeHook', handler);
    return () => window.removeEventListener('claudeHook', handler);
  }, [handleRefresh]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
        <CircularProgress size={24} />
        <Typography variant="body2">{t('workflowVisualizer:loading')}</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (workflows.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1 }}>
        <AccountTree sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="body2" color="text.secondary">{t('workflowVisualizer:noWorkflows')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Panel position="top-left">
          <Paper elevation={2} sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            {!fileWorkflowId && (
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Workflow</InputLabel>
                <Select
                  value={selectedWorkflowId || ''}
                  label="Workflow"
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                >
                  {workflows.map(w => (
                    <MenuItem key={w.id} value={w.id}>
                      {w.name}
                      {w.isWaiting && ' (waiting)'}
                      {w.isFinal && ' (done)'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {statusData && (
              <>
                <Chip
                  label={statusData.stateLabel}
                  size="small"
                  color={statusData.isFinal ? 'success' : statusData.isWaiting ? 'warning' : 'primary'}
                  variant="outlined"
                />
                {statusData.isWaiting && (
                  <Typography variant="caption" color="warning.main">
                    {t('workflowVisualizer:waitingFor', { target: statusData.waitingFor })}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  v{statusData.version}
                </Typography>
              </>
            )}
          </Paper>
        </Panel>
        <Controls />
        <Background variant="dots" gap={16} size={1} />
        <MiniMap
          nodeColor={(node) => {
            if (node.data?.isCurrent) return '#1976d2';
            if (node.data?.nodeType === 'final') return '#4caf50';
            if (node.data?.nodeType === 'waiting') return '#ff9800';
            if (node.data?.nodeType === 'initial') return '#9c27b0';
            return '#bdbdbd';
          }}
          maskColor="rgba(0,0,0,0.1)"
          style={{ height: 80, width: 120 }}
        />
      </ReactFlow>
    </Box>
  );
}

// Default node box used before React Flow has measured the real DOM size.
const DEFAULT_NODE_SIZE = { width: 210, height: 96 };

/**
 * Layered left-to-right layout via dagre (Sugiyama: rank assignment +
 * barycenter crossing minimization). `nodeSize` is a map of
 * stateId -> { width, height } measured from the DOM; missing entries fall
 * back to DEFAULT_NODE_SIZE (used for the provisional pre-measurement pass).
 * Returns a Map of stateId -> { x, y } (top-left, for React Flow).
 */
function layoutWithDagre(nodes, edges, nodeSize = {}) {
  const positions = new Map();
  if (nodes.length === 0) return positions;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 36, // gap between nodes within the same rank
    ranksep: 90, // gap between ranks
    edgesep: 24, // separation between parallel edges (DEMOTE/SUPERSEDE fan-in)
    marginx: 16,
    marginy: 16,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const s = nodeSize[n.id] || DEFAULT_NODE_SIZE;
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  for (const e of edges) {
    // dagre ignores edges to/from unknown nodes; guard anyway
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  for (const n of nodes) {
    const dn = g.node(n.id);
    if (!dn) continue;
    // dagre positions are node centers; React Flow wants top-left
    positions.set(n.id, { x: dn.x - dn.width / 2, y: dn.y - dn.height / 2 });
  }
  return positions;
}
