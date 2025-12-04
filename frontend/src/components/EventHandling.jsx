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
  Card,
  CardContent,
  CardActions,
  Stack,
  Alert,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Menu
} from '@mui/material';
import {
  Add as AddIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  ExpandMore as ExpandMoreIcon,
  Event as EventIcon,
  Rule as RuleIcon,
  Info as InfoIcon,
  ContentCopy as ContentCopyIcon,
  Send as SendIcon,
  Description as DescriptionIcon,
  History as HistoryIcon,
  FolderOpen as FileWatcherIcon,
  Sensors as MqttIcon,
  Code as ClaudeCodeIcon,
  Schedule as ScheduleIcon,
  MoreVert as MoreVertIcon,
  Webhook as WebhookIcon
} from '@mui/icons-material';
import { BiMessageEdit, BiHelpCircle } from 'react-icons/bi';
import { PiHeartbeat, PiSecurityCameraFill } from 'react-icons/pi';
import { FcWorkflow } from 'react-icons/fc';
import { IoMdNotificationsOutline, IoMdNotificationsOff } from 'react-icons/io';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import LiveEventsTab from './LiveEventsTab';

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
  }
};

// Helper to get group styling
const getGroupStyle = (group) => EVENT_GROUP_CONFIG[group] || {
  icon: EventIcon,
  color: '#757575',
  bgColor: '#f5f5f5'
};

