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
import { apiAxios } from '../services/api';
import SkillsSelector from './SkillsSelector';
import McpToolsSelector from './McpToolsSelector';
import A2AAgentsSelector from './A2AAgentsSelector';
import AutoFilePreviewExtensions from './AutoFilePreviewExtensions';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const getWizardSteps = (t) => [
  {
    label: t('wizard.stepProjectName'),
    image: '/project-wizard-step-1.png',
    benefitTitle: t('wizard.benefitTitleStep1'),
    benefitDescription: t('wizard.benefitDescStep1')
  },
  {
    label: t('wizard.stepMissionBrief'),
    image: '/project-wizard-step-2.png',
    benefitTitle: t('wizard.benefitTitleStep2'),
    benefitDescription: t('wizard.benefitDescStep2')
  },
  {
    label: t('wizard.stepAgentRole'),
    image: '/project-wizard-step-3.png',
    benefitTitle: t('wizard.benefitTitleStep3'),
    benefitDescription: t('wizard.benefitDescStep3')
  },
  {
    label: t('wizard.stepSkills'),
    image: '/project-wizard-step-4.png',
    benefitTitle: t('wizard.benefitTitleStep4'),
    benefitDescription: t('wizard.benefitDescStep4')
  },
  {
    label: t('wizard.stepTools'),
    image: '/project-wizard-step-5.png',
    benefitTitle: t('wizard.benefitTitleStep5'),
    benefitDescription: t('wizard.benefitDescStep5')
  },
  {
    label: t('wizard.stepExternalAgents'),
    image: '/project-wizard-step-6.png',
    benefitTitle: t('wizard.benefitTitleStep6'),
    benefitDescription: t('wizard.benefitDescStep6')
  },
  {
    label: t('wizard.stepCustomizeUI'),
    image: '/project-wizard-step-7.png',
    benefitTitle: t('wizard.benefitTitleStep7'),
    benefitDescription: t('wizard.benefitDescStep7')
  }
];

export default function CreateProjectWizard({ open, onClose, onProjectCreated, existingProjects = [] }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { mode: themeMode } = useThemeMode();
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
  const [registeredPreviewers, setRegisteredPreviewers] = useState([]);
  const [autoFilePreviewExtensions, setAutoFilePreviewExtensions] = useState([]);

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      resetWizard();
      fetchAgentRoles();
      fetchRepositorySkills();
      fetchMcpRegistry();
      fetchA2ARegistry();
      fetchProjectsWithUI();
      fetchPreviewers();
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
    setAutoFilePreviewExtensions([]);
    setError(null);
  };

  const fetchAgentRoles = async () => {
    setRolesLoading(true);
    try {
      const response = await apiAxios.get('/api/agent-role-registry');
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
      const response = await apiAxios.get('/api/skills/repository/list?includeOptional=true');
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
      const response = await apiAxios.get('/api/mcp-registry');
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
      const response = await apiAxios.get('/api/a2a-settings/registry/local');
      setRegistryAgents(response.data.agents || []);
    } catch (error) {
      console.error('Failed to fetch A2A registry:', error);
    } finally {
      setAgentsLoading(false);
    }
  };

  const fetchPreviewers = async () => {
    try {
      const response = await apiAxios.get('/api/previewers/configuration');
      setRegisteredPreviewers(response.data.previewers || []);
    } catch (error) {
      console.error('Failed to fetch previewers:', error);
    }
  };

  const fetchProjectsWithUI = async () => {
    try {
      const response = await apiAxios.get('/api/projects/with-ui-config');
      setProjectsWithUI(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects with UI config:', error);
      setProjectsWithUI([]);
    }
  };

  const WIZARD_STEPS = getWizardSteps(t);

  const validateProjectName = (name) => {
    if (!name) return t('wizard.validationRequired');
    if (!/^[a-z0-9-]+$/.test(name)) return t('wizard.validationFormat');
    if (name.length > 30) return t('wizard.validationMaxLength');
    if (existingProjects.includes(name)) return t('wizard.validationDuplicate');
    return null;
  };

  // Generate agent name when entering step 7 (index 6)
  const generateAgentNameForStep7 = async () => {
    // If user has a custom role, generate name from it
    if (roleType === 'custom' && customRoleContent.trim()) {
      setAgentNameLoading(true);
      try {
        const response = await apiAxios.post('/api/projects/generate-agent-name', {
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
        agentName: agentName || 'Etienne',
        autoFilePreviewExtensions: autoFilePreviewExtensions.length > 0 ? autoFilePreviewExtensions : undefined
      };

      const response = await apiAxios.post('/api/projects/create', dto);

      if (response.data.success) {
        onProjectCreated(projectName, response.data.guidanceDocuments);
      } else {
        setError(response.data.errors?.[0] || t('wizard.errorCreateDefault'));
      }
    } catch (error) {
      setError(error.response?.data?.message || error.message || t('wizard.errorCreateDefault'));
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
              label={t('wizard.projectNameLabel')}
              value={projectName}
              onChange={(e) => {
                const value = e.target.value.toLowerCase();
                if (value === '' || /^[a-z0-9-]*$/.test(value)) {
                  setProjectName(value);
                }
              }}
              error={!!nameError}
              helperText={nameError || t('wizard.projectNameHelperText')}
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
                theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
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
                <FormControlLabel value="registry" control={<Radio />} label={t('wizard.roleSelectFromRegistry')} />
                <FormControlLabel value="custom" control={<Radio />} label={t('wizard.roleDefineCustom')} />
              </RadioGroup>
            </FormControl>

            {roleType === 'registry' ? (
              <Box>
                {rolesLoading ? (
                  <CircularProgress size={24} />
                ) : (
                  <>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>{t('wizard.roleLabel')}</InputLabel>
                      <Select
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                        label={t('wizard.roleLabel')}
                      >
                        <MenuItem value="">
                          <em>{t('wizard.roleNoneOption')}</em>
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
                  theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
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
                {t('wizard.agentNameDescription')}
              </Typography>
              <TextField
                fullWidth
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t('wizard.agentNamePlaceholder')}
                disabled={agentNameLoading}
                InputProps={{
                  endAdornment: agentNameLoading ? <CircularProgress size={20} /> : null
                }}
              />
            </Box>

            {projectsWithUI.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {t('wizard.copyUIDescription')}
                </Typography>
                <FormControl fullWidth>
                  <InputLabel>{t('wizard.copyFromLabel')}</InputLabel>
                  <Select
                    value={copyFromProject}
                    onChange={(e) => setCopyFromProject(e.target.value)}
                    label={t('wizard.copyFromLabel')}
                  >
                    <MenuItem value="">
                      <em>{t('wizard.copyFromNoneOption')}</em>
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

            <Box sx={{ mt: 3 }}>
              <AutoFilePreviewExtensions
                value={autoFilePreviewExtensions}
                onChange={setAutoFilePreviewExtensions}
                registeredPreviewers={registeredPreviewers}
              />
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('wizard.dialogTitle')}
        <Typography variant="body2" color="text.secondary">
          {t('wizard.stepIndicator', { current: activeStep + 1, total: WIZARD_STEPS.length })}
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
          {t('common.cancel')}
        </Button>
        <Box>
          <Button
            disabled={activeStep === 0 || creating}
            onClick={() => setActiveStep(s => s - 1)}
            sx={{ mr: 1 }}
          >
            {t('common.back')}
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
              t('common.create')
            ) : (
              t('common.next')
            )}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
