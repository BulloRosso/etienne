import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Divider,
  Stack,
  Alert,
  Tabs,
  Tab,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Close as CloseIcon,
  Event as EventIcon,
  Info as InfoIcon,
  History as HistoryIcon,
  FolderOpen as FileWatcherIcon,
  Sensors as MqttIcon,
  Code as ClaudeCodeIcon,
  Schedule as ScheduleIcon,
  Webhook as WebhookIcon,
  Email as EmailIcon,
  AccountTree as WorkflowIcon
} from '@mui/icons-material';
import { BiMessageEdit, BiHelpCircle } from 'react-icons/bi';
import { PiHeartbeat, PiSecurityCameraFill } from 'react-icons/pi';
import { FcWorkflow } from 'react-icons/fc';
import { IoMdNotificationsOutline } from 'react-icons/io';
import { apiAxios, authSSEUrl } from '../services/api';
import { useTranslation } from 'react-i18next';
import LiveEventsTab from './LiveEventsTab';
import {
  ActionsTab,
  RulesTab,
  EventLogTab,
  WebHooksTab,
  ExamplesTab,
  UseCasesTab
} from './conditionmonitoring';

// Event group styling configuration (consistent with LiveEventsTab)
const EVENT_GROUP_CONFIG = {
  'Filesystem': {
    icon: FileWatcherIcon,
    color: '#4caf50',
    bgColor: '#e8f5e9'
  },
  'MQTT': {
    icon: MqttIcon,
    color: '#2196f3',
    bgColor: '#e3f2fd'
  },
  'Claude Code': {
    icon: ClaudeCodeIcon,
    color: '#9c27b0',
    bgColor: '#f3e5f5'
  },
  'Scheduling': {
    icon: ScheduleIcon,
    color: '#00bcd4',
    bgColor: '#e0f7fa'
  },
  'Webhook': {
    icon: WebhookIcon,
    color: '#ff9800',
    bgColor: '#fff3e0'
  },
  'Email': {
    icon: EmailIcon,
    color: '#e91e63',
    bgColor: '#fce4ec'
  }
};

// Helper to get group styling
const getGroupStyle = (group) => EVENT_GROUP_CONFIG[group] || {
  icon: EventIcon,
  color: '#757575',
  bgColor: '#f5f5f5'
};

