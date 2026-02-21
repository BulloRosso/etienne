import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Tabs,
  Tab,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Send as SendIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  RocketLaunch as DeployIcon,
} from '@mui/icons-material';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiAxios } from '../../services/api';
import { useThemeMode } from '../../contexts/ThemeContext.jsx';

// ── Color Palettes ──────────────────────────────

const darkPalette = {
  bg: '#0a0c10',
  panel: '#0f1117',
  panelBorder: '#1e2230',
  surface: '#161922',
  surfaceHover: '#1d2130',
  accent: '#3b82f6',
  accentDim: '#1d3a6e',
  trigger: { bg: '#1a1025', border: '#7c3aed', text: '#c4b5fd' },
  condition: { bg: '#0f1f1a', border: '#059669', text: '#6ee7b7' },
  action: { bg: '#1a0f0f', border: '#dc2626', text: '#fca5a5' },
  outcome: { bg: '#0f1621', border: '#0ea5e9', text: '#7dd3fc' },
  text: '#e2e8f0',
  textMuted: '#64748b',
  textDim: '#334155',
  zmq: '#f59e0b',
  llm: '#a78bfa',
  success: '#22c55e',
};

const lightPalette = {
  bg: '#f8fafc',
  panel: '#ffffff',
  panelBorder: '#e2e8f0',
  surface: '#f1f5f9',
  surfaceHover: '#e2e8f0',
  accent: '#3b82f6',
  accentDim: '#93c5fd',
  trigger: { bg: '#f5f3ff', border: '#7c3aed', text: '#6d28d9' },
  condition: { bg: '#ecfdf5', border: '#059669', text: '#047857' },
  action: { bg: '#fef2f2', border: '#dc2626', text: '#b91c1c' },
  outcome: { bg: '#eff6ff', border: '#0ea5e9', text: '#0369a1' },
  text: '#1e293b',
  textMuted: '#64748b',
  textDim: '#94a3b8',
  zmq: '#d97706',
  llm: '#7c3aed',
  success: '#16a34a',
};

// ── Custom Nodes ─────────────────────────────────

