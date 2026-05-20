import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, FormControl, InputLabel, Select } from '@mui/material';
import { FolderOutlined, MoreVert } from '@mui/icons-material';
import { IoClose } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { listApplicationTypes, setProjectApplicationType, getEffectiveApplicationType } from '../services/applicationTypes';

export default function ProjectListModal({ open, onClose, currentProject, onProjectChange }) {
  const { t, i18n } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuProject, setMenuProject] = useState(null);

  const [appTypeDialogOpen, setAppTypeDialogOpen] = useState(false);
  const [appTypeDialogProject, setAppTypeDialogProject] = useState(null);
  const [availableAppTypes, setAvailableAppTypes] = useState([]);
  const [appTypeSelection, setAppTypeSelection] = useState('');
  const [appTypeSaving, setAppTypeSaving] = useState(false);
  const [appTypeError, setAppTypeError] = useState(null);

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

  const openMenu = (e, project) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuProject(project);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuProject(null);
  };

  const openAppTypeDialog = async () => {
    const project = menuProject;
    closeMenu();
    if (!project) return;
    setAppTypeDialogProject(project);
    setAppTypeDialogOpen(true);
    setAppTypeError(null);
    setAppTypeSaving(false);

    const lng = (i18n.language || 'en').split('-')[0];
    try {
      const [types, current] = await Promise.all([
        listApplicationTypes(lng),
        getEffectiveApplicationType(project, lng),
      ]);
      setAvailableAppTypes(types);
      setAppTypeSelection(current?.id || '');
    } catch (err) {
      setAppTypeError(err.message || 'Failed to load application types');
    }
  };

  const closeAppTypeDialog = () => {
    setAppTypeDialogOpen(false);
    setAppTypeDialogProject(null);
    setAppTypeSelection('');
    setAppTypeError(null);
  };

  const saveAppType = async () => {
    if (!appTypeDialogProject) return;
    setAppTypeSaving(true);
    setAppTypeError(null);
    try {
      await setProjectApplicationType(appTypeDialogProject, appTypeSelection || null);
      closeAppTypeDialog();
    } catch (err) {
      setAppTypeError(err.message || 'Failed to save');
    } finally {
      setAppTypeSaving(false);
    }
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
                    pr: 1,
                  }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => openMenu(e, project)}
                      aria-label={t('sidebar.projectActions', 'Project actions')}
                    >
                      <MoreVert fontSize="small" />
                    </IconButton>
                  }
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

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
      >
        <MenuItem onClick={openAppTypeDialog}>
          {t('sidebar.changeApplicationType', 'Change application type…')}
        </MenuItem>
      </Menu>

      <Dialog open={appTypeDialogOpen} onClose={closeAppTypeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          {t('sidebar.changeApplicationType', 'Change application type')}
          {appTypeDialogProject ? ` — ${appTypeDialogProject}` : ''}
        </DialogTitle>
        <DialogContent>
          {appTypeError && (
            <Typography color="error" sx={{ mb: 1, fontSize: '0.875rem' }}>{appTypeError}</Typography>
          )}
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>{t('wizard:applicationTypeLabel', 'Application type')}</InputLabel>
            <Select
              value={appTypeSelection}
              onChange={(e) => setAppTypeSelection(e.target.value)}
              label={t('wizard:applicationTypeLabel', 'Application type')}
            >
              <MenuItem value="">
                <em>{t('wizard:applicationTypeNoneOption', 'None')}</em>
              </MenuItem>
              {availableAppTypes.map(at => (
                <MenuItem key={at.id} value={at.id}>{at.label || at.id}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAppTypeDialog} disabled={appTypeSaving}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={saveAppType} disabled={appTypeSaving} variant="contained">
            {appTypeSaving ? <CircularProgress size={18} /> : t('common.save', 'Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
