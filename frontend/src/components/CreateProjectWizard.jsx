import React, { useState, useEffect, useMemo } from 'react';
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
  Checkbox,
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
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const getAllWizardSteps = (t) => [
  {
    id: 'projectName',
    label: t('wizard.stepProjectName'),
    image: '/project-wizard-step-1.png',
    benefitTitle: t('wizard.benefitTitleStep1'),
    benefitDescription: t('wizard.benefitDescStep1')
  },
  {
    id: 'missionBrief',
    label: t('wizard.stepMissionBrief'),
    image: '/project-wizard-step-2.png',
    benefitTitle: t('wizard.benefitTitleStep2'),
    benefitDescription: t('wizard.benefitDescStep2')
  },
  {
    id: 'agentRole',
    label: t('wizard.stepAgentRole'),
    image: '/project-wizard-step-3.png',
    benefitTitle: t('wizard.benefitTitleStep3'),
    benefitDescription: t('wizard.benefitDescStep3')
  },
  {
    id: 'skills',
    label: t('wizard.stepSkills'),
    image: '/project-wizard-step-4.png',
    benefitTitle: t('wizard.benefitTitleStep4'),
    benefitDescription: t('wizard.benefitDescStep4')
  },
  {
    id: 'tools',
    label: t('wizard.stepTools'),
    image: '/project-wizard-step-5.png',
    benefitTitle: t('wizard.benefitTitleStep5'),
    benefitDescription: t('wizard.benefitDescStep5')
  },
  {
    id: 'externalAgents',
    label: t('wizard.stepExternalAgents'),
    image: '/project-wizard-step-6.png',
    benefitTitle: t('wizard.benefitTitleStep6'),
    benefitDescription: t('wizard.benefitDescStep6')
  },
  {
    id: 'customizeUI',
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

  // Step 1: Feature toggles (checkboxes)
  const [useSpecializedRole, setUseSpecializedRole] = useState(false);
  const [connectDataSources, setConnectDataSources] = useState(false);
  const [useExternalAgents, setUseExternalAgents] = useState(false);

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
    setUseSpecializedRole(false);
    setConnectDataSources(false);
    setUseExternalAgents(false);
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
      const servers = response.data.servers || [];
      setRegistryMcpServers(servers);

      // Auto-add standard MCP servers (user cannot remove these)
      const standardServers = {};
      servers.filter(s => s.isStandard).forEach(s => {
        standardServers[s.name] = {
          type: s.transport,
          url: s.url,
          ...(s.headers && { headers: s.headers }),
        };
      });
      if (Object.keys(standardServers).length > 0) {
        setMcpServers(prev => ({ ...standardServers, ...prev }));
      }
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

  const fetchProjectsWithUI = async () => {
    try {
      const response = await apiAxios.get('/api/projects/with-ui-config');
      setProjectsWithUI(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects with UI config:', error);
      setProjectsWithUI([]);
    }
  };

  const ALL_STEPS = useMemo(() => getAllWizardSteps(t), [t]);

  const visibleSteps = useMemo(() => {
    return ALL_STEPS.filter(step => {
      if (step.id === 'agentRole' && !useSpecializedRole) return false;
      if (step.id === 'tools' && !connectDataSources) return false;
      if (step.id === 'externalAgents' && !useExternalAgents) return false;
      return true;
    });
  }, [ALL_STEPS, useSpecializedRole, connectDataSources, useExternalAgents]);

  // Clamp activeStep when visible steps shrink (e.g. user unchecks a checkbox)
  useEffect(() => {
    if (activeStep >= visibleSteps.length) {
      setActiveStep(visibleSteps.length - 1);
    }
  }, [visibleSteps.length]);

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
    const currentStepId = visibleSteps[activeStep]?.id;
    switch (currentStepId) {
      case 'projectName':
        return !validateProjectName(projectName);
      case 'missionBrief':
        return missionBrief.trim().length > 0;
      default:
        return true;
    }
  };

  const isLastStep = activeStep === visibleSteps.length - 1;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const dto = {
        projectName,
        missionBrief,
        agentRole: !useSpecializedRole
          ? { type: 'registry', roleId: 'general-assistant' }
          : roleType === 'registry' && selectedRoleId
            ? { type: 'registry', roleId: selectedRoleId }
            : roleType === 'custom' && customRoleContent.trim()
              ? { type: 'custom', customContent: customRoleContent }
              : { type: 'registry', roleId: 'general-assistant' },
        selectedSkills: selectedOptionalSkills,
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        a2aAgents: useExternalAgents && selectedAgents.length > 0 ? selectedAgents : undefined,
        copyUIFrom: copyFromProject || undefined,
        agentName: agentName || 'Etienne',
        language: i18n.language,
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

  const renderStepContent = (stepId) => {
    switch (stepId) {
      case 'projectName': {
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
            <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useSpecializedRole}
                    onChange={(e) => setUseSpecializedRole(e.target.checked)}
                  />
                }
                label={t('wizard.checkboxSpecializedRole')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={connectDataSources}
                    onChange={(e) => setConnectDataSources(e.target.checked)}
                  />
                }
                label={t('wizard.checkboxConnectDataSources')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useExternalAgents}
                    onChange={(e) => setUseExternalAgents(e.target.checked)}
                  />
                }
                label={t('wizard.checkboxExternalAgents')}
              />
            </Box>
          </Box>
        );
      }

      case 'missionBrief':
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

      case 'agentRole':
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

      case 'skills':
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

      case 'tools':
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

      case 'externalAgents':
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

      case 'customizeUI':
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
          {t('wizard.stepIndicator', { current: activeStep + 1, total: visibleSteps.length })}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {visibleSteps.map((step) => (
            <Step key={step.id}>
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
              src={visibleSteps[activeStep].image}
              alt={visibleSteps[activeStep].label}
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
              {visibleSteps[activeStep].benefitTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {visibleSteps[activeStep].benefitDescription}
            </Typography>

            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {renderStepContent(visibleSteps[activeStep].id)}
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
                // When entering the Customize UI step, generate agent name
                if (visibleSteps[nextStep]?.id === 'customizeUI') {
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
