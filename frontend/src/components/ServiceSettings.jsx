import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, IconButton, Button, TextField,
  Accordion, AccordionSummary, AccordionDetails,
  CircularProgress, Alert
} from '@mui/material';
import { Close } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const SETTINGS_GROUPS = (t) => [
  {
    key: 'codingAgent',
    label: t('serviceSettings.sectionCodingAgent'),
    fields: [
      { key: 'CODING_AGENT', label: t('serviceSettings.codingAgentLabel'), type: 'select', options: ['anthropic', 'openai', 'openai-agents'], helperText: t('serviceSettings.codingAgentHelperText') },
    ]
  },
  {
    key: 'apiKeys',
    label: t('serviceSettings.sectionApiKeys'),
    fields: [
      { key: 'ANTHROPIC_API_KEY', label: t('serviceSettings.anthropicApiKeyLabel'), type: 'password', helperText: t('serviceSettings.anthropicApiKeyHelperText') },
      { key: 'OPENAI_API_KEY', label: t('serviceSettings.openaiApiKeyLabel'), type: 'password', helperText: t('serviceSettings.openaiApiKeyHelperText') },
    ]
  },
  {
    key: 'models',
    label: t('serviceSettings.sectionModels'),
    fields: [
      { key: 'ANTHROPIC_MODELS', label: t('serviceSettings.anthropicModelsLabel'), type: 'text', helperText: t('serviceSettings.anthropicModelsHelperText') },
      { key: 'OPENAI_MODELS', label: t('serviceSettings.openaiModelsLabel'), type: 'text', helperText: t('serviceSettings.openaiModelsHelperText') },
    ]
  },
  {
    key: 'openaiAgents',
    label: t('serviceSettings.sectionOpenAIAgents'),
    fields: [
      { key: 'OPENAI_AGENTS_MODEL', label: t('serviceSettings.openaiAgentsModelLabel'), type: 'text', helperText: t('serviceSettings.openaiAgentsModelHelperText') },
      { key: 'OPENAI_AGENTS_ENABLE_CODEX_TOOL', label: t('serviceSettings.openaiAgentsEnableCodexLabel'), type: 'select', options: ['false', 'true'], helperText: '' },
      { key: 'OPENAI_AGENTS_PERMISSION_TIMEOUT_MS', label: t('serviceSettings.openaiAgentsPermissionTimeoutLabel'), type: 'number', helperText: '' },
    ]
  },
  {
    key: 'observability',
    label: t('serviceSettings.sectionObservability'),
    fields: [
      { key: 'OTEL_ENABLED', label: t('serviceSettings.otelEnabledLabel'), type: 'select', options: ['true', 'false'], helperText: t('serviceSettings.otelEnabledHelperText') },
      { key: 'PHOENIX_COLLECTOR_ENDPOINT', label: t('serviceSettings.phoenixEndpointLabel'), type: 'text', helperText: t('serviceSettings.phoenixEndpointHelperText') },
      { key: 'OTEL_SERVICE_NAME', label: t('serviceSettings.otelServiceNameLabel'), type: 'text', helperText: t('serviceSettings.otelServiceNameHelperText') },
    ]
  },
  {
    key: 'memory',
    label: t('serviceSettings.sectionMemory'),
    fields: [
      { key: 'MEMORY_MANAGEMENT_URL', label: t('serviceSettings.memoryManagementUrlLabel'), type: 'text', helperText: '' },
      { key: 'MEMORY_DECAY_DAYS', label: t('serviceSettings.memoryDecayDaysLabel'), type: 'number', helperText: t('serviceSettings.memoryDecayDaysHelperText') },
    ]
  },
  {
    key: 'workspace',
    label: t('serviceSettings.sectionWorkspace'),
    fields: [
      { key: 'WORKSPACE_ROOT', label: t('serviceSettings.workspaceRootLabel'), type: 'text', helperText: t('serviceSettings.workspaceRootHelperText') },
      { key: 'FORCE_PROJECT_SCOPE', label: t('serviceSettings.forceProjectScopeLabel'), type: 'select', options: ['true', 'false'], helperText: t('serviceSettings.forceProjectScopeHelperText') },
    ]
  },
  {
    key: 'budget',
    label: t('serviceSettings.sectionBudget'),
    fields: [
      { key: 'COSTS_CURRENCY_UNIT', label: t('serviceSettings.currencyUnitLabel'), type: 'text', helperText: '' },
      { key: 'COSTS_PER_MIO_INPUT_TOKENS', label: t('serviceSettings.costPerMioInputLabel'), type: 'number', helperText: '' },
      { key: 'COSTS_PER_MIO_OUTPUT_TOKENS', label: t('serviceSettings.costPerMioOutputLabel'), type: 'number', helperText: '' },
    ]
  },
  {
    key: 'mcpTools',
    label: t('serviceSettings.sectionMcpTools'),
    fields: [
      { key: 'DIFFBOT_TOKEN', label: t('serviceSettings.diffbotTokenLabel'), type: 'password', helperText: t('serviceSettings.diffbotTokenHelperText') },
      { key: 'VAPI_TOKEN', label: t('serviceSettings.vapiTokenLabel'), type: 'password', helperText: t('serviceSettings.vapiTokenHelperText') },
    ]
  },
  {
    key: 'checkpointing',
    label: t('serviceSettings.sectionCheckpointing'),
    fields: [
      { key: 'CHECKPOINT_PROVIDER', label: t('serviceSettings.checkpointProviderLabel'), type: 'text', helperText: '' },
      { key: 'GITEA_URL', label: t('serviceSettings.giteaUrlLabel'), type: 'text', helperText: '' },
      { key: 'GITEA_USERNAME', label: t('serviceSettings.giteaUsernameLabel'), type: 'text', helperText: '' },
      { key: 'GITEA_PASSWORD', label: t('serviceSettings.giteaPasswordLabel'), type: 'password', helperText: '' },
      { key: 'GITEA_REPO', label: t('serviceSettings.giteaRepoLabel'), type: 'text', helperText: '' },
    ]
  },
  {
    key: 'email',
    label: t('serviceSettings.sectionEmail'),
    fields: [
      { key: 'SMTP_CONNECTION', label: t('serviceSettings.smtpConnectionLabel'), type: 'text', helperText: t('serviceSettings.smtpConnectionHelperText') },
      { key: 'IMAP_CONNECTION', label: t('serviceSettings.imapConnectionLabel'), type: 'text', helperText: t('serviceSettings.imapConnectionHelperText') },
      { key: 'SMTP_WHITELIST', label: t('serviceSettings.smtpWhitelistLabel'), type: 'text', helperText: t('serviceSettings.smtpWhitelistHelperText') },
    ]
  },
  {
    key: 'agentBus',
    label: t('serviceSettings.sectionAgentBus'),
    fields: [
      { key: 'AGENT_BUS_LOG_CMS', label: t('serviceSettings.agentBusLogCmsLabel'), type: 'text', helperText: t('serviceSettings.agentBusLogHelperText') },
      { key: 'AGENT_BUS_LOG_DSS', label: t('serviceSettings.agentBusLogDssLabel'), type: 'text', helperText: '' },
      { key: 'AGENT_BUS_LOG_SWE', label: t('serviceSettings.agentBusLogSweLabel'), type: 'text', helperText: '' },
    ]
  },
  {
    key: 'previewers',
    label: t('serviceSettings.sectionPreviewers'),
    fields: [
      { key: 'REGISTERED_PREVIEWERS', label: t('serviceSettings.registeredPreviewersLabel'), type: 'multiline', helperText: t('serviceSettings.registeredPreviewersHelperText') },
    ]
  },
  {
    key: 'secrets',
    label: t('serviceSettings.sectionSecrets'),
    fields: [
      { key: 'SECRET_VAULT_PROVIDER', label: t('serviceSettings.secretVaultProviderLabel'), type: 'select', options: ['openbao', 'azure-keyvault', 'aws', 'env'], helperText: t('serviceSettings.secretVaultProviderHelperText') },
      { key: 'OPENBAO_ADDR', label: t('serviceSettings.openbaoAddrLabel'), type: 'text', helperText: '' },
      { key: 'OPENBAO_DEV_ROOT_TOKEN', label: t('serviceSettings.openbaoTokenLabel'), type: 'password', helperText: '' },
      { key: 'AZURE_TENANT_ID', label: t('serviceSettings.azureTenantIdLabel'), type: 'text', helperText: '' },
      { key: 'AZURE_CLIENT_ID', label: t('serviceSettings.azureClientIdLabel'), type: 'text', helperText: '' },
      { key: 'AZURE_CLIENT_SECRET', label: t('serviceSettings.azureClientSecretLabel'), type: 'password', helperText: '' },
      { key: 'AZURE_VAULT_URL', label: t('serviceSettings.azureVaultUrlLabel'), type: 'text', helperText: '' },
      { key: 'AWS_REGION', label: t('serviceSettings.awsRegionLabel'), type: 'text', helperText: '' },
      { key: 'AWS_ACCESS_KEY_ID', label: t('serviceSettings.awsAccessKeyIdLabel'), type: 'text', helperText: '' },
      { key: 'AWS_SECRET_ACCESS_KEY', label: t('serviceSettings.awsSecretAccessKeyLabel'), type: 'password', helperText: '' },
      { key: 'AWS_SECRETS_PREFIX', label: t('serviceSettings.awsSecretsPrefixLabel'), type: 'text', helperText: t('serviceSettings.awsSecretsPrefixHelperText') },
    ]
  },
];