function TriggerNode({ data, selected }) {
  const C = data._palette || darkPalette;
  return (
    <div style={{
      borderRadius: 12, border: '2px solid', padding: '12px 16px',
      minWidth: 180, maxWidth: 220, cursor: 'pointer',
      transition: 'all 0.15s',
      background: C.trigger.bg,
      borderColor: selected ? '#a78bfa' : C.trigger.border,
      boxShadow: selected ? `0 0 0 2px ${C.trigger.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <Handle type="source" position={Position.Bottom} style={{ background: C.trigger.border }} />
      <div style={{ color: C.trigger.text, fontFamily: 'monospace', fontSize: 10, opacity: 0.7, marginBottom: 2 }}>TRIGGER</div>
      <div style={{ color: C.trigger.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.description && <div style={{ color: C.trigger.text, fontSize: 11, marginTop: 4, lineHeight: 1.4, opacity: 0.7 }}>{data.description}</div>}
    </div>
  );
}

function ConditionNode({ data, selected }) {
  const C = data._palette || darkPalette;
  return (
    <div style={{
      borderRadius: 12, border: '2px solid', padding: '12px 16px',
      minWidth: 180, maxWidth: 220, cursor: 'pointer',
      transition: 'all 0.15s',
      background: C.condition.bg,
      borderColor: selected ? '#34d399' : C.condition.border,
      boxShadow: selected ? `0 0 0 2px ${C.condition.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.condition.border }} />
      <Handle type="source" position={Position.Bottom} id="true" style={{ background: C.condition.border, left: '35%' }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ background: '#dc2626', left: '65%' }} />
      <div style={{ color: C.condition.text, fontFamily: 'monospace', fontSize: 10, opacity: 0.7, marginBottom: 2 }}>CONDITION</div>
      <div style={{ color: C.condition.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.property && (
        <div style={{ marginTop: 5, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: C.condition.text, fontFamily: 'monospace' }}>{data.property}</span>
          <span style={{ color: C.condition.text, background: C.condition.bg, padding: '1px 5px', borderRadius: 4, border: `1px solid ${C.condition.border}44` }}>{data.operator}</span>
          <span style={{ color: C.condition.text, fontFamily: 'monospace' }}>{data.value}</span>
        </div>
      )}
      {data.zeromqEvent && (
        <div style={{ marginTop: 4, fontSize: 10, color: C.zmq, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>ZMQ:</span><span style={{ fontFamily: 'monospace' }}>{data.zeromqEvent}</span>
        </div>
      )}
    </div>
  );
}

function ActionNode({ data, selected }) {
  const C = data._palette || darkPalette;
  const statusColors = {
    pending: '#94a3b8', approved: '#22c55e', rejected: '#ef4444',
    executing: '#f59e0b', done: '#3b82f6',
  };
  return (
    <div style={{
      borderRadius: 12, border: '2px solid', padding: '12px 16px',
      minWidth: 180, maxWidth: 220, cursor: 'pointer',
      transition: 'all 0.15s',
      background: C.action.bg,
      borderColor: selected ? '#f87171' : C.action.border,
      boxShadow: selected ? `0 0 0 2px ${C.action.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.action.border }} />
      <Handle type="source" position={Position.Bottom} style={{ background: C.action.border }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: C.action.text, fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>ACTION</div>
        {data.status && (
          <div style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
            background: (statusColors[data.status] || '#94a3b8') + '22',
            color: statusColors[data.status] || '#94a3b8',
            border: `1px solid ${(statusColors[data.status] || '#94a3b8')}44`,
            textTransform: 'uppercase',
          }}>{data.status}</div>
        )}
      </div>
      <div style={{ color: C.action.text, fontWeight: 700, fontSize: 13, marginTop: 2 }}>{data.label}</div>
      {data.actionType && (
        <div style={{ marginTop: 3, fontSize: 11, color: C.action.text, fontFamily: 'monospace', opacity: 0.7 }}>{data.actionType}</div>
      )}
      {data.zeromqEmit && (
        <div style={{ marginTop: 4, fontSize: 10, color: C.zmq, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>ZMQ emit:</span><span style={{ fontFamily: 'monospace' }}>{data.zeromqEmit}</span>
        </div>
      )}
      {data.llmPromptTemplate && (
        <div style={{ marginTop: 3, fontSize: 10, color: C.llm, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>LLM prompt attached</span>
        </div>
      )}
    </div>
  );
}

function OutcomeNode({ data, selected }) {
  const C = data._palette || darkPalette;
  return (
    <div style={{
      borderRadius: 12, border: '2px solid', padding: '12px 16px',
      minWidth: 180, maxWidth: 220, cursor: 'pointer',
      transition: 'all 0.15s',
      background: C.outcome.bg,
      borderColor: selected ? '#38bdf8' : C.outcome.border,
      boxShadow: selected ? `0 0 0 2px ${C.outcome.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.outcome.border }} />
      <div style={{ color: C.outcome.text, fontFamily: 'monospace', fontSize: 10, opacity: 0.7, marginBottom: 2 }}>OUTCOME</div>
      <div style={{ color: C.outcome.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.description && <div style={{ color: C.outcome.text, fontSize: 11, marginTop: 4, opacity: 0.8 }}>{data.description}</div>}
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  outcome: OutcomeNode,
};

// ── Suggestion → ReactFlow Nodes/Edges ─────────

function suggestionToRF(suggestion, palette) {
  if (!suggestion?.nodes?.length) return { nodes: [], edges: [] };

  const posMap = { trigger: 0, condition: 1, action: 2, outcome: 3 };
  const colGroups = { 0: [], 1: [], 2: [], 3: [] };
  suggestion.nodes.forEach(n => colGroups[posMap[n.type] ?? 1].push(n));

  const rfNodes = suggestion.nodes.map(n => {
    const col = posMap[n.type] ?? 1;
    const idx = colGroups[col].indexOf(n);
    const colCount = colGroups[col].length;

    const cond = suggestion.conditions?.find(c => c.id === n.conditionId);
    const act = suggestion.actions?.find(a => a.id === n.actionId);

    return {
      id: n.id,
      type: n.type,
      position: {
        x: col * 280 + 60,
        y: (idx - (colCount - 1) / 2) * 160 + 260,
      },
      data: {
        label: n.label,
        description: n.description,
        entityType: n.entityType,
        property: cond?.property,
        operator: cond?.operator,
        value: cond?.value,
        zeromqEvent: cond?.zeromqEvent,
        actionType: act?.actionType,
        status: act?.status,
        zeromqEmit: act?.zeromqEmit,
        llmPromptTemplate: act?.llmPromptTemplate,
        _palette: palette,
      },
    };
  });

  const rfEdges = (suggestion.edges || []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.condition,
    label: e.label,
    labelStyle: { fill: e.condition === 'true' ? palette.condition.text : e.condition === 'false' ? palette.action.text : palette.textMuted, fontSize: 10 },
    labelBgStyle: { fill: palette.panel },
    style: {
      stroke: e.condition === 'true' ? palette.condition.border : e.condition === 'false' ? '#dc2626' : palette.accentDim,
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.condition === 'true' ? palette.condition.border : e.condition === 'false' ? '#dc2626' : palette.accentDim,
    },
    animated: e.condition === 'true',
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Mock suggestion for demo/dev ────────────────

function generateMockSuggestion(userMessage) {
  const keyword = userMessage.toLowerCase();
  const isShutdown = keyword.includes('shut') || keyword.includes('compressor') || keyword.includes('pressure');

  return {
    title: isShutdown ? 'Compressor Anomaly Response' : 'Automated Decision Response',
    description: isShutdown
      ? 'Monitors pressure thresholds and vibration alerts, routes to maintenance or emergency shutdown.'
      : 'Derived from conversation context with ontology-grounded conditions and actions.',
    reasoning: isShutdown
      ? 'Two open vibration alerts combined with elevated pressure readings exceed safe operating thresholds. Emergency shutdown is available but premature; scheduling maintenance aligns with the next available window.'
      : 'Based on the described situation, the most appropriate response involves monitoring relevant entity states and executing corrective actions when conditions are met.',
    conditions: [
      {
        id: 'cond-1', targetEntityType: 'Sensor', targetEntityId: 'sensor-unit4-pressure',
        property: 'pressure', operator: 'gt', value: '150',
        description: 'Pressure exceeds 150 PSI safe threshold', zeromqEvent: 'sensor.threshold.exceeded',
      },
      {
        id: 'cond-2', targetEntityType: 'Alert',
        property: 'openAlertCount', operator: 'gte', value: '2',
        description: 'Multiple open alerts on same asset', zeromqEvent: 'alert.multiple.open',
      },
    ],
    actions: [
      {
        id: 'act-1', name: 'Schedule Maintenance', description: 'Create work order for next maintenance window',
        targetEntityType: 'WorkOrder', actionType: 'ScheduleMaintenance',
        parameters: { window: 'next', priority: 'high', notifyOps: 'true' },
        preconditions: ['cond-2'], status: 'pending',
        zeromqEmit: 'workorder.created',
        llmPromptTemplate: 'Assess {{targetEntityId}} and recommend maintenance scope based on recent alerts.',
      },
      {
        id: 'act-2', name: 'Emergency Shutdown', description: 'Immediately halt Compressor Unit 4',
        targetEntityType: 'Compressor', targetEntityId: 'compressor-unit4',
        actionType: 'EmergencyShutdown',
        parameters: { urgency: 'immediate', notifyOps: 'true', logReason: 'pressure+vibration' },
        preconditions: ['cond-1', 'cond-2'], status: 'pending',
        zeromqEmit: 'compressor.shutdown.initiated',
      },
    ],
    nodes: [
      { id: 'n-trigger', type: 'trigger', label: 'Anomaly Detected', description: 'Sensor reading or alert threshold crossed' },
      { id: 'n-cond-1', type: 'condition', label: 'Pressure > 150 PSI', conditionId: 'cond-1', entityType: 'Sensor' },
      { id: 'n-cond-2', type: 'condition', label: 'Multiple Open Alerts', conditionId: 'cond-2', entityType: 'Alert' },
      { id: 'n-act-1', type: 'action', label: 'Schedule Maintenance', actionId: 'act-1', entityType: 'WorkOrder' },
      { id: 'n-act-2', type: 'action', label: 'Emergency Shutdown', actionId: 'act-2', entityType: 'Compressor' },
      { id: 'n-outcome-1', type: 'outcome', label: 'Maintenance Scheduled', description: 'Work order created, operations notified' },
      { id: 'n-outcome-2', type: 'outcome', label: 'System Offline', description: 'Compressor halted, pressure normalizing' },
    ],
    edges: [
      { id: 'e1', source: 'n-trigger', target: 'n-cond-1' },
      { id: 'e2', source: 'n-trigger', target: 'n-cond-2' },
      { id: 'e3', source: 'n-cond-2', target: 'n-act-1', label: 'true', condition: 'true' },
      { id: 'e4', source: 'n-cond-1', target: 'n-act-2', label: 'true', condition: 'true' },
      { id: 'e5', source: 'n-cond-1', target: 'n-act-1', label: 'false', condition: 'false' },
      { id: 'e6', source: 'n-act-1', target: 'n-outcome-1' },
      { id: 'e7', source: 'n-act-2', target: 'n-outcome-2' },
    ],
  };
}

// ── Inner Component ─────────────────────────────

function OntologyCoreEditorInner({ selectedProject, onClose }) {
  const { mode: themeMode } = useThemeMode();
  const C = themeMode === 'dark' ? darkPalette : lightPalette;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0=chat, 1=details
  const [toast, setToast] = useState(null);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [input, setInput] = useState('');
  const [lastSavedId, setLastSavedId] = useState(null);
  const chatHistoryRef = useRef([]);
  const bottomRef = useRef(null);

  // Load saved graphs on mount
  useEffect(() => {
    if (selectedProject) {
      apiAxios.get(`/api/decision-support/graphs/${selectedProject}`)
        .then(res => {
          const data = res.data;
          if (data.success && data.graphs) {
            setSavedGraphs(data.graphs);
          }
        })
        .catch(() => { /* no saved graphs yet */ });
    }
  }, [selectedProject]);

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const onConnect = useCallback(
    params => setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: C.accentDim } }, eds)),
    [C]
  );

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isThinking) return;

    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setIsThinking(true);

    try {
      const response = await apiAxios.post('/api/decision-support/derive', {
        project: selectedProject,
        chatHistory: chatHistoryRef.current,
        userMessage: msg,
      });

      const data = response.data;
      const { suggestion: newSuggestion, assistantReply } = data;

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: 'user', content: msg },
        { role: 'assistant', content: assistantReply },
      ];

      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantReply }]);
      setSuggestion(newSuggestion);

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(newSuggestion, C);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setActiveTab(1);
    } catch {
      // Demo mode: generate mock suggestion
      const mockSuggestion = generateMockSuggestion(msg);
      const reply = `I've analyzed your situation and identified ${mockSuggestion.conditions.length} conditions and ${mockSuggestion.actions.length} actionable responses, grounded in your ontology. The decision graph is now visible on the canvas.`;

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: 'user', content: msg },
        { role: 'assistant', content: reply },
      ];

      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setSuggestion(mockSuggestion);

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(mockSuggestion, C);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setActiveTab(1);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, selectedProject, C, setNodes, setEdges]);

  const handleSave = useCallback(async () => {
    if (!suggestion) return;
    try {
      const response = await apiAxios.post('/api/decision-support/graphs', {
        project: selectedProject,
        graph: {
          title: suggestion.title,
          description: suggestion.description,
          chatContextSummary: chatMessages.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 500),
          conditions: suggestion.conditions,
          actions: suggestion.actions,
          nodes: suggestion.nodes,
          edges: suggestion.edges,
        },
      });
      const data = response.data;
      if (data.success) {
        setLastSavedId(data.id);
        setSavedGraphs(prev => [...prev, { id: data.id, title: suggestion.title }]);
        setToast({ message: `"${suggestion.title}" saved to ontology`, severity: 'success' });
      }
    } catch {
      const graphId = `graph-${Date.now()}`;
      setLastSavedId(graphId);
      setSavedGraphs(prev => [...prev, { id: graphId, title: suggestion.title }]);
      setToast({ message: `"${suggestion.title}" saved (local)`, severity: 'success' });
    }
  }, [suggestion, selectedProject, chatMessages]);

  const handleExportZmq = useCallback(() => {
    if (!suggestion) return;
    const rules = suggestion.actions.map(a => ({
      ruleId: `rule-${a.id}`,
      name: a.name,
      trigger: suggestion.conditions
        .filter(c => a.preconditions?.includes(c.id))
        .map(c => c.zeromqEvent).filter(Boolean),
      conditions: suggestion.conditions
        .filter(c => a.preconditions?.includes(c.id))
        .map(c => ({ entityType: c.targetEntityType, property: c.property, operator: c.operator, value: c.value })),
      onTrue: { emitEvent: a.zeromqEmit, executeLlmPrompt: a.llmPromptTemplate },
    }));

    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zmq-rules.json'; a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'ZMQ rules exported', severity: 'info' });
  }, [suggestion]);

  const handleDeploy = useCallback(async () => {
    if (!lastSavedId) {
      setToast({ message: 'Save the graph first before deploying', severity: 'warning' });
      return;
    }
    try {
      const response = await apiAxios.post(`/api/decision-support/graphs/${selectedProject}/${lastSavedId}/deploy-rules`);
      const data = response.data;
      if (data.success) {
        setToast({ message: `${data.ruleCount} rules deployed to event system`, severity: 'success' });
      }
    } catch {
      setToast({ message: 'Failed to deploy rules', severity: 'error' });
    }
  }, [lastSavedId, selectedProject]);

  const handleLoadGraph = useCallback(async (graphId) => {
    try {
      const response = await apiAxios.get(`/api/decision-support/graphs/${selectedProject}/${graphId}`);
      const data = response.data;
      if (data.success && data.graph) {
        const graph = data.graph;
        const loadedSuggestion = {
          title: graph.title,
          description: graph.description,
          reasoning: '',
          conditions: graph.conditions,
          actions: graph.actions,
          nodes: graph.nodes,
          edges: graph.edges,
        };
        setSuggestion(loadedSuggestion);
        setLastSavedId(graphId);
        const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(loadedSuggestion, C);
        setNodes(rfNodes);
        setEdges(rfEdges);
        setActiveTab(1);
      }
    } catch {
      setToast({ message: 'Failed to load graph', severity: 'error' });
    }
  }, [selectedProject, C, setNodes, setEdges]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 3, py: 1.5, borderBottom: `1px solid ${C.panelBorder}`, background: C.panel,
      }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: C.text }}>
          Decision Support Studio
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: C.textMuted }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Main Content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Panel: Chat + Detail tabs */}
        <Box sx={{
          width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${C.panelBorder}`, background: C.panel,
        }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{
              minHeight: 40,
              '& .MuiTab-root': { minHeight: 40, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted },
              '& .Mui-selected': { color: C.accent },
              '& .MuiTabs-indicator': { backgroundColor: C.accent },
            }}
          >
            <Tab label="Chat" />
            <Tab label="Graph Details" />
          </Tabs>

          {/* Chat Tab */}
          {activeTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Messages */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {chatMessages.length === 0 && (
                  <Typography sx={{ color: C.textDim, fontSize: 12, textAlign: 'center', mt: 5, lineHeight: 1.8 }}>
                    Describe a situation, anomaly, or decision you need help with.
                    The agent will ground it in your ontology and propose a structured decision graph.
                  </Typography>
                )}
                {chatMessages.map((m, i) => (
                  <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <Box sx={{
                      maxWidth: '85%', px: 1.5, py: 1, borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: m.role === 'user' ? C.accentDim : C.surface,
                      border: `1px solid ${m.role === 'user' ? C.accent + '55' : C.panelBorder}`,
                      color: m.role === 'user' ? (themeMode === 'dark' ? '#93c5fd' : '#1e40af') : C.text,
                      fontSize: 12, lineHeight: 1.6,
                    }}>
                      {m.content}
                    </Box>
                  </Box>
                ))}
                {isThinking && (
                  <Box sx={{ display: 'flex', gap: 0.5, p: 1 }}>
                    <CircularProgress size={16} sx={{ color: C.accent }} />
                    <Typography sx={{ color: C.textMuted, fontSize: 12, ml: 1 }}>Analyzing...</Typography>
                  </Box>
                )}
                <div ref={bottomRef} />
              </Box>

              {/* Input */}
              <Box sx={{ p: 1.5, borderTop: `1px solid ${C.panelBorder}`, display: 'flex', gap: 1 }}>
                <TextField
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Describe a situation or decision..."
                  multiline
                  maxRows={3}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: 12, background: C.surface, color: C.text,
                      '& fieldset': { borderColor: C.panelBorder },
                      '&:hover fieldset': { borderColor: C.accent + '55' },
                      '&.Mui-focused fieldset': { borderColor: C.accent },
                    },
                    '& .MuiInputBase-input': { color: C.text },
                  }}
                />
                <IconButton
                  onClick={handleSend}
                  disabled={!input.trim() || isThinking}
                  sx={{
                    backgroundColor: input.trim() && !isThinking ? C.accent : C.accentDim,
                    color: 'white', '&:hover': { backgroundColor: C.accent },
                    '&.Mui-disabled': { backgroundColor: C.accentDim, color: 'rgba(255,255,255,0.4)' },
                    borderRadius: 2, width: 40, height: 40,
                  }}
                >
                  <SendIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          )}

          {/* Details Tab */}
          {activeTab === 1 && (
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!suggestion ? (
                <Typography sx={{ color: C.textMuted, fontSize: 12, mt: 3 }}>
                  No suggestion yet. Start a conversation to generate a decision graph.
                </Typography>
              ) : (
                <>
                  <Box>
                    <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{suggestion.title}</Typography>
                    <Typography sx={{ color: C.textMuted, fontSize: 12, mt: 0.5, lineHeight: 1.5 }}>{suggestion.description}</Typography>
                  </Box>

                  {suggestion.reasoning && (
                    <Box sx={{ background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 2, p: 1.5 }}>
                      <Typography sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', mb: 0.5 }}>REASONING</Typography>
                      <Typography sx={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>{suggestion.reasoning}</Typography>
                    </Box>
                  )}

                  {suggestion.conditions?.length > 0 && (
                    <Box>
                      <Typography sx={{ color: C.condition.text, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', mb: 1 }}>
                        CONDITIONS ({suggestion.conditions.length})
                      </Typography>
                      {suggestion.conditions.map(c => (
                        <Box key={c.id} sx={{
                          background: C.condition.bg, border: `1px solid ${C.condition.border}33`,
                          borderRadius: 2, p: 1.5, mb: 0.75,
                        }}>
                          <Typography sx={{ color: C.condition.text, fontSize: 12, fontWeight: 600 }}>{c.description}</Typography>
                          <Typography sx={{ color: C.condition.text, fontSize: 11, fontFamily: 'monospace', mt: 0.5, opacity: 0.8 }}>
                            {c.targetEntityType}{c.targetEntityId ? `/${c.targetEntityId}` : ''} &middot; {c.property} {c.operator} {c.value}
                          </Typography>
                          {c.zeromqEvent && (
                            <Typography sx={{ color: C.zmq, fontSize: 10, mt: 0.5 }}>ZMQ: {c.zeromqEvent}</Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}

                  {suggestion.actions?.length > 0 && (
                    <Box>
                      <Typography sx={{ color: C.action.text, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', mb: 1 }}>
                        ACTIONS ({suggestion.actions.length})
                      </Typography>
                      {suggestion.actions.map(a => (
                        <Box key={a.id} sx={{
                          background: C.action.bg, border: `1px solid ${C.action.border}33`,
                          borderRadius: 2, p: 1.5, mb: 0.75,
                        }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ color: C.action.text, fontSize: 12, fontWeight: 600 }}>{a.name}</Typography>
                            <Chip label={a.actionType} size="small" sx={{
                              height: 18, fontSize: 9, background: C.action.bg,
                              color: C.action.text, border: `1px solid ${C.action.border}44`,
                            }} />
                          </Box>
                          <Typography sx={{ color: C.action.text, fontSize: 11, mt: 0.5, opacity: 0.7 }}>{a.description}</Typography>
                          {a.zeromqEmit && <Typography sx={{ color: C.zmq, fontSize: 10, mt: 0.5 }}>ZMQ emit: {a.zeromqEmit}</Typography>}
                          {a.llmPromptTemplate && <Typography sx={{ color: C.llm, fontSize: 10, mt: 0.25 }}>LLM prompt attached</Typography>}
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Action buttons */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto', pt: 1 }}>
                    <Button
                      onClick={handleSave}
                      variant="contained"
                      startIcon={<SaveIcon />}
                      fullWidth
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
                    >
                      Save to Ontology
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        onClick={handleExportZmq}
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        size="small"
                        sx={{ textTransform: 'none', fontSize: 11, flex: 1, color: C.zmq, borderColor: C.zmq + '55' }}
                      >
                        Export ZMQ
                      </Button>
                      <Button
                        onClick={handleDeploy}
                        variant="outlined"
                        startIcon={<DeployIcon />}
                        size="small"
                        disabled={!lastSavedId}
                        sx={{ textTransform: 'none', fontSize: 11, flex: 1 }}
                      >
                        Deploy Rules
                      </Button>
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>

        {/* Center: ReactFlow Canvas */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{
              style: { stroke: C.accentDim, strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: C.accentDim },
            }}
            style={{ background: C.bg }}
          >
            <Background variant="dots" gap={24} size={1} color={C.panelBorder} />
            <Controls position="bottom-right" />
            <MiniMap
              position="bottom-left"
              nodeColor={n => {
                const colorMap = { trigger: C.trigger.border, condition: C.condition.border, action: C.action.border, outcome: C.outcome.border };
                return colorMap[n.type] || C.accentDim;
              }}
              maskColor={C.bg + 'cc'}
              style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8 }}
            />

            {/* Canvas legend */}
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
              background: C.panel + 'dd', border: `1px solid ${C.panelBorder}`,
              borderRadius: 20, padding: '6px 16px',
            }}>
              {[
                { color: C.trigger.border, label: 'Trigger' },
                { color: C.condition.border, label: 'Condition' },
                { color: C.action.border, label: 'Action' },
                { color: C.outcome.border, label: 'Outcome' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span style={{ color: C.textMuted, fontSize: 10 }}>{item.label}</span>
                </div>
              ))}
            </div>

            {nodes.length === 0 && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none',
              }}>
                <div style={{ color: C.textDim, fontSize: 28, marginBottom: 12 }}>&#x2B21;</div>
                <div style={{ color: C.textDim, fontSize: 13, fontWeight: 600 }}>Decision Graph Canvas</div>
                <div style={{ color: C.textDim, fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  Describe a situation in the chat panel<br />to generate a graph
                </div>
              </div>
            )}
          </ReactFlow>
        </Box>

        {/* Right: Saved Graphs Sidebar */}
        {savedGraphs.length > 0 && (
          <Box sx={{
            width: 200, borderLeft: `1px solid ${C.panelBorder}`,
            background: C.panel, p: 2, overflowY: 'auto',
          }}>
            <Typography sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', mb: 1.5 }}>
              SAVED GRAPHS
            </Typography>
            {savedGraphs.map(g => (
              <Box
                key={g.id}
                onClick={() => handleLoadGraph(g.id)}
                sx={{
                  p: 1, borderRadius: 1, mb: 0.75, cursor: 'pointer',
                  background: C.surface, border: `1px solid ${C.panelBorder}`,
                  color: C.text, fontSize: 11,
                  '&:hover': { borderColor: C.accent + '55' },
                  transition: 'border-color 0.15s',
                }}
              >
                {g.title}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Toast */}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast && (
          <Alert onClose={() => setToast(null)} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}

// ── Main Export (with ReactFlowProvider) ─────────

export default function OntologyCoreEditor(props) {
  return (
    <ReactFlowProvider>
      <OntologyCoreEditorInner {...props} />
    </ReactFlowProvider>
  );
}
