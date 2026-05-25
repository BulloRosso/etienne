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
  Stack,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import { AccountTree, MenuBook, History as HistoryIcon, InfoOutlined, Close as CloseIcon } from '@mui/icons-material';
import WorkflowStateNode from './WorkflowStateNode';
import RationaleCard from './RationaleCard';
import ProgressFooter from './workflows/ProgressFooter';
import WikiLinkTree from './workflows/WikiLinkTree';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

const nodeTypes = { workflowState: WorkflowStateNode };

/**
 * WorkflowVisualizer - Read-only visualization of XState workflows.
 *
 * Props:
 *   projectName: string
 *   workflowFile?: string                   auto-selects a specific .workflow.json
 *   selectedWorkflowId?: string             controlled selection (overrides internal state)
 *   onWorkflowsLoaded?: (workflows) => void  reports the loaded workflow list to parent
 *   onSelectWorkflow?: (id) => void         called when the user picks from the embedded dropdown
 *   onOpenWiki?: (slug) => void             handle wiki-link clicks locally instead of via global event bus
 *   onProgressClick?: (eventName) => void   status-tab footer click handler (opens parent's progress dialog)
 *   viewMode?: 'both' | 'flow' | 'status'   layout mode (default 'both' = legacy two-column)
 *   hideInternalDropdown?: boolean          suppress the floating workflow Select inside the graph
 */
export default function WorkflowVisualizer(props) {
  const viewMode = props.viewMode || 'both';
  if (viewMode === 'status') {
    return <StatusPane {...props} />;
  }
  return (
    <ReactFlowProvider>
      <WorkflowVisualizerInner {...props} viewMode={viewMode} />
    </ReactFlowProvider>
  );
}

