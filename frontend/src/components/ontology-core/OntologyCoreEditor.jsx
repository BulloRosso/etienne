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
  Tooltip,
  Divider,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  RocketLaunch as DeployIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  AccountTree as OntologyIcon,
  Sensors as SensorIcon,
  PrecisionManufacturing as CompressorIcon,
  LinearScale as PipelineIcon,
  Warning as AlertIcon,
  Build as WorkOrderIcon,
  Person as PersonIcon,
  Business as CompanyIcon,
  Inventory as ProductIcon,
  Category as DefaultEntityIcon,
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
import { GoArrowUp } from 'react-icons/go';
import { apiAxios } from '../../services/api';
import { useThemeMode } from '../../contexts/ThemeContext.jsx';
import TestScenarioModal from './TestScenarioModal.jsx';

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
      boxShadow: data._testHighlight
        ? `0 0 0 3px ${data._testHighlight}, 0 0 12px ${data._testHighlight}66`
        : selected ? `0 0 0 2px ${C.trigger.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
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
      boxShadow: data._testHighlight
        ? `0 0 0 3px ${data._testHighlight}, 0 0 12px ${data._testHighlight}66`
        : selected ? `0 0 0 2px ${C.condition.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
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
    NOT_ACTIVATED: '#64748b', PENDING: '#f59e0b', DONE: '#22c55e',
  };
  return (
    <div style={{
      borderRadius: 12, border: '2px solid', padding: '12px 16px',
      minWidth: 180, maxWidth: 220, cursor: 'pointer',
      transition: 'all 0.15s',
      background: C.action.bg,
      borderColor: selected ? '#f87171' : C.action.border,
      boxShadow: data._testHighlight
        ? `0 0 0 3px ${data._testHighlight}, 0 0 12px ${data._testHighlight}66`
        : selected ? `0 0 0 2px ${C.action.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
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
      {(data.llmPromptTemplate || data.httpConfig) && (
        <div
          onClick={(e) => { e.stopPropagation(); data.onConfigClick?.(data); }}
          style={{
            marginTop: 3, fontSize: 10,
            color: data.httpConfig ? C.zmq : C.llm,
            display: 'flex', alignItems: 'center', gap: 3,
            cursor: 'pointer',
            padding: '2px 4px', borderRadius: 4,
            background: data.httpConfig ? C.zmq + '11' : C.llm + '11',
          }}
        >
          <span>{data.httpConfig ? `HTTP ${data.httpConfig.method}` : 'LLM prompt attached'}</span>
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
      boxShadow: data._testHighlight
        ? `0 0 0 3px ${data._testHighlight}, 0 0 12px ${data._testHighlight}66`
        : selected ? `0 0 0 2px ${C.outcome.border}44` : '0 2px 8px rgba(0,0,0,0.2)',
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

// ── Ontology Graph Custom Nodes ─────────────────

function EntityTypeNode({ data, selected }) {
  const C = data._palette || darkPalette;
  const Icon = entityTypeIcons[data.entityType] || DefaultEntityIcon;
  const color = entityTypeColors[data.entityType] || C.accent;
  return (
    <div style={{
      borderRadius: 14, border: '2px solid', padding: '14px 18px',
      minWidth: 160, cursor: 'pointer', transition: 'all 0.15s',
      background: C.panel, borderColor: selected ? color : color + '88',
      boxShadow: selected ? `0 0 0 2px ${color}44` : '0 2px 10px rgba(0,0,0,0.15)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon style={{ fontSize: 18, color }} />
        <span style={{ color, fontWeight: 800, fontSize: 13, letterSpacing: '0.04em' }}>{data.entityType}</span>
      </div>
      <div style={{ color: C.textMuted, fontSize: 11 }}>{data.count} instance{data.count !== 1 ? 's' : ''}</div>
      {data.count > 0 && (
        <div
          onClick={(e) => { e.stopPropagation(); data.onExpand?.(); }}
          style={{
            marginTop: 8, fontSize: 10, color: C.accent, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            background: C.accent + '11', border: `1px solid ${C.accent}33`,
          }}
        >
          {data.expanded ? '▾ Collapse' : '▸ Show instances'}
        </div>
      )}
    </div>
  );
}

function EntityInstanceNode({ data }) {
  const C = data._palette || darkPalette;
  const color = entityTypeColors[data.entityType] || C.accent;
  return (
    <div style={{
      borderRadius: 10, border: `1.5px solid ${color}55`, padding: '8px 12px',
      minWidth: 140, maxWidth: 200, cursor: 'pointer', transition: 'all 0.15s',
      background: C.surface, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 6, height: 6 }} />
      <div style={{ color: C.text, fontWeight: 600, fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {Object.entries(data.properties).slice(0, 2).map(([k, v]) => (
            <span key={k} style={{
              color: C.textMuted, fontSize: 9, fontFamily: 'monospace',
              background: C.bg, padding: '1px 4px', borderRadius: 3, border: `1px solid ${C.panelBorder}`,
            }}>
              {k}={String(v).length > 15 ? String(v).slice(0, 15) + '…' : v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionGraphNode({ data }) {
  const C = data._palette || darkPalette;
  return (
    <div style={{
      borderRadius: 10, border: `1.5px dashed ${C.accent}88`, padding: '8px 14px',
      minWidth: 120, maxWidth: 180, cursor: 'pointer', transition: 'all 0.15s',
      background: C.accent + '0a', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.accent, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: C.accent, width: 6, height: 6 }} />
      <div style={{ color: C.accent, fontFamily: 'monospace', fontSize: 9, opacity: 0.7, marginBottom: 2 }}>DECISION GRAPH</div>
      <div style={{ color: C.text, fontWeight: 600, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
    </div>
  );
}

const ontologyNodeTypes = {
  entityType: EntityTypeNode,
  entityInstance: EntityInstanceNode,
  decisionGraph: DecisionGraphNode,
};

// ── Suggestion → ReactFlow Nodes/Edges ─────────

function suggestionToRF(suggestion, palette, onConfigClick) {
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
        actionId: act?.id,
        status: act?.status,
        zeromqEmit: act?.zeromqEmit,
        llmPromptTemplate: act?.llmPromptTemplate,
        httpConfig: act?.httpConfig,
        onConfigClick: onConfigClick,
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

// ── Entity type icon mapping ────────────────────

const entityTypeIcons = {
  Sensor: SensorIcon,
  Compressor: CompressorIcon,
  Pipeline: PipelineIcon,
  Alert: AlertIcon,
  WorkOrder: WorkOrderIcon,
  Person: PersonIcon,
  Company: CompanyIcon,
  Product: ProductIcon,
};

function getEntityIcon(type) {
  const Icon = entityTypeIcons[type] || DefaultEntityIcon;
  return Icon;
}

const entityTypeColors = {
  Sensor: '#059669',
  Compressor: '#7c3aed',
  Pipeline: '#0ea5e9',
  Alert: '#f59e0b',
  WorkOrder: '#dc2626',
  Person: '#3b82f6',
  Company: '#8b5cf6',
  Product: '#14b8a6',
};

// ── Action Config Form (inside dialog) ──────────

function ActionConfigForm({ actionData, palette, onSave, onCancel }) {
  const C = palette;
  const [mode, setMode] = useState(actionData?.httpConfig ? 'http' : 'llm');
  const [llmPrompt, setLlmPrompt] = useState(actionData?.llmPromptTemplate || '');
  const [httpMethod, setHttpMethod] = useState(actionData?.httpConfig?.method || 'POST');
  const [httpUrl, setHttpUrl] = useState(actionData?.httpConfig?.url || '');

  useEffect(() => {
    if (actionData) {
      setMode(actionData.httpConfig ? 'http' : 'llm');
      setLlmPrompt(actionData.llmPromptTemplate || '');
      setHttpMethod(actionData.httpConfig?.method || 'POST');
      setHttpUrl(actionData.httpConfig?.url || '');
    }
  }, [actionData]);

  const handleSave = () => {
    onSave({
      llmPromptTemplate: mode === 'llm' ? (llmPrompt || undefined) : undefined,
      httpConfig: mode === 'http' && httpUrl ? { method: httpMethod, url: httpUrl } : undefined,
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
      <Typography sx={{ color: C.textMuted, fontSize: 11, mb: 0.5 }}>
        Configure how this action is executed during a test scenario.
      </Typography>
      <Tabs
        value={mode === 'llm' ? 0 : 1}
        onChange={(_, v) => setMode(v === 0 ? 'llm' : 'http')}
        sx={{
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted },
          '& .Mui-selected': { color: C.accent },
          '& .MuiTabs-indicator': { backgroundColor: C.accent },
        }}
      >
        <Tab label="LLM Prompt" />
        <Tab label="HTTP Endpoint" />
      </Tabs>

      {mode === 'llm' && (
        <TextField
          value={llmPrompt}
          onChange={e => setLlmPrompt(e.target.value)}
          multiline
          minRows={4}
          maxRows={8}
          fullWidth
          placeholder="Enter LLM prompt template... Use {{targetEntityId}} for interpolation."
          sx={{
            '& .MuiInputBase-input': { fontSize: 11, color: C.text, fontFamily: 'monospace' },
            '& .MuiOutlinedInput-root fieldset': { borderColor: C.panelBorder },
            '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.accent + '55' },
            '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.accent },
          }}
        />
      )}

      {mode === 'http' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            select
            label="Method"
            value={httpMethod}
            onChange={e => setHttpMethod(e.target.value)}
            size="small"
            SelectProps={{ native: true }}
            sx={{
              width: 140,
              '& .MuiInputBase-input': { fontSize: 11, color: C.text },
              '& .MuiInputLabel-root': { fontSize: 11 },
              '& .MuiOutlinedInput-root fieldset': { borderColor: C.panelBorder },
            }}
          >
            {['POST', 'PUT', 'PATCH', 'DELETE', 'GET'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </TextField>
          <TextField
            value={httpUrl}
            onChange={e => setHttpUrl(e.target.value)}
            placeholder="https://api.example.com/action"
            size="small"
            fullWidth
            label="URL"
            sx={{
              '& .MuiInputBase-input': { fontSize: 11, color: C.text, fontFamily: 'monospace' },
              '& .MuiInputLabel-root': { fontSize: 11 },
              '& .MuiOutlinedInput-root fieldset': { borderColor: C.panelBorder },
              '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.accent + '55' },
              '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.accent },
            }}
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
        <Button onClick={onCancel} sx={{ textTransform: 'none', fontSize: 12, color: C.textMuted }}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" sx={{
          textTransform: 'none', fontSize: 12,
          background: C.accent, '&:hover': { background: C.accent + 'dd' },
        }}>
          Save
        </Button>
      </Box>
    </Box>
  );
}

function OntologyCoreEditorInner({ selectedProject, onClose }) {
  const { mode: themeMode } = useThemeMode();
  const C = themeMode === 'dark' ? darkPalette : lightPalette;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0=chat, 1=details, 2=ontology
  const [toast, setToast] = useState(null);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [input, setInput] = useState('');
  const [lastSavedId, setLastSavedId] = useState(null);
  const [ontologyData, setOntologyData] = useState(null);
  const [ontologyLoading, setOntologyLoading] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [entityForm, setEntityForm] = useState({ id: '', type: 'Sensor', properties: '' });
  const [entityCreating, setEntityCreating] = useState(false);
  const [centerTab, setCenterTab] = useState(0); // 0=scenario graph, 1=ontology graph
  const [ontGraphNodes, setOntGraphNodes, onOntGraphNodesChange] = useNodesState([]);
  const [ontGraphEdges, setOntGraphEdges, onOntGraphEdgesChange] = useEdgesState([]);
  const [ontGraphLoading, setOntGraphLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState(new Set());
  const ontGraphDataRef = useRef(null);
  const chatHistoryRef = useRef([]);
  const bottomRef = useRef(null);

  // Test scenario modal state
  const [testModalOpen, setTestModalOpen] = useState(false);

  // Action config modal state
  const [actionConfigOpen, setActionConfigOpen] = useState(false);
  const [actionConfigData, setActionConfigData] = useState(null);

  // Entity detail modal state
  const [entityDetailOpen, setEntityDetailOpen] = useState(false);
  const [entityDetailData, setEntityDetailData] = useState(null);
  const [entityDetailForm, setEntityDetailForm] = useState({ id: '', type: '', properties: '' });
  const [entityDetailSaving, setEntityDetailSaving] = useState(false);

  // Load saved graphs from backend
  const loadSavedGraphs = useCallback(() => {
    if (!selectedProject) return;
    apiAxios.get(`/api/decision-support/graphs/${selectedProject}`)
      .then(res => {
        const data = res.data;
        if (data.success && data.graphs) {
          setSavedGraphs(data.graphs);
        }
      })
      .catch(() => { /* no saved graphs yet */ });
  }, [selectedProject]);

  // Load saved graphs on mount
  useEffect(() => {
    loadSavedGraphs();
  }, [loadSavedGraphs]);

  // Load ontology entities with graph links
  const loadOntologyEntities = useCallback(() => {
    if (!selectedProject) return;
    setOntologyLoading(true);
    apiAxios.get(`/api/decision-support/ontology-entities/${selectedProject}`)
      .then(res => {
        const data = res.data;
        if (data.success) {
          setOntologyData({
            entities: data.entities || [],
            missingEntities: data.missingEntities || [],
            graphs: data.graphs || [],
          });
        }
      })
      .catch(() => { setOntologyData(null); })
      .finally(() => setOntologyLoading(false));
  }, [selectedProject]);

  // Load ontology when switching to ontology tab
  useEffect(() => {
    if (activeTab === 2) {
      loadOntologyEntities();
    }
  }, [activeTab, loadOntologyEntities]);

  // Create ontology entity
  const handleCreateEntity = useCallback(async (id, type, propertiesStr) => {
    if (!selectedProject || !id || !type) return;
    setEntityCreating(true);
    try {
      // Parse properties from "key=value" lines
      const properties = {};
      if (propertiesStr) {
        propertiesStr.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            properties[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
          }
        });
      }
      await apiAxios.post(`/api/decision-support/ontology-entities/${selectedProject}`, { id, type, properties });
      setToast({ severity: 'success', message: `Entity "${id}" created` });
      setShowEntityForm(false);
      setEntityForm({ id: '', type: 'Sensor', properties: '' });
      loadOntologyEntities();
    } catch (err) {
      setToast({ severity: 'error', message: `Failed to create entity: ${err.message}` });
    } finally {
      setEntityCreating(false);
    }
  }, [selectedProject, loadOntologyEntities]);

  // Pre-fill entity form from a missing entity reference
  const handleCreateMissing = useCallback((missingEnt) => {
    setEntityForm({ id: missingEnt.id, type: missingEnt.type, properties: '' });
    setShowEntityForm(true);
  }, []);

  // ── Ontology Graph: data loading & layout ─────

  const buildOntologyGraphLayout = useCallback((data, expanded) => {
    const C2 = themeMode === 'dark' ? darkPalette : lightPalette;
    const rfNodes = [];
    const rfEdges = [];

    // Layer Y positions: Decision Graphs (top) → Entity Types (middle) → Instances (bottom)
    const hasGraphs = data.graphs.length > 0;
    const graphY = 60;
    const typeY = hasGraphs ? 240 : 60;
    const instanceY = typeY + 180;

    // ── Top layer: Decision Graph nodes ──
    if (hasGraphs) {
      const gSpacing = 200;
      const gStartX = -(data.graphs.length - 1) * gSpacing / 2 + 400;

      data.graphs.forEach((g, gIdx) => {
        const gNodeId = `graph-${g.id}`;
        rfNodes.push({
          id: gNodeId,
          type: 'decisionGraph',
          position: { x: gStartX + gIdx * gSpacing, y: graphY },
          data: { label: g.title, _palette: C2 },
        });
      });
    }

    // ── Middle layer: Entity Type nodes ──
    const typeCount = data.typeNodes.length;
    const typeSpacing = 220;
    const typeStartX = -(typeCount - 1) * typeSpacing / 2 + 400;

    data.typeNodes.forEach((tn, idx) => {
      const typeId = `type-${tn.type}`;
      const isExpanded = expanded.has(tn.type);
      rfNodes.push({
        id: typeId,
        type: 'entityType',
        position: { x: typeStartX + idx * typeSpacing, y: typeY },
        data: {
          entityType: tn.type,
          count: tn.count,
          expanded: isExpanded,
          _palette: C2,
          onExpand: () => {
            setExpandedTypes(prev => {
              const next = new Set(prev);
              if (next.has(tn.type)) next.delete(tn.type); else next.add(tn.type);
              return next;
            });
          },
        },
      });

      // ── Bottom layer: Instance nodes in a column with 30px left indent ──
      if (isExpanded) {
        const instRowHeight = 60;
        const instX = typeStartX + idx * typeSpacing + 30;
        tn.instances.forEach((inst, iIdx) => {
          const instId = `inst-${inst.id}`;
          rfNodes.push({
            id: instId,
            type: 'entityInstance',
            position: { x: instX, y: instanceY + iIdx * instRowHeight },
            data: {
              label: inst.id,
              entityType: tn.type,
              properties: inst.properties,
              _palette: C2,
            },
          });
          rfEdges.push({
            id: `e-${typeId}-${instId}`,
            source: typeId,
            target: instId,
            style: { stroke: (entityTypeColors[tn.type] || C2.accent) + '66', strokeWidth: 1.5, strokeDasharray: '4 3' },
            markerEnd: { type: MarkerType.ArrowClosed, color: (entityTypeColors[tn.type] || C2.accent) + '66' },
          });
        });
      }
    });

    // ── Edges: Decision Graphs → Entity Types / Instances ──
    for (const link of data.graphLinks) {
      const gNodeId = `graph-${link.graphId}`;
      // Connect to instance if that type is expanded, else to the type node
      const typeExpanded = expanded.has(link.entityType);
      const targetId = typeExpanded ? `inst-${link.entityId}` : `type-${link.entityType}`;
      const edgeColor = link.role === 'condition' ? C2.condition.border : C2.action.border;
      const edgeId = `e-${gNodeId}-${targetId}-${link.role}-${link.entityId}`;

      if (!rfEdges.find(e => e.id === edgeId)) {
        rfEdges.push({
          id: edgeId,
          source: gNodeId,
          target: targetId,
          label: link.role,
          style: { stroke: edgeColor + '88', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor + '88' },
          labelStyle: { fontSize: 9, fill: edgeColor },
          labelBgStyle: { fill: C2.panel, fillOpacity: 0.9 },
        });
      }
    }

    // ── Edges: Inter-instance relationships ──
    for (const rel of data.relationships) {
      const sourceId = rfNodes.find(n => n.id === `inst-${rel.source}`) ? `inst-${rel.source}` : null;
      const targetId = rfNodes.find(n => n.id === `inst-${rel.target}`) ? `inst-${rel.target}` : null;
      if (sourceId && targetId) {
        rfEdges.push({
          id: `e-rel-${rel.source}-${rel.predicate}-${rel.target}`,
          source: sourceId,
          target: targetId,
          label: rel.predicate,
          style: { stroke: C2.textMuted + '66', strokeWidth: 1, strokeDasharray: '6 3' },
          labelStyle: { fontSize: 8, fill: C2.textMuted },
          labelBgStyle: { fill: C2.panel, fillOpacity: 0.9 },
        });
      }
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [themeMode]);

  const loadOntologyGraph = useCallback(() => {
    if (!selectedProject) return;
    setOntGraphLoading(true);
    apiAxios.get(`/api/decision-support/ontology-graph/${selectedProject}`)
      .then(res => {
        if (res.data.success) {
          ontGraphDataRef.current = res.data;
          const { nodes: n, edges: e } = buildOntologyGraphLayout(res.data, expandedTypes);
          setOntGraphNodes(n);
          setOntGraphEdges(e);
        }
      })
      .catch(() => { setToast({ severity: 'error', message: 'Failed to load ontology graph' }); })
      .finally(() => setOntGraphLoading(false));
  }, [selectedProject, expandedTypes, buildOntologyGraphLayout, setOntGraphNodes, setOntGraphEdges]);

  // Re-layout when expandedTypes changes
  useEffect(() => {
    if (ontGraphDataRef.current && centerTab === 1) {
      const { nodes: n, edges: e } = buildOntologyGraphLayout(ontGraphDataRef.current, expandedTypes);
      setOntGraphNodes(n);
      setOntGraphEdges(e);
    }
  }, [expandedTypes, centerTab, buildOntologyGraphLayout, setOntGraphNodes, setOntGraphEdges]);

  // Load ontology graph when switching to ontology graph tab
  useEffect(() => {
    if (centerTab === 1) {
      loadOntologyGraph();
    }
  }, [centerTab, loadOntologyGraph]);

  // Handle clicking an entity instance node in the ontology graph
  const handleOntologyNodeClick = useCallback((event, node) => {
    if (node.type !== 'entityInstance') return;
    const { label, entityType, properties } = node.data;
    const propsStr = properties
      ? Object.entries(properties).map(([k, v]) => `${k}=${v}`).join('\n')
      : '';
    setEntityDetailData({ id: label, type: entityType, properties: properties || {} });
    setEntityDetailForm({ id: label, type: entityType, properties: propsStr });
    setEntityDetailOpen(true);
  }, []);

  // Update an existing entity
  const handleUpdateEntity = useCallback(async () => {
    if (!selectedProject || !entityDetailData) return;
    setEntityDetailSaving(true);
    try {
      const properties = {};
      if (entityDetailForm.properties) {
        entityDetailForm.properties.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            properties[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
          }
        });
      }
      const originalId = entityDetailData.id;
      await apiAxios.put(
        `/api/decision-support/ontology-entities/${selectedProject}/${encodeURIComponent(originalId)}`,
        { id: entityDetailForm.id, type: entityDetailForm.type, properties }
      );
      setToast({ severity: 'success', message: `Entity "${entityDetailForm.id}" updated` });
      setEntityDetailOpen(false);
      setEntityDetailData(null);
      loadOntologyEntities();
      loadOntologyGraph();
    } catch (err) {
      setToast({ severity: 'error', message: `Failed to update entity: ${err.message}` });
    } finally {
      setEntityDetailSaving(false);
    }
  }, [selectedProject, entityDetailData, entityDetailForm, loadOntologyEntities, loadOntologyGraph]);

  // Delete an entity
  const handleDeleteEntity = useCallback(async () => {
    if (!selectedProject || !entityDetailData) return;
    setEntityDetailSaving(true);
    try {
      const originalId = entityDetailData.id;
      await apiAxios.delete(
        `/api/decision-support/ontology-entities/${selectedProject}/${encodeURIComponent(originalId)}`
      );
      setToast({ severity: 'success', message: `Entity "${originalId}" deleted` });
      setEntityDetailOpen(false);
      setEntityDetailData(null);
      loadOntologyEntities();
      loadOntologyGraph();
    } catch (err) {
      setToast({ severity: 'error', message: `Failed to delete entity: ${err.message}` });
    } finally {
      setEntityDetailSaving(false);
    }
  }, [selectedProject, entityDetailData, loadOntologyEntities, loadOntologyGraph]);

  // Handle action config click from ActionNode
  const handleActionConfigClick = useCallback((nodeData) => {
    const action = suggestion?.actions?.find(a => a.id === nodeData.actionId);
    if (action) {
      setActionConfigData(action);
      setActionConfigOpen(true);
    }
  }, [suggestion]);

  // Handle action config save
  const handleActionConfigSave = useCallback((updates) => {
    setSuggestion(prev => {
      if (!prev) return prev;
      const newActions = prev.actions.map(a =>
        a.id === actionConfigData.id
          ? { ...a, llmPromptTemplate: updates.llmPromptTemplate, httpConfig: updates.httpConfig }
          : a
      );
      const newSuggestion = { ...prev, actions: newActions };
      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(newSuggestion, C, handleActionConfigClick);
      setNodes(rfNodes);
      setEdges(rfEdges);
      return newSuggestion;
    });
    setActionConfigOpen(false);
    setActionConfigData(null);
  }, [actionConfigData, C, setNodes, setEdges, handleActionConfigClick]);

  // New scenario: reset chat and canvas but keep saved graphs
  const handleNewScenario = useCallback(() => {
    setChatMessages([]);
    setSuggestion(null);
    setNodes([]);
    setEdges([]);
    setInput('');
    setLastSavedId(null);
    chatHistoryRef.current = [];
    setActiveTab(0);
  }, [setNodes, setEdges]);

  // Delete a saved graph
  const handleDeleteGraph = useCallback(async (graphId, e) => {
    e.stopPropagation();
    try {
      await apiAxios.delete(`/api/decision-support/graphs/${selectedProject}/${graphId}`);
      setSavedGraphs(prev => prev.filter(g => g.id !== graphId));
      if (lastSavedId === graphId) {
        setLastSavedId(null);
      }
      setToast({ message: 'Graph deleted', severity: 'info' });
    } catch {
      // Fallback: remove from local state anyway
      setSavedGraphs(prev => prev.filter(g => g.id !== graphId));
      setToast({ message: 'Graph removed', severity: 'info' });
    }
  }, [selectedProject, lastSavedId]);

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

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(newSuggestion, C, handleActionConfigClick);
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

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(mockSuggestion, C, handleActionConfigClick);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setActiveTab(1);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, selectedProject, C, setNodes, setEdges, handleActionConfigClick]);

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
        setToast({ message: `"${suggestion.title}" saved to ontology`, severity: 'success' });
        // Reload graphs from backend to ensure persistence
        loadSavedGraphs();
      }
    } catch {
      const graphId = `graph-${Date.now()}`;
      setLastSavedId(graphId);
      setSavedGraphs(prev => [...prev, { id: graphId, title: suggestion.title }]);
      setToast({ message: `"${suggestion.title}" saved (local only - backend unreachable)`, severity: 'warning' });
    }
  }, [suggestion, selectedProject, chatMessages, loadSavedGraphs]);

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
        const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(loadedSuggestion, C, handleActionConfigClick);
        setNodes(rfNodes);
        setEdges(rfEdges);
        setActiveTab(1);
      }
    } catch {
      setToast({ message: 'Failed to load graph', severity: 'error' });
    }
  }, [selectedProject, C, setNodes, setEdges, handleActionConfigClick]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            onClick={handleNewScenario}
            startIcon={<AddIcon />}
            size="small"
            sx={{ textTransform: 'none', fontSize: 12, color: C.textMuted }}
          >
            New Scenario
          </Button>
          <IconButton onClick={onClose} size="small" sx={{ color: C.textMuted }}>
            <CloseIcon />
          </IconButton>
        </Box>
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
            <Tab label="Analysis" />
            <Tab label="Ontology" />
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
              <Box sx={{ p: 1.5, borderTop: `1px solid ${C.panelBorder}`, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
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
                  color="primary"
                  size="small"
                  sx={{ backgroundColor: '#DEEBF7', flexShrink: 0 }}
                >
                  <GoArrowUp />
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

          {/* Ontology Tab */}
          {activeTab === 2 && (
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <OntologyIcon sx={{ fontSize: 16, color: C.accent }} />
                  <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 13 }}>Ontology Entities</Typography>
                </Box>
                <IconButton onClick={loadOntologyEntities} size="small" sx={{ color: C.textMuted, p: 0.25 }}>
                  <RefreshIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>

              <Typography sx={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5, mb: 0.5 }}>
                Global entities in your project and which decision graphs reference them.
              </Typography>

              {/* Add Entity button */}
              {!showEntityForm && (
                <Button
                  size="small"
                  startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setShowEntityForm(true)}
                  sx={{
                    textTransform: 'none', fontSize: 11, color: C.accent,
                    border: `1px dashed ${C.accent}55`, borderRadius: 1.5,
                    py: 0.5, mb: 0.5,
                    '&:hover': { background: C.accent + '11', borderColor: C.accent },
                  }}
                >
                  Add Entity
                </Button>
              )}

              {/* Entity creation form */}
              {showEntityForm && (
                <Box sx={{
                  background: C.surface, border: `1px solid ${C.accent}44`,
                  borderRadius: 1.5, p: 1.5, mb: 1,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: C.text, fontSize: 11, fontWeight: 700 }}>New Entity</Typography>
                    <IconButton size="small" onClick={() => setShowEntityForm(false)} sx={{ color: C.textMuted, p: 0.25 }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                  <TextField
                    select
                    label="Type"
                    value={entityForm.type}
                    onChange={e => setEntityForm(f => ({ ...f, type: e.target.value }))}
                    size="small"
                    fullWidth
                    SelectProps={{ native: true }}
                    sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: 11, color: C.text }, '& .MuiInputLabel-root': { fontSize: 11 } }}
                  >
                    {Object.keys(entityTypeIcons).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </TextField>
                  <TextField
                    label="Entity ID"
                    placeholder="e.g. sensor-unit4-pressure"
                    value={entityForm.id}
                    onChange={e => setEntityForm(f => ({ ...f, id: e.target.value }))}
                    size="small"
                    fullWidth
                    sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: 11, color: C.text, fontFamily: 'monospace' }, '& .MuiInputLabel-root': { fontSize: 11 } }}
                  />
                  <TextField
                    label="Properties (optional)"
                    placeholder={'key=value\nlocation=Unit 4\nunit=PSI'}
                    value={entityForm.properties}
                    onChange={e => setEntityForm(f => ({ ...f, properties: e.target.value }))}
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={4}
                    sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: 10, color: C.text, fontFamily: 'monospace' }, '& .MuiInputLabel-root': { fontSize: 11 } }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!entityForm.id || entityCreating}
                    onClick={() => handleCreateEntity(entityForm.id, entityForm.type, entityForm.properties)}
                    sx={{
                      textTransform: 'none', fontSize: 11, py: 0.5,
                      background: C.accent, '&:hover': { background: C.accent + 'dd' },
                    }}
                  >
                    {entityCreating ? 'Creating...' : 'Create Entity'}
                  </Button>
                </Box>
              )}

              {/* Missing entities section */}
              {!ontologyLoading && ontologyData && ontologyData.missingEntities && ontologyData.missingEntities.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                    <AlertIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                    <Typography sx={{ color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>
                      MISSING ENTITIES ({ontologyData.missingEntities.length})
                    </Typography>
                  </Box>
                  <Typography sx={{ color: C.textMuted, fontSize: 10, mb: 0.75, lineHeight: 1.5 }}>
                    These entities are referenced by decision graphs but don't exist in the knowledge graph yet.
                  </Typography>
                  {ontologyData.missingEntities.map(me => {
                    const MeIcon = getEntityIcon(me.type);
                    const meColor = entityTypeColors[me.type] || C.accent;
                    return (
                      <Box key={me.id} sx={{
                        background: themeMode === 'dark' ? '#f59e0b11' : '#f59e0b08',
                        border: '1px dashed #f59e0b55',
                        borderRadius: 1.5, p: 1.25, mb: 0.5,
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                            <MeIcon sx={{ fontSize: 13, color: meColor, flexShrink: 0 }} />
                            <Typography sx={{
                              color: C.text, fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {me.id}
                            </Typography>
                            <Chip label={me.type} size="small" sx={{
                              height: 16, fontSize: 9, ml: 0.5, flexShrink: 0,
                              background: meColor + '22', color: meColor, border: `1px solid ${meColor}44`,
                            }} />
                          </Box>
                          <Button
                            size="small"
                            onClick={() => handleCreateMissing(me)}
                            sx={{
                              textTransform: 'none', fontSize: 10, py: 0.25, px: 1, ml: 0.5,
                              color: C.accent, border: `1px solid ${C.accent}44`,
                              minWidth: 'auto', flexShrink: 0,
                              '&:hover': { background: C.accent + '11' },
                            }}
                          >
                            Create
                          </Button>
                        </Box>
                        {/* Show which graphs reference this missing entity */}
                        {me.referencedBy && me.referencedBy.length > 0 && (
                          <Box sx={{ mt: 0.5 }}>
                            {me.referencedBy.map((ref, idx) => (
                              <Typography key={idx} sx={{ color: C.textMuted, fontSize: 9, lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 600, color: ref.role === 'condition' ? C.condition.text : C.action.text }}>
                                  {ref.role}
                                </span>
                                {' in '}
                                <span
                                  style={{ cursor: 'pointer', textDecoration: 'underline', color: C.accent }}
                                  onClick={() => handleLoadGraph(ref.graphId)}
                                >
                                  {ref.graphTitle}
                                </span>
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                  <Divider sx={{ borderColor: C.panelBorder, my: 1 }} />
                </Box>
              )}

              {ontologyLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, justifyContent: 'center' }}>
                  <CircularProgress size={16} sx={{ color: C.accent }} />
                  <Typography sx={{ color: C.textMuted, fontSize: 12 }}>Loading ontology...</Typography>
                </Box>
              )}

              {!ontologyLoading && !ontologyData && (
                <Typography sx={{ color: C.textDim, fontSize: 11, mt: 2, textAlign: 'center', lineHeight: 1.6 }}>
                  Could not load ontology data. Make sure the backend and quadstore are running.
                </Typography>
              )}

              {!ontologyLoading && ontologyData && ontologyData.entities.length === 0 && (!ontologyData.missingEntities || ontologyData.missingEntities.length === 0) && (
                <Typography sx={{ color: C.textDim, fontSize: 11, mt: 2, textAlign: 'center', lineHeight: 1.6 }}>
                  No ontology entities found in this project yet. Use the "Add Entity" button above or save a decision graph that references entities to get started.
                </Typography>
              )}

              {!ontologyLoading && ontologyData && ontologyData.entities.length > 0 && (() => {
                // Group entities by type
                const grouped = {};
                for (const ent of ontologyData.entities) {
                  if (!grouped[ent.type]) grouped[ent.type] = [];
                  grouped[ent.type].push(ent);
                }
                return Object.entries(grouped).map(([type, entities]) => {
                  const TypeIcon = getEntityIcon(type);
                  const typeColor = entityTypeColors[type] || C.accent;
                  return (
                    <Box key={type} sx={{ mb: 1 }}>
                      {/* Type header */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                        <TypeIcon sx={{ fontSize: 14, color: typeColor }} />
                        <Typography sx={{ color: typeColor, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                          {type.toUpperCase()}
                        </Typography>
                        <Typography sx={{ color: C.textDim, fontSize: 10 }}>
                          ({entities.length})
                        </Typography>
                      </Box>

                      {/* Entities of this type */}
                      {entities.map(ent => {
                        const hasRefs = ent.referencedBy && ent.referencedBy.length > 0;
                        // Pick key properties to show (skip internal ones)
                        const displayProps = Object.entries(ent.properties || {})
                          .filter(([k]) => !['graphType', 'type', 'nodesJson', 'edgesJson', 'parametersJson', 'preconditionsJson'].includes(k))
                          .slice(0, 3);

                        return (
                          <Box key={ent.id} sx={{
                            background: hasRefs ? (themeMode === 'dark' ? `${typeColor}11` : `${typeColor}08`) : C.surface,
                            border: `1px solid ${hasRefs ? typeColor + '33' : C.panelBorder}`,
                            borderRadius: 1.5, p: 1.25, mb: 0.5,
                            transition: 'border-color 0.15s',
                            '&:hover': { borderColor: typeColor + '66' },
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography sx={{
                                color: C.text, fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                              }}>
                                {ent.id}
                              </Typography>
                              {hasRefs && (
                                <Tooltip title={`Referenced by ${ent.referencedBy.length} graph element(s)`} arrow placement="top">
                                  <Badge
                                    badgeContent={ent.referencedBy.length}
                                    color="primary"
                                    sx={{
                                      ml: 1,
                                      '& .MuiBadge-badge': { fontSize: 9, height: 16, minWidth: 16, background: typeColor },
                                    }}
                                  >
                                    <OntologyIcon sx={{ fontSize: 13, color: typeColor }} />
                                  </Badge>
                                </Tooltip>
                              )}
                            </Box>

                            {/* Key properties */}
                            {displayProps.length > 0 && (
                              <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {displayProps.map(([k, v]) => (
                                  <Typography key={k} sx={{
                                    color: C.textMuted, fontSize: 9, fontFamily: 'monospace',
                                    background: C.surface, border: `1px solid ${C.panelBorder}`,
                                    borderRadius: 0.5, px: 0.5, py: 0.1,
                                  }}>
                                    {k}={String(v).length > 20 ? String(v).slice(0, 20) + '...' : String(v)}
                                  </Typography>
                                ))}
                              </Box>
                            )}

                            {/* Graph references */}
                            {hasRefs && (
                              <Box sx={{ mt: 0.75 }}>
                                {ent.referencedBy.map((ref, idx) => (
                                  <Box key={idx} sx={{
                                    display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25,
                                  }}>
                                    <Box sx={{
                                      width: 6, height: 6, borderRadius: '50%',
                                      background: ref.role === 'condition' ? C.condition.border : C.action.border,
                                      flexShrink: 0,
                                    }} />
                                    <Typography sx={{
                                      color: C.textMuted, fontSize: 9, lineHeight: 1.3,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      <span style={{ fontWeight: 600, color: ref.role === 'condition' ? C.condition.text : C.action.text }}>
                                        {ref.role}
                                      </span>
                                      {' in '}
                                      <span
                                        style={{ cursor: 'pointer', textDecoration: 'underline', color: C.accent }}
                                        onClick={() => handleLoadGraph(ref.graphId)}
                                      >
                                        {ref.graphTitle}
                                      </span>
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  );
                });
              })()}

              {/* Summary: graphs referencing entities */}
              {!ontologyLoading && ontologyData && ontologyData.graphs.length > 0 && (
                <>
                  <Divider sx={{ borderColor: C.panelBorder, my: 1 }} />
                  <Box>
                    <Typography sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', mb: 0.75 }}>
                      DECISION GRAPHS ({ontologyData.graphs.length})
                    </Typography>
                    {ontologyData.graphs.map(g => {
                      // Count how many entities reference this graph
                      const refCount = ontologyData.entities.reduce(
                        (sum, ent) => sum + (ent.referencedBy || []).filter(r => r.graphId === g.id).length,
                        0
                      );
                      return (
                        <Box
                          key={g.id}
                          onClick={() => handleLoadGraph(g.id)}
                          sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            p: 0.75, borderRadius: 1, mb: 0.5, cursor: 'pointer',
                            background: lastSavedId === g.id ? C.accentDim + '33' : C.surface,
                            border: `1px solid ${lastSavedId === g.id ? C.accent + '55' : C.panelBorder}`,
                            '&:hover': { borderColor: C.accent + '55' },
                            transition: 'border-color 0.15s',
                          }}
                        >
                          <Typography sx={{
                            color: C.text, fontSize: 11, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          }}>
                            {g.title}
                          </Typography>
                          {refCount > 0 && (
                            <Chip
                              label={`${refCount} link${refCount > 1 ? 's' : ''}`}
                              size="small"
                              sx={{
                                height: 16, fontSize: 9, ml: 0.5,
                                background: C.accent + '22', color: C.accent,
                                border: `1px solid ${C.accent}44`,
                              }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>

        {/* Center: Tab Strip + Canvas */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Center tab strip */}
          <Box sx={{
            display: 'flex', alignItems: 'center',
            borderBottom: `1px solid ${C.panelBorder}`, background: C.panel,
          }}>
            <Tabs
              value={centerTab}
              onChange={(_, v) => setCenterTab(v)}
              sx={{
                minHeight: 40, flex: 1,
                '& .MuiTab-root': { minHeight: 40, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted },
                '& .Mui-selected': { color: C.accent },
                '& .MuiTabs-indicator': { backgroundColor: C.accent },
              }}
            >
              <Tab label="Scenario Graph" />
              <Tab label="Ontology Graph" />
            </Tabs>
            {centerTab === 1 && (
              <IconButton onClick={loadOntologyGraph} size="small" sx={{ color: C.textMuted, mr: 1, p: 0.25 }}>
                <RefreshIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>

          {/* Controls theme override */}
          <style>{`
            .themed-controls .react-flow__controls-button {
              background: ${C.panel};
              color: ${C.text};
              border: none;
              border-bottom: 1px solid ${C.panelBorder};
            }
            .themed-controls .react-flow__controls-button:hover {
              background: ${C.surfaceHover};
            }
            .themed-controls .react-flow__controls-button svg {
              fill: ${C.text};
            }
          `}</style>

          {/* Scenario Graph Canvas */}
          <Box sx={{ flex: 1, position: 'relative', display: centerTab === 0 ? 'block' : 'none' }}>
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
              <Controls
                position="bottom-right"
                className="themed-controls"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.panelBorder}`,
                  borderRadius: 8,
                  boxShadow: 'none',
                }}
              />
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

          {/* Ontology Graph Canvas */}
          <Box sx={{ flex: 1, position: 'relative', display: centerTab === 1 ? 'block' : 'none' }}>
            {ontGraphLoading && (
              <Box sx={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                zIndex: 10, display: 'flex', alignItems: 'center', gap: 1,
              }}>
                <CircularProgress size={16} sx={{ color: C.accent }} />
                <Typography sx={{ color: C.textMuted, fontSize: 12 }}>Loading ontology graph...</Typography>
              </Box>
            )}
            <ReactFlowProvider>
              <ReactFlow
                nodes={ontGraphNodes}
                edges={ontGraphEdges}
                onNodesChange={onOntGraphNodesChange}
                onEdgesChange={onOntGraphEdgesChange}
                onNodeClick={handleOntologyNodeClick}
                nodeTypes={ontologyNodeTypes}
                fitView
                fitViewOptions={{ padding: 0.4 }}
                defaultEdgeOptions={{
                  style: { stroke: C.accentDim + '88', strokeWidth: 1.5 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: C.accentDim + '88' },
                }}
                style={{ background: C.bg }}
              >
                <Background variant="dots" gap={24} size={1} color={C.panelBorder} />
                <Controls
                  position="bottom-right"
                  className="themed-controls"
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.panelBorder}`,
                    borderRadius: 8,
                    boxShadow: 'none',
                  }}
                />
                <MiniMap
                  position="bottom-left"
                  nodeColor={n => {
                    if (n.type === 'entityType') return entityTypeColors[n.data?.entityType] || C.accent;
                    if (n.type === 'decisionGraph') return C.accent;
                    return entityTypeColors[n.data?.entityType] || C.accentDim;
                  }}
                  maskColor={C.bg + 'cc'}
                  style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8 }}
                />

                {/* Ontology legend */}
                <div style={{
                  position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
                  background: C.panel + 'dd', border: `1px solid ${C.panelBorder}`,
                  borderRadius: 20, padding: '6px 16px',
                }}>
                  {[
                    { color: C.accent, label: 'Entity Type', style: 'solid' },
                    { color: C.textMuted, label: 'Instance', style: 'solid' },
                    { color: C.accent, label: 'Decision Graph', style: 'dashed' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: item.style === 'dashed' ? 2 : '50%',
                        background: item.style === 'dashed' ? 'transparent' : item.color,
                        border: item.style === 'dashed' ? `1.5px dashed ${item.color}` : 'none',
                      }} />
                      <span style={{ color: C.textMuted, fontSize: 10 }}>{item.label}</span>
                    </div>
                  ))}
                </div>

                {ontGraphNodes.length === 0 && !ontGraphLoading && (
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none',
                  }}>
                    <OntologyIcon style={{ color: C.textDim, fontSize: 28, marginBottom: 12 }} />
                    <div style={{ color: C.textDim, fontSize: 13, fontWeight: 600 }}>Ontology Graph</div>
                    <div style={{ color: C.textDim, fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                      No ontology entities found yet.<br />Create entities in the Ontology tab to see them here.
                    </div>
                  </div>
                )}
              </ReactFlow>
            </ReactFlowProvider>
          </Box>
        </Box>

        {/* Right: Saved Graphs Sidebar */}
        <Box sx={{
          width: 220, borderLeft: `1px solid ${C.panelBorder}`,
          background: C.panel, p: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
              SAVED SCENARIOS
            </Typography>
            <IconButton onClick={loadSavedGraphs} size="small" sx={{ color: C.textMuted, p: 0.25 }}>
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
          {savedGraphs.length === 0 ? (
            <Typography sx={{ color: C.textDim, fontSize: 11, lineHeight: 1.6, mt: 1 }}>
              No saved scenarios yet. Describe a situation in the chat, then click "Save to Ontology" to persist it here.
            </Typography>
          ) : (
            savedGraphs.map(g => (
              <Box
                key={g.id}
                onClick={() => handleLoadGraph(g.id)}
                sx={{
                  p: 1, borderRadius: 1, mb: 0.75, cursor: 'pointer',
                  background: lastSavedId === g.id ? C.accentDim + '33' : C.surface,
                  border: `1px solid ${lastSavedId === g.id ? C.accent + '55' : C.panelBorder}`,
                  color: C.text, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  '&:hover': { borderColor: C.accent + '55' },
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.title}
                </span>
                <IconButton
                  onClick={(e) => handleDeleteGraph(g.id, e)}
                  size="small"
                  sx={{ color: C.textDim, p: 0.25, ml: 0.5, '&:hover': { color: C.action.border } }}
                >
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
            ))
          )}

          {/* Test Scenario Button */}
          <Box sx={{ mt: 'auto', pt: 1.5 }}>
            <Divider sx={{ mb: 1.5, borderColor: C.panelBorder }} />
            <Button
              onClick={() => setTestModalOpen(true)}
              disabled={!suggestion || !lastSavedId}
              fullWidth
              variant="outlined"
              sx={{
                textTransform: 'none', fontSize: 11, fontWeight: 600,
                borderColor: C.accent + '55', color: C.accent,
                '&:hover': { borderColor: C.accent, background: C.accent + '11' },
                '&.Mui-disabled': { borderColor: C.panelBorder, color: C.textDim },
              }}
            >
              Test Scenario
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Test Scenario Modal */}
      <TestScenarioModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        project={selectedProject}
        graphId={lastSavedId}
        palette={C}
        setToast={setToast}
        setNodes={setNodes}
        setEdges={setEdges}
      />

      {/* Action Config Modal */}
      <Dialog
        open={actionConfigOpen}
        onClose={() => { setActionConfigOpen(false); setActionConfigData(null); }}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              background: C.panel, border: `1px solid ${C.panelBorder}`,
              borderTop: `3px solid ${C.llm}`, borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Action Configuration</Typography>
          <IconButton size="small" onClick={() => { setActionConfigOpen(false); setActionConfigData(null); }} sx={{ color: C.textMuted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ background: C.surface, borderColor: C.panelBorder }}>
          {actionConfigData && (
            <ActionConfigForm
              actionData={actionConfigData}
              palette={C}
              onSave={handleActionConfigSave}
              onCancel={() => { setActionConfigOpen(false); setActionConfigData(null); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Entity Detail Modal */}
      <Dialog
        open={entityDetailOpen}
        onClose={() => { setEntityDetailOpen(false); setEntityDetailData(null); }}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderTop: `3px solid ${entityDetailData ? (entityTypeColors[entityDetailData.type] || C.accent) : C.accent}`,
              borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {entityDetailData && (() => {
              const Icon = getEntityIcon(entityDetailData.type);
              return <Icon sx={{ fontSize: 20, color: entityTypeColors[entityDetailData.type] || C.accent }} />;
            })()}
            <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Entity Details</Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => { setEntityDetailOpen(false); setEntityDetailData(null); }}
            sx={{ color: C.textMuted }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ background: C.surface, borderColor: C.panelBorder }}>
          {entityDetailData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Type"
                value={entityDetailForm.type}
                size="small"
                fullWidth
                disabled
                sx={{
                  '& .MuiInputBase-input': { fontSize: 12, color: C.text, fontFamily: 'monospace' },
                  '& .MuiInputLabel-root': { fontSize: 12 },
                  '& .Mui-disabled': { WebkitTextFillColor: C.textMuted },
                }}
              />
              <TextField
                label="Entity ID"
                value={entityDetailForm.id}
                onChange={e => setEntityDetailForm(f => ({ ...f, id: e.target.value }))}
                size="small"
                fullWidth
                sx={{
                  '& .MuiInputBase-input': { fontSize: 12, color: C.text, fontFamily: 'monospace' },
                  '& .MuiInputLabel-root': { fontSize: 12 },
                }}
              />
              <TextField
                label="Properties"
                placeholder={'key=value\nlocation=Unit 4\nunit=PSI'}
                value={entityDetailForm.properties}
                onChange={e => setEntityDetailForm(f => ({ ...f, properties: e.target.value }))}
                size="small"
                fullWidth
                multiline
                minRows={4}
                maxRows={10}
                sx={{
                  '& .MuiInputBase-input': { fontSize: 11, color: C.text, fontFamily: 'monospace' },
                  '& .MuiInputLabel-root': { fontSize: 12 },
                }}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ background: C.panel, borderTop: `1px solid ${C.panelBorder}`, px: 2, py: 1.5, justifyContent: 'space-between' }}>
          <Button
            onClick={handleDeleteEntity}
            disabled={entityDetailSaving}
            startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none', fontSize: 12, color: '#ef4444',
              '&:hover': { background: '#ef444411' },
            }}
          >
            Delete
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => { setEntityDetailOpen(false); setEntityDetailData(null); }}
              sx={{ textTransform: 'none', fontSize: 12, color: C.textMuted }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateEntity}
              disabled={entityDetailSaving || !entityDetailForm.id}
              variant="contained"
              sx={{
                textTransform: 'none', fontSize: 12,
                background: C.accent, '&:hover': { background: C.accent + 'dd' },
              }}
            >
              {entityDetailSaving ? 'Saving...' : 'Update'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

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
