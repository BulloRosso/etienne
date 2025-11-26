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
  TableRow
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
  History as HistoryIcon
} from '@mui/icons-material';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

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

  const eventGroups = ['Filesystem', 'MQTT', 'Scheduling', 'Claude Code'];

  // Define supported event names per group
  const eventNamesByGroup = {
    'Filesystem': ['File Created', 'File Modified', 'File Deleted', 'Directory Created', 'Directory Deleted'],
    'MQTT': ['Message Received', 'Connection Established', 'Connection Lost'],
    'Scheduling': ['Task Scheduled', 'Task Executed', 'Task Failed'],
    'Claude Code': ['File Created', 'File Modified', 'Session Started', 'Session Ended', 'Tool Executed']
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

    sse.onerror = (error) => {
      console.error('SSE error:', error);
    };

    setEventStream(sse);

    return () => {
      sse.close();
    };
  }, [selectedProject]);

  useEffect(() => {
    loadRules();
    loadPrompts();
    loadEventLog();
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

  // Load prompts from localStorage
  const loadPrompts = () => {
    if (!selectedProject) return;

    const key = `prompts_${selectedProject}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setPrompts(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to load prompts:', error);
        setPrompts([]);
      }
    } else {
      setPrompts([]);
    }
  };

  // Save prompts to localStorage
  const savePrompts = (updatedPrompts) => {
    if (!selectedProject) return;

    const key = `prompts_${selectedProject}`;
    localStorage.setItem(key, JSON.stringify(updatedPrompts));
    setPrompts(updatedPrompts);
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
      setPayloadPath('');
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

  const handleSaveRule = async () => {
    const ruleData = {
      name: ruleName,
      enabled: ruleEnabled,
      condition: {
        type: conditionType,
        event: {
          ...(eventGroup && { group: eventGroup }),
          ...(eventName && { name: eventName }),
          ...(eventTopic && { topic: eventTopic }),
          ...(payloadPath && { [payloadPath.split(':')[0]]: payloadPath.split(':')[1] })
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

  const handleSavePrompt = () => {
    if (!promptTitle || !promptContent) return;

    const updatedPrompts = [...prompts];

    if (editingPrompt) {
      // Update existing prompt
      const index = updatedPrompts.findIndex(p => p.id === editingPrompt.id);
      if (index !== -1) {
        updatedPrompts[index] = {
          ...updatedPrompts[index],
          title: promptTitle,
          content: promptContent,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      // Create new prompt
      updatedPrompts.push({
        id: uuidv4(),
        title: promptTitle,
        content: promptContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    savePrompts(updatedPrompts);
    handleClosePromptDialog();
  };

  const handleDeletePrompt = (promptId) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    const updatedPrompts = prompts.filter(p => p.id !== promptId);
    savePrompts(updatedPrompts);
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
              component="img"
              src="/conditionmonitoring.jpg"
              alt="Condition Monitoring"
              sx={{ width: 48, height: 48, borderRadius: 1, objectFit: 'cover' }}
            />
            <Box>
              <Typography variant="h5" fontWeight={600} sx={{ pt: '3px', pl: '3px' }}>
                Condition Monitoring
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ pl: '3px' }}>
                {selectedProject}
              </Typography>
            </Box>
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
          <Tab label="Rules" icon={<RuleIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab
            label={`Live Events ${eventStream ? '●' : ''}`}
            icon={<EventIcon />}
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
          <Tab label="Event Log" icon={<HistoryIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="Examples" icon={<InfoIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="Prompts" icon={<DescriptionIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
          <Tab label="WebHooks" icon={<SendIcon />} iconPosition="start" sx={{ textTransform: 'none' }} />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : currentTab === 0 ? (
          // Tab 0: Rules
          <Box>
            {rules.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <RuleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No rules configured
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Create your first rule to start monitoring conditions
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenRuleDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  Create First Rule
                </Button>
              </Paper>
            ) : (
              <Stack spacing={2}>
                {rules.map((rule) => (
                  <Card key={rule.id} variant="outlined" sx={{ '&:hover': { boxShadow: 2 } }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="h6" fontWeight={600}>
                              {rule.name}
                            </Typography>
                            <Chip
                              label={rule.enabled ? 'Enabled' : 'Disabled'}
                              size="small"
                              color={rule.enabled ? 'success' : 'default'}
                            />
                            <Chip
                              label={rule.condition.type}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            Created: {new Date(rule.createdAt).toLocaleDateString()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title={rule.enabled ? 'Disable' : 'Enable'}>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleRule(rule)}
                              color={rule.enabled ? 'primary' : 'default'}
                            >
                              {rule.enabled ? <PauseIcon /> : <PlayIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenRuleDialog(rule)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteRule(rule.id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>

                      <Divider sx={{ my: 2 }} />

                      <Accordion disableGutters elevation={0}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="body2" fontWeight={600}>
                            Condition Details
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack spacing={1}>
                            {rule.condition.event?.group && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">Group:</Typography>
                                <Typography variant="body2">{rule.condition.event.group}</Typography>
                              </Box>
                            )}
                            {rule.condition.event?.name && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">Event Name:</Typography>
                                <Typography variant="body2">{rule.condition.event.name}</Typography>
                              </Box>
                            )}
                            {rule.condition.event?.topic && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">Topic:</Typography>
                                <Typography variant="body2">{rule.condition.event.topic}</Typography>
                              </Box>
                            )}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>

                      <Accordion disableGutters elevation={0}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="body2" fontWeight={600}>
                            Action Details
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Type:</Typography>
                            <Typography variant="body2">{rule.action.type}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Prompt ID:</Typography>
                            <Typography variant="body2" fontFamily="monospace">
                              {rule.action.promptId}
                            </Typography>
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : currentTab === 1 ? (
          // Tab 1: Live Events
          <Box>
            {liveEvents.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <EventIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Waiting for events...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {eventStream ? 'Connected to event stream' : 'Connecting...'}
                </Typography>
              </Paper>
            ) : (
              <Stack spacing={2}>
                {liveEvents.map((event, idx) => (
                  <Card
                    key={idx}
                    variant="outlined"
                    sx={{
                      borderLeft: 4,
                      borderLeftColor: event.triggeredRules && event.triggeredRules.length > 0
                        ? 'success.main'
                        : 'grey.300'
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                          {event.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                        <Chip label={event.group} size="small" />
                        <Chip label={event.source} size="small" variant="outlined" />
                      </Stack>
                      {event.topic && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Topic: {event.topic}
                        </Typography>
                      )}
                      {event.triggeredRules && event.triggeredRules.length > 0 && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                          Triggered {event.triggeredRules.length} rule(s)
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : currentTab === 2 ? (
          // Tab 2: Event Log
          <Box>
            {loadingEventLog ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : eventLog.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No events logged yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Events that trigger rules will appear here
                </Typography>
              </Paper>
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
                          <Chip label={entry.event.group} size="small" />
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
        ) : currentTab === 3 ? (
          // Tab 3: Examples
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
        ) : currentTab === 4 ? (
          // Tab 4: Prompts
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Manage reusable prompt templates for your rule actions
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenPromptDialog()}
                sx={{ textTransform: 'none' }}
              >
                New Prompt
              </Button>
            </Box>

            {prompts.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <DescriptionIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No prompts defined
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Create reusable prompt templates to use in your rules
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenPromptDialog()}
                  sx={{ textTransform: 'none' }}
                >
                  Create First Prompt
                </Button>
              </Paper>
            ) : (
              <Stack spacing={2}>
                {prompts.map((prompt) => (
                  <Card key={prompt.id} variant="outlined" sx={{ '&:hover': { boxShadow: 2 } }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" fontWeight={600} gutterBottom>
                            {prompt.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            ID: <code style={{ fontSize: '0.85em' }}>{prompt.id}</code>
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
                            "{prompt.content.substring(0, 150)}{prompt.content.length > 150 ? '...' : ''}"
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created: {new Date(prompt.createdAt).toLocaleString()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenPromptDialog(prompt)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleDeletePrompt(prompt.id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : currentTab === 5 ? (
          // Tab 5: WebHooks
          <Box>
            <Paper sx={{ p: 3 }} variant="outlined">
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendIcon color="primary" />
            Webhook Integration
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            POST events to this project from external systems or test your rules manually
          </Typography>

          <Divider sx={{ mb: 3 }} />

          {/* Webhook URL Display */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Webhook URL
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                fullWidth
                value={`http://localhost:6060/api/events/${selectedProject}`}
                InputProps={{
                  readOnly: true,
                  sx: { fontFamily: 'monospace', fontSize: '0.9rem' }
                }}
                size="small"
              />
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyWebhookUrl}
                sx={{ textTransform: 'none', minWidth: 100 }}
              >
                {copySuccess ? 'Copied!' : 'Copy'}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Send POST requests to this URL with event data in the request body
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* Test Event Form */}
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Send Test Event
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Event Name"
              fullWidth
              value={webhookEventName}
              onChange={(e) => setWebhookEventName(e.target.value)}
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Event Group</InputLabel>
              <Select
                value={webhookEventGroup}
                onChange={(e) => setWebhookEventGroup(e.target.value)}
                label="Event Group"
              >
                {eventGroups.map((group) => (
                  <MenuItem key={group} value={group}>{group}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Payload (JSON)"
              fullWidth
              multiline
              rows={4}
              value={webhookPayload}
              onChange={(e) => setWebhookPayload(e.target.value)}
              placeholder='{"key": "value"}'
              size="small"
              sx={{ fontFamily: 'monospace' }}
            />
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={handleSendTestEvent}
              sx={{ textTransform: 'none' }}
            >
              Send Test Event
            </Button>

            {webhookResponse && (
              <Alert
                severity={webhookResponse.error ? 'error' : 'success'}
                onClose={() => setWebhookResponse(null)}
              >
                {webhookResponse.error ? (
                  <Typography variant="body2">
                    <strong>Error:</strong> {webhookResponse.error}
                  </Typography>
                ) : (
                  <Typography variant="body2">
                    <strong>Success!</strong> Event published with ID: {webhookResponse.data?.event?.id}
                  </Typography>
                )}
              </Alert>
            )}
          </Stack>
            </Paper>
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
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                label="Rule Name"
                fullWidth
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                required
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={ruleEnabled}
                    onChange={(e) => setRuleEnabled(e.target.checked)}
                  />
                }
                label="Enabled"
                sx={{ minWidth: 120 }}
              />
            </Box>

            <Divider>
              <Chip label="Condition" size="small" />
            </Divider>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl sx={{ flex: 1 }}>
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
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>Event Group</InputLabel>
                  <Select
                    value={eventGroup}
                    onChange={(e) => setEventGroup(e.target.value)}
                    label="Event Group"
                  >
                    {eventGroups.map((group) => (
                      <MenuItem key={group} value={group}>{group}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            {conditionType === 'simple' && (
              <>

                <FormControl fullWidth>
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
                  value={eventTopic}
                  onChange={(e) => setEventTopic(e.target.value)}
                  placeholder="e.g., /sensors/* or /workspace/docs"
                  helperText="Use * for wildcards"
                />

                <TextField
                  label="Payload Matcher (optional)"
                  fullWidth
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
                multiline
                rows={3}
                value={payloadPath}
                onChange={(e) => setPayloadPath(e.target.value)}
                placeholder="Describe what you're looking for in natural language"
                helperText="e.g., 'errors in the authentication module' or 'file changes in Python code'"
                required
              />
            )}

            <Alert severity="info" icon={<InfoIcon />}>
              {conditionType === 'simple' && 'Simple conditions match event fields exactly'}
              {conditionType === 'semantic' && 'Semantic conditions use AI similarity matching (threshold: 0.86)'}
              {conditionType === 'compound' && 'Compound conditions combine multiple conditions with AND/OR/NOT'}
              {conditionType === 'temporal' && 'Temporal conditions filter by time or day of week'}
            </Alert>

            <Divider>
              <Chip label="Action" size="small" />
            </Divider>

            <FormControl fullWidth required>
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
          <Stack spacing={3}>
            <TextField
              label="Prompt Title"
              fullWidth
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              required
              placeholder="e.g., File Creation Handler"
              helperText="A descriptive name for this prompt template"
            />

            <TextField
              label="Prompt Content"
              fullWidth
              multiline
              rows={10}
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              required
              placeholder="Enter the prompt template content..."
              helperText="The actual prompt text that will be used when this rule triggers"
            />

            {editingPrompt && (
              <Alert severity="info">
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