function useWorkflowData({
  projectName,
  workflowFile,
  controlledSelectedId,
  onWorkflowsLoaded,
}) {
  const [workflows, setWorkflows] = useState([]);
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [definitionData, setDefinitionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fileWorkflowId = useMemo(() => {
    if (!workflowFile) return null;
    const filename = workflowFile.split('/').pop()?.split('\\').pop();
    if (filename?.endsWith('.workflow.json')) {
      return filename.replace('.workflow.json', '');
    }
    return null;
  }, [workflowFile]);

  const selectedWorkflowId =
    controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  useEffect(() => {
    if (!projectName) return;
    setLoading(true);
    setError(null);

    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/workflows`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load workflows: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setWorkflows(data);
        if (onWorkflowsLoaded) onWorkflowsLoaded(data);
        if (controlledSelectedId === undefined) {
          if (fileWorkflowId && data.some((w) => w.id === fileWorkflowId)) {
            setInternalSelectedId(fileWorkflowId);
          } else if (data.length > 0 && !internalSelectedId) {
            setInternalSelectedId(data[0].id);
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, fileWorkflowId]);

  const fetchSelected = useCallback(() => {
    if (!projectName || !selectedWorkflowId) {
      setGraphData(null);
      setStatusData(null);
      setDefinitionData(null);
      return;
    }
    const base = `/api/workspace/${encodeURIComponent(projectName)}/workflows/${encodeURIComponent(selectedWorkflowId)}`;
    Promise.all([
      apiFetch(`${base}/graph`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error('Failed to load graph'))
      ),
      apiFetch(`${base}/status`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error('Failed to load status'))
      ),
      apiFetch(base).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error('Failed to load workflow definition'))
      ),
    ])
      .then(([graph, status, definition]) => {
        setGraphData(graph);
        setStatusData(status);
        setDefinitionData(definition);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [projectName, selectedWorkflowId]);

  useEffect(() => {
    fetchSelected();
  }, [fetchSelected]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.hook === 'PostHook') {
        fetchSelected();
      }
    };
    window.addEventListener('claudeHook', handler);
    return () => window.removeEventListener('claudeHook', handler);
  }, [fetchSelected]);

  return {
    workflows,
    selectedWorkflowId,
    setInternalSelectedId,
    graphData,
    statusData,
    definitionData,
    loading,
    error,
    fileWorkflowId,
  };
}

function WorkflowVisualizerInner({
  projectName,
  workflowFile,
  selectedWorkflowId: controlledSelectedId,
  onWorkflowsLoaded,
  onSelectWorkflow,
  onOpenWiki,
  onOpenEvidence,
  viewMode,
  hideInternalDropdown,
}) {
  const { t } = useTranslation(['workflowVisualizer']);
  const {
    workflows,
    selectedWorkflowId,
    setInternalSelectedId,
    graphData,
    statusData,
    definitionData,
    loading,
    error,
    fileWorkflowId,
  } = useWorkflowData({
    projectName,
    workflowFile,
    controlledSelectedId,
    onWorkflowsLoaded,
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodesInitialized = useNodesInitialized();
  const { getNodes, fitView } = useReactFlow();
  const relaidOutForRef = useRef(null);

  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: graphNodes, edges: graphEdges, currentState } = graphData;
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

    const rfEdges = graphEdges.map((edge) => ({
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
      labelBgStyle: { fill: '#fff', fillOpacity: 1 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 3,
    }));

    relaidOutForRef.current = null;
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, setNodes, setEdges]);

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
    window.requestAnimationFrame(() => fitView({ padding: 0.3 }));
  }, [graphData, nodesInitialized, getNodes, setNodes, fitView]);

  const handleOpenWikiSlug = useCallback(
    (slug) => {
      if (!slug || !projectName) return;
      if (onOpenWiki) {
        onOpenWiki(slug);
        return;
      }
      claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
        action: 'markdown-preview',
        filePath: `wiki/topics/${slug}.md`,
        projectName,
      });
    },
    [projectName, onOpenWiki]
  );

  const handleSelectChange = (id) => {
    if (controlledSelectedId === undefined) setInternalSelectedId(id);
    if (onSelectWorkflow) onSelectWorkflow(id);
  };

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

  const showLegacySidebar = viewMode === 'both';
  const hasContextContent = computeHasContextContent(definitionData);

  const showInternalDropdown = !hideInternalDropdown && !fileWorkflowId;

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row' }}>
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
              {showInternalDropdown && (
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Workflow</InputLabel>
                  <Select
                    value={selectedWorkflowId || ''}
                    label="Workflow"
                    onChange={(e) => handleSelectChange(e.target.value)}
                  >
                    {workflows.map((w) => (
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
      {showLegacySidebar && hasContextContent && (
        <Box
          sx={{
            width: 340,
            borderLeft: 1,
            borderColor: 'divider',
            overflowY: 'auto',
            p: 1.5,
            backgroundColor: 'background.paper',
          }}
        >
          <StatusContent
            definitionData={definitionData}
            projectName={projectName}
            onOpenWiki={handleOpenWikiSlug}
            onOpenEvidence={onOpenEvidence}
          />
        </Box>
      )}
    </Box>
  );
}

/**
 * Pure status pane — same data fetching as the graph, but renders only the
 * starting-assumption / initial-rationale / decision-history content. Used by
 * the new 3-column workflow modal in the "Status" tab. No React Flow needed.
 */
function StatusPane({
  projectName,
  workflowFile,
  selectedWorkflowId: controlledSelectedId,
  onWorkflowsLoaded,
  onOpenWiki,
  onOpenEvidence,
  onProgressClick,
}) {
  const { t } = useTranslation(['workflowVisualizer']);
  const { workflows, definitionData, statusData, loading, error } = useWorkflowData({
    projectName,
    workflowFile,
    controlledSelectedId,
    onWorkflowsLoaded,
  });

  const handleOpenWikiSlug = useCallback(
    (slug) => {
      if (!slug || !projectName) return;
      if (onOpenWiki) {
        onOpenWiki(slug);
        return;
      }
      claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
        action: 'markdown-preview',
        filePath: `wiki/topics/${slug}.md`,
        projectName,
      });
    },
    [projectName, onOpenWiki]
  );
  const [infoOpen, setInfoOpen] = useState(false);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
        <CircularProgress size={24} />
        <Typography variant="body2">{t('workflowVisualizer:loading')}</Typography>
      </Box>
    );
  }
  if (error) {
    return <Box sx={{ p: 2 }}><Alert severity="error">{error}</Alert></Box>;
  }
  if (workflows.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1 }}>
        <AccountTree sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="body2" color="text.secondary">{t('workflowVisualizer:noWorkflows')}</Typography>
      </Box>
    );
  }

  const hasContextContent = computeHasContextContent(definitionData);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.paper' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
        {definitionData?.name && (
          <Typography variant="h6" sx={{ mb: 1, lineHeight: 1.3 }} title={definitionData.name}>
            {definitionData.name}
          </Typography>
        )}
        {statusData && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: infoOpen ? 1 : '40px' }}>
            <Chip
              label={statusData.stateLabel}
              size="small"
              color={statusData.isFinal ? 'success' : statusData.isWaiting ? 'warning' : 'primary'}
              variant="outlined"
              sx={{ borderWidth: 2, '& .MuiChip-label': { mt: '2px', ml: '3px' } }}
            />
            {statusData.isWaiting && (
              <Typography variant="caption" color="warning.main">
                {t('workflowVisualizer:waitingFor', { target: statusData.waitingFor })}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">v{statusData.version}</Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="What do these sections mean?">
              <IconButton
                size="small"
                onClick={() => setInfoOpen((v) => !v)}
                sx={{ color: 'text.secondary' }}
              >
                <InfoOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
        {statusData && infoOpen && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: '40px' }}>
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Status sections
              </Typography>
              <IconButton size="small" onClick={() => setInfoOpen(false)} sx={{ mt: '-4px', mr: '-4px' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Table size="small" sx={{ '& td, & th': { px: 1, py: 0.5, verticalAlign: 'top' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: '30%' }}>Section</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '40%' }}>Captures</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>When</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Starting assumption</TableCell>
                  <TableCell>The hypothesis itself (wiki pages)</TableCell>
                  <TableCell>Defined by the wiki, referenced at creation</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Initial rationale</TableCell>
                  <TableCell>Why we decided to test it <em>now</em> + supporting evidence</TableCell>
                  <TableCell>Recorded at workflow creation, once</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>history[].rationale</code></TableCell>
                  <TableCell>Why a specific state transition was made</TableCell>
                  <TableCell>Recorded on each human-decided transition</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        )}
        {hasContextContent ? (
          <StatusContent
            definitionData={definitionData}
            projectName={projectName}
            onOpenWiki={handleOpenWikiSlug}
            onOpenEvidence={onOpenEvidence}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            No assumptions or decision history recorded yet.
          </Typography>
        )}
      </Box>
      {onProgressClick && (
        <ProgressFooter
          definitionData={definitionData}
          statusData={statusData}
          onPick={onProgressClick}
        />
      )}
    </Box>
  );
}

function computeHasContextContent(definitionData) {
  const assumptionSlugs = definitionData?.assumptionWikiSlugs || [];
  const initialRationale = definitionData?.initialRationale;
  const history = Array.isArray(definitionData?.history) ? definitionData.history : [];
  return (
    assumptionSlugs.length > 0 ||
    !!initialRationale ||
    history.some((h) => h?.rationale)
  );
}

function StatusContent({ definitionData, projectName, onOpenWiki, onOpenEvidence }) {
  const assumptionSlugs = definitionData?.assumptionWikiSlugs || [];
  const initialRationale = definitionData?.initialRationale;
  const history = Array.isArray(definitionData?.history) ? definitionData.history : [];

  return (
    <>
      {assumptionSlugs.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
            <MenuBook sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
              Starting assumption
            </Typography>
          </Stack>
          <WikiLinkTree
            items={assumptionSlugs.map((slug) => ({
              key: slug,
              label: slug,
              title: `Open wiki page: ${slug}`,
            }))}
            onClick={(item) => onOpenWiki(item.key)}
          />
        </Box>
      )}
      {initialRationale && (
        <Box sx={{ mb: 2 }}>
          <RationaleCard
            rationale={initialRationale}
            projectName={projectName}
            variant="card"
            title="Initial rationale"
            onOpenDocument={makeDocOpener(onOpenWiki, onOpenEvidence)}
          />
        </Box>
      )}
      {history.some((h) => h?.rationale) && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
            <HistoryIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
              Human decisions
            </Typography>
          </Stack>
          <Stack spacing={1}>
            {history
              .map((entry, idx) => ({ entry, idx }))
              .filter(({ entry }) => entry?.rationale)
              .map(({ entry, idx }) => (
                <Paper key={idx} variant="outlined" sx={{ p: 1.25 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                    <Chip label={entry.event} size="small" sx={{ height: 18, fontSize: 10 }} />
                    <Typography variant="caption" color="text.secondary">
                      {entry.fromState} → {entry.toState}
                    </Typography>
                    {entry.decidedBy === 'human' && (
                      <Chip
                        label="human"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10, ml: 'auto', borderWidth: 2, '& .MuiChip-label': { mt: '2px', ml: '3px' } }}
                      />
                    )}
                  </Stack>
                  <RationaleCard
                    rationale={entry.rationale}
                    projectName={projectName}
                    variant="inline"
                    onOpenDocument={makeDocOpener(onOpenWiki, onOpenEvidence)}
                  />
                </Paper>
              ))}
          </Stack>
        </Box>
      )}
    </>
  );
}

// Route evidence-document paths into the workflow modal's right pane instead of
// falling through to the global eventBus (which opens behind the modal).
function makeDocOpener(onOpenWiki, onOpenEvidence) {
  if (!onOpenWiki && !onOpenEvidence) return undefined;
  return (docPath) => {
    if (!docPath) return false;
    const m = /^wiki\/topics\/(.+)\.md$/.exec(docPath);
    if (m && onOpenWiki) {
      onOpenWiki(m[1]);
      return true;
    }
    if (onOpenEvidence) {
      onOpenEvidence(docPath);
      return true;
    }
    return false;
  };
}

const DEFAULT_NODE_SIZE = { width: 210, height: 96 };

function layoutWithDagre(nodes, edges, nodeSize = {}) {
  const positions = new Map();
  if (nodes.length === 0) return positions;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 36,
    ranksep: 90,
    edgesep: 24,
    marginx: 16,
    marginy: 16,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const s = nodeSize[n.id] || DEFAULT_NODE_SIZE;
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  for (const n of nodes) {
    const dn = g.node(n.id);
    if (!dn) continue;
    positions.set(n.id, { x: dn.x - dn.width / 2, y: dn.y - dn.height / 2 });
  }
  return positions;
}