const EventHandling = ({ selectedProject, onClose }) => {
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
  const [actionPromptId, setActionPromptId] = useState('');

  // Webhook test state
  const [webhookEventName, setWebhookEventName] = useState('Test Event');
  const [webhookEventGroup, setWebhookEventGroup] = useState('Claude Code');
  const [webhookPayload, setWebhookPayload] = useState('{}');
  const [webhookResponse, setWebhookResponse] = useState(null);
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

  // Prompt execution state
  const [promptExecutions, setPromptExecutions] = useState([]);

  // Service status state
  const [serviceStatus, setServiceStatus] = useState({
    mqtt: { connected: false, subscriptions: [] }
  });

  const eventGroups = ['Filesystem', 'MQTT', 'Scheduling', 'Claude Code', 'Webhook'];

  // Define supported event names per group
  const eventNamesByGroup = {
    'Filesystem': ['File Created', 'File Modified', 'File Deleted', 'Directory Created', 'Directory Deleted'],
    'MQTT': ['Message Received', 'Connection Established', 'Connection Lost'],
    'Scheduling': ['Task Scheduled', 'Task Executed', 'Task Failed'],
    'Claude Code': ['File Created', 'File Modified', 'Session Started', 'Session Ended', 'Tool Executed'],
    'Webhook': ['Webhook Received']
  };

  // Load rules from API
  const loadRules = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:6060/api/rules/${selectedProject}`);
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

    const sse = new EventSource(`http://localhost:6060/api/events/${selectedProject}/stream`);

    const addOrUpdateEvent = (newEvent) => {
      setLiveEvents((prev) => {
        // Check if event with same ID already exists
        const existingIndex = prev.findIndex(e => e.id === newEvent.id);

        if (existingIndex !== -1) {
          // Update existing event (merge triggeredRules if present)
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...newEvent,
            triggeredRules: newEvent.triggeredRules || updated[existingIndex].triggeredRules
          };
          return updated;
        } else {
          // Add new event
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
        // Update existing or add new
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
      const response = await axios.get(`http://localhost:6060/api/external-events/${selectedProject}/status`);
      setServiceStatus(prev => ({
        ...prev,
        mqtt: {
          connected: response.data.connected || false,
          subscriptions: response.data.subscriptions || []
        }
      }));
    } catch (error) {
      // MQTT may not be configured, that's okay
      console.log('MQTT status not available:', error.message);
    }
  };

  useEffect(() => {
    loadRules();
    loadPrompts();
    loadEventLog();
    loadMqttStatus();
  }, [selectedProject]);

  // Load event log from API
  const loadEventLog = async () => {
    if (!selectedProject) return;

    try {
      setLoadingEventLog(true);
      const response = await axios.get(`http://localhost:6060/api/events/${selectedProject}/latest?limit=50`);
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
      const response = await axios.get(`http://localhost:6060/api/prompts/${selectedProject}`);
      if (response.data.success) {
        setPrompts(response.data.prompts || []);
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setPrompts([]);
    }
  };

  // Extract payload matcher from rule condition event object
  const extractPayloadMatcher = (event) => {
    if (!event) return '';
    // Find any key that's not group, name, topic, or source (those are standard fields)
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
      setConditionType(rule.condition.type);
      setEventGroup(rule.condition.event?.group || '');
      setEventName(rule.condition.event?.name || '');
      setEventTopic(rule.condition.event?.topic || '');
      setPayloadPath(extractPayloadMatcher(rule.condition.event));
      setActionPromptId(rule.action.promptId);
    } else {
      setEditingRule(null);
      setRuleName('');
      setRuleEnabled(true);
      setConditionType('simple');
      setEventGroup('');
      setEventName('');
      setEventTopic('');
      setPayloadPath('');
      setActionPromptId('');
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

    const ruleData = {
      name: ruleName,
      enabled: ruleEnabled,
      condition: {
        type: conditionType,
        event: {
          ...(eventGroup && { group: eventGroup }),
          ...(eventName && { name: eventName }),
          ...(eventTopic && { topic: eventTopic }),
          ...payloadMatcher
        }
      },
      action: {
        type: 'prompt',
        promptId: actionPromptId
      }
    };

    try {
      if (editingRule) {
        await axios.put(`http://localhost:6060/api/rules/${selectedProject}/${editingRule.id}`, ruleData);
      } else {
        await axios.post(`http://localhost:6060/api/rules/${selectedProject}`, ruleData);
      }
      await loadRules();
      handleCloseRuleDialog();
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await axios.put(`http://localhost:6060/api/rules/${selectedProject}/${rule.id}`, {
        enabled: !rule.enabled
      });
      await loadRules();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await axios.delete(`http://localhost:6060/api/rules/${selectedProject}/${ruleId}`);
      await loadRules();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleCopyWebhookUrl = () => {
    const webhookUrl = `http://localhost:6060/api/events/${selectedProject}`;
    navigator.clipboard.writeText(webhookUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSendTestEvent = async () => {
    try {
      let payload;
      try {
        payload = JSON.parse(webhookPayload);
      } catch (e) {
        setWebhookResponse({ error: 'Invalid JSON in payload' });
        return;
      }

      const response = await axios.post(`http://localhost:6060/api/events/${selectedProject}`, {
        name: webhookEventName,
        group: webhookEventGroup,
        source: 'Manual Test',
        payload
      });

      setWebhookResponse({ success: true, data: response.data });
    } catch (error) {
      setWebhookResponse({
        error: error.response?.data?.message || error.message
      });
    }
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
        // Update existing prompt
        await axios.put(`http://localhost:6060/api/prompts/${selectedProject}/${editingPrompt.id}`, {
          title: promptTitle,
          content: promptContent
        });
      } else {
        // Create new prompt
        await axios.post(`http://localhost:6060/api/prompts/${selectedProject}`, {
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
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      await axios.delete(`http://localhost:6060/api/prompts/${selectedProject}/${promptId}`);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to delete prompt:', error);
    }
  };

  if (!selectedProject) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Please select a project to manage condition monitoring
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
              {/* Rotating neon border line */}
              <Box
                sx={{
                  position: 'absolute',
                  inset: -20,
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 340deg, #667eea 350deg, #764ba2 360deg)',
                  animation: 'neonBorderSweep 4s linear infinite',
                  zIndex: 0
                }}
              />
              {/* Inner background to mask center */}
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
              Condition Monitoring
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenRuleDialog()}
              sx={{ textTransform: 'none' }}
            >
              New Rule
            </Button>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ px: 3 }}>
          <Tab label="Action" icon={<BiMessageEdit style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="Rules" icon={<IoMdNotificationsOutline style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab
            label={`Live Events ${eventStream ? '●' : ''}`}
            icon={<PiHeartbeat style={{ fontSize: 20 }} />}
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
          <Tab label="Event Log" icon={<HistoryIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="WebHooks" icon={<WebhookIcon sx={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="Examples" icon={<BiHelpCircle style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="Use Cases" icon={<FcWorkflow style={{ fontSize: 20 }} />} iconPosition="start" sx={{ textTransform: 'none' }} />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : currentTab === 0 ? (
          // Tab 0: Action
          <Box>
            {prompts.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="body2" sx={{marginLeft: '20px'}} color="text.secondary">
                  Manage reusable action templates for your rule actions
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenPromptDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  New Action
                </Button>
              </Box>
            )}

            {prompts.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <BiMessageEdit style={{ fontSize: 48, color: '#ccc', marginBottom: 12, opacity: 0.5 }} />
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No actions defined
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                  Create reusable action templates to use in your rules
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenPromptDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  Create First Action
                </Button>
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'background.paper' }}>
                        <TableCell sx={{ width: 50 }}></TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Prompt</TableCell>
                        <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {prompts.map((prompt, idx) => (
                        <TableRow
                          key={prompt.id}
                          sx={{
                            bgcolor: idx % 2 === 0 ? 'transparent' : 'grey.50',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                        >
                          <TableCell sx={{ textAlign: 'center' }}>
                            <BiMessageEdit style={{ fontSize: 20, color: '#757575' }} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>
                            {prompt.title}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {prompt.content.substring(0, 120)}{prompt.content.length > 120 ? '...' : ''}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                setPromptMenuAnchor(e.currentTarget);
                                setSelectedPromptForMenu(prompt);
                              }}
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Menu
                  anchorEl={promptMenuAnchor}
                  open={Boolean(promptMenuAnchor)}
                  onClose={() => {
                    setPromptMenuAnchor(null);
                    setSelectedPromptForMenu(null);
                  }}
                >
                  <MenuItem
                    onClick={() => {
                      handleOpenPromptDialog(selectedPromptForMenu);
                      setPromptMenuAnchor(null);
                      setSelectedPromptForMenu(null);
                    }}
                  >
                    <EditIcon fontSize="small" sx={{ mr: 1 }} />
                    Edit
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      handleDeletePrompt(selectedPromptForMenu?.id);
                      setPromptMenuAnchor(null);
                      setSelectedPromptForMenu(null);
                    }}
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    Delete
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        ) : currentTab === 1 ? (
          // Tab 1: Rules
          <Box>
            {rules.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="body2" sx={{ marginLeft: '20px' }} color="text.secondary">
                  Manage condition monitoring rules
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenRuleDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  New Rule
                </Button>
              </Box>
            )}

            {rules.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <IoMdNotificationsOff style={{ fontSize: 48, color: '#ccc', marginBottom: 12, opacity: 0.5 }} />
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No rules configured
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                  Create your first rule to start monitoring conditions
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenRuleDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  Create First Rule
                </Button>
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'background.paper' }}>
                        <TableCell sx={{ width: 50 }}></TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Event Group</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                        <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rules.map((rule, idx) => {
                        const groupStyle = rule.condition.event?.group ? getGroupStyle(rule.condition.event.group) : null;
                        const GroupIcon = groupStyle?.icon;
                        const actionPrompt = prompts.find(p => p.id === rule.action.promptId);
                        return (
                          <TableRow
                            key={rule.id}
                            sx={{
                              bgcolor: idx % 2 === 0 ? 'transparent' : 'grey.50',
                              '&:hover': { bgcolor: 'action.hover' }
                            }}
                          >
                            <TableCell sx={{ textAlign: 'center' }}>
                              {rule.enabled ? (
                                <IoMdNotificationsOutline style={{ fontSize: 20, color: '#4caf50' }} />
                              ) : (
                                <IoMdNotificationsOff style={{ fontSize: 20, color: '#ccc' }} />
                              )}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 500 }}>
                              {rule.name}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={rule.condition.type}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {groupStyle && GroupIcon ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <GroupIcon sx={{ fontSize: 16, color: groupStyle.color }} />
                                  <Typography variant="body2" color="text.secondary">
                                    {rule.condition.event.group}
                                  </Typography>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.disabled">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {actionPrompt?.title || rule.action.promptId}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  setRuleMenuAnchor(e.currentTarget);
                                  setSelectedRuleForMenu(rule);
                                }}
                              >
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Menu
                  anchorEl={ruleMenuAnchor}
                  open={Boolean(ruleMenuAnchor)}
                  onClose={() => {
                    setRuleMenuAnchor(null);
                    setSelectedRuleForMenu(null);
                  }}
                >
                  <MenuItem
                    onClick={() => {
                      handleToggleRule(selectedRuleForMenu);
                      setRuleMenuAnchor(null);
                      setSelectedRuleForMenu(null);
                    }}
                  >
                    {selectedRuleForMenu?.enabled ? <PauseIcon fontSize="small" sx={{ mr: 1 }} /> : <PlayIcon fontSize="small" sx={{ mr: 1 }} />}
                    {selectedRuleForMenu?.enabled ? 'Disable' : 'Enable'}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      handleOpenRuleDialog(selectedRuleForMenu);
                      setRuleMenuAnchor(null);
                      setSelectedRuleForMenu(null);
                    }}
                  >
                    <EditIcon fontSize="small" sx={{ mr: 1 }} />
                    Edit
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      handleDeleteRule(selectedRuleForMenu?.id);
                      setRuleMenuAnchor(null);
                      setSelectedRuleForMenu(null);
                    }}
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    Delete
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        ) : currentTab === 2 ? (
          // Tab 2: Live Events - Column-based display by source
          <LiveEventsTab liveEvents={liveEvents} eventStream={eventStream} promptExecutions={promptExecutions} serviceStatus={serviceStatus} />
        ) : currentTab === 3 ? (
          // Tab 3: Event Log
          <Box>
            {loadingEventLog ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : eventLog.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5, opacity: 0.5 }} />
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No events logged yet
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  Events that trigger rules will appear here
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Timestamp</strong></TableCell>
                      <TableCell><strong>Event Name</strong></TableCell>
                      <TableCell><strong>Group</strong></TableCell>
                      <TableCell><strong>Source</strong></TableCell>
                      <TableCell><strong>Triggered Rules</strong></TableCell>
                      <TableCell><strong>Payload</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eventLog.map((entry, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(entry.event.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>{entry.event.name}</TableCell>
                        <TableCell>
                          {(() => {
                            const style = getGroupStyle(entry.event.group);
                            const GroupIcon = style.icon;
                            return (
                              <Chip
                                icon={<GroupIcon sx={{ fontSize: 14, color: `${style.color} !important` }} />}
                                label={entry.event.group}
                                size="small"
                                sx={{
                                  bgcolor: style.bgColor,
                                  color: style.color,
                                  fontWeight: 500,
                                  '& .MuiChip-icon': { ml: 0.5 }
                                }}
                              />
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Chip label={entry.event.source} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.triggeredRules.length}
                            size="small"
                            color={entry.triggeredRules.length > 0 ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: 'monospace',
                              maxWidth: 300,
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {JSON.stringify(entry.event.payload)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        ) : currentTab === 4 ? (
          // Tab 4: WebHooks
          <Box>
            
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              POST events to this project from external systems or test your rules manually
            </Typography>

    

            {/* Webhook URL Display */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Webhook URL
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  value={`http://localhost:6060/api/events/${selectedProject}`}
                  InputProps={{
                    readOnly: true,
                    sx: { fontFamily: 'monospace', fontSize: '0.75rem' }
                  }}
                  size="small"
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                  onClick={handleCopyWebhookUrl}
                  sx={{ textTransform: 'none', minWidth: 80, fontSize: '0.75rem' }}
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </Button>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Test Event Form */}
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Send Test Event
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Event Name"
                fullWidth
                value={webhookEventName}
                onChange={(e) => setWebhookEventName(e.target.value)}
                size="small"
                InputProps={{ sx: { fontSize: '0.85rem' } }}
                InputLabelProps={{ sx: { fontSize: '0.85rem' } }}
              />
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.85rem' }}>Event Group</InputLabel>
                <Select
                  value={webhookEventGroup}
                  onChange={(e) => setWebhookEventGroup(e.target.value)}
                  label="Event Group"
                  sx={{ fontSize: '0.85rem' }}
                  renderValue={(selected) => {
                    const style = getGroupStyle(selected);
                    const GroupIcon = style.icon;
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                        {selected}
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
                          {group}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
              <TextField
                label="Payload (JSON)"
                fullWidth
                multiline
                rows={3}
                value={webhookPayload}
                onChange={(e) => setWebhookPayload(e.target.value)}
                placeholder='{"key": "value"}'
                size="small"
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                InputLabelProps={{ sx: { fontSize: '0.85rem' } }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<SendIcon sx={{ fontSize: 16 }} />}
                onClick={handleSendTestEvent}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                Send Test Event
              </Button>

              {webhookResponse && (
                <Alert
                  severity={webhookResponse.error ? 'error' : 'success'}
                  onClose={() => setWebhookResponse(null)}
                  sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}
                >
                  {webhookResponse.error ? (
                    <>Error: {webhookResponse.error}</>
                  ) : (
                    <>Success! Event ID: {webhookResponse.data?.event?.id}</>
                  )}
                </Alert>
              )}
            </Stack>
          </Box>
        ) : currentTab === 5 ? (
          // Tab 5: Examples
          <Box>
            <Stack spacing={3}>
              {/* Simple Condition Example */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label="Simple" color="primary" size="small" />
                    Simple Condition
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Use simple conditions for exact matching of event properties. Perfect for straightforward triggers like "when a Python file is created" or "when a specific MQTT topic receives a message".
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Example: Monitor Python file creation
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {`{
  "type": "simple",
  "event": {
    "group": "Filesystem",
    "name": "File Created",
    "payload.path": "*.py"
  }
}`}
                  </Paper>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Simple conditions support wildcard matching with * in string values
                  </Alert>
                </CardContent>
              </Card>

              {/* Semantic Condition Example */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label="Semantic" color="secondary" size="small" />
                    Semantic Condition
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Use semantic conditions for AI-powered similarity matching. Great for finding related content or detecting semantically similar events even when exact wording differs.
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Example: Find authentication-related code changes
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {`{
  "type": "semantic",
  "event": {
    "group": "Filesystem",
    "payload": {
      "similarity": {
        "query": "user authentication and login security",
        "threshold": 0.86
      }
    }
  }
}`}
                  </Paper>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Semantic matching uses vector embeddings with a default threshold of 0.86
                  </Alert>
                </CardContent>
              </Card>

              {/* Compound Condition Example */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label="Compound" color="warning" size="small" />
                    Compound Condition
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Use compound conditions to combine multiple conditions with logical operators (AND, OR, NOT). Ideal for complex scenarios requiring multiple criteria.
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Example: Monitor test file changes AND config changes
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {`{
  "type": "compound",
  "operator": "AND",
  "conditions": [
    {
      "type": "simple",
      "event": { "group": "Filesystem", "name": "File Modified" }
    },
    {
      "type": "simple",
      "event": { "payload.path": "*/test/*" }
    }
  ],
  "timeWindow": 300000
}`}
                  </Paper>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Compound conditions support AND, OR, and NOT operators with optional time windows (in milliseconds)
                  </Alert>
                </CardContent>
              </Card>

              {/* Temporal Constraint Example */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label="Temporal" color="success" size="small" />
                    Temporal Constraint
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Use temporal constraints to filter events by time of day or day of week. Perfect for business hours monitoring or scheduled maintenance windows.
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Example: Monitor during business hours only
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {`{
  "type": "temporal",
  "time": {
    "after": "09:00",
    "before": "17:00",
    "dayOfWeek": [1, 2, 3, 4, 5]
  }
}`}
                  </Paper>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Day of week: 0=Sunday, 1=Monday, ..., 6=Saturday. Times use 24-hour format (HH:MM)
                  </Alert>
                </CardContent>
              </Card>
            </Stack>
          </Box>
        ) : currentTab === 6 ? (
          // Tab 6: Use Cases
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <img
              src="/condition-monitoring-usecases.jpg"
              alt="Condition Monitoring Use Cases"
              style={{
                maxWidth: 1000,
                width: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 8
              }}
            />
          </Box>
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
              {editingRule ? 'Edit Rule' : 'Create New Rule'}
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
                label="Rule Name"
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
                label="Enabled"
                sx={{ minWidth: 100 }}
              />
            </Box>

            <Divider>
              <Chip label="Condition" size="small" />
            </Divider>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl sx={{ flex: 1 }} size="small">
                <InputLabel>Condition Type</InputLabel>
                <Select
                  value={conditionType}
                  onChange={(e) => setConditionType(e.target.value)}
                  label="Condition Type"
                >
                  <MenuItem value="simple">Simple</MenuItem>
                  <MenuItem value="semantic">Semantic</MenuItem>
                  <MenuItem value="compound">Compound</MenuItem>
                  <MenuItem value="temporal">Temporal</MenuItem>
                </Select>
              </FormControl>

              {conditionType === 'simple' && (
                <FormControl sx={{ flex: 1 }} size="small">
                  <InputLabel>Event Group</InputLabel>
                  <Select
                    value={eventGroup}
                    onChange={(e) => setEventGroup(e.target.value)}
                    label="Event Group"
                    renderValue={(selected) => {
                      const style = getGroupStyle(selected);
                      const GroupIcon = style.icon;
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                          {selected}
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
                            {group}
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            </Box>

            {conditionType === 'simple' && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>Event Name (optional)</InputLabel>
                  <Select
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    label="Event Name (optional)"
                    disabled={!eventGroup}
                  >
                    <MenuItem value="">
                      <em>Any Event</em>
                    </MenuItem>
                    {eventGroup && eventNamesByGroup[eventGroup]?.map((name) => (
                      <MenuItem key={name} value={name}>{name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Topic Pattern (optional)"
                  fullWidth
                  size="small"
                  value={eventTopic}
                  onChange={(e) => setEventTopic(e.target.value)}
                  placeholder="e.g., /sensors/* or /workspace/docs"
                  helperText="Use * for wildcards"
                />

                <TextField
                  label="Payload Matcher (optional)"
                  fullWidth
                  size="small"
                  value={payloadPath}
                  onChange={(e) => setPayloadPath(e.target.value)}
                  placeholder="e.g., payload.path:*.py"
                  helperText="Format: field:pattern"
                />
              </>
            )}

            {conditionType === 'semantic' && (
              <TextField
                label="Semantic Query"
                fullWidth
                size="small"
                multiline
                rows={3}
                value={payloadPath}
                onChange={(e) => setPayloadPath(e.target.value)}
                placeholder="Describe what you're looking for in natural language"
                helperText="e.g., 'errors in the authentication module' or 'file changes in Python code'"
                required
              />
            )}

            <Alert severity="info" icon={<InfoIcon fontSize="small" />} sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
              {conditionType === 'simple' && 'Simple conditions match event fields exactly'}
              {conditionType === 'semantic' && 'Semantic conditions use AI similarity matching (threshold: 0.86)'}
              {conditionType === 'compound' && 'Compound conditions combine multiple conditions with AND/OR/NOT'}
              {conditionType === 'temporal' && 'Temporal conditions filter by time or day of week'}
            </Alert>

            <Divider>
              <Chip label="Action" size="small" />
            </Divider>

            <FormControl fullWidth size="small" required>
              <InputLabel>Prompt</InputLabel>
              <Select
                value={actionPromptId}
                onChange={(e) => setActionPromptId(e.target.value)}
                label="Prompt"
              >
                {prompts.length === 0 ? (
                  <MenuItem value="" disabled>
                    <em>No prompts available - create one in the Prompts tab</em>
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
                The prompt/template to execute when this rule triggers
              </Typography>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseRuleDialog} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveRule}
            variant="contained"
            disabled={!ruleName || !actionPromptId}
            sx={{ textTransform: 'none' }}
          >
            {editingRule ? 'Update Rule' : 'Create Rule'}
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
              {editingPrompt ? 'Edit Prompt' : 'Create New Prompt'}
            </Typography>
            <IconButton onClick={handleClosePromptDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Prompt Title"
              fullWidth
              size="small"
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              required
              placeholder="e.g., File Creation Handler"
              helperText="A descriptive name for this prompt template"
            />

            <TextField
              label="Prompt Content"
              fullWidth
              size="small"
              multiline
              rows={8}
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              required
              placeholder="Enter the prompt template content..."
              helperText="The actual prompt text that will be used when this rule triggers"
            />

            {editingPrompt && (
              <Alert severity="info" sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                Prompt ID: <code>{editingPrompt.id}</code>
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClosePromptDialog} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSavePrompt}
            variant="contained"
            disabled={!promptTitle || !promptContent}
            sx={{ textTransform: 'none' }}
          >
            {editingPrompt ? 'Update Prompt' : 'Create Prompt'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EventHandling;
