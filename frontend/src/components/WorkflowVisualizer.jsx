import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

    // Simple topological layout: arrange left-to-right
    const stateOrder = computeLayout(graphNodes, graphEdges);

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
      animated: edge.source === currentState,
      style: { strokeWidth: 2, stroke: edge.source === currentState ? '#1976d2' : '#9e9e9e' },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: '#555' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 3,
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData]);

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
        <Typography variant="body2">{t('workflowVisualizer.loading')}</Typography>
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
        <Typography variant="body2" color="text.secondary">{t('workflowVisualizer.noWorkflows')}</Typography>
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
                    {t('workflowVisualizer.waitingFor', { target: statusData.waitingFor })}
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

/**
 * Simple left-to-right layout using BFS from initial state.
 * Returns a Map of stateId -> { x, y }
 */
function computeLayout(nodes, edges) {
  const positions = new Map();
  if (nodes.length === 0) return positions;

  const HORIZONTAL_GAP = 280;
  const VERTICAL_GAP = 120;

  // Build adjacency list
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source).push(edge.target);
  }

  // Find initial node
  const initialNode = nodes.find(n => n.type === 'initial') || nodes[0];

  // BFS to assign columns
  const visited = new Set();
  const columns = new Map(); // stateId -> column index
  const queue = [{ id: initialNode.id, col: 0 }];
  visited.add(initialNode.id);
  columns.set(initialNode.id, 0);

  while (queue.length > 0) {
    const { id, col } = queue.shift();
    const neighbors = adjacency.get(id) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        columns.set(neighbor, col + 1);
        queue.push({ id: neighbor, col: col + 1 });
      }
    }
  }

  // Handle any disconnected nodes
  for (const node of nodes) {
    if (!columns.has(node.id)) {
      const maxCol = Math.max(...columns.values(), -1);
      columns.set(node.id, maxCol + 1);
    }
  }

  // Group nodes by column
  const columnGroups = new Map();
  for (const [nodeId, col] of columns) {
    if (!columnGroups.has(col)) columnGroups.set(col, []);
    columnGroups.get(col).push(nodeId);
  }

  // Assign positions
  for (const [col, nodeIds] of columnGroups) {
    const totalHeight = (nodeIds.length - 1) * VERTICAL_GAP;
    const startY = -totalHeight / 2;
    nodeIds.forEach((nodeId, idx) => {
      positions.set(nodeId, {
        x: col * HORIZONTAL_GAP,
        y: startY + idx * VERTICAL_GAP,
      });
    });
  }

  return positions;
}
