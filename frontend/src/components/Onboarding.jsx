import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Link
} from '@mui/material';
import { GoArrowRight } from 'react-icons/go';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

// Configure marked to convert line breaks to <br>
marked.setOptions({
  breaks: true
});

const getSteps = (t) => [
  {
    name: t('onboarding.step1Name'),
    image: '/etienne-waving-color.png',
    explanation: t('onboarding.step1Explanation'),
    nextStepName: t('onboarding.step1Next')
  },
  {
    name: t('onboarding.step2Name'),
    image: '/claude-needs-charging-color.png',
    explanation: t('onboarding.step2Explanation'),
    nextStepName: t('onboarding.step2Next')
  },
  {
    name: t('onboarding.step3Name'),
    image: '/claude-is-charged-color.png',
    explanation: t('onboarding.step3Explanation'),
    nextStepName: t('onboarding.step3Next')
  },
  {
    name: t('onboarding.step4Name'),
    image: '/claude-is-walking-color.png',
    explanation: t('onboarding.step4Explanation'),
    nextStepName: t('onboarding.step4Next')
  }
];

const getServiceDefinitions = (t) => [
  { id: 'rdf-store', name: t('onboarding.serviceKnowledgeGraph'), port: 7000, description: t('onboarding.serviceKnowledgeGraphDesc') },
  { id: 'vector-store', name: t('onboarding.serviceVectorStore'), port: 7100, description: t('onboarding.serviceVectorStoreDesc') },
  { id: 'a2a-server', name: t('onboarding.serviceA2ARegistry'), port: 5600, description: t('onboarding.serviceA2ARegistryDesc') },
  { id: 'webserver', name: t('onboarding.serviceWebServer'), port: 4000, description: t('onboarding.serviceWebServerDesc') }
];

