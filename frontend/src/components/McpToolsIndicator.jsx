import React, { useState, useEffect } from 'react';
import {
  Box, Tooltip, Menu, MenuItem, Typography, Divider,
  Drawer, List, ListItem, ListItemIcon, ListItemText,
  CircularProgress, Button
} from '@mui/material';
import { Build } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import DonClippoModal from './DonClippoModal';

export default function McpToolsIndicator({ projectName, sessionId }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const [mcpServers, setMcpServers] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [toolsDrawerServer, setToolsDrawerServer] = useState(null);
  const [toolsList, setToolsList] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState(null);
  const [donClippoOpen, setDonClippoOpen] = useState(false);

  // Hide for admin role
  const isAdmin = hasRole('admin');

  useEffect(() => {
    if (projectName && !isAdmin) {
      loadMcpConfig();
    }
  }, [projectName, isAdmin]);

  const loadMcpConfig = async () => {
    try {
      const response = await apiAxios.post('/api/claude/mcp/config', {
        projectName
      });
      setMcpServers(response.data.mcpServers || {});
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      setMcpServers({});
    }
  };

  const handleServerClick = async (name) => {
    setAnchorEl(null);
    const config = mcpServers[name];
    if (!config || !config.url) return;

    setToolsDrawerServer({ name, ...config });
    setToolsDrawerOpen(true);
    setToolsList([]);
    setToolsError(null);
    setToolsLoading(true);

    try {
      const response = await apiAxios.post('/api/mcp-registry/list-tools', {
        url: config.url,
        headers: config.headers
      });
      setToolsList(response.data.tools || []);
    } catch (error) {
      setToolsError(error.response?.data?.message || error.message || 'Failed to fetch tools');
    } finally {
      setToolsLoading(false);
    }
  };

  // Don't render for admin role
  if (isAdmin) {
    return null;
  }

  const serverCount = Object.keys(mcpServers).length;

  // Don't render if no servers
  if (serverCount === 0) {
    return null;
  }

  const sortedServerNames = Object.keys(mcpServers).sort();

  return (
    <>
      <Tooltip title={t('mcpToolsIndicator.tooltip')}>
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            fontSize: '0.75rem',
            mr: 1,
            '&:hover': { opacity: 0.8 }
          }}
        >
          <Box component="span" sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            px: 0.5,
            py: 0.25,
            bgcolor: '#000000',
            color: '#ffffff',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.7rem'
          }}>
            {serverCount}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>{t('mcpToolsIndicator.label')}</Box>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {sortedServerNames.map(name => (
          <MenuItem key={name} onClick={() => handleServerClick(name)}>
            <Build sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
            <Typography variant="body2">{name}</Typography>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchorEl(null); setDonClippoOpen(true); }}>
          <img src="/don-clippo.png" alt="" style={{ width: 20, height: 20, marginRight: 8, borderRadius: 4, objectFit: 'contain' }} />
          <Typography variant="body2">{t('donClippo.visitMenuItem')}</Typography>
        </MenuItem>
      </Menu>

      <Drawer
        anchor="left"
        open={toolsDrawerOpen}
        onClose={() => setToolsDrawerOpen(false)}
      >
        <Box sx={{ width: 420, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            {t('mcpToolsIndicator.drawerTitle')}
          </Typography>
          {toolsDrawerServer && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {toolsDrawerServer.name}
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
              {t('mcpToolsIndicator.noToolsAvailable')}
            </Typography>
          )}

          {!toolsLoading && toolsList.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('mcpToolsIndicator.toolsAvailableCount', { count: toolsList.length })}
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

          <Box sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              onClick={() => setToolsDrawerOpen(false)}
              fullWidth
            >
              {t('common.close')}
            </Button>
          </Box>
        </Box>
      </Drawer>

      <DonClippoModal
        open={donClippoOpen}
        onClose={() => { setDonClippoOpen(false); loadMcpConfig(); }}
        projectName={projectName}
        sessionId={sessionId}
      />
    </>
  );
}
