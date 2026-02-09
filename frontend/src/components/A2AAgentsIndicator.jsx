import React, { useState, useEffect } from 'react';
import { Box, Tooltip, Menu, MenuItem, Typography } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function A2AAgentsIndicator({ projectName }) {
  const { hasRole } = useAuth();
  const [agents, setAgents] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);

  // Hide for admin role
  const isAdmin = hasRole('admin');

  useEffect(() => {
    if (projectName && !isAdmin) {
      loadAgents();
    }
  }, [projectName, isAdmin]);

  const loadAgents = async () => {
    try {
      const response = await axios.get(`/api/a2a-settings/${encodeURIComponent(projectName)}/enabled`);
      setAgents(response.data.agents || []);
    } catch (error) {
      console.error('Failed to load A2A agents:', error);
      setAgents([]);
    }
  };

  // Don't render for admin role
  if (isAdmin) {
    return null;
  }

  const agentCount = agents.length;

  // Don't render if no agents
  if (agentCount === 0) {
    return null;
  }

  const sortedAgents = [...agents].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <>
      <Tooltip title="External Agents Available">
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
            bgcolor: '#001f3f',
            color: '#ffffff',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.7rem'
          }}>
            {agentCount}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>agents available</Box>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {sortedAgents.map(agent => (
          <MenuItem key={agent.url} onClick={() => setAnchorEl(null)}>
            <Typography variant="body2">{agent.name}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
