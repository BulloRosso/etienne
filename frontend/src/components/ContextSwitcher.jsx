import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Chip,
  IconButton,
  Divider,
  Typography,
  Tooltip
} from '@mui/material';
import { Add, Settings } from '@mui/icons-material';
import { TiTags } from "react-icons/ti";
import { apiAxios } from '../services/api';

export default function ContextSwitcher({
  projectName,
  sessionId,
  activeContextId,
  onContextChange,
  onManageContexts,
  sx
}) {
  const [contexts, setContexts] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (projectName) {
      loadContexts();
    }
  }, [projectName]);

  const loadContexts = async () => {
    try {
      const response = await apiAxios.get(`/api/workspace/${projectName}/contexts`);
      setContexts(response.data || []);
    } catch (err) {
      console.error('Failed to load contexts:', err);
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectContext = async (contextId) => {
    try {
      setLoading(true);

      // Set the active context for this session
      await apiAxios.post(`/api/sessions/${projectName}/${sessionId}/context`, {
        contextId
      });

      // Notify parent component
      if (onContextChange) {
        onContextChange(contextId);
      }

      handleClose();
    } catch (err) {
      console.error('Failed to set active context:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManageContexts = () => {
    handleClose();
    if (onManageContexts) {
      onManageContexts();
    }
  };

  const activeContext = contexts.find(c => c.id === activeContextId);

  return (
    <Box sx={sx}>
      <Tooltip title="Switch Context" arrow>
        <Button
          variant="outlined"
          size="small"
          startIcon={<TiTags size={18} />}
          onClick={handleClick}
          disabled={!projectName || !sessionId}
          sx={{
            color: 'inherit',
            borderColor: 'rgba(255, 255, 255, 0.3)',
            paddingLeft: '10px',
            paddingRight: '10px',
            '&:hover': {
              borderColor: 'rgba(255, 255, 255, 0.5)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          {activeContext ? activeContext.name : 'Default (All)'}
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 280 }
        }}
      >
        <MenuItem
          onClick={() => handleSelectContext(null)}
          selected={!activeContextId}
          disabled={loading}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Typography variant="body2">Default (All)</Typography>
            {!activeContextId && (
              <Chip
                label="Active"
                size="small"
                color="primary"
                sx={{ ml: 'auto', height: '20px', fontSize: '0.7rem' }}
              />
            )}
          </Box>
        </MenuItem>

        <Divider />

        {contexts.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No contexts defined
            </Typography>
          </MenuItem>
        ) : (
          contexts.map((context) => (
            <MenuItem
              key={context.id}
              onClick={() => handleSelectContext(context.id)}
              selected={context.id === activeContextId}
              disabled={loading}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Typography variant="body2">{context.name}</Typography>
                  {context.id === activeContextId && (
                    <Chip
                      label="Active"
                      size="small"
                      color="primary"
                      sx={{ ml: 'auto', height: '20px', fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
                {context.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {context.description}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))
        )}

        <Divider />

        <MenuItem onClick={handleManageContexts}>
          <Settings fontSize="small" sx={{ mr: 1 }} />
          <Typography variant="body2">Manage Contexts...</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
