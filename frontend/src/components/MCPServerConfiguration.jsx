import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Tooltip
} from '@mui/material';
import { Add, Delete, Edit as EditIcon, Check, Close, Key } from '@mui/icons-material';
import axios from 'axios';
import BackgroundInfo from './BackgroundInfo';

export default function MCPServerConfiguration({ projectName, showBackgroundInfo }) {
  const [servers, setServers] = useState({});
  const [originalServers, setOriginalServers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState(null);
  const [newServer, setNewServer] = useState({
    name: 'internetretrieval',
    transport: 'http',
    url: 'http://host.docker.internal:6060/mcp',
    command: '',
    args: '',
    auth: 'test123'
  });
  const [hoveredKey, setHoveredKey] = useState(null);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    loadConfig();
  }, [projectName]);

  // Validate server name: only lowercase, numbers, underscore, and hyphen
  const validateServerName = (name) => {
    const validPattern = /^[a-z0-9_-]+$/;
    return validPattern.test(name);
  };

  // Check if there are unsaved changes
  const hasChanges = JSON.stringify(servers) !== JSON.stringify(originalServers);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/claude/mcp/config', {
        projectName
      });
      const loadedServers = response.data.mcpServers || {};
      setServers(loadedServers);
      setOriginalServers(loadedServers);
    } catch (err) {
      setError('Failed to load MCP configuration');
      console.error('Load MCP config error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await axios.post('/api/claude/mcp/config/save', {
        projectName,
        mcpServers: servers
      });
      setOriginalServers(servers); // Update original after successful save
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save MCP configuration');
      console.error('Save MCP config error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const trimmedName = newServer.name.trim();

    if (!trimmedName) {
      setNameError('Server name is required');
      return;
    }

    if (!validateServerName(trimmedName)) {
      setNameError('Server name can only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    setNameError('');
    const serverConfig = {};

    if (newServer.transport === 'stdio') {
      serverConfig.command = newServer.command || 'npx';
      serverConfig.args = newServer.args ? newServer.args.split(' ').filter(a => a) : [];
    } else {
      serverConfig.type = newServer.transport;
      serverConfig.url = newServer.url;
      if (newServer.auth) {
        serverConfig.headers = { Authorization: newServer.auth };
      }
    }

    setServers({ ...servers, [trimmedName]: serverConfig });
    setNewServer({
      name: 'internetretrieval',
      transport: 'http',
      url: 'http://host.docker.internal:6060/mcp',
      command: '',
      args: '',
      auth: 'Bearer test123'
    });
  };

  const handleDelete = (key) => {
    const updated = { ...servers };
    delete updated[key];
    setServers(updated);
  };

  const handleStartEdit = (key) => {
    const server = servers[key];
    const transport = server.type || 'stdio';
    setEditingKey(key);
    setEditValue({
      name: key,
      transport,
      url: server.url || '',
      command: server.command || '',
      args: Array.isArray(server.args) ? server.args.join(' ') : '',
      auth: server.headers?.Authorization || ''
    });
  };

  const handleSaveEdit = () => {
    const trimmedName = editValue.name.trim();

    if (!trimmedName) {
      return;
    }

    if (!validateServerName(trimmedName)) {
      setError('Server name can only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    const serverConfig = {};

    if (editValue.transport === 'stdio') {
      serverConfig.command = editValue.command || 'npx';
      serverConfig.args = editValue.args ? editValue.args.split(' ').filter(a => a) : [];
    } else {
      serverConfig.type = editValue.transport;
      serverConfig.url = editValue.url;
      if (editValue.auth) {
        serverConfig.headers = { Authorization: editValue.auth };
      }
    }

    const updated = { ...servers };
    if (editingKey !== trimmedName) {
      delete updated[editingKey];
    }
    updated[trimmedName] = serverConfig;
    setServers(updated);
    setEditingKey(null);
    setEditValue(null);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue(null);
  };

  const getDisplayValue = (key, server) => {
    const transport = server.type || 'stdio';
    if (transport === 'stdio') {
      const cmd = server.command || 'npx';
      const args = Array.isArray(server.args) ? server.args.join(' ') : '';
      return `${cmd} ${args}`;
    } else {
      return server.url || '';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  const serverEntries = Object.entries(servers);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <BackgroundInfo infoId="integrations" showBackgroundInfo={showBackgroundInfo} />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          MCP configuration saved successfully
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ flex: 1, mb: 2 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell><strong>Name</strong></TableCell>
              <TableCell><strong>Transport</strong></TableCell>
              <TableCell><strong>URL/CMD</strong></TableCell>
              <TableCell>
                <Tooltip title="Authentication key/credentials">
                  <Key fontSize="small" />
                </Tooltip>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {serverEntries.map(([key, server], index) => (
              <TableRow
                key={key}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                sx={{ backgroundColor: index % 2 === 0 ? 'white' : '#EBF5FF', height: '60px' }}
              >
                {editingKey === key ? (
                  <>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        sx={{ backgroundColor: 'white' }}
                        value={editValue.name}
                        onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl fullWidth size="small">
                        <Select
                          value={editValue.transport}
                          onChange={(e) => setEditValue({ ...editValue, transport: e.target.value })}
                          sx={{ backgroundColor: 'white' }}
                        >
                          <MenuItem value="stdio">STDIO</MenuItem>
                          <MenuItem value="http">HTTP</MenuItem>
                          <MenuItem value="sse">SSE</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      {editValue.transport === 'stdio' ? (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            size="small"
                            placeholder="Command"
                            value={editValue.command}
                            onChange={(e) => setEditValue({ ...editValue, command: e.target.value })}
                            sx={{ backgroundColor: 'white', width: '30%' }}
                          />
                          <TextField
                            size="small"
                            placeholder="Args"
                            value={editValue.args}
                            onChange={(e) => setEditValue({ ...editValue, args: e.target.value })}
                            sx={{ backgroundColor: 'white', flex: 1 }}
                          />
                        </Box>
                      ) : (
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="URL"
                          value={editValue.url}
                          onChange={(e) => setEditValue({ ...editValue, url: e.target.value })}
                          sx={{ backgroundColor: 'white' }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="Bearer token..."
                        value={editValue.auth}
                        onChange={(e) => setEditValue({ ...editValue, auth: e.target.value })}
                        sx={{ backgroundColor: 'white' }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={handleSaveEdit} sx={{ p: 0.5 }}>
                        <Check fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={handleCancelEdit} sx={{ p: 0.5 }}>
                        <Close fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell
                      onClick={() => handleStartEdit(key)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <code>{key}</code>
                    </TableCell>
                    <TableCell
                      onClick={() => handleStartEdit(key)}
                      sx={{ cursor: 'pointer' }}
                    >
                      {(server.type || 'stdio').toUpperCase()}
                    </TableCell>
                    <TableCell
                      onClick={() => handleStartEdit(key)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <code style={{ fontSize: '0.85em' }}>{getDisplayValue(key, server)}</code>
                    </TableCell>
                    <TableCell
                      onClick={() => handleStartEdit(key)}
                      sx={{ cursor: 'pointer' }}
                    >
                      {server.headers?.Authorization ? '***' : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {(hoveredKey === key || editingKey === key) && (
                        <>
                          <IconButton size="small" onClick={() => handleStartEdit(key)} sx={{ p: 0.5 }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDelete(key)} sx={{ p: 0.5 }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Server name..."
                  value={newServer.name}
                  onChange={(e) => {
                    setNewServer({ ...newServer, name: e.target.value });
                    setNameError('');
                  }}
                  error={!!nameError}
                  helperText={nameError}
                />
              </TableCell>
              <TableCell>
                <FormControl fullWidth size="small">
                  <Select
                    value={newServer.transport}
                    onChange={(e) => setNewServer({ ...newServer, transport: e.target.value })}
                  >
                    <MenuItem value="stdio">STDIO</MenuItem>
                    <MenuItem value="http">HTTP</MenuItem>
                    <MenuItem value="sse">SSE</MenuItem>
                  </Select>
                </FormControl>
              </TableCell>
              <TableCell>
                {newServer.transport === 'stdio' ? (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Command"
                      value={newServer.command}
                      onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                      sx={{ width: '30%' }}
                    />
                    <TextField
                      size="small"
                      placeholder="Args"
                      value={newServer.args}
                      onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                  </Box>
                ) : (
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="https://..."
                    value={newServer.url}
                    onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                  />
                )}
              </TableCell>
              <TableCell>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Bearer token..."
                  value={newServer.auth}
                  onChange={(e) => setNewServer({ ...newServer, auth: e.target.value })}
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" color="primary" onClick={handleAdd} disabled={!newServer.name.trim()} sx={{ p: 0.5 }}>
                  <Add fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
