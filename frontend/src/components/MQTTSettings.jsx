import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Box,
  TextField,
  Button,
  IconButton,
  Typography,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import { Close, Delete } from '@mui/icons-material';
import { FcElectricalSensor } from 'react-icons/fc';
import { FaAssistiveListeningSystems } from 'react-icons/fa';
import { apiFetch } from '../services/api';

export default function MQTTSettings({ open, onClose, project }) {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Server settings
  const [host, setHost] = useState('broker.hivemq.com');
  const [port, setPort] = useState(1883);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Subscription settings
  const [topic, setTopic] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [status, setStatus] = useState({ connected: false, subscriptions: [] });

  useEffect(() => {
    if (open && project) {
      loadBrokerSetup();
      loadStatus();
    }
  }, [open, project]);

  const loadBrokerSetup = async () => {
    try {
      const response = await apiFetch(`/api/external-events/${project}/broker-setup`);
      if (response.ok) {
        const config = await response.json();
        if (config.broker) {
          setHost(config.broker.host || 'broker.hivemq.com');
          setPort(config.broker.port || 1883);
          setUsername(config.broker.username || '');
          setPassword(config.broker.password || '');
        }
        setSubscriptions(config.subscriptions || []);
      }
    } catch (error) {
      console.error('Failed to load broker setup:', error);
      setError('Failed to load MQTT settings');
    }
  };

  const loadStatus = async () => {
    try {
      const response = await apiFetch(`/api/external-events/${project}/status`);
      if (response.ok) {
        const statusData = await response.json();
        setStatus(statusData);
      }
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const handleSaveBroker = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(`/api/external-events/${project}/broker-setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          host,
          port: parseInt(port, 10),
          username: username || undefined,
          password: password || undefined,
        }),
      });

      if (response.ok) {
        setSuccess('MQTT broker settings saved successfully');
        await loadStatus();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to save MQTT broker settings');
      }
    } catch (error) {
      console.error('Failed to save broker setup:', error);
      setError('Failed to save MQTT broker settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic name');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(`/api/external-events/${project}/subscriptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), qos: 0 }),
      });

      if (response.ok) {
        setSuccess(`Subscribed to topic: ${topic}`);
        setTopic('');
        await loadBrokerSetup();
        await loadStatus();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to subscribe to topic');
      }
    } catch (error) {
      console.error('Failed to subscribe:', error);
      setError('Failed to subscribe to topic');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async (topicToUnsubscribe) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const encodedTopic = encodeURIComponent(topicToUnsubscribe);
      const response = await fetch(
        `/api/external-events/${project}/subscriptions/${encodedTopic}`,
        {
          method: 'DELETE',
        },
      );

      if (response.ok) {
        setSuccess(`Unsubscribed from topic: ${topicToUnsubscribe}`);
        await loadBrokerSetup();
        await loadStatus();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to unsubscribe from topic');
      }
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      setError('Failed to unsubscribe from topic');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(`/api/external-events/${project}/connect`, {
        method: 'POST',
      });

      if (response.ok) {
        setSuccess('Connected to MQTT broker');
        await loadStatus();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to connect to MQTT broker');
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to connect to MQTT broker');
    } finally {
      setLoading(false);
    }
  };

  const isSubscribed = subscriptions.includes(topic.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FcElectricalSensor size={24} />
          MQTT Settings
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Server" />
          <Tab label="Subscribe" />
        </Tabs>
      </Box>

      <DialogContent sx={{ minHeight: 400 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Status:
          </Typography>
          <Chip
            label={status.connected ? 'Connected' : 'Disconnected'}
            color={status.connected ? 'success' : 'default'}
            size="small"
          />
        </Box>

        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Configure your MQTT broker connection. Default is HiveMQ public broker.
            </Typography>

            <TextField
              label="Host"
              fullWidth
              value={host}
              onChange={(e) => setHost(e.target.value)}
              helperText="MQTT broker hostname or IP address"
            />

            <TextField
              label="Port"
              type="number"
              fullWidth
              value={port}
              onChange={(e) => setPort(e.target.value)}
              helperText="MQTT broker port (default: 1883)"
            />

            <TextField
              label="Username"
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              helperText="Optional: Username for authentication"
            />

            <TextField
              label="Password"
              type="password"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Optional: Password for authentication"
            />

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="contained" onClick={handleSaveBroker} disabled={loading}>
                {loading ? 'Saving...' : 'Save Settings'}
              </Button>
              {!status.connected && (
                <Button variant="outlined" onClick={handleConnect} disabled={loading}>
                  Connect
                </Button>
              )}
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Subscribe to MQTT topics to receive events. Use wildcards: + (single level) or #
              (multi-level).
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="Topic"
                fullWidth
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                helperText="e.g., sensors/temperature or devices/+/status"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isSubscribed) {
                    handleSubscribe();
                  }
                }}
              />
              <Button
                variant="contained"
                onClick={isSubscribed ? () => handleUnsubscribe(topic.trim()) : handleSubscribe}
                disabled={loading || !topic.trim()}
                sx={{
                  minWidth: 'auto',
                  height: '56px',
                  px: 2
                }}
              >
                <FaAssistiveListeningSystems size={24} />
              </Button>
            </Box>

            {subscriptions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Active Subscriptions
                </Typography>
                <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  {subscriptions.map((sub, index) => (
                    <ListItem key={index} divider={index < subscriptions.length - 1}>
                      <ListItemText
                        primary={sub}
                        secondary={`Recording events to: external-events/mqtt-${sub.replace(/\//g, '-')}.json`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => handleUnsubscribe(sub)}
                          disabled={loading}
                        >
                          <Delete />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {subscriptions.length === 0 && (
              <Box
                sx={{
                  mt: 2,
                  p: 3,
                  textAlign: 'center',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'grey.50',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No active subscriptions. Enter a topic above to start listening.
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
