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
  Tooltip,
  Menu,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { Add, Delete, Edit as EditIcon, Check, Close, Key, MoreVert, Build } from '@mui/icons-material';
import { HiOutlineWrench } from 'react-icons/hi2';
import { TfiWorld } from 'react-icons/tfi';
import { GoShieldCheck } from 'react-icons/go';
import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';
import BackgroundInfo from './BackgroundInfo';

export default function MCPServerConfiguration({ projectName, showBackgroundInfo, readOnly = false }) {
  const { t } = useTranslation(["mcpServer","common"]);
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
    url: 'http://host.docker.internal:6060/mcp/demo',
    command: '',
    args: '',
    auth: 'test123',
    authType: 'none',
    description: ''
  });
  const [hoveredKey, setHoveredKey] = useState(null);
  const [nameError, setNameError] = useState('');
  const [rowMenuAnchor, setRowMenuAnchor] = useState(null);
  const [rowMenuKey, setRowMenuKey] = useState(null);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [toolsDrawerServer, setToolsDrawerServer] = useState(null);
  const [toolsList, setToolsList] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState(null);

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

  const enrichWithRegistryDescriptions = async (loadedServers) => {
    const enriched = { ...loadedServers };
    for (const [key, server] of Object.entries(enriched)) {
      if (!server.description && server.url) {
        try {
          const resp = await apiAxios.post('/api/mcp-registry/lookup-by-url', { url: server.url });
          if (resp.data.server?.description) {
            enriched[key] = { ...server, description: resp.data.server.description };
          }
        } catch { /* ignore lookup failures */ }
      }
    }
    return enriched;
  };

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAxios.post('/api/claude/mcp/config', {
        projectName
      });
      const loadedServers = response.data.mcpServers || {};
      const enriched = await enrichWithRegistryDescriptions(loadedServers);
      setServers(enriched);
      setOriginalServers(enriched);
    } catch (err) {
      setError(t('mcpServer:failedToLoadConfig'));
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
      await apiAxios.post('/api/claude/mcp/config/save', {
        projectName,
        mcpServers: servers
      });
      setOriginalServers(servers); // Update original after successful save
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(t('mcpServer:failedToSaveConfig'));
      console.error('Save MCP config error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const trimmedName = newServer.name.trim();

    if (!trimmedName) {
      setNameError(t('mcpServer:nameRequired'));
      return;
    }

    if (!validateServerName(trimmedName)) {
      setNameError(t('mcpServer:nameValidation'));
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
      if (newServer.auth && newServer.authType !== 'UserEntraToken') {
        serverConfig.headers = { Authorization: newServer.auth };
      }
    }
    if (newServer.description) {
      serverConfig.description = newServer.description;
    }
    if (newServer.authType && newServer.authType !== 'none') {
      serverConfig.authType = newServer.authType;
    }

    setServers({ ...servers, [trimmedName]: serverConfig });
    setNewServer({
      name: 'internetretrieval',
      transport: 'http',
      url: 'http://host.docker.internal:6060/mcp/demo',
      command: '',
      args: '',
      auth: 'Bearer test123',
      authType: 'none',
      description: ''
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
      auth: server.headers?.Authorization || '',
      authType: server.authType || 'none',
      description: server.description || ''
    });
  };

  const handleSaveEdit = () => {
    const trimmedName = editValue.name.trim();

    if (!trimmedName) {
      return;
    }

    if (!validateServerName(trimmedName)) {
      setError(t('mcpServer:nameValidation'));
      return;
    }

    const serverConfig = {};

    if (editValue.transport === 'stdio') {
      serverConfig.command = editValue.command || 'npx';
      serverConfig.args = editValue.args ? editValue.args.split(' ').filter(a => a) : [];
    } else {
      serverConfig.type = editValue.transport;
      serverConfig.url = editValue.url;
      if (editValue.auth && editValue.authType !== 'UserEntraToken') {
        serverConfig.headers = { Authorization: editValue.auth };
      }
    }
    if (editValue.description) {
      serverConfig.description = editValue.description;
    }
    if (editValue.authType && editValue.authType !== 'none') {
      serverConfig.authType = editValue.authType;
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

  const handleShowTools = async (key, server) => {
    setRowMenuAnchor(null);
    setRowMenuKey(null);
    setToolsDrawerServer({ name: key, ...server });
    setToolsDrawerOpen(true);
    setToolsList([]);
    setToolsError(null);
    setToolsLoading(true);
    try {
      const response = await apiAxios.post('/api/mcp-registry/list-tools', {
        url: server.url,
        headers: server.headers
      });
      setToolsList(response.data.tools || []);
    } catch (err) {
      setToolsError(err.response?.data?.message || err.message || 'Failed to fetch tools');
    } finally {
      setToolsLoading(false);
    }
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
          {t('mcpServer:savedSuccessfully')}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ flex: 1, mb: 2 }}>
        <Table stickyHeader sx={{ '& td': { verticalAlign: 'top', pt: 1.5 } }}>
          <TableHead>
            <TableRow>
              <TableCell><strong>{t('mcpServer:columnName')}</strong></TableCell>
              <TableCell><strong>{t('mcpServer:columnTransport')}</strong></TableCell>
              <TableCell><strong>{t('mcpServer:columnDescription')}</strong></TableCell>
              <TableCell><strong>{t('mcpServer:columnSecurity')}</strong></TableCell>
              <TableCell align="center" sx={{ width: 48 }}></TableCell>
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
                {!readOnly && editingKey === key ? (
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
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={editValue.transport}
                            onChange={(e) => setEditValue({ ...editValue, transport: e.target.value })}
                            sx={{ backgroundColor: 'white' }}
                          >
                            <MenuItem value="stdio">{t('mcpServer:transportStdio')}</MenuItem>
                            <MenuItem value="http">{t('mcpServer:transportHttp')}</MenuItem>
                            <MenuItem value="sse">{t('mcpServer:transportSse')}</MenuItem>
                          </Select>
                        </FormControl>
                        {editValue.transport === 'stdio' ? (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                              size="small"
                              placeholder={t('mcpServer:placeholderCommand')}
                              value={editValue.command}
                              onChange={(e) => setEditValue({ ...editValue, command: e.target.value })}
                              sx={{ backgroundColor: 'white', width: '30%' }}
                            />
                            <TextField
                              size="small"
                              placeholder={t('mcpServer:placeholderArgs')}
                              value={editValue.args}
                              onChange={(e) => setEditValue({ ...editValue, args: e.target.value })}
                              sx={{ backgroundColor: 'white', flex: 1 }}
                            />
                          </Box>
                        ) : (
                          <TextField
                            fullWidth
                            size="small"
                            placeholder={t('mcpServer:placeholderUrl')}
                            value={editValue.url}
                            onChange={(e) => setEditValue({ ...editValue, url: e.target.value })}
                            sx={{ backgroundColor: 'white' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder={t('mcpServer:placeholderDescription')}
                        value={editValue.description}
                        onChange={(e) => setEditValue({ ...editValue, description: e.target.value })}
                        sx={{ backgroundColor: 'white' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={editValue.authType}
                            onChange={(e) => setEditValue({ ...editValue, authType: e.target.value })}
                            sx={{ backgroundColor: 'white' }}
                          >
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="bearer">Bearer</MenuItem>
                            <MenuItem value="UserEntraToken">Entra ID (OBO)</MenuItem>
                          </Select>
                        </FormControl>
                        {editValue.authType !== 'UserEntraToken' && (
                          <TextField
                            fullWidth
                            size="small"
                            placeholder={t('mcpServer:placeholderBearerToken')}
                            value={editValue.auth}
                            onChange={(e) => setEditValue({ ...editValue, auth: e.target.value })}
                            sx={{ backgroundColor: 'white' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ width: 48, whiteSpace: 'nowrap' }}>
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
                      onClick={readOnly ? undefined : () => handleStartEdit(key)}
                      sx={readOnly ? {} : { cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title={getDisplayValue(key, server)} placement="right">
                          <img src="/logo-mcp.png" alt="MCP" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                        </Tooltip>
                        <code>{key}</code>
                      </Box>
                    </TableCell>
                    <TableCell
                      onClick={readOnly ? undefined : () => handleStartEdit(key)}
                      sx={readOnly ? {} : { cursor: 'pointer' }}
                    >
                      {(server.type || 'stdio').toUpperCase()}
                    </TableCell>
                    <TableCell
                      onClick={readOnly ? undefined : () => handleStartEdit(key)}
                      sx={readOnly ? {} : { cursor: 'pointer' }}
                    >
                      <Typography variant="body2" color="text.secondary">{server.description || ''}</Typography>
                    </TableCell>
                    <TableCell
                      onClick={readOnly ? undefined : () => handleStartEdit(key)}
                      sx={readOnly ? {} : { cursor: 'pointer' }}
                    >
                      {readOnly ? (
                        server.authType === 'UserEntraToken'
                          ? <Tooltip title="Foundry OBO identity passthrough"><Chip label="Entra ID" size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} /></Tooltip>
                          : server.headers?.Authorization
                            ? <Tooltip title={t('mcpServer:protected')}><span><GoShieldCheck style={{ fontSize: 18, color: 'green' }} /></span></Tooltip>
                            : <Tooltip title={t('mcpServer:public')}><span><TfiWorld style={{ fontSize: 16, color: 'black' }} /></span></Tooltip>
                      ) : (
                        server.authType === 'UserEntraToken'
                          ? <Chip label="Entra ID" size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                          : server.headers?.Authorization ? '***' : '-'
                      )}
                    </TableCell>
                    <TableCell align="center" sx={{ width: 48 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenuAnchor(e.currentTarget);
                          setRowMenuKey(key);
                        }}
                        sx={{ p: 0.5 }}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {!readOnly && (
              <TableRow>
                <TableCell>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={t('mcpServer:placeholderServerName')}
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <FormControl fullWidth size="small">
                      <Select
                        value={newServer.transport}
                        onChange={(e) => setNewServer({ ...newServer, transport: e.target.value })}
                      >
                        <MenuItem value="stdio">{t('mcpServer:transportStdio')}</MenuItem>
                        <MenuItem value="http">{t('mcpServer:transportHttp')}</MenuItem>
                        <MenuItem value="sse">{t('mcpServer:transportSse')}</MenuItem>
                      </Select>
                    </FormControl>
                    {newServer.transport === 'stdio' ? (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder={t('mcpServer:placeholderCommand')}
                          value={newServer.command}
                          onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                          sx={{ width: '30%' }}
                        />
                        <TextField
                          size="small"
                          placeholder={t('mcpServer:placeholderArgs')}
                          value={newServer.args}
                          onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                          sx={{ flex: 1 }}
                        />
                      </Box>
                    ) : (
                      <TextField
                        fullWidth
                        size="small"
                        placeholder={t('mcpServer:placeholderHttps')}
                        value={newServer.url}
                        onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={t('mcpServer:placeholderDescription')}
                    value={newServer.description}
                    onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <FormControl fullWidth size="small">
                      <Select
                        value={newServer.authType}
                        onChange={(e) => setNewServer({ ...newServer, authType: e.target.value })}
                      >
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value="bearer">Bearer</MenuItem>
                        <MenuItem value="UserEntraToken">Entra ID (OBO)</MenuItem>
                      </Select>
                    </FormControl>
                    {newServer.authType !== 'UserEntraToken' && (
                      <TextField
                        fullWidth
                        size="small"
                        placeholder={t('mcpServer:placeholderBearerToken')}
                        value={newServer.auth}
                        onChange={(e) => setNewServer({ ...newServer, auth: e.target.value })}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ width: 48 }}>
                  <IconButton size="small" color="primary" onClick={handleAdd} disabled={!newServer.name.trim()} sx={{ p: 0.5 }}>
                    <Add fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!readOnly && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </Box>
      )}

      <Menu
        anchorEl={rowMenuAnchor}
        open={Boolean(rowMenuAnchor)}
        onClose={() => { setRowMenuAnchor(null); setRowMenuKey(null); }}
      >
        <MenuItem
          onClick={() => rowMenuKey && handleShowTools(rowMenuKey, servers[rowMenuKey])}
          disabled={!rowMenuKey || !servers[rowMenuKey]?.url}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <HiOutlineWrench style={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>{t('mcpToolsSelector.providedTools')}</ListItemText>
        </MenuItem>
        {!readOnly && (
          <MenuItem
            onClick={() => {
              if (rowMenuKey) handleStartEdit(rowMenuKey);
              setRowMenuAnchor(null);
              setRowMenuKey(null);
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('common.edit')}</ListItemText>
          </MenuItem>
        )}
        {!readOnly && (
          <MenuItem
            onClick={() => {
              if (rowMenuKey) handleDelete(rowMenuKey);
              setRowMenuAnchor(null);
              setRowMenuKey(null);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: 'error.main' }}>
              <Delete fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('common.delete')}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Drawer
        anchor="left"
        open={toolsDrawerOpen}
        onClose={() => setToolsDrawerOpen(false)}
        sx={{ zIndex: 1400 }}
      >
        <Box sx={{ width: 420, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="h6">
              {t('mcpToolsSelector.providedTools')}
            </Typography>
            <IconButton onClick={() => setToolsDrawerOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
          {toolsDrawerServer && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <img src="/logo-mcp.png" alt="MCP" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              <Typography variant="body2" color="text.secondary">
                {toolsDrawerServer.name}
              </Typography>
            </Box>
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
              {t('mcpToolsSelector.noToolsAvailable')}
            </Typography>
          )}

          {!toolsLoading && toolsList.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('mcpToolsSelector.toolsAvailableCount', { count: toolsList.length })}
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
                      secondary={tool.description}
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
