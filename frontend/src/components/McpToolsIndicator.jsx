import React, { useState, useEffect } from 'react';
import { Box, Tooltip, Menu, MenuItem, Typography } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function McpToolsIndicator({ projectName }) {
  const { hasRole } = useAuth();
  const [mcpServers, setMcpServers] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);

  // Hide for admin role
  const isAdmin = hasRole('admin');

  useEffect(() => {
    if (projectName && !isAdmin) {
      loadMcpConfig();
    }
  }, [projectName, isAdmin]);

  const loadMcpConfig = async () => {
    try {
      const response = await axios.post('/api/claude/mcp/config', {
        projectName
      });
      setMcpServers(response.data.mcpServers || {});
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      setMcpServers({});
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
      <Tooltip title="MCP Tools Available">
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            bgcolor: '#000000',
            color: '#ffffff',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
            mr: 1,
            '&:hover': {
              bgcolor: '#333333'
            }
          }}
        >
          <span>{serverCount}</span>
          <span>tools available</span>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {sortedServerNames.map(name => (
          <MenuItem key={name} onClick={() => setAnchorEl(null)}>
            <Typography variant="body2">{name}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