const EventHandling = ({ selectedProject, onClose }) => {
  const { t } = useTranslation();
  const [rules, setRules] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEventLog, setLoadingEventLog] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [eventStream, setEventStream] = useState(null);

  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [conditionType, setConditionType] = useState('simple');
  const [eventGroup, setEventGroup] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventTopic, setEventTopic] = useState('');
  const [payloadPath, setPayloadPath] = useState('');
  const [actionType, setActionType] = useState('prompt');
  const [actionPromptId, setActionPromptId] = useState('');
  const [actionWorkflowId, setActionWorkflowId] = useState('');
  const [actionWorkflowEvent, setActionWorkflowEvent] = useState('');
  const [actionMapPayload, setActionMapPayload] = useState(true);

  // Webhook state
  const [copySuccess, setCopySuccess] = useState(false);

  // Prompts management state
  const [prompts, setPrompts] = useState([]);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptMenuAnchor, setPromptMenuAnchor] = useState(null);
  const [selectedPromptForMenu, setSelectedPromptForMenu] = useState(null);
  const [ruleMenuAnchor, setRuleMenuAnchor] = useState(null);
  const [selectedRuleForMenu, setSelectedRuleForMenu] = useState(null);

  // Workflows list for action selector
  const [workflows, setWorkflows] = useState([]);

  // Prompt execution state
  const [promptExecutions, setPromptExecutions] = useState([]);

  // Workflow execution state
  const [workflowExecutions, setWorkflowExecutions] = useState([]);

  // Script execution state
  const [scriptExecutions, setScriptExecutions] = useState([]);

  // Service status state
  const [serviceStatus, setServiceStatus] = useState({
    mqtt: { connected: false, subscriptions: [] }
  });

  const eventGroups = ['Filesystem', 'MQTT', 'Scheduling', 'Claude Code', 'Webhook', 'Email'];

  const eventGroupLabels = {
    'Filesystem': t('eventHandling.eventGroupFilesystem'),
    'MQTT': t('eventHandling.eventGroupMQTT'),
    'Scheduling': t('eventHandling.eventGroupScheduling'),
    'Claude Code': t('eventHandling.eventGroupClaudeCode'),
    'Webhook': t('eventHandling.eventGroupWebhook'),
    'Email': t('eventHandling.eventGroupEmail'),
  };

  // Define supported event names per group
  const eventNamesByGroup = {
    'Filesystem': ['File Created', 'File Modified', 'File Deleted', 'Directory Created', 'Directory Deleted'],
    'MQTT': ['Message Received', 'Connection Established', 'Connection Lost'],
    'Scheduling': ['Task Scheduled', 'Task Executed', 'Task Failed'],
    'Claude Code': ['File Created', 'File Modified', 'Session Started', 'Session Ended', 'Tool Executed'],
    'Webhook': ['Webhook Received'],
    'Email': ['Email Received']
  };

  const eventNameLabels = {
    'File Created': t('eventHandling.eventFileCreated'),
    'File Modified': t('eventHandling.eventFileModified'),
    'File Deleted': t('eventHandling.eventFileDeleted'),
    'Directory Created': t('eventHandling.eventDirectoryCreated'),
    'Directory Deleted': t('eventHandling.eventDirectoryDeleted'),
    'Message Received': t('eventHandling.eventMessageReceived'),
    'Connection Established': t('eventHandling.eventConnectionEstablished'),
    'Connection Lost': t('eventHandling.eventConnectionLost'),
    'Task Scheduled': t('eventHandling.eventTaskScheduled'),
    'Task Executed': t('eventHandling.eventTaskExecuted'),
    'Task Failed': t('eventHandling.eventTaskFailed'),
    'Session Started': t('eventHandling.eventSessionStarted'),
    'Session Ended': t('eventHandling.eventSessionEnded'),
    'Tool Executed': t('eventHandling.eventToolExecuted'),
    'Webhook Received': t('eventHandling.eventWebhookReceived'),
    'Email Received': t('eventHandling.eventEmailReceived'),
  };

  // Load rules from API
  const loadRules = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const response = await apiAxios.get(`http://localhost:6060/api/rules/${selectedProject}`);
      if (response.data.success) {
        setRules(response.data.rules || []);
      }
    } catch (error) {
      console.error('Failed to load rules:', error);
    } finally {
      setLoading(false);
    }
  };

  // Connect to SSE stream for real-time events
  useEffect(() => {
    if (!selectedProject) return;

    const sse = new EventSource(authSSEUrl(`http://localhost:6060/api/events/${selectedProject}/stream`));

    const addOrUpdateEvent = (newEvent) => {
      setLiveEvents((prev) => {
        const existingIndex = prev.findIndex(e => e.id === newEvent.id);

        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...newEvent,
            triggeredRules: newEvent.triggeredRules || updated[existingIndex].triggeredRules
          };
          return updated;
        } else {
          return [newEvent, ...prev].slice(0, 50);
        }
      });
    };

    sse.addEventListener('event', (e) => {
      const event = JSON.parse(e.data);
      addOrUpdateEvent(event);
    });

    sse.addEventListener('rule-execution', (e) => {
      const data = JSON.parse(e.data);
      addOrUpdateEvent({ ...data.event, triggeredRules: data.triggeredRules });
    });

    sse.addEventListener('prompt-execution', (e) => {
      const data = JSON.parse(e.data);
      setPromptExecutions((prev) => {
        const existingIndex = prev.findIndex(
          (p) => p.ruleId === data.ruleId && p.eventId === data.eventId
        );
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...data };
          return updated;
        }
        return [data, ...prev].slice(0, 20);
      });
    });

    sse.addEventListener('workflow-execution', (e) => {
      const data = JSON.parse(e.data);
      setWorkflowExecutions((prev) => {
        const existingIndex = prev.findIndex(
          (w) => w.ruleId === data.ruleId && w.eventId === data.eventId
        );
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...data };
          return updated;
        }
        return [data, ...prev].slice(0, 20);
      });
    });

    sse.addEventListener('script-execution', (e) => {
      const data = JSON.parse(e.data);
      setScriptExecutions((prev) => {
        const existingIndex = prev.findIndex(
          (s) => s.workflowId === data.workflowId && s.scriptFile === data.scriptFile && s.state === data.state
        );
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...data };
          return updated;
        }
        return [data, ...prev].slice(0, 20);
      });
    });

    sse.addEventListener('service-status', (e) => {
      const data = JSON.parse(e.data);
      if (data.service === 'mqtt') {
        setServiceStatus(prev => ({
          ...prev,
          mqtt: { connected: data.connected, subscriptions: data.subscriptions || [] }
        }));
      }
    });

    sse.onerror = (error) => {
      console.error('SSE error:', error);
    };

    setEventStream(sse);

    return () => {
      sse.close();
    };
  }, [selectedProject]);

  // Load MQTT status
  const loadMqttStatus = async () => {
    if (!selectedProject) return;

    try {
      const response = await apiAxios.get(`http://localhost:6060/api/external-events/${selectedProject}/status`);
      setServiceStatus(prev => ({
        ...prev,
        mqtt: {
          connected: response.data.connected || false,
          subscriptions: response.data.subscriptions || []
        }
      }));
    } catch (error) {
      console.log('MQTT status not available:', error.message);
    }
  };

  useEffect(() => {
    loadRules();
    loadPrompts();
    loadWorkflows();
    loadEventLog();
    loadMqttStatus();
  }, [selectedProject]);

  // Load event log from API
  const loadEventLog = async () => {
    if (!selectedProject) return;

    try {
      setLoadingEventLog(true);
      const response = await apiAxios.get(`http://localhost:6060/api/events/${selectedProject}/latest?limit=50`);
      if (response.data.success) {
        setEventLog(response.data.events || []);
      }
    } catch (error) {
      console.error('Failed to load event log:', error);
    } finally {
      setLoadingEventLog(false);
    }
  };

  // Load prompts from backend API
  const loadPrompts = async () => {
    if (!selectedProject) return;

    try {
      const response = await apiAxios.get(`http://localhost:6060/api/prompts/${selectedProject}`);
      if (response.data.success) {
        setPrompts(response.data.prompts || []);
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setPrompts([]);
    }
  };

  // Load workflows for action selector
  const loadWorkflows = async () => {
    if (!selectedProject) return;

    try {
      const response = await apiAxios.get(`http://localhost:6060/api/workspace/${selectedProject}/workflows`);
      setWorkflows(response.data || []);
    } catch (error) {
      console.log('Failed to load workflows:', error.message);
      setWorkflows([]);
    }
  };

  // Extract payload matcher from rule condition event object
  const extractPayloadMatcher = (event) => {
    if (!event) return '';
    const standardFields = ['group', 'name', 'topic', 'source'];
    for (const key of Object.keys(event)) {
      if (!standardFields.includes(key)) {
        return `${key}:${event[key]}`;
      }
    }
    return '';
  };

  const handleOpenRuleDialog = (rule = null) => {
    if (rule) {
      setEditingRule(rule);
      setRuleName(rule.name);
      setRuleEnabled(rule.enabled);
      if (rule.condition.type === 'email-semantic') {
        setConditionType('email-semantic');
        setEventGroup('Email');
        setPayloadPath(rule.condition.criteria || '');
        setEventName('');
        setEventTopic('');
      } else {
        setConditionType(rule.condition.type);
        setEventGroup(rule.condition.event?.group || '');
        setEventName(rule.condition.event?.name || '');
        setEventTopic(rule.condition.event?.topic || '');
        setPayloadPath(extractPayloadMatcher(rule.condition.event));
      }
      // Load action fields based on type
      setActionType(rule.action.type || 'prompt');
      setActionPromptId(rule.action.promptId || '');
      setActionWorkflowId(rule.action.workflowId || '');
      setActionWorkflowEvent(rule.action.event || '');
      setActionMapPayload(rule.action.mapPayload !== false);
    } else {
      setEditingRule(null);
      setRuleName('');
      setRuleEnabled(true);
      setConditionType('simple');
      setEventGroup('');
      setEventName('');
      setEventTopic('');
      setPayloadPath('');
      setActionType('prompt');
      setActionPromptId('');
      setActionWorkflowId('');
      setActionWorkflowEvent('');
      setActionMapPayload(true);
    }
    setRuleDialogOpen(true);
  };

  const handleCloseRuleDialog = () => {
    setRuleDialogOpen(false);
    setEditingRule(null);
  };

  // Parse payload matcher string (format: "key:value" where value may contain colons)
  const parsePayloadMatcher = (matcher) => {
    if (!matcher || !matcher.includes(':')) return null;
    const colonIndex = matcher.indexOf(':');
    const key = matcher.substring(0, colonIndex).trim();
    const value = matcher.substring(colonIndex + 1).trim();
    if (!key || !value) return null;
    return { [key]: value };
  };

  const handleSaveRule = async () => {
    const payloadMatcher = parsePayloadMatcher(payloadPath);

    // Build action based on selected type
    const action = actionType === 'workflow_event'
      ? {
          type: 'workflow_event',
          workflowId: actionWorkflowId,
          event: actionWorkflowEvent,
          mapPayload: actionMapPayload,
        }
      : {
          type: 'prompt',
          promptId: actionPromptId,
        };

    const ruleData = {
      name: ruleName,
      enabled: ruleEnabled,
      condition: eventGroup === 'Email' ? {
        type: 'email-semantic',
        criteria: payloadPath,
        event: { group: 'Email' }
      } : {
        type: conditionType,
        event: {
          ...(eventGroup && { group: eventGroup }),
          ...(eventName && { name: eventName }),
          ...(eventTopic && { topic: eventTopic }),
          ...payloadMatcher
        }
      },
      action,
    };

    try {
      if (editingRule) {
        await apiAxios.put(`http://localhost:6060/api/rules/${selectedProject}/${editingRule.id}`, ruleData);
      } else {
        await apiAxios.post(`http://localhost:6060/api/rules/${selectedProject}`, ruleData);
      }
      await loadRules();
      handleCloseRuleDialog();
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await apiAxios.put(`http://localhost:6060/api/rules/${selectedProject}/${rule.id}`, {
        enabled: !rule.enabled
      });
      await loadRules();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm(t('eventHandling.confirmDeleteRule'))) return;

    try {
      await apiAxios.delete(`http://localhost:6060/api/rules/${selectedProject}/${ruleId}`);
      await loadRules();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleCopyWebhookUrl = () => {
    const webhookUrl = `http://localhost:6060/api/events/${selectedProject}/webhook`;
    navigator.clipboard.writeText(webhookUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleOpenPromptDialog = (prompt = null) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setPromptTitle(prompt.title);
      setPromptContent(prompt.content);
    } else {
      setEditingPrompt(null);
      setPromptTitle('');
      setPromptContent('');
    }
    setPromptDialogOpen(true);
  };

  const handleClosePromptDialog = () => {
    setPromptDialogOpen(false);
    setEditingPrompt(null);
  };

  const handleSavePrompt = async () => {
    if (!promptTitle || !promptContent) return;

    try {
      if (editingPrompt) {
        await apiAxios.put(`http://localhost:6060/api/prompts/${selectedProject}/${editingPrompt.id}`, {
          title: promptTitle,
          content: promptContent
        });
      } else {
        await apiAxios.post(`http://localhost:6060/api/prompts/${selectedProject}`, {
          title: promptTitle,
          content: promptContent
        });
      }
      await loadPrompts();
      handleClosePromptDialog();
    } catch (error) {
      console.error('Failed to save prompt:', error);
    }
  };

  const handleDeletePrompt = async (promptId) => {
    if (!confirm(t('eventHandling.confirmDeletePrompt'))) return;

    try {
      await apiAxios.delete(`http://localhost:6060/api/prompts/${selectedProject}/${promptId}`);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to delete prompt:', error);
    }
  };

  if (!selectedProject) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {t('eventHandling.selectProject')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
      {/* Header */}
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                position: 'relative',
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                '@keyframes neonBorderSweep': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' }
                }
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: -20,
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 340deg, #667eea 350deg, #764ba2 360deg)',
                  animation: 'neonBorderSweep 4s linear infinite',
                  zIndex: 0
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 2,
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                  zIndex: 1
                }}
              />
              <PiSecurityCameraFill style={{ fontSize: 26, color: '#667eea', position: 'relative', zIndex: 2 }} />
            </Box>
            <Typography variant="h5" fontWeight={600}>
              {t('eventHandling.pageTitle')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenRuleDialog()}
              sx={{ textTransform: 'none' }}
            >
              {t('eventHandling.newRule')}
            </Button>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ px: 3 }}>
          <Tab label={t('eventHandling.tabAction')} icon={<BiMessageEdit style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label={t('eventHandling.tabRules')} icon={<IoMdNotificationsOutline style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab
            label={t('eventHandling.tabLiveEvents', { indicator: eventStream ? '●' : '' })}
            icon={<PiHeartbeat style={{ fontSize: 20 }} />}
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
          <Tab label={t('eventHandling.tabEventLog')} icon={<HistoryIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label={t('eventHandling.tabWebHooks')} icon={<WebhookIcon sx={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label={t('eventHandling.tabExamples')} icon={<BiHelpCircle style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label={t('eventHandling.tabUseCases')} icon={<FcWorkflow style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : currentTab === 0 ? (
          <ActionsTab
            prompts={prompts}
            onOpenPromptDialog={handleOpenPromptDialog}
            onDeletePrompt={handleDeletePrompt}
            promptMenuAnchor={promptMenuAnchor}
            setPromptMenuAnchor={setPromptMenuAnchor}
            selectedPromptForMenu={selectedPromptForMenu}
            setSelectedPromptForMenu={setSelectedPromptForMenu}
          />
        ) : currentTab === 1 ? (
          <RulesTab
            rules={rules}
            prompts={prompts}
            getGroupStyle={getGroupStyle}
            onOpenRuleDialog={handleOpenRuleDialog}
            onToggleRule={handleToggleRule}
            onDeleteRule={handleDeleteRule}
            ruleMenuAnchor={ruleMenuAnchor}
            setRuleMenuAnchor={setRuleMenuAnchor}
            selectedRuleForMenu={selectedRuleForMenu}
            setSelectedRuleForMenu={setSelectedRuleForMenu}
          />
        ) : currentTab === 2 ? (
          <LiveEventsTab
            liveEvents={liveEvents}
            eventStream={eventStream}
            promptExecutions={promptExecutions}
            workflowExecutions={workflowExecutions}
            scriptExecutions={scriptExecutions}
            serviceStatus={serviceStatus}
          />
        ) : currentTab === 3 ? (
          <EventLogTab
            eventLog={eventLog}
            loadingEventLog={loadingEventLog}
            getGroupStyle={getGroupStyle}
          />
        ) : currentTab === 4 ? (
          <WebHooksTab
            selectedProject={selectedProject}
            copySuccess={copySuccess}
            onCopyWebhookUrl={handleCopyWebhookUrl}
          />
        ) : currentTab === 5 ? (
          <ExamplesTab />
        ) : currentTab === 6 ? (
          <UseCasesTab />
        ) : null}
      </Box>

      {/* Rule Dialog */}
      <Dialog
        open={ruleDialogOpen}
        onClose={handleCloseRuleDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              {editingRule ? t('eventHandling.editRuleTitle') : t('eventHandling.createRuleTitle')}
            </Typography>
            <IconButton onClick={handleCloseRuleDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                label={t('eventHandling.ruleNameLabel')}
                fullWidth
                size="small"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                required
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={ruleEnabled}
                    onChange={(e) => setRuleEnabled(e.target.checked)}
                  />
                }
                label={t('common.enabled')}
                sx={{ minWidth: 100 }}
              />
            </Box>

            <Divider>
              <Chip label={t('eventHandling.conditionDivider')} size="small" />
            </Divider>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl sx={{ flex: 1 }} size="small">
                <InputLabel>{t('eventHandling.eventGroupLabel')}</InputLabel>
                <Select
                  value={eventGroup}
                  onChange={(e) => {
                    const group = e.target.value;
                    setEventGroup(group);
                    if (group === 'Email') {
                      setConditionType('email-semantic');
                      setEventName('');
                      setEventTopic('');
                    } else if (conditionType === 'email-semantic') {
                      setConditionType('simple');
                    }
                  }}
                  label={t('eventHandling.eventGroupLabel')}
                  renderValue={(selected) => {
                    const style = getGroupStyle(selected);
                    const GroupIcon = style.icon;
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                        {eventGroupLabels[selected] || selected}
                      </Box>
                    );
                  }}
                >
                  {eventGroups.map((group) => {
                    const style = getGroupStyle(group);
                    const GroupIcon = style.icon;
                    return (
                      <MenuItem key={group} value={group}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                          {eventGroupLabels[group] || group}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {eventGroup !== 'Email' && (
                <FormControl sx={{ flex: 1 }} size="small">
                  <InputLabel>{t('eventHandling.conditionTypeLabel')}</InputLabel>
                  <Select
                    value={conditionType}
                    onChange={(e) => setConditionType(e.target.value)}
                    label={t('eventHandling.conditionTypeLabel')}
                  >
                    <MenuItem value="simple">{t('eventHandling.conditionSimple')}</MenuItem>
                    <MenuItem value="semantic">{t('eventHandling.conditionSemantic')}</MenuItem>
                    <MenuItem value="compound">{t('eventHandling.conditionCompound')}</MenuItem>
                    <MenuItem value="temporal">{t('eventHandling.conditionTemporal')}</MenuItem>
                  </Select>
                </FormControl>
              )}

              {eventGroup === 'Email' && (
                <Chip
                  label={t('eventHandling.semanticAi')}
                  size="small"
                  sx={{ alignSelf: 'center', backgroundColor: '#fce4ec', color: '#e91e63' }}
                />
              )}
            </Box>

            {eventGroup === 'Email' && (
              <>
                <TextField
                  label={t('eventHandling.emailCriteriaLabel')}
                  fullWidth
                  size="small"
                  multiline
                  rows={3}
                  value={payloadPath}
                  onChange={(e) => setPayloadPath(e.target.value)}
                  placeholder={t('eventHandling.emailCriteriaPlaceholder')}
                  helperText={t('eventHandling.emailCriteriaHelper')}
                  required
                />
                <Alert severity="info" icon={<InfoIcon fontSize="small" />} sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                  <Typography variant="caption" component="div">
                    <strong>{t('eventHandling.emailDataStructure')}</strong>
                    <pre style={{ margin: '4px 0', fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>
{`{
  From: "sender@example.com",
  To: "recipient@example.com",
  Important: true/false,
  Subject: "Email subject line",
  BodyText: "Full email body text",
  Attachments: ["file1.pdf", "image.png"]
}`}
                    </pre>
                  </Typography>
                </Alert>
              </>
            )}

            {conditionType === 'simple' && eventGroup !== 'Email' && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('eventHandling.eventNameLabel')}</InputLabel>
                  <Select
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    label={t('eventHandling.eventNameLabel')}
                    disabled={!eventGroup}
                  >
                    <MenuItem value="">
                      <em>{t('eventHandling.anyEvent')}</em>
                    </MenuItem>
                    {eventGroup && eventNamesByGroup[eventGroup]?.map((name) => (
                      <MenuItem key={name} value={name}>{eventNameLabels[name] || name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label={t('eventHandling.topicPatternLabel')}
                  fullWidth
                  size="small"
                  value={eventTopic}
                  onChange={(e) => setEventTopic(e.target.value)}
                  placeholder={t('eventHandling.topicPatternPlaceholder')}
                  helperText={t('eventHandling.topicPatternHelper')}
                />

                <TextField
                  label={t('eventHandling.payloadMatcherLabel')}
                  fullWidth
                  size="small"
                  value={payloadPath}
                  onChange={(e) => setPayloadPath(e.target.value)}
                  placeholder={t('eventHandling.payloadMatcherPlaceholder')}
                  helperText={t('eventHandling.payloadMatcherHelper')}
                />
              </>
            )}

            {conditionType === 'semantic' && eventGroup !== 'Email' && (
              <TextField
                label={t('eventHandling.semanticQueryLabel')}
                fullWidth
                size="small"
                multiline
                rows={3}
                value={payloadPath}
                onChange={(e) => setPayloadPath(e.target.value)}
                placeholder={t('eventHandling.semanticQueryPlaceholder')}
                helperText={t('eventHandling.semanticQueryHelper')}
                required
              />
            )}

            <Alert severity="info" icon={<InfoIcon fontSize="small" />} sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
              {conditionType === 'simple' && eventGroup !== 'Email' && t('eventHandling.simpleConditionInfo')}
              {conditionType === 'semantic' && eventGroup !== 'Email' && t('eventHandling.semanticConditionInfo')}
              {conditionType === 'compound' && t('eventHandling.compoundConditionInfo')}
              {conditionType === 'temporal' && t('eventHandling.temporalConditionInfo')}
              {eventGroup === 'Email' && t('eventHandling.emailConditionInfo')}
            </Alert>

            <Divider>
              <Chip label={t('eventHandling.actionDivider')} size="small" />
            </Divider>

            <FormControl fullWidth size="small">
              <InputLabel>{t('eventHandling.actionTypeLabel')}</InputLabel>
              <Select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                label={t('eventHandling.actionTypeLabel')}
              >
                <MenuItem value="prompt">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BiMessageEdit style={{ fontSize: 16, color: '#9c27b0' }} />
                    {t('eventHandling.executePrompt')}
                  </Box>
                </MenuItem>
                <MenuItem value="workflow_event">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WorkflowIcon sx={{ fontSize: 16, color: '#ff9800' }} />
                    {t('eventHandling.sendWorkflowEvent')}
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {actionType === 'prompt' && (
              <FormControl fullWidth size="small" required>
                <InputLabel>{t('eventHandling.promptLabel')}</InputLabel>
                <Select
                  value={actionPromptId}
                  onChange={(e) => setActionPromptId(e.target.value)}
                  label={t('eventHandling.promptLabel')}
                >
                  {prompts.length === 0 ? (
                    <MenuItem value="" disabled>
                      <em>{t('eventHandling.noPromptsAvailable')}</em>
                    </MenuItem>
                  ) : (
                    prompts.map((prompt) => (
                      <MenuItem key={prompt.id} value={prompt.id}>
                        {prompt.title}
                      </MenuItem>
                    ))
                  )}
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                  {t('eventHandling.promptHelper')}
                </Typography>
              </FormControl>
            )}

            {actionType === 'workflow_event' && (
              <>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {workflows.length > 0 ? (
                    <FormControl sx={{ flex: 1 }} size="small" required>
                      <InputLabel>{t('eventHandling.workflowLabel')}</InputLabel>
                      <Select
                        value={actionWorkflowId}
                        onChange={(e) => setActionWorkflowId(e.target.value)}
                        label={t('eventHandling.workflowLabel')}
                      >
                        {workflows.map((wf) => (
                          <MenuItem key={wf.id} value={wf.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <WorkflowIcon sx={{ fontSize: 14, color: '#ff9800' }} />
                              {wf.name}
                              <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>({wf.id})</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      label={t('eventHandling.workflowIdLabel')}
                      sx={{ flex: 1 }}
                      size="small"
                      value={actionWorkflowId}
                      onChange={(e) => setActionWorkflowId(e.target.value)}
                      placeholder={t('eventHandling.workflowIdPlaceholder')}
                      helperText={t('eventHandling.workflowIdHelper')}
                      required
                    />
                  )}
                  <TextField
                    label={t('eventHandling.eventNameActionLabel')}
                    sx={{ flex: 1 }}
                    size="small"
                    value={actionWorkflowEvent}
                    onChange={(e) => setActionWorkflowEvent(e.target.value.toUpperCase())}
                    placeholder={t('eventHandling.eventNameActionPlaceholder')}
                    helperText={t('eventHandling.eventNameActionHelper')}
                    required
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={actionMapPayload}
                      onChange={(e) => setActionMapPayload(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {t('eventHandling.passPayloadToWorkflow')}
                    </Typography>
                  }
                />
                {actionWorkflowId && (
                  <Alert severity="info" icon={<WorkflowIcon fontSize="small" />} sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                    {t('eventHandling.workflowTriggerInfo', { event: actionWorkflowEvent || '...', workflow: actionWorkflowId })}
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseRuleDialog} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSaveRule}
            variant="contained"
            disabled={!ruleName || (actionType === 'prompt' ? !actionPromptId : (!actionWorkflowId || !actionWorkflowEvent))}
            sx={{ textTransform: 'none' }}
          >
            {editingRule ? t('eventHandling.updateRule') : t('eventHandling.createRule')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prompt Dialog */}
      <Dialog
        open={promptDialogOpen}
        onClose={handleClosePromptDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              {editingPrompt ? t('eventHandling.editPromptTitle') : t('eventHandling.createPromptTitle')}
            </Typography>
            <IconButton onClick={handleClosePromptDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label={t('eventHandling.promptTitleLabel')}
              fullWidth
              size="small"
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              required
              placeholder={t('eventHandling.promptTitlePlaceholder')}
              helperText={t('eventHandling.promptTitleHelper')}
            />

            <TextField
              label={t('eventHandling.promptContentLabel')}
              fullWidth
              size="small"
              multiline
              rows={8}
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              required
              placeholder={t('eventHandling.promptContentPlaceholder')}
              helperText={t('eventHandling.promptContentHelper')}
            />

            {editingPrompt && (
              <Alert severity="info" sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                {t('eventHandling.promptIdInfo', { id: editingPrompt.id })}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClosePromptDialog} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSavePrompt}
            variant="contained"
            disabled={!promptTitle || !promptContent}
            sx={{ textTransform: 'none' }}
          >
            {editingPrompt ? t('eventHandling.updatePrompt') : t('eventHandling.createPrompt')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EventHandling;
