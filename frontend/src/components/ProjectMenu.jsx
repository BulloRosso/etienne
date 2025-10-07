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
  ListItemText,
  Box,
  Typography,
  Tabs,
  Tab,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Menu as MenuIcon, FolderOutlined, AddOutlined, InfoOutlined, Close, Assessment } from '@mui/icons-material';
import { TbCalendarTime } from 'react-icons/tb';
import SchedulingOverview from './SchedulingOverview';

export default function ProjectMenu({ currentProject, onProjectChange, budgetSettings, onBudgetSettingsChange, onTasksChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [budgetSettingsOpen, setBudgetSettingsOpen] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

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

  const handleAboutOpen = () => {
    setAboutOpen(true);
    handleMenuClose();
  };

  const handleAboutClose = () => {
    setAboutOpen(false);
    setCurrentTab(0);
  };

  const handleBudgetSettingsOpen = () => {
    setBudgetSettingsOpen(true);
    handleMenuClose();
  };

  const handleBudgetSettingsClose = () => {
    setBudgetSettingsOpen(false);
  };

  const handleSchedulingOpen = () => {
    setSchedulingOpen(true);
    handleMenuClose();
  };

  const handleSchedulingClose = () => {
    setSchedulingOpen(false);
    // Notify parent that tasks may have changed
    if (onTasksChange) {
      onTasksChange();
    }
  };

  const handleBudgetToggle = async (event) => {
    const enabled = event.target.checked;

    try {
      const response = await fetch(`/api/budget-monitoring/${currentProject}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          limit: budgetSettings?.limit || 0
        })
      });

      if (response.ok && onBudgetSettingsChange) {
        onBudgetSettingsChange({
          enabled,
          limit: budgetSettings?.limit || 0
        });
      }
    } catch (error) {
      console.error('Failed to update budget settings:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
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
        <MenuItem onClick={handleAboutOpen}>
          <ListItemIcon>
            <InfoOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>About...</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleBudgetSettingsOpen} disabled={!currentProject}>
          <ListItemIcon>
            <Assessment fontSize="small" />
          </ListItemIcon>
          <ListItemText>Budget Settings</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSchedulingOpen} disabled={!currentProject}>
          <ListItemIcon>
            <TbCalendarTime fontSize="small" style={{ fontSize: '20px' }} />
          </ListItemIcon>
          <ListItemText>Scheduling</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <ListItemText>Choose project:</ListItemText>
        </MenuItem>
        {projects.map((project) => (
          <MenuItem
            key={project}
            onClick={() => handleProjectSelect(project)}
            selected={project === currentProject}
          >
            <ListItemIcon>
              <FolderOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{project}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleNewProject}>
          <ListItemIcon>
            <AddOutlined fontSize="small" />
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

      <Dialog open={aboutOpen} onClose={handleAboutClose} maxWidth="md"  fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          About Etienne
          <IconButton onClick={handleAboutClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <Tabs value={currentTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tab label="Intention" />
          <Tab label="How it works" />
          <Tab label="How to create your own solution" />
        </Tabs>
        <DialogContent>
          {currentTab === 0 && (
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', minHeight: '400px', p: 2 }}>
              <Box sx={{ flex: '0 0 auto' }}>
                <img
                  src="/etienne-logo.png"
                  alt="Etienne Logo"
                  style={{ height: '220px', width: 'auto' }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography>
                  <strong>Headless Claude Code</strong>
                  <br />
                  A learner project for AI system engineers to understand how Claude Code works in non-interactive mode.
                </Typography>
                <Box component="ul" sx={{ color: 'text.secondary', mt: 2, pl: 2 }}>
                  <li>see hooks and events in action</li>
                  <li>learn how to build a live preview</li>
                  <li>play around with permissions</li>
                  <li>understand multi-tenant project organization</li>
                  <li>manage content in the Claude workspace</li>
                  <li>observe session management files</li>
                  <li>use local or OpenAI inference via the integrated model proxy</li>
                </Box>
              </Box>
            </Box>
          )}

          {currentTab === 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 0 }}>
              <img
                src="/building-blocks.jpg"
                alt="Building Blocks"
                style={{ maxWidth: '100%', height: '400px' }}
              />
            </Box>
          )}

          {currentTab === 2 && (
            <Box sx={{ p: 2, minHeight: '400px' }}>
              <Typography paragraph>
                Etienne was built with Claude Code 2.0 and the Anthropic 4.5 Sonnet model following a <b>spec-driven approach</b>.
              </Typography>
              <Typography paragraph>
                If you want to build your own solution, this is the <b>suggested workflow</b>:
              </Typography>
              <Box component="ol" sx={{ pl: 3 }}>
                <li>place a new requirements specification in the root as markdown file</li>
                <li>ask Claude code to implement it</li>
                <li>review and refine the results presented by Claude</li>
                <li>move the specification to the directory 'requirement-docs'</li>
              </Box>
              <Box component="ul" sx={{ color: 'text.secondary', mt: 2, pl: 2 }}>
             
                With spec-driven coding the specification is the most important artifact. You can recreate a
                more sophisticated implementations later on using more capable AI models.<br/><br/> In modern
                DevOps environments IaC is a common approach - with application development the specifications will 
                have the same importance as Terraform scripts nowadays for IaC.
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={budgetSettingsOpen} onClose={handleBudgetSettingsClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Budget Monitoring
          <IconButton onClick={handleBudgetSettingsClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={budgetSettings?.enabled || false}
                  onChange={handleBudgetToggle}
                />
              }
              label="Enable Budget Monitoring"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Track AI inference costs for this project
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBudgetSettingsClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <SchedulingOverview
        open={schedulingOpen}
        onClose={handleSchedulingClose}
        project={currentProject}
      />
    </>
  );
}
