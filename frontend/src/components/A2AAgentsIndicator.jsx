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
            px: 1,
            py: 0.5,
            bgcolor: '#001f3f',
            color: '#ffffff',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
            mr: 1,
            '&:hover': {
              bgcolor: '#003366'
            }
          }}
        >
          <span>{agentCount}</span>
          <span>agents available</span>
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
