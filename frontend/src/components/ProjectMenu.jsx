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
import { TbCalendarTime, TbPalette } from 'react-icons/tb';
import { IoHandRightOutline } from 'react-icons/io5';
import { RiRobot2Line } from 'react-icons/ri';
import { FcElectricalSensor } from 'react-icons/fc';
import { PiGraphLight } from 'react-icons/pi';
import { GiAtom } from 'react-icons/gi';
import SchedulingOverview from './SchedulingOverview';
import GuardrailsSettings from './GuardrailsSettings';
import SubagentConfiguration from './SubagentConfiguration';
import MQTTSettings from './MQTTSettings';
import CustomUI from './CustomUI';
import KnowledgeGraphBrowser from './KnowledgeGraphBrowser';
import SkillsSettings from './SkillsSettings';
import DashboardGrid from './DashboardGrid';
import EmailConfiguration from './EmailConfiguration';
import ContextManager from './ContextManager';
import EventHandling from './EventHandling';
import Scrapbook from './Scrapbook';
import Configuration from './Configuration';

export default function ProjectMenu({ currentProject, onProjectChange, budgetSettings, onBudgetSettingsChange, onTasksChange, showBackgroundInfo, onUIConfigChange, showConfigurationRequired, onConfigurationSaved }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [budgetSettingsOpen, setBudgetSettingsOpen] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [guardrailsOpen, setGuardrailsOpen] = useState(false);
  const [subagentsOpen, setSubagentsOpen] = useState(false);
  const [externalEventsOpen, setExternalEventsOpen] = useState(false);
  const [customUIOpen, setCustomUIOpen] = useState(false);
  const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);
  const [conditionMonitoringOpen, setConditionMonitoringOpen] = useState(false);
  const [scrapbookOpen, setScrapbookOpen] = useState(false);
  const [useGraphLayer, setUseGraphLayer] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [customizeUI, setCustomizeUI] = useState(false);
  const [projectsWithUI, setProjectsWithUI] = useState([]);
  const [copyFromProject, setCopyFromProject] = useState('');
  const [currentTab, setCurrentTab] = useState(0);
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  // Open About dialog with Configuration tab when configuration is required
  useEffect(() => {
    if (showConfigurationRequired) {
      setAboutOpen(true);
      setCurrentTab(3); // Configuration tab index
    }
  }, [showConfigurationRequired]);

  useEffect(() => {
    if (currentProject) {
      fetchTags();
    }
  }, [currentProject]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/claude/listProjects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`/api/workspace/${currentProject}/tags`);
      const data = await response.json();
      setAllTags(data || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
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

  const handleDashboardItemClick = (itemId) => {
    switch (itemId) {
      case 'budget':
        handleBudgetSettingsOpen();
        break;
      case 'scheduling':
        handleSchedulingOpen();
        break;
      case 'guardrails':
        handleGuardrailsOpen();
        break;
      case 'subagents':
        handleSubagentsOpen();
        break;
      case 'customui':
        handleCustomUIOpen();
        break;
      case 'knowledge':
        handleKnowledgeGraphOpen();
        break;
      case 'skills':
        handleSkillsOpen();
        break;
      case 'externalevents':
        handleExternalEventsOpen();
        break;
      case 'email':
        handleEmailOpen();
        break;
      case 'contexts':
        handleContextsOpen();
        break;
      case 'conditionmonitoring':
        handleConditionMonitoringOpen();
        break;
      case 'scrapbook':
        handleScrapbookOpen();
        break;
      default:
        break;
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setNewProjectName('');
    setCustomizeUI(false);
    setCopyFromProject('');
  };

  const fetchProjectsWithUI = async () => {
    try {
      const response = await fetch('/api/workspace/projects-with-ui');
      const data = await response.json();
      setProjectsWithUI(data || []);
    } catch (error) {
      console.error('Failed to fetch projects with UI:', error);
    }
  };

  const handleCustomizeUIToggle = (event) => {
    const checked = event.target.checked;
    setCustomizeUI(checked);
    if (checked) {
      fetchProjectsWithUI();
    }
  };

  const handleCopyUIConfig = async () => {
    if (!copyFromProject) return;

    try {
      const response = await fetch(`/api/workspace/${copyFromProject}/user-interface`);
      if (response.ok) {
        const config = await response.json();
        // Store for later use after project creation
        window._pendingUIConfig = config;
      }
    } catch (error) {
      console.error('Failed to copy UI config:', error);
    }
  };

  const handleCreateProject = async () => {
    const projectName = newProjectName.trim();
    // Validate: only lowercase letters, numbers, hyphens, max 30 characters
    if (projectName && /^[a-z0-9-]{1,30}$/.test(projectName)) {
      // Create project by creating a CLAUDE.md file
      await fetch('/api/claude/addFile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_dir: projectName,
          file_name: 'CLAUDE.md',
          file_content: `# ${projectName}\n`
        })
      });

      // If customizeUI is enabled and we have a pending config, save it
      if (customizeUI && window._pendingUIConfig) {
        try {
          await fetch(`/api/workspace/${projectName}/user-interface`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(window._pendingUIConfig)
          });
          delete window._pendingUIConfig;
        } catch (error) {
          console.error('Failed to save UI config:', error);
        }
      }

      await fetchProjects();
      onProjectChange(projectName);
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

  const handleGuardrailsOpen = () => {
    setGuardrailsOpen(true);
    handleMenuClose();
  };

  const handleGuardrailsClose = () => {
    setGuardrailsOpen(false);
  };

  const handleSubagentsOpen = () => {
    setSubagentsOpen(true);
    handleMenuClose();
  };

  const handleSubagentsClose = () => {
    setSubagentsOpen(false);
  };

  const handleExternalEventsOpen = () => {
    setExternalEventsOpen(true);
    handleMenuClose();
  };

  const handleExternalEventsClose = () => {
    setExternalEventsOpen(false);
  };

  const handleCustomUIOpen = () => {
    setCustomUIOpen(true);
    handleMenuClose();
  };

  const handleCustomUIClose = () => {
    setCustomUIOpen(false);
  };

  const handleKnowledgeGraphOpen = () => {
    setKnowledgeGraphOpen(true);
    handleMenuClose();
  };

  const handleKnowledgeGraphClose = () => {
    setKnowledgeGraphOpen(false);
  };

  const handleSkillsOpen = () => {
    setSkillsOpen(true);
    handleMenuClose();
  };

  const handleSkillsClose = () => {
    setSkillsOpen(false);
  };

  const handleEmailOpen = () => {
    setEmailOpen(true);
    handleMenuClose();
  };

  const handleEmailClose = () => {
    setEmailOpen(false);
  };

  const handleContextsOpen = () => {
    setContextsOpen(true);
    handleMenuClose();
  };

  const handleContextsClose = () => {
    setContextsOpen(false);
  };

  const handleConditionMonitoringOpen = () => {
    setConditionMonitoringOpen(true);
    handleMenuClose();
  };

  const handleConditionMonitoringClose = () => {
    setConditionMonitoringOpen(false);
  };

  const handleScrapbookOpen = () => {
    setScrapbookOpen(true);
    handleMenuClose();
  };

  const handleScrapbookClose = () => {
    setScrapbookOpen(false);
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
        PaperProps={{
          sx: {
            overflow: 'visible',
            mt: 1.5
          }
        }}
        slotProps={{
          paper: {
            sx: {
              overflow: 'visible'
            }
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* Dashboard Grid on the left */}
          <Box>
            <DashboardGrid
              currentProject={currentProject}
              onItemClick={handleDashboardItemClick}
              onClose={handleMenuClose}
              onAboutClick={handleAboutOpen}
            />
          </Box>

          {/* Project Menu on the right */}
          <Box sx={{ minWidth: '250px' }}>
            <MenuItem disabled sx={{ opacity: '1 !important', mt: '20px' }}>
              <ListItemText>Choose project:</ListItemText>
            </MenuItem>
            {projects.filter(project => !project.startsWith('.')).map((project) => (
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
          </Box>
        </Box>
      </Menu>

      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            value={newProjectName}
            onChange={(e) => {
              const value = e.target.value;
              // Only allow lowercase letters, numbers, and hyphens, max 30 characters
              if (value === '' || (/^[a-z0-9-]*$/.test(value) && value.length <= 30)) {
                setNewProjectName(value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !customizeUI) {
                handleCreateProject();
              }
            }}
            helperText="Only lowercase letters, numbers, and hyphens (max 30 characters)"
            sx={{ mb: 2 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={customizeUI}
                onChange={handleCustomizeUIToggle}
                size="small"
              />
            }
            label="Customize UI"
          />

          {customizeUI && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              {projectsWithUI.length > 0 ? (
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Copy UI configuration from existing project:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      select
                      size="small"
                      label="Copy from"
                      value={copyFromProject}
                      onChange={(e) => setCopyFromProject(e.target.value)}
                      sx={{ flex: 1 }}
                      SelectProps={{ native: true }}
                    >
                      <option value="">Select a project...</option>
                      {projectsWithUI.map((proj) => (
                        <option key={proj} value={proj}>
                          {proj}
                        </option>
                      ))}
                    </TextField>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleCopyUIConfig}
                      disabled={!copyFromProject}
                    >
                      Copy
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No projects with UI customization found. You can customize the UI after creating the project.
                </Typography>
              )}
            </Box>
          )}
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
          <Tab label="Configuration" />
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

          {currentTab === 3 && (
            <Box sx={{ minHeight: '400px' }}>
              <Configuration onSave={() => {
                if (onConfigurationSaved) {
                  onConfigurationSaved();
                }
                handleAboutClose();
              }} />
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

      <GuardrailsSettings
        open={guardrailsOpen}
        onClose={handleGuardrailsClose}
        project={currentProject}
        showBackgroundInfo={showBackgroundInfo}
      />

      <Dialog open={subagentsOpen} onClose={handleSubagentsClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Subagents Configuration
          <IconButton onClick={handleSubagentsClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ height: '70vh', p: 0 }}>
          <SubagentConfiguration project={currentProject} />
        </DialogContent>
      </Dialog>

      <MQTTSettings
        open={externalEventsOpen}
        onClose={handleExternalEventsClose}
        project={currentProject}
      />

      <Dialog open={customUIOpen} onClose={handleCustomUIClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Customize UI
          <IconButton onClick={handleCustomUIClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <CustomUI
            project={currentProject}
            onSave={(config) => {
              if (onUIConfigChange) {
                onUIConfigChange(config);
              }
              handleCustomUIClose();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={knowledgeGraphOpen} onClose={handleKnowledgeGraphClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PiGraphLight style={{ fontSize: '24px' }} />
            <span>Knowledge Base</span>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={useGraphLayer}
                  onChange={(e) => setUseGraphLayer(e.target.checked)}
                  size="small"
                />
              }
              label="Use Graph Layer"
              sx={{ m: 0 }}
            />
            <IconButton onClick={handleKnowledgeGraphClose} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ height: '70vh', p: 2 }}>
          <KnowledgeGraphBrowser project={currentProject} useGraphLayer={useGraphLayer} />
        </DialogContent>
      </Dialog>

      <SkillsSettings
        open={skillsOpen}
        onClose={handleSkillsClose}
        project={currentProject}
      />

      <Dialog open={emailOpen} onClose={handleEmailClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            Email Configuration
            <IconButton onClick={handleEmailClose} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <EmailConfiguration />
        </DialogContent>
      </Dialog>

      <ContextManager
        open={contextsOpen}
        onClose={handleContextsClose}
        projectName={currentProject}
        allTags={allTags}
        onContextChange={() => {}}
      />

      <Dialog
        open={conditionMonitoringOpen}
        onClose={handleConditionMonitoringClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh'
          }
        }}
      >
        <EventHandling
          selectedProject={currentProject}
          onClose={handleConditionMonitoringClose}
        />
      </Dialog>

      <Dialog
        open={scrapbookOpen}
        onClose={handleScrapbookClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span>Scrapbook</span>
          </Box>
          <IconButton onClick={handleScrapbookClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ height: 'calc(100% - 64px)', p: 0 }}>
          <Scrapbook projectName={currentProject} onClose={handleScrapbookClose} />
        </DialogContent>
      </Dialog>
    </>
  );
}
