import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  Button,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip
} from '@mui/material';
import { Delete, Add } from '@mui/icons-material';

export default function McpToolsSelector({
  registryServers = [],
  configuredServers = {},
  onServersChange
}) {
  const [newServer, setNewServer] = useState({
    name: '',
    transport: 'http',
    url: '',
    headers: ''
  });

  const handleAddFromRegistry = (server) => {
    const config = {
      type: server.transport,
      url: server.url
    };
    if (server.headers) {
      config.headers = server.headers;
    }
    onServersChange({
      ...configuredServers,
      [server.name]: config
    });
  };

  const handleRemoveServer = (name) => {
    const updated = { ...configuredServers };
    delete updated[name];
    onServersChange(updated);
  };

  const handleAddCustomServer = () => {
    if (!newServer.name || !newServer.url) return;

    // Validate server name
    if (!/^[a-z0-9_-]+$/.test(newServer.name)) {
      alert('Server name can only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    const config = {
      type: newServer.transport,
      url: newServer.url
    };

    if (newServer.headers) {
      try {
        config.headers = JSON.parse(newServer.headers);
      } catch {
        // If not valid JSON, treat as a simple authorization header
        config.headers = { Authorization: newServer.headers };
      }
    }

    onServersChange({
      ...configuredServers,
      [newServer.name]: config
    });

    setNewServer({
      name: '',
      transport: 'http',
      url: '',
      headers: ''
    });
  };

  const isInRegistry = (serverName) => {
    return registryServers.some(s => s.name === serverName);
  };

  const availableRegistryServers = registryServers.filter(
    server => !configuredServers[server.name]
  );

  return (
    <Box>
      {/* Configured Servers Section */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Configured MCP Servers
      </Typography>
      {Object.keys(configuredServers).length > 0 ? (
        <List dense sx={{ bgcolor: '#f5f5f5', borderRadius: 1, mb: 2 }}>
          {Object.entries(configuredServers).map(([name, config]) => (
            <ListItem
              key={name}
              secondaryAction={
                <IconButton edge="end" onClick={() => handleRemoveServer(name)}>
                  <Delete />
                </IconButton>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {name}
                    <Chip
                      size="small"
                      label={config.type || 'http'}
                      sx={{ fontSize: '0.7rem' }}
                    />
                    {isInRegistry(name) && (
                      <Chip
                        size="small"
                        label="Registry"
                        color="primary"
                        sx={{ fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                }
                secondary={config.url || config.command}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No MCP servers configured yet.
        </Typography>
      )}

      {/* Available from Registry Section */}
      {availableRegistryServers.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Available from Registry
          </Typography>
          <List dense sx={{ bgcolor: '#e3f2fd', borderRadius: 1, mb: 2 }}>
            {availableRegistryServers.map(server => (
              <ListItem
                key={server.name}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={() => handleAddFromRegistry(server)}
                    color="primary"
                  >
                    <Add />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {server.name}
                      <Chip
                        size="small"
                        label={server.transport}
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </Box>
                  }
                  secondary={server.description || server.url}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      {/* Add Custom Server Section */}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Add Custom MCP Server
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            label="Name"
            value={newServer.name}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value.toLowerCase() })}
            placeholder="my-server"
            sx={{ width: 150 }}
          />
          <FormControl size="small" sx={{ width: 100 }}>
            <InputLabel>Transport</InputLabel>
            <Select
              value={newServer.transport}
              onChange={(e) => setNewServer({ ...newServer, transport: e.target.value })}
              label="Transport"
            >
              <MenuItem value="http">HTTP</MenuItem>
              <MenuItem value="sse">SSE</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="URL"
            value={newServer.url}
            onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
            placeholder="https://mcp.example.com"
            sx={{ flex: 1 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            label="Auth Header (optional)"
            value={newServer.headers}
            onChange={(e) => setNewServer({ ...newServer, headers: e.target.value })}
            placeholder="Bearer token..."
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={handleAddCustomServer}
            disabled={!newServer.name || !newServer.url}
          >
            Add
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
