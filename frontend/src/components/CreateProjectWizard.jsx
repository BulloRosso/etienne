import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  CircularProgress,
  Alert
} from '@mui/material';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import SkillsSelector from './SkillsSelector';
import McpToolsSelector from './McpToolsSelector';
import A2AAgentsSelector from './A2AAgentsSelector';
import { useAuth } from '../contexts/AuthContext.jsx';

const WIZARD_STEPS = [
  {
    label: 'Project Name',
    image: '/project-wizard-step-1.jpg',
    benefitTitle: 'Give your project a unique identity',
    benefitDescription: 'A clear project name helps you organize your work and quickly find what you need. Choose a name that reflects the project\'s purpose.'
  },
  {
    label: 'Mission Brief',
    image: '/project-wizard-step-2.jpg',
    benefitTitle: 'Define your project\'s goals',
    benefitDescription: 'The mission brief guides your AI assistant\'s behavior. A detailed description ensures better, more focused results aligned with your objectives.'
  },
  {
    label: 'Agent Role',
    image: '/project-wizard-step-3.jpg',
    benefitTitle: 'Choose your AI assistant\'s expertise',
    benefitDescription: 'Select a predefined role that matches your project\'s needs, or create a custom role definition. The agent role determines the assistant\'s personality, knowledge focus, and working style.'
  },
  {
    label: 'Skills',
    image: '/project-wizard-step-4.jpg',
    benefitTitle: 'Equip your project with capabilities',
    benefitDescription: 'Skills are pre-built behaviors that enhance your AI assistant. Standard skills are included automatically. Add optional skills to extend functionality.'
  },
  {
    label: 'Tools',
    image: '/project-wizard-step-5.jpg',
    benefitTitle: 'Connect to external services',
    benefitDescription: 'MCP tools let your AI assistant interact with external systems and APIs. Add pre-approved tools from the registry or connect to custom servers.'
  },
  {
    label: 'External Agents',
    image: '/project-wizard-step-6.jpg',
    benefitTitle: 'Collaborate with specialized agents',
    benefitDescription: 'External A2A agents bring specialized expertise to your project. Select agents that complement your project\'s goals for enhanced capabilities.'
  },
  {
    label: 'Customize UI',
    image: '/project-wizard-step-7.jpg',
    benefitTitle: 'Personalize your workspace',
    benefitDescription: 'Start with a familiar look by copying UI settings from an existing project, or begin fresh with the default configuration.'
  }
];