export default function ServiceSettings({ open, onClose, service, serviceStatus, serviceIcon: ServiceIcon, allowedVars }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isCloudVault, setIsCloudVault] = useState(false);
  const [vaultProvider, setVaultProvider] = useState('');

  const isRunning = serviceStatus?.status === 'running';

  useEffect(() => {
    if (open && service) {
      loadConfig();
    }
    if (!open) {
      setError(null);
      setSuccess(null);
    }
  }, [open, service]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [configRes, vaultRes] = await Promise.all([
        apiFetch('/api/configuration'),
        apiFetch('/api/configuration/vault-info'),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
      } else if (configRes.status === 404) {
        setConfig({});
      } else {
        throw new Error(t('serviceSettings.errorLoad'));
      }

      const vaultData = await vaultRes.json();
      setIsCloudVault(vaultData.isCloudVault || false);
      setVaultProvider(vaultData.provider || '');
    } catch (err) {
      setError(t('serviceSettings.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key) => (event) => {
    setConfig(prev => ({ ...prev, [key]: event.target.value }));
    setSuccess(null);
  };

  const pollServiceStatus = (serviceName, expectedStatus, maxAttempts = 5) => {
    return new Promise((resolve) => {
      let attempts = 0;
      const poll = async () => {
        try {
          const res = await apiFetch(`/api/process-manager/${serviceName}`);
          const data = await res.json();
          if (data.status === expectedStatus) {
            resolve(true);
            return;
          }
        } catch { /* ignore */ }
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          resolve(false);
        }
      };
      setTimeout(poll, 2000);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch('/api/configuration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(t('serviceSettings.errorSave'));
      }

      if (isRunning && service) {
        // Stop the service
        const stopRes = await apiFetch(`/api/process-manager/${service.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        });
        if (!stopRes.ok) {
          throw new Error(t('serviceSettings.errorRestart', { serviceName: service.displayName }));
        }

        const stopped = await pollServiceStatus(service.name, 'stopped');
        if (!stopped) {
          throw new Error(t('serviceSettings.errorRestart', { serviceName: service.displayName }));
        }

        // Start the service
        const startRes = await apiFetch(`/api/process-manager/${service.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        });
        if (!startRes.ok) {
          throw new Error(t('serviceSettings.errorRestart', { serviceName: service.displayName }));
        }

        const started = await pollServiceStatus(service.name, 'running');
        if (!started) {
          throw new Error(t('serviceSettings.errorRestart', { serviceName: service.displayName }));
        }

        setSuccess(t('serviceSettings.restartSuccess', { serviceName: service.displayName }));
      } else {
        setSuccess(t('serviceSettings.saveSuccess'));
      }
    } catch (err) {
      setError(err.message || t('serviceSettings.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field) => {
    if (isCloudVault && (field.key === 'ANTHROPIC_API_KEY' || field.key === 'OPENAI_API_KEY')) {
      return (
        <Alert severity="info" sx={{ mb: 2 }} key={field.key}>
          {t('serviceSettings.cloudVaultActive', { provider: vaultProvider })}
        </Alert>
      );
    }

    if (field.type === 'select') {
      return (
        <TextField
          key={field.key}
          fullWidth
          label={field.label}
          value={config[field.key] || ''}
          onChange={handleChange(field.key)}
          size="small"
          select
          SelectProps={{ native: true }}
          sx={{ mb: 2 }}
          helperText={field.helperText || undefined}
        >
          <option value=""></option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </TextField>
      );
    }

    if (field.type === 'multiline') {
      return (
        <TextField
          key={field.key}
          fullWidth
          label={field.label}
          value={config[field.key] || ''}
          onChange={handleChange(field.key)}
          size="small"
          multiline
          rows={3}
          sx={{ mb: 2 }}
          helperText={field.helperText || undefined}
        />
      );
    }

    return (
      <TextField
        key={field.key}
        fullWidth
        label={field.label}
        value={config[field.key] || ''}
        onChange={handleChange(field.key)}
        size="small"
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        sx={{ mb: 2 }}
        helperText={field.helperText || undefined}
      />
    );
  };

  if (!service) return null;

  const allGroups = SETTINGS_GROUPS(t);

  // Filter groups to only show fields relevant to this service.
  const groups = allowedVars
    ? allGroups
        .map(group => ({
          ...group,
          fields: group.fields.filter(f => allowedVars.includes(f.key)),
        }))
        .filter(group => group.fields.length > 0)
    : allGroups;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {ServiceIcon && <ServiceIcon size={28} />}
          <span>{service.displayName} — {t('serviceSettings.dialogTitle')}</span>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('serviceSettings.description')}
            </Alert>

            <Typography variant="body2" sx={{ mb: 3, fontStyle: 'italic', color: 'text.secondary' }}>
              {service.description}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
                {success}
              </Alert>
            )}

            {groups.map((group) => (
              <Accordion
                key={group.key}
                defaultExpanded={false}
                elevation={0}
                sx={{ '&:before': { display: 'none' }, backgroundColor: 'transparent' }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography sx={{ fontWeight: 500 }}>{group.label}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  {group.fields.map(renderField)}
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || saving}
          startIcon={saving ? <CircularProgress size={18} /> : undefined}
        >
          {saving
            ? t('serviceSettings.applyAndRestartProgress')
            : isRunning
              ? t('serviceSettings.applyAndRestart')
              : t('common.save')
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}
