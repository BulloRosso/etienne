import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Box } from '@mui/material';
import { FolderOutlined, Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function ProjectListModal({ open, onClose, currentProject, onProjectChange }) {
  const { t } = useTranslation();
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('sidebar.allProjects')}
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <List>
            {projects.map((project) => (
              <ListItem
                key={project}
                button
                selected={project === currentProject}
                onClick={() => handleSelect(project)}
                sx={{ borderRadius: 1 }}
              >
                <ListItemIcon><FolderOutlined /></ListItemIcon>
                <ListItemText primary={project} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
