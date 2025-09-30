import React, { useState, useEffect } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { Menu as MenuIcon, Folder, Add } from '@mui/icons-material';

export default function ProjectMenu({ currentProject, onProjectChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/claude/listProjects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleProjectSelect = (projectName) => {
    onProjectChange(projectName);
    handleMenuClose();
  };

  const handleNewProject = () => {
    setDialogOpen(true);
    handleMenuClose();
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setNewProjectName('');
  };

  const handleCreateProject = async () => {
    if (newProjectName.trim()) {
      // Create project by creating a CLAUDE.md file
      await fetch('/api/claude/addFile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_dir: newProjectName.trim(),
          file_name: 'CLAUDE.md',
          file_content: `# ${newProjectName.trim()}\n`
        })
      });

      await fetchProjects();
      onProjectChange(newProjectName.trim());
      handleDialogClose();
    }
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleMenuOpen}
        edge="end"
      >
        <MenuIcon />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {projects.map((project) => (
          <MenuItem
            key={project}
            onClick={() => handleProjectSelect(project)}
            selected={project === currentProject}
          >
            <ListItemIcon>
              <Folder fontSize="small" />
            </ListItemIcon>
            <ListItemText>{project}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleNewProject}>
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          <ListItemText>New Project</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={dialogOpen} onClose={handleDialogClose}>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateProject();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Cancel</Button>
          <Button onClick={handleCreateProject} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
