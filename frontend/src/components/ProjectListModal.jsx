import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress } from '@mui/material';
import { FolderOutlined } from '@mui/icons-material';
import { IoClose } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function ProjectListModal({ open, onClose, currentProject, onProjectChange }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      apiFetch('/api/claude/listProjects')
        .then(res => res.json())
        .then(data => setProjects((data.projects || []).filter(p => !p.startsWith('.'))))
        .catch(() => setProjects([]))
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSelect = (projectName) => {
    onProjectChange(projectName);
    onClose();
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          maxWidth: '90vw'
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2
        }}>
          <Typography variant="h6">{t('sidebar.allProjects')}</Typography>
          <IconButton onClick={onClose} size="small">
            <IoClose size={20} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List sx={{ p: 2 }}>
              {projects.map((project) => (
                <ListItem
                  key={project}
                  button
                  onClick={() => handleSelect(project)}
                  sx={{
                    border: '1px solid',
                    borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
                    borderLeft: project === currentProject ? '3px solid #1976d2' : '1px solid',
                    borderLeftColor: project === currentProject ? '#1976d2' : (themeMode === 'dark' ? '#555' : '#e0e0e0'),
                    borderRadius: 1,
                    mb: 1,
                    backgroundColor: project === currentProject
                      ? (themeMode === 'dark' ? '#1a2332' : '#f0f6ff')
                      : (themeMode === 'dark' ? '#383838' : '#fafafa'),
                    '&:hover': {
                      backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5',
                    },
                  }}
                >
                  <ListItemIcon>
                    <FolderOutlined sx={{ color: project === currentProject ? '#1976d2' : undefined }} />
                  </ListItemIcon>
                  <ListItemText primary={project} primaryTypographyProps={{
                    fontWeight: project === currentProject ? 600 : 400,
                  }} />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