export default function Onboarding({ onComplete }) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [workspacePath, setWorkspacePath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedServices, setSelectedServices] = useState({
    'rdf-store': true,
    'vector-store': true,
    'a2a-server': true,
    'webserver': true
  });
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceErrors, setServiceErrors] = useState({});
  const [serviceStatuses, setServiceStatuses] = useState({});

  const STEPS = getSteps(t);
  const SERVICE_DEFINITIONS = getServiceDefinitions(t);
  const step = STEPS[currentStep];

  const isNextEnabled = () => {
    switch (currentStep) {
      case 0:
        return workspacePath.length > 3;
      case 1:
        return apiKey.length > 10;
      case 2:
        return true; // Services can all be disabled
      case 3:
        return /^[a-z0-9-]+$/.test(projectName) && projectName.length > 0;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    setError('');
    setIsLoading(true);

    try {
      switch (currentStep) {
        case 0:
          // Just proceed to next step, workspace path will be saved with API key
          setCurrentStep(1);
          break;

        case 1:
          // Save configuration and validate API key
          const saveResponse = await apiFetch('/api/configuration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              WORKSPACE_ROOT: workspacePath,
              ANTHROPIC_API_KEY: apiKey
            })
          });

          if (!saveResponse.ok) {
            throw new Error(t('onboarding.failedToSaveConfig'));
          }

          // Validate the API key
          const healthResponse = await apiFetch('/api/claude/health/model');
          const healthData = await healthResponse.json();

          if (!healthData.healthy) {
            throw new Error(healthData.reason || t('onboarding.apiKeyValidationFailed'));
          }

          setCurrentStep(2);
          break;

        case 2:
          // Start selected services in parallel
          const servicesToStart = Object.entries(selectedServices)
            .filter(([_, enabled]) => enabled)
            .map(([id]) => id);

          // Start all services simultaneously (don't wait for each one)
          const startPromises = servicesToStart.map(serviceId =>
            apiFetch(`/api/process-manager/${serviceId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start' })
            }).then(res => res.json()).catch(err => ({ success: false, message: err.message }))
          );

          await Promise.all(startPromises);

          // Now poll for all services to be ready (up to 120 seconds)
          const maxWaitTime = 120000; // 120 seconds
          const pollInterval = 2000;  // Check every 2 seconds
          const startTime = Date.now();
          let allRunning = false;
          let finalStatuses = {};
          let finalErrors = {};

          // Helper function to check all service statuses
          const checkAllStatuses = async () => {
            const statusPromises = servicesToStart.map(async (serviceId) => {
              try {
                const statusResponse = await apiFetch(`/api/process-manager/${serviceId}`);
                const statusData = await statusResponse.json();
                return { serviceId, status: statusData.status, error: null };
              } catch (err) {
                return { serviceId, status: 'error', error: err.message };
              }
            });

            const statusResults = await Promise.all(statusPromises);

            finalStatuses = {};
            finalErrors = {};

            for (const result of statusResults) {
              finalStatuses[result.serviceId] = result.status;
              if (result.error) {
                finalErrors[result.serviceId] = result.error;
              }
            }

            setServiceStatuses({ ...finalStatuses });

            // Check if all selected services are running
            return servicesToStart.every(id => finalStatuses[id] === 'running');
          };

          // Check immediately first (services might already be running)
          allRunning = await checkAllStatuses();

          // Then poll until timeout or all running
          while (Date.now() - startTime < maxWaitTime && !allRunning) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            allRunning = await checkAllStatuses();
          }

          // Timeout reached or all running
          if (!allRunning) {
            // Mark services that aren't running as errors
            for (const serviceId of servicesToStart) {
              if (finalStatuses[serviceId] !== 'running') {
                const service = SERVICE_DEFINITIONS.find(s => s.id === serviceId);
                finalErrors[serviceId] = t('onboarding.serviceFailedToStart', { port: service?.port });
              }
            }
          }

          setServiceErrors(finalErrors);

          // Check if all selected services started successfully
          const hasErrors = Object.keys(finalErrors).length > 0;
          if (!hasErrors) {
            setCurrentStep(3);
          } else {
            setError(t('onboarding.someServicesFailed'));
          }
          break;

        case 3:
          // Create project
          const createResponse = await apiFetch('/api/claude/addFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_dir: projectName,
              file_name: 'CLAUDE.md',
              file_content: `# ${projectName}\n\nThis is your project workspace.`
            })
          });

          if (!createResponse.ok) {
            throw new Error(t('onboarding.failedToCreateProject'));
          }

          // Set as current project in localStorage
          localStorage.setItem('currentProject', projectName);

          // Complete onboarding
          if (onComplete) {
            onComplete(projectName);
          }
          break;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
    // Clear any error for this service when toggling
    setServiceErrors(prev => {
      const next = { ...prev };
      delete next[serviceId];
      return next;
    });
  };

  const renderStepActions = () => {
    switch (currentStep) {
      case 0:
        return (
          <Box sx={{ width: '100%' }}>
            <TextField
              fullWidth
              label={t('onboarding.workspacePathLabel')}
              placeholder={t('onboarding.workspacePathPlaceholder')}
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              variant="outlined"
              sx={{ mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {t('onboarding.workspacePathHint')}
            </Typography>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ width: '100%' }}>
            <TextField
              fullWidth
              label={t('onboarding.apiKeyLabel')}
              placeholder={t('onboarding.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              variant="outlined"
              type="password"
              sx={{ mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {t('onboarding.apiKeyHint')}{' '}
              <Link href="https://console.anthropic.com" target="_blank" rel="noopener">
                {t('onboarding.apiKeyLinkText')}
              </Link>
            </Typography>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ width: '100%' }}>
            {SERVICE_DEFINITIONS.map((service) => (
              <Box key={service.id} sx={{ mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedServices[service.id]}
                      onChange={() => handleServiceToggle(service.id)}
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" fontWeight="medium">
                        {service.name} <small>(:{service.port})</small>
                        {serviceStatuses[service.id] === 'running' && (
                          <Typography component="span" sx={{ ml: 1, color: 'success.main', fontSize: '0.875rem' }}>
                            {t('onboarding.serviceRunning')}
                          </Typography>
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {service.description}
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', mb: 0.5 }}
                />
                {serviceErrors[service.id] && (
                  <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>
                    {serviceErrors[service.id]}
                  </Alert>
                )}
              </Box>
            ))}
          </Box>
        );

      case 3:
        return (
          <Box sx={{ width: '100%' }}>
            <TextField
              fullWidth
              label={t('onboarding.projectNameLabel')}
              placeholder={t('onboarding.projectNamePlaceholder')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              variant="outlined"
              sx={{ mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {t('onboarding.projectNameHint')}
            </Typography>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999
      }}
    >
      {/* Header - Step Name */}
      <Box
        sx={{
          backgroundColor: '#efefef',
          py: 3,
          textAlign: 'center'
        }}
      >
        <Typography
          variant="h4"
          sx={{
            color: '#ff9800',
            fontWeight: 500
          }}
        >
          {step.name}
        </Typography>
      </Box>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden'
        }}
      >
        {/* Left Side - Step Image */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            p: 4,
            pb: 2
          }}
        >
          <img
            key={currentStep}
            src={step.image}
            alt={step.name}
            style={{
              maxWidth: (currentStep === 1 || currentStep === 2) ? '600px' : '300px',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        </Box>

        {/* Right Side - Explanation + Step Actions */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            p: 4
          }}
        >
          {/* Etienne's Explanation */}
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <Typography
              variant="body1"
              color="text.secondary"
              component="div"
              dangerouslySetInnerHTML={{ __html: marked.parse(step.explanation) }}
              sx={{
                fontFamily: '"Oxanium", sans-serif',
                fontSize: '1.1rem',
                lineHeight: 1.6,
                '& p': { mb: 1 },
                '& p:last-child': { mb: 0 }
              }}
            />
          </Box>

          {/* Step Actions */}
          {renderStepActions()}
        </Box>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          borderTop: '1px solid #e0e0e0',
          minHeight: 100
        }}
      >
        {/* Left Side - Empty for balance */}
        <Box
          sx={{
            flex: 1,
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafafa'
          }}
        />

        {/* Right Side - Next Button */}
        <Box
          sx={{
            flex: 1,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
              {error}
            </Alert>
          )}

          {currentStep === 2 && Object.keys(serviceErrors).length > 0 && (
            <Button
              variant="text"
              onClick={() => setCurrentStep(3)}
              sx={{ mb: 1 }}
            >
              {t('onboarding.skipAndContinue')}
            </Button>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={handleNext}
            disabled={!isNextEnabled() || isLoading}
            endIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <GoArrowRight />}
            sx={{
              px: 4,
              py: 1.5,
              backgroundColor: '#ff9800',
              '&:hover': {
                backgroundColor: '#f57c00'
              }
            }}
          >
            {step.nextStepName}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
