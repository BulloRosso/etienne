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
  FormControlLabel,
  Drawer
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
import SkillCatalog from './SkillCatalog';
import DashboardGrid from './DashboardGrid';
import ContextManager from './ContextManager';
import EventHandling from './EventHandling';
import OntologyCoreEditor from './ontology-core/OntologyCoreEditor';
import Configuration from './Configuration';
import ChangePasswordDialog from './ChangePasswordDialog';
import CreateProjectWizard from './CreateProjectWizard';
import ServiceControlDrawer from './ServiceControlDrawer';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { filePreviewHandler } from '../services/FilePreviewHandler';

export default function ProjectMenu({ currentProject, onProjectChange, budgetSettings, onBudgetSettingsChange, onTasksChange, showBackgroundInfo, onUIConfigChange, showConfigurationRequired, onConfigurationSaved }) {
  const { user, logout, hasRole } = useAuth();
  const { mode: themeMode } = useThemeMode();
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
  const [skillCatalogOpen, setSkillCatalogOpen] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);
  const [conditionMonitoringOpen, setConditionMonitoringOpen] = useState(false);
  const [ontologyCoreOpen, setOntologyCoreOpen] = useState(false);
  const [scrapbookListOpen, setScrapbookListOpen] = useState(false);
  const [scrapbooks, setScrapbooks] = useState([]);
  const [createScrapbookDialogOpen, setCreateScrapbookDialogOpen] = useState(false);
  const [newScrapbookName, setNewScrapbookName] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [serviceControlOpen, setServiceControlOpen] = useState(false);
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

  // Open About dialog with Configuration tab when configuration is required (admin only)
  useEffect(() => {
    if (showConfigurationRequired && hasRole('admin')) {
      setAboutOpen(true);
      setCurrentTab(3); // Configuration tab index
    }
  }, [showConfigurationRequired, hasRole]);

  useEffect(() => {
    if (currentProject) {
      fetchTags();
    }
  }, [currentProject]);

  const fetchProjects = async () => {
    try {
      const response = await apiFetch('/api/claude/listProjects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await apiFetch(`/api/workspace/${currentProject}/tags`);
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
      case 'contexts':
        handleContextsOpen();
        break;
      case 'conditionmonitoring':
        handleConditionMonitoringOpen();
        break;
      case 'ontologycore':
        handleOntologyCoreOpen();
        break;
      case 'scrapbook':
        handleScrapbookOpen();
        break;
      case 'skillstore':
        handleSkillCatalogOpen();
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
      const response = await apiFetch('/api/workspace/projects-with-ui');
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
      const response = await apiFetch(`/api/workspace/${copyFromProject}/user-interface`);
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
      await apiFetch('/api/claude/addFile', {
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
          await apiFetch(`/api/workspace/${projectName}/user-interface`, {
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

  const handleSkillCatalogOpen = () => {
    setSkillCatalogOpen(true);
    handleMenuClose();
  };

  const handleSkillCatalogClose = () => {
    setSkillCatalogOpen(false);
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

  const handleOntologyCoreOpen = () => {
    setOntologyCoreOpen(true);
    handleMenuClose();
  };

  const handleOntologyCoreClose = () => {
    setOntologyCoreOpen(false);
  };

  const fetchScrapbooks = async () => {
    if (!currentProject) return;
    try {
      const response = await apiFetch(`/api/workspace/${currentProject}/scrapbooks`);
      if (response.ok) {
        const data = await response.json();
        setScrapbooks(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch scrapbooks:', error);
    }
  };

  const handleScrapbookOpen = () => {
    fetchScrapbooks();
    setScrapbookListOpen(true);
    handleMenuClose();
  };

  const handleOpenScrapbookFile = (scrapbook) => {
    filePreviewHandler.handlePreview(scrapbook.filename, currentProject);
    setScrapbookListOpen(false);
  };

  const handleCreateScrapbook = async () => {
    const name = newScrapbookName.trim();
    if (!name) return;

    try {
      const response = await apiFetch(`/api/workspace/${currentProject}/scrapbooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const result = await response.json();
        setCreateScrapbookDialogOpen(false);
        setNewScrapbookName('');
        setScrapbookListOpen(false);
        handleOpenScrapbookFile(result);
      }
    } catch (error) {
      console.error('Failed to create scrapbook:', error);
    }
  };

  const handleChangePasswordOpen = () => {
    setChangePasswordOpen(true);
  };

  const handleChangePasswordClose = () => {
    setChangePasswordOpen(false);
  };

  const handleServiceControlOpen = () => {
    setServiceControlOpen(true);
    handleMenuClose();
  };

  const handleServiceControlClose = () => {
    setServiceControlOpen(false);
  };

  // Listen for openScrapbook event (triggered by #scrapbook hash route)
  useEffect(() => {
    const handleOpenScrapbook = () => {
      fetchScrapbooks();
      setScrapbookListOpen(true);
    };

    window.addEventListener('openScrapbook', handleOpenScrapbook);
    return () => window.removeEventListener('openScrapbook', handleOpenScrapbook);
  }, [currentProject]);

  const handleBudgetToggle = async (event) => {
    const enabled = event.target.checked;

    try {
      const response = await apiFetch(`/api/budget-monitoring/${currentProject}/settings`, {
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
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'hidden'
            }
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'stretch', maxHeight: 'calc(100vh - 32px)' }}>
          {/* Dashboard Grid on the left */}
          <Box sx={{
            overflowY: 'auto',
            overflowX: 'hidden',
            mb: '8px',
            '&::-webkit-scrollbar': { width: '8px' },
            '&::-webkit-scrollbar-track': { backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#f5f5f0' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: themeMode === 'dark' ? '#555' : '#ccc',
              borderRadius: '4px',
              '&:hover': { backgroundColor: themeMode === 'dark' ? '#777' : '#aaa' }
            },
            scrollbarColor: themeMode === 'dark' ? '#555 #2c2c2c' : '#ccc #f5f5f0',
          }}>
            <DashboardGrid
              currentProject={currentProject}
              onItemClick={handleDashboardItemClick}
              onClose={handleMenuClose}
              onAboutClick={handleAboutOpen}
              user={user}
              onLogout={logout}
              onSettingsClick={handleChangePasswordOpen}
              onServiceControlClick={handleServiceControlOpen}
            />
          </Box>

          {/* Project Menu on the right */}
          <Box sx={{
            minWidth: '250px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <MenuItem disabled sx={{ opacity: '1 !important', mt: '20px', flexShrink: 0 }}>
              <ListItemText>Choose project:</ListItemText>
            </MenuItem>
            <Box sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              '&::-webkit-scrollbar': { width: '8px' },
              '&::-webkit-scrollbar-track': { backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#f5f5f0' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: themeMode === 'dark' ? '#555' : '#ccc',
                borderRadius: '4px',
                '&:hover': { backgroundColor: themeMode === 'dark' ? '#777' : '#aaa' }
              },
              scrollbarColor: themeMode === 'dark' ? '#555 #2c2c2c' : '#ccc #f5f5f0',
            }}>
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
            </Box>
            <Box sx={{ flexShrink: 0, mb: '10px' }}>
              <Divider />
              <MenuItem onClick={handleNewProject}>
                <ListItemIcon sx={{ color: themeMode === 'dark' ? 'gold' : 'inherit' }}>
                  <AddOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontWeight: 'bold', color: themeMode === 'dark' ? 'gold' : 'inherit' }}>New Project</ListItemText>
              </MenuItem>
            </Box>
          </Box>
        </Box>
      </Menu>

      <CreateProjectWizard
        open={dialogOpen}
        onClose={handleDialogClose}
        existingProjects={projects}
        onProjectCreated={async (projectName, guidanceDocuments) => {
          handleDialogClose();
          await fetchProjects();
          onProjectChange(projectName, guidanceDocuments);
        }}
      />

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
          {hasRole('admin') && <Tab label="Configuration" />}
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
                  <strong>Coding Agent Harness</strong>
                  <br />
                  Etienne integrates traditional IT backend services (like CRON jobs) with coding agents like Anthropic Claude Code or OpenAI Codex. It can be run on the local machine for development and inside a docker container for production.
                </Typography>
                <Box component="ul" sx={{ color: 'text.secondary', mt: 2, pl: 2 }}>
                  <li>works on private/local storage ("workspace")</li>
                  <li>adds a event bus (ZeroMQ) and a condition monitoring system</li>
                  <li>can create public websites exposed under /web</li>
                  <li>adds RBAC security layer</li>
                  <li>showcases service management for additional local services (e.g. vector store, RDF store)</li>
                  <li>demonstrates how to seamlessly integrate agent skills and MCP tools into business processes</li>
                  <li>provides a file system explorer and file type dependent previewers (e.g. mindmaps)</li>
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

          {currentTab === 3 && hasRole('admin') && (
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

      <Drawer
        anchor="right"
        open={schedulingOpen}
        onClose={handleSchedulingClose}
        sx={{
          '& .MuiDrawer-paper': {
            width: '500px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <SchedulingOverview
            open={schedulingOpen}
            onClose={handleSchedulingClose}
            project={currentProject}
          />
        </Box>
      </Drawer>

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

      <SkillCatalog
        open={skillCatalogOpen}
        onClose={handleSkillCatalogClose}
      />

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
            maxHeight: '90vh',
            ...(themeMode === 'dark' && { border: '1px solid #999' })
          }
        }}
      >
        <EventHandling
          selectedProject={currentProject}
          onClose={handleConditionMonitoringClose}
        />
      </Dialog>

      <Dialog
        open={ontologyCoreOpen}
        onClose={handleOntologyCoreClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh',
            ...(themeMode === 'dark' && { border: '1px solid #999' })
          }
        }}
      >
        <OntologyCoreEditor
          selectedProject={currentProject}
          onClose={handleOntologyCoreClose}
        />
      </Dialog>

      <Dialog
        open={scrapbookListOpen}
        onClose={() => setScrapbookListOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Scrapbooks</span>
          <IconButton onClick={() => setScrapbookListOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {scrapbooks.length > 0 ? scrapbooks.map((sb) => (
            <MenuItem key={sb.graphName} onClick={() => handleOpenScrapbookFile(sb)}>
              <ListItemText
                primary={sb.name}
                secondary={sb.filename}
              />
            </MenuItem>
          )) : (
            <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No scrapbooks yet. Create one to get started.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCreateScrapbookDialogOpen(true)}
            startIcon={<AddOutlined />}
            variant="contained"
          >
            Create New
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createScrapbookDialogOpen}
        onClose={() => setCreateScrapbookDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New Scrapbook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Scrapbook Name"
            value={newScrapbookName}
            onChange={(e) => setNewScrapbookName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateScrapbook(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateScrapbookDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateScrapbook} variant="contained" disabled={!newScrapbookName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={handleChangePasswordClose}
      />

      <ServiceControlDrawer
        open={serviceControlOpen}
        onClose={handleServiceControlClose}
      />
    </>
  );
}
