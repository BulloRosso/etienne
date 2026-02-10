import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  TextField,
  Button,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
  Drawer,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { DeleteOutlined, Add, Build, ExpandMore, Close } from '@mui/icons-material';
import axios from 'axios';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

export default function McpToolsSelector({
  registryServers = [],
  configuredServers = {},
  onServersChange,
  isAdmin = false
}) {
  const { mode: themeMode } = useThemeMode();
  const [newServer, setNewServer] = useState({
    name: '',
    transport: 'http',
    url: '',
    headers: ''
  });
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [toolsDrawerServer, setToolsDrawerServer] = useState(null);
  const [toolsList, setToolsList] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState(null);

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

  const handleShowTools = async (server) => {
    setToolsDrawerServer(server);
    setToolsDrawerOpen(true);
    setToolsList([]);
    setToolsError(null);
    setToolsLoading(true);

    try {
      const response = await axios.post('/api/mcp-registry/list-tools', {
        url: server.url,
        headers: server.headers
      });
      setToolsList(response.data.tools || []);
    } catch (error) {
      setToolsError(error.response?.data?.message || error.message || 'Failed to fetch tools');
    } finally {
      setToolsLoading(false);
    }
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
        <List dense sx={{ bgcolor: '#f5f5f5', borderRadius: 1, mb: 2, color: '#000' }}>
          {Object.entries(configuredServers).map(([name, config]) => (
            <ListItem
              key={name}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {config.url && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Build sx={{ fontSize: 16 }} />}
                      onClick={() => handleShowTools({
                        name,
                        url: config.url,
                        headers: config.headers,
                        description: registryServers.find(s => s.name === name)?.description
                      })}
                      sx={{ fontSize: '0.75rem', textTransform: 'none', color: 'navy', borderColor: 'navy' }}
                    >
                      Provided Tools
                    </Button>
                  )}
                  <IconButton edge="end" onClick={() => handleRemoveServer(name)} sx={{ color: themeMode === 'dark' ? 'navy' : 'darkred' }}>
                    <DeleteOutlined />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {name}
                    <Chip
                      size="small"
                      variant="outlined"
                      label={config.type || 'http'}
                      sx={{ fontSize: '0.7rem', color: '#000', borderColor: '#000' }}
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
                secondaryTypographyProps={{ sx: { color: 'rgba(0,0,0,0.6)' } }}
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
          <List dense sx={{ bgcolor: '#e3f2fd', borderRadius: 1, mb: 2, color: '#000' }}>
            {availableRegistryServers.map(server => (
              <ListItem
                key={server.name}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Build sx={{ fontSize: 16 }} />}
                      onClick={() => handleShowTools(server)}
                      sx={{ fontSize: '0.75rem', textTransform: 'none', color: 'navy', borderColor: 'navy' }}
                    >
                      Provided Tools
                    </Button>
                    <IconButton
                      edge="end"
                      onClick={() => handleAddFromRegistry(server)}
                      sx={{ color: 'navy' }}
                    >
                      <Add />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {server.name}
                      <Chip
                        size="small"
                        variant="outlined"
                        label={server.transport}
                        sx={{ fontSize: '0.7rem', color: '#000', borderColor: '#000' }}
                      />
                    </Box>
                  }
                  secondary={server.description || server.url}
                  secondaryTypographyProps={{ sx: { color: 'rgba(0,0,0,0.6)' } }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      {/* Add Custom Server Section - Admin only, collapsible */}
      {isAdmin && (
        <>
          <Divider sx={{ my: 2 }} />
          <Accordion defaultExpanded={false} sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 0, minHeight: 'auto' }}>
              <Typography variant="subtitle2">
                Add Custom MCP Server
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
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
            </AccordionDetails>
          </Accordion>
        </>
      )}

      {/* Tools Drawer */}
      <Drawer
        anchor="left"
        open={toolsDrawerOpen}
        onClose={() => setToolsDrawerOpen(false)}
        sx={{ zIndex: 1400 }}
      >
        <Box sx={{ width: 420, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="h6">
              Provided Tools
            </Typography>
            <IconButton onClick={() => setToolsDrawerOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
          {toolsDrawerServer && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {toolsDrawerServer.name}
              {toolsDrawerServer.description && ` \u2014 ${toolsDrawerServer.description}`}
            </Typography>
          )}

          {toolsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {toolsError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {toolsError}
            </Typography>
          )}

          {!toolsLoading && !toolsError && toolsList.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No tools available from this server.
            </Typography>
          )}

          {!toolsLoading && toolsList.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {toolsList.length} tool{toolsList.length !== 1 ? 's' : ''} available
              </Typography>
              <List dense>
                {toolsList.map((tool, index) => (
                  <ListItem key={tool.name || index} sx={{ alignItems: 'flex-start', px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32, mt: '4px' }}>
                      <Build sx={{ fontSize: 18, color: 'primary.main' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {tool.name}
                        </Typography>
                      }
                      secondary={tool.description || 'No description available'}
                      secondaryTypographyProps={{ sx: { fontSize: '0.75rem' } }}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}

        </Box>
      </Drawer>
    </Box>
  );
}
