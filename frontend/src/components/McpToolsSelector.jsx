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
  AccordionDetails,
  Card,
  CardContent,
  Tooltip
} from '@mui/material';
import { Add, Build, BuildOutlined, ExpandMore, Close, RemoveCircleOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

export default function McpToolsSelector({
  registryServers = [],
  configuredServers = {},
  onServersChange,
  isAdmin = false
}) {
  const { t } = useTranslation();
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

  const isStandard = (serverName) => {
    return registryServers.some(s => s.name === serverName && s.isStandard);
  };

  const handleRemoveServer = (name) => {
    if (isStandard(name)) return;
    const updated = { ...configuredServers };
    delete updated[name];
    onServersChange(updated);
  };

  const handleAddCustomServer = () => {
    if (!newServer.name || !newServer.url) return;

    // Validate server name
    if (!/^[a-z0-9_-]+$/.test(newServer.name)) {
      alert(t('mcpToolsSelector.nameValidation'));
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
      const response = await apiAxios.post('/api/mcp-registry/list-tools', {
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

  const availableRegistryServers = registryServers
    .filter(server => !configuredServers[server.name])
    .sort((a, b) => a.name.localeCompare(b.name));

  const renderServerCard = (name, config, { isConfigured, server }) => {
    const description = server?.description || config?.url || config?.command || '';
    const standard = isStandard(name);
    const registry = isInRegistry(name);
    const url = config?.url || server?.url;
    const headers = config?.headers || server?.headers;

    return (
      <Tooltip key={name} title={description} arrow placement="top" enterDelay={400}>
        <Card
          variant="outlined"
          sx={{
            position: 'relative',
            minHeight: 72,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderColor: isConfigured ? 'primary.main' : '#ccc',
            borderWidth: isConfigured ? 2 : 1,
            bgcolor: isConfigured ? '#e3f2fd' : 'background.paper',
            transition: 'border-color 0.2s, background-color 0.2s',
            '&:hover': { borderColor: 'primary.light', bgcolor: isConfigured ? '#d0e8fc' : 'action.hover' },
          }}
        >
          <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 }, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Top-right action: add or remove */}
            <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
              {isConfigured ? (
                !standard && (
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveServer(name)}
                    sx={{ color: 'error.main', p: 0.25 }}
                  >
                    <RemoveCircleOutline sx={{ fontSize: 18 }} />
                  </IconButton>
                )
              ) : (
                <IconButton
                  size="small"
                  onClick={() => handleAddFromRegistry(server)}
                  sx={{ color: 'primary.main', p: 0.25 }}
                >
                  <Add sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>

            {/* Server name + badges */}
            <Typography
              variant="subtitle2"
              sx={{
                px: 3,
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.3,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </Typography>
            {isConfigured && (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                {standard && (
                  <Chip size="small" label={t('mcpToolsSelector.standard', 'Standard')} sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#616161', color: '#fff' }} />
                )}
                {registry && !standard && (
                  <Chip size="small" label={t('mcpToolsSelector.registry')} color="primary" sx={{ fontSize: '0.65rem', height: 18 }} />
                )}
              </Box>
            )}

            {/* Bottom-right: show tools */}
            {url && (
              <Box sx={{ position: 'absolute', bottom: 4, right: 4 }}>
                <Tooltip title={t('mcpToolsSelector.providedTools')} arrow placement="bottom">
                  <IconButton
                    size="small"
                    onClick={() => handleShowTools({ name, url, headers, description })}
                    sx={{ color: 'text.secondary', p: 0.25 }}
                  >
                    <BuildOutlined sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </CardContent>
        </Card>
      </Tooltip>
    );
  };

  // Separate configured and available servers
  const configuredList = Object.entries(configuredServers).map(([name, config]) => ({
    name,
    config,
    server: registryServers.find(s => s.name === name),
    isConfigured: true,
  }));

  const availableList = availableRegistryServers.map(server => ({
    name: server.name,
    config: null,
    server,
    isConfigured: false,
  }));

  const gridSx = {
    display: 'grid',
    gridTemplateColumns: {
      xs: '1fr',
      sm: 'repeat(2, 1fr)',
      md: 'repeat(3, 1fr)',
      lg: 'repeat(4, 1fr)',
    },
    gap: 1.5,
  };

  return (
    <Box>
      {/* Selected servers */}
      {configuredList.length > 0 && (
        <Box sx={{ ...gridSx, mb: availableList.length > 0 ? 1 : 2 }}>
          {configuredList.map(({ name, config, server, isConfigured }) =>
            renderServerCard(name, config, { isConfigured, server })
          )}
        </Box>
      )}

      {/* Available (not yet added) servers */}
      {availableList.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t('mcpToolsSelector.availableFromRegistry')}
          </Typography>
          <Box sx={{ ...gridSx, mb: 2 }}>
            {availableList.map(({ name, config, server, isConfigured }) =>
              renderServerCard(name, config, { isConfigured, server })
            )}
          </Box>
        </>
      )}

      {configuredList.length === 0 && availableList.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('mcpToolsSelector.noServersConfigured')}
        </Typography>
      )}

      {/* Add Custom Server Section - Admin only, collapsible */}
      {isAdmin && (
        <>
          <Divider sx={{ my: 2 }} />
          <Accordion defaultExpanded={false} sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 0, minHeight: 'auto' }}>
              <Typography variant="subtitle2">
                {t('mcpToolsSelector.addCustomServer')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    label={t('mcpToolsSelector.nameLabel')}
                    value={newServer.name}
                    onChange={(e) => setNewServer({ ...newServer, name: e.target.value.toLowerCase() })}
                    placeholder={t('mcpToolsSelector.namePlaceholder')}
                    sx={{ width: 150 }}
                  />
                  <FormControl size="small" sx={{ width: 100 }}>
                    <InputLabel>{t('mcpToolsSelector.transportLabel')}</InputLabel>
                    <Select
                      value={newServer.transport}
                      onChange={(e) => setNewServer({ ...newServer, transport: e.target.value })}
                      label={t('mcpToolsSelector.transportLabel')}
                    >
                      <MenuItem value="http">HTTP</MenuItem>
                      <MenuItem value="sse">SSE</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label={t('mcpToolsSelector.urlLabel')}
                    value={newServer.url}
                    onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                    placeholder={t('mcpToolsSelector.urlPlaceholder')}
                    sx={{ flex: 1 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    label={t('mcpToolsSelector.authHeaderLabel')}
                    value={newServer.headers}
                    onChange={(e) => setNewServer({ ...newServer, headers: e.target.value })}
                    placeholder={t('mcpToolsSelector.authPlaceholder')}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddCustomServer}
                    disabled={!newServer.name || !newServer.url}
                  >
                    {t('common.add')}
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
              {t('mcpToolsSelector.providedTools')}
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
                      secondary={tool.description || t('skillCatalog.noDescription')}
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
