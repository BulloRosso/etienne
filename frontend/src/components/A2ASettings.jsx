import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  TextField,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
  Tooltip,
  Collapse,
  InputAdornment,
  Divider
} from '@mui/material';
import {
  Add,
  Delete,
  Refresh,
  Link as LinkIcon,
  ExpandMore,
  ExpandLess,
  Search,
  CheckCircle,
  Error as ErrorIcon,
  Speed,
  Notifications,
  History
} from '@mui/icons-material';
import { RiRobot2Line } from 'react-icons/ri';
import { apiAxios } from '../services/api';
import BackgroundInfo from './BackgroundInfo';

const DEFAULT_REGISTRY_URL = 'http://localhost:5600/directory';

export default function A2ASettings({ projectName, showBackgroundInfo }) {
  const [settings, setSettings] = useState({ registryUrl: DEFAULT_REGISTRY_URL, agents: [] });
  const [registryAgents, setRegistryAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [registryUrl, setRegistryUrl] = useState(DEFAULT_REGISTRY_URL);
  const [filterText, setFilterText] = useState('');
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [testingAgent, setTestingAgent] = useState(null);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    loadSettings();
  }, [projectName]);

  const loadSettings = async () => {
    if (!projectName) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiAxios.get(`/api/a2a-settings/${encodeURIComponent(projectName)}`);
      setSettings(response.data);
      setRegistryUrl(response.data.registryUrl || DEFAULT_REGISTRY_URL);
    } catch (err) {
      setError('Failed to load A2A settings');
      console.error('Load A2A settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistry = async () => {
    setRegistryLoading(true);
    setError(null);
    try {
      const response = await apiAxios.get(`/api/a2a-settings/registry/fetch?url=${encodeURIComponent(registryUrl)}`);
      setRegistryAgents(response.data.agents || []);
    } catch (err) {
      setError(`Failed to fetch registry: ${err.response?.data?.message || err.message}`);
      console.error('Fetch registry error:', err);
    } finally {
      setRegistryLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await apiAxios.post(`/api/a2a-settings/${encodeURIComponent(projectName)}`, newSettings);
      setSettings(response.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save A2A settings');
      console.error('Save A2A settings error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAgent = async (agentUrl, enabled) => {
    try {
      const response = await apiAxios.post(`/api/a2a-settings/${encodeURIComponent(projectName)}/toggle`, {
        agentUrl,
        enabled
      });
      setSettings(response.data);
    } catch (err) {
      setError('Failed to toggle agent');
      console.error('Toggle agent error:', err);
    }
  };

  const handleAddAgent = async (agent) => {
    try {
      const response = await apiAxios.post(`/api/a2a-settings/${encodeURIComponent(projectName)}/agents`, agent);
      setSettings(response.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to add agent');
      console.error('Add agent error:', err);
    }
  };

  const handleRemoveAgent = async (agentUrl) => {
    try {
      const response = await apiAxios.delete(`/api/a2a-settings/${encodeURIComponent(projectName)}/agents`, {
        data: { agentUrl }
      });
      setSettings(response.data);
    } catch (err) {
      setError('Failed to remove agent');
      console.error('Remove agent error:', err);
    }
  };

  const handleTestConnection = async (agentUrl) => {
    setTestingAgent(agentUrl);
    try {
      const response = await apiAxios.post('/api/a2a-settings/test-connection', { agentUrl });
      setTestResults(prev => ({
        ...prev,
        [agentUrl]: response.data
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [agentUrl]: { success: false, message: err.message }
      }));
    } finally {
      setTestingAgent(null);
    }
  };

  const handleUpdateRegistryUrl = () => {
    handleSaveSettings({ ...settings, registryUrl });
    fetchRegistry();
  };

  // Filter registry agents
  const filteredRegistryAgents = useMemo(() => {
    if (!filterText.trim()) return registryAgents;
    const lower = filterText.toLowerCase();
    return registryAgents.filter(agent =>
      agent.name?.toLowerCase().includes(lower) ||
      agent.description?.toLowerCase().includes(lower) ||
      agent.url?.toLowerCase().includes(lower)
    );
  }, [registryAgents, filterText]);

  // Check if an agent is already added
  const isAgentAdded = (agentUrl) => {
    return settings.agents.some(a => a.url === agentUrl);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <BackgroundInfo infoId="a2a-protocol" showBackgroundInfo={showBackgroundInfo} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          A2A settings saved successfully
        </Alert>
      )}

      {/* Registry URL Configuration */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
          A2A Agent Registry
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Enter A2A registry URL..."
            value={registryUrl}
            onChange={(e) => setRegistryUrl(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            onClick={handleUpdateRegistryUrl}
            disabled={registryLoading}
            startIcon={registryLoading ? <CircularProgress size={16} /> : <Refresh />}
          >
            Connect
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Configured Agents */}
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
        Configured Agents ({settings.agents.length})
      </Typography>

      {settings.agents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No agents configured. Connect to a registry and add agents below.
        </Typography>
      ) : (
        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: '30vh', overflow: 'auto' }}>
          {settings.agents.map((agent) => (
            <Card key={agent.url} variant="outlined" sx={{
              borderColor: agent.enabled !== false ? 'primary.main' : 'divider',
              opacity: agent.enabled !== false ? 1 : 0.7,
              minHeight: 72,
              flexShrink: 0
            }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <RiRobot2Line size={24} color={agent.enabled !== false ? '#1976d2' : '#9e9e9e'} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">{agent.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {agent.url}
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={agent.enabled !== false}
                        onChange={(e) => handleToggleAgent(agent.url, e.target.checked)}
                      />
                    }
                    label=""
                  />
                  <Tooltip title="Test Connection">
                    <IconButton
                      size="small"
                      onClick={() => handleTestConnection(agent.url)}
                      disabled={testingAgent === agent.url}
                    >
                      {testingAgent === agent.url ? (
                        <CircularProgress size={16} />
                      ) : testResults[agent.url]?.success ? (
                        <CheckCircle color="success" fontSize="small" />
                      ) : testResults[agent.url] ? (
                        <ErrorIcon color="error" fontSize="small" />
                      ) : (
                        <Refresh fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove Agent">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveAgent(agent.url)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Expandable details */}
                <Collapse in={expandedAgent === agent.url}>
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {agent.description}
                    </Typography>

                    {/* Capabilities */}
                    {agent.capabilities && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                        {agent.capabilities.streaming && (
                          <Chip size="small" icon={<Speed />} label="Streaming" variant="outlined" />
                        )}
                        {agent.capabilities.pushNotifications && (
                          <Chip size="small" icon={<Notifications />} label="Push Notifications" variant="outlined" />
                        )}
                        {agent.capabilities.stateTransitionHistory && (
                          <Chip size="small" icon={<History />} label="State History" variant="outlined" />
                        )}
                      </Box>
                    )}

                    {/* Skills */}
                    {agent.skills && agent.skills.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Skills:</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {agent.skills.map((skill) => (
                            <Tooltip key={skill.id} title={skill.description}>
                              <Chip size="small" label={skill.name} />
                            </Tooltip>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Collapse>

                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => setExpandedAgent(expandedAgent === agent.url ? null : agent.url)}
                  >
                    {expandedAgent === agent.url ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Registry Agents */}
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
        Available from Registry ({filteredRegistryAgents.length})
      </Typography>

      {registryAgents.length > 3 && (
        <TextField
          fullWidth
          size="small"
          placeholder="Filter agents..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      )}

      {registryAgents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No agents loaded. Click "Connect" to fetch agents from the registry.
        </Typography>
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredRegistryAgents.map((agent) => (
            <Card key={agent.url} variant="outlined" sx={{
              opacity: isAgentAdded(agent.url) ? 0.6 : 1,
              minHeight: 72,
              flexShrink: 0
            }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <RiRobot2Line size={24} color="#757575" style={{ marginTop: 2 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">{agent.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      whiteSpace: 'normal',
                      maxWidth: '600px'
                    }}>
                      {agent.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {agent.url}
                    </Typography>
                  </Box>

                  {/* Skills preview */}
                  {agent.skills && agent.skills.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {agent.skills.slice(0, 3).map((skill) => (
                        <Chip key={skill.id} size="small" label={skill.name} variant="outlined" />
                      ))}
                      {agent.skills.length > 3 && (
                        <Chip size="small" label={`+${agent.skills.length - 3}`} variant="outlined" />
                      )}
                    </Box>
                  )}

                  {isAgentAdded(agent.url) ? (
                    <Chip size="small" label="Added" color="success" variant="outlined" />
                  ) : (
                    <Tooltip title="Add Agent">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleAddAgent(agent)}
                      >
                        <Add />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