export default function CreateProjectWizard({ open, onClose, onProjectCreated, existingProjects = [] }) {
  const { hasRole } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Project Name
  const [projectName, setProjectName] = useState('');

  // Step 2: Mission Brief
  const [missionBrief, setMissionBrief] = useState('');

  // Step 3: Agent Role
  const [roleType, setRoleType] = useState('registry');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [customRoleContent, setCustomRoleContent] = useState('');
  const [availableRoles, setAvailableRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Step 4: Skills
  const [repositorySkills, setRepositorySkills] = useState({ standard: [], optional: [] });
  const [selectedOptionalSkills, setSelectedOptionalSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Step 5: MCP Tools
  const [mcpServers, setMcpServers] = useState({});
  const [registryMcpServers, setRegistryMcpServers] = useState([]);
  const [mcpLoading, setMcpLoading] = useState(false);

  // Step 6: External Agents
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [registryAgents, setRegistryAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Step 7: Customize UI
  const [copyFromProject, setCopyFromProject] = useState('');
  const [projectsWithUI, setProjectsWithUI] = useState([]);
  const [agentName, setAgentName] = useState('Etienne');
  const [agentNameLoading, setAgentNameLoading] = useState(false);

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      resetWizard();
      fetchAgentRoles();
      fetchRepositorySkills();
      fetchMcpRegistry();
      fetchA2ARegistry();
      fetchProjectsWithUI();
    }
  }, [open]);

  const resetWizard = () => {
    setActiveStep(0);
    setProjectName('');
    setMissionBrief('');
    setRoleType('registry');
    setSelectedRoleId('');
    setCustomRoleContent('');
    setSelectedOptionalSkills([]);
    setMcpServers({});
    setSelectedAgents([]);
    setCopyFromProject('');
    setAgentName('Etienne');
    setError(null);
  };

  const fetchAgentRoles = async () => {
    setRolesLoading(true);
    try {
      const response = await axios.get('/api/agent-role-registry');
      setAvailableRoles(response.data.roles || []);
    } catch (error) {
      console.error('Failed to fetch agent roles:', error);
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchRepositorySkills = async () => {
    setSkillsLoading(true);
    try {
      const response = await axios.get('/api/skills/repository/list?includeOptional=true');
      const skills = response.data.skills || [];
      setRepositorySkills({
        standard: skills.filter(s => s.source === 'standard'),
        optional: skills.filter(s => s.source === 'optional')
      });
    } catch (error) {
      console.error('Failed to fetch repository skills:', error);
    } finally {
      setSkillsLoading(false);
    }
  };

  const fetchMcpRegistry = async () => {
    setMcpLoading(true);
    try {
      const response = await axios.get('/api/mcp-registry');
      setRegistryMcpServers(response.data.servers || []);
    } catch (error) {
      console.error('Failed to fetch MCP registry:', error);
    } finally {
      setMcpLoading(false);
    }
  };

  const fetchA2ARegistry = async () => {
    setAgentsLoading(true);
    try {
      const response = await axios.get('/api/a2a-settings/registry/local');
      setRegistryAgents(response.data.agents || []);
    } catch (error) {
      console.error('Failed to fetch A2A registry:', error);
    } finally {
      setAgentsLoading(false);
    }
  };

  const fetchProjectsWithUI = async () => {
    try {
      const response = await axios.get('/api/projects/with-ui-config');
      setProjectsWithUI(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects with UI config:', error);
      setProjectsWithUI([]);
    }
  };

  const validateProjectName = (name) => {
    if (!name) return 'Project name is required';
    if (!/^[a-z0-9-]+$/.test(name)) return 'Only lowercase letters, numbers, and hyphens allowed';
    if (name.length > 30) return 'Maximum 30 characters';
    if (existingProjects.includes(name)) return 'Project already exists';
    return null;
  };

  // Generate agent name when entering step 7 (index 6)
  const generateAgentNameForStep7 = async () => {
    // If user has a custom role, generate name from it
    if (roleType === 'custom' && customRoleContent.trim()) {
      setAgentNameLoading(true);
      try {
        const response = await axios.post('/api/projects/generate-agent-name', {
          customRoleContent: customRoleContent
        });
        setAgentName(response.data.agentName || 'Etienne');
      } catch (error) {
        console.error('Failed to generate agent name:', error);
        setAgentName('Etienne');
      } finally {
        setAgentNameLoading(false);
      }
    } else if (roleType === 'registry' && selectedRoleId) {
      // Use the role name from the registry
      const role = availableRoles.find(r => r.id === selectedRoleId);
      setAgentName(role?.name || 'Etienne');
    } else {
      setAgentName('Etienne');
    }
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return !validateProjectName(projectName);
      case 1:
        return missionBrief.trim().length > 0;
      default:
        return true;
    }
  };

  const isLastStep = activeStep === WIZARD_STEPS.length - 1;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const dto = {
        projectName,
        missionBrief,
        agentRole: roleType === 'registry' && selectedRoleId
          ? { type: 'registry', roleId: selectedRoleId }
          : roleType === 'custom' && customRoleContent.trim()
            ? { type: 'custom', customContent: customRoleContent }
            : undefined,
        selectedSkills: selectedOptionalSkills,
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        a2aAgents: selectedAgents.length > 0 ? selectedAgents : undefined,
        copyUIFrom: copyFromProject || undefined,
        agentName: agentName || 'Etienne'
      };

      const response = await axios.post('/api/projects/create', dto);

      if (response.data.success) {
        onProjectCreated(projectName);
      } else {
        setError(response.data.errors?.[0] || 'Failed to create project');
      }
    } catch (error) {
      setError(error.response?.data?.message || error.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0: // Project Name
        const nameError = projectName ? validateProjectName(projectName) : null;
        return (
          <Box sx={{ mt: 2 }}>
            <TextField
              autoFocus
              fullWidth
              label="Project Name"
              value={projectName}
              onChange={(e) => {
                const value = e.target.value.toLowerCase();
                if (value === '' || /^[a-z0-9-]*$/.test(value)) {
                  setProjectName(value);
                }
              }}
              error={!!nameError}
              helperText={nameError || 'Only lowercase letters, numbers, and hyphens (max 30 characters)'}
            />
          </Box>
        );

      case 1: // Mission Brief
        return (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', mt: 2 }}>
            <Box sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1 }}>
              <Editor
                height="300px"
                defaultLanguage="markdown"
                value={missionBrief}
                onChange={(v) => setMissionBrief(v || '')}
                theme="light"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  lineNumbers: 'off',
                  scrollBeyondLastLine: false
                }}
              />
            </Box>
          </Box>
        );

      case 2: // Agent Role
        return (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', mt: 2 }}>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <RadioGroup
                row
                value={roleType}
                onChange={(e) => setRoleType(e.target.value)}
              >
                <FormControlLabel value="registry" control={<Radio />} label="Select from registry" />
                <FormControlLabel value="custom" control={<Radio />} label="Define custom role" />
              </RadioGroup>
            </FormControl>

            {roleType === 'registry' ? (
              <Box>
                {rolesLoading ? (
                  <CircularProgress size={24} />
                ) : (
                  <>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Agent Role</InputLabel>
                      <Select
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                        label="Agent Role"
                      >
                        <MenuItem value="">
                          <em>None (skip role selection)</em>
                        </MenuItem>
                        {availableRoles.map(role => (
                          <MenuItem key={role.id} value={role.id}>
                            {role.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {selectedRoleId && (
                      <Typography variant="body2" color="text.secondary">
                        {availableRoles.find(r => r.id === selectedRoleId)?.description}
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            ) : (
              <Box sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1 }}>
                <Editor
                  height="250px"
                  defaultLanguage="markdown"
                  value={customRoleContent}
                  onChange={(v) => setCustomRoleContent(v || '')}
                  theme="light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on'
                  }}
                />
              </Box>
            )}
          </Box>
        );

      case 3: // Skills
        return (
          <Box sx={{ mt: 2 }}>
            {skillsLoading ? (
              <CircularProgress size={24} />
            ) : (
              <SkillsSelector
                standardSkills={repositorySkills.standard}
                optionalSkills={repositorySkills.optional}
                selectedOptionalSkills={selectedOptionalSkills}
                onSelectionChange={setSelectedOptionalSkills}
              />
            )}
          </Box>
        );

      case 4: // MCP Tools
        return (
          <Box sx={{ mt: 2 }}>
            {mcpLoading ? (
              <CircularProgress size={24} />
            ) : (
              <McpToolsSelector
                registryServers={registryMcpServers}
                configuredServers={mcpServers}
                onServersChange={setMcpServers}
                isAdmin={hasRole('admin')}
              />
            )}
          </Box>
        );

      case 5: // External Agents
        return (
          <Box sx={{ mt: 2 }}>
            {agentsLoading ? (
              <CircularProgress size={24} />
            ) : (
              <A2AAgentsSelector
                registryAgents={registryAgents}
                selectedAgents={selectedAgents}
                onSelectionChange={setSelectedAgents}
              />
            )}
          </Box>
        );

      case 6: // Customize UI
        return (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Agent Name (displayed in the app bar):
              </Typography>
              <TextField
                fullWidth
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Enter agent name..."
                disabled={agentNameLoading}
                InputProps={{
                  endAdornment: agentNameLoading ? <CircularProgress size={20} /> : null
                }}
              />
            </Box>

            {projectsWithUI.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Copy additional UI settings from existing project (optional):
                </Typography>
                <FormControl fullWidth>
                  <InputLabel>Copy from</InputLabel>
                  <Select
                    value={copyFromProject}
                    onChange={(e) => setCopyFromProject(e.target.value)}
                    label="Copy from"
                  >
                    <MenuItem value="">
                      <em>None (use default)</em>
                    </MenuItem>
                    {projectsWithUI.map(proj => (
                      <MenuItem key={proj} value={proj}>
                        {proj}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Create New Project
        <Typography variant="body2" color="text.secondary">
          Step {activeStep + 1} of {WIZARD_STEPS.length}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {WIZARD_STEPS.map((step) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 4, minHeight: 450 }}>
          {/* Left: Image */}
          <Box sx={{ width: 400, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <img
              src={WIZARD_STEPS[activeStep].image}
              alt={WIZARD_STEPS[activeStep].label}
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: 450,
                objectFit: 'contain',
                borderRadius: 8
              }}
            />
          </Box>

          {/* Right: Benefit + Controls */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {WIZARD_STEPS[activeStep].benefitTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {WIZARD_STEPS[activeStep].benefitDescription}
            </Typography>

            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {renderStepContent(activeStep)}
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Box>
          <Button
            disabled={activeStep === 0 || creating}
            onClick={() => setActiveStep(s => s - 1)}
            sx={{ mr: 1 }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            disabled={!canProceed() || creating}
            onClick={async () => {
              if (isLastStep) {
                handleCreate();
              } else {
                const nextStep = activeStep + 1;
                // When entering step 7 (index 6), generate agent name
                if (nextStep === 6) {
                  await generateAgentNameForStep7();
                }
                setActiveStep(nextStep);
              }
            }}
          >
            {creating ? (
              <CircularProgress size={20} color="inherit" />
            ) : isLastStep ? (
              'Create'
            ) : (
              'Next'
            )}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
