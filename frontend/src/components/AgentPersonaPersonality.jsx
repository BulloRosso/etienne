import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, TextField,
  FormControl, InputLabel, Select, MenuItem,
  RadioGroup, FormControlLabel, Radio, FormLabel,
  CircularProgress, Alert, Tabs, Tab, InputAdornment
} from '@mui/material';
import { Close, UploadFile } from '@mui/icons-material';
import { RiSpeakLine } from 'react-icons/ri';
import { MdOutlineNotificationsOff, MdDoNotDisturbAlt, MdOutlineTipsAndUpdates } from 'react-icons/md';
import { PiTelegramLogoDuotone, PiMicrosoftTeamsLogoLight } from 'react-icons/pi';
import { AiOutlineMail } from 'react-icons/ai';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

const EMPTY_PERSONALITY = {
  personaType: '',
  name: '',
  avatarDescription: '',
  allowReviewNotificationsBetween: '',
  communicationStyle: '',
  contactChannels: {
    email: '',
    teamsAccount: '',
    telegramHandle: '',
    preferredChannel: 'email',
  },
  avoidAtAllCosts: '',
};

export default function AgentPersonaPersonality({ open, onClose, onInstalled }) {
  const { t } = useTranslation();
  const [personaTypes, setPersonaTypes] = useState([]);
  const [personality, setPersonality] = useState({ ...EMPTY_PERSONALITY });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open) {
      setPersonality({ ...EMPTY_PERSONALITY, contactChannels: { ...EMPTY_PERSONALITY.contactChannels } });
      setAvatarPreview(null);
      setError(null);
      setGenerating(false);
      setInstalling(false);
      setActiveTab(0);
      fetchPersonaTypes();
    }
  }, [open]);

  const fetchPersonaTypes = async () => {
    try {
      const response = await apiAxios.get('/api/persona-manager/persona-types');
      setPersonaTypes(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load persona types');
    }
  };

  const updateField = (field, value) => {
    setPersonality(prev => ({ ...prev, [field]: value }));
  };

  const updateContactChannel = (field, value) => {
    setPersonality(prev => ({
      ...prev,
      contactChannels: { ...prev.contactChannels, [field]: value },
    }));
  };

  const handleGenerateAvatar = async () => {
    if (!personality.avatarDescription?.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await apiAxios.post('/api/persona-manager/generate-avatar', {
        avatarDescription: personality.avatarDescription,
      });
      setAvatarPreview(response.data.image);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate avatar');
    } finally {
      setGenerating(false);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      const selectedType = personaTypes.find(p => p.name === personality.personaType);
      const zipFilename = selectedType?.zipFilename || `${personality.personaType}.zip`;

      const response = await apiAxios.post('/api/persona-manager/install', {
        personality,
        zipFilename,
      });

      if (response.data.success) {
        onInstalled(response.data.projectName);
      } else {
        setError('Installation failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to install persona');
    } finally {
      setInstalling(false);
    }
  };

  const handleUploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setError(t('agentPersona.uploadPngOnly'));
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      setAvatarPreview(base64);
      try {
        await apiAxios.post('/api/persona-manager/upload-avatar', { image: base64 });
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to save uploaded avatar');
      }
    };
    reader.readAsDataURL(file);
  };

  const isValid = personality.name.length >= 3 && personality.name.length <= 35 && personality.personaType;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">{t('agentPersona.title')}</Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mx: 3, mt: 1, mb: '10px', p: '14px', bgcolor: '#fffde7', borderRadius: 1 }}>
        <MdOutlineTipsAndUpdates color="#1976d2" size={20} />
        <Typography variant="body2" color="text.secondary">
          {t('agentPersona.description')}
        </Typography>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}
      >
        <Tab label={t('agentPersona.tabIdentity')} />
        <Tab label={t('agentPersona.tabPreferences')} />
      </Tabs>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2, minHeight: 450 }}>
        {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>{error}</Alert>}

        {/* Tab 1: Identity */}
        {activeTab === 0 && (
          <>
            {/* Persona Type */}
            <FormControl fullWidth size="small">
              <InputLabel>{t('agentPersona.personaType')}</InputLabel>
              <Select
                value={personality.personaType}
                label={t('agentPersona.personaType')}
                onChange={(e) => updateField('personaType', e.target.value)}
              >
                {personaTypes.map((pt) => (
                  <MenuItem key={pt.name} value={pt.name}>
                    {pt.name}{pt.description ? ` — ${pt.description}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Name */}
            <TextField
              label={t('agentPersona.name')}
              helperText={t('agentPersona.nameHelper')}
              value={personality.name}
              onChange={(e) => updateField('name', e.target.value)}
              inputProps={{ minLength: 3, maxLength: 35 }}
              size="small"
              fullWidth
              error={personality.name.length > 0 && (personality.name.length < 3 || personality.name.length > 35)}
            />

            {/* Avatar Section */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              {/* Avatar Preview */}
              <Box sx={{
                width: 350, minWidth: 350, height: 350,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'grey.100', borderRadius: 2, overflow: 'hidden',
                border: '1px solid', borderColor: 'divider',
              }}>
                {generating ? (
                  <CircularProgress />
                ) : avatarPreview ? (
                  <Box component="img"
                    src={`data:image/png;base64,${avatarPreview}`}
                    sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <Typography color="text.secondary" variant="body2">
                    {t('agentPersona.avatarPlaceholder')}
                  </Typography>
                )}
              </Box>

              {/* Avatar Description + Generate */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  label={t('agentPersona.avatarDescription')}
                  value={personality.avatarDescription}
                  onChange={(e) => updateField('avatarDescription', e.target.value)}
                  multiline
                  rows={4}
                  size="small"
                  fullWidth
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    onClick={handleGenerateAvatar}
                    disabled={generating || !personality.avatarDescription?.trim()}
                  >
                    {generating ? t('agentPersona.generating') : t('agentPersona.generateAvatar')}
                  </Button>
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<UploadFile />}
                  >
                    {t('agentPersona.uploadPng')}
                    <input type="file" accept="image/png" hidden onChange={handleUploadAvatar} />
                  </Button>
                </Box>
              </Box>
            </Box>
          </>
        )}

        {/* Tab 2: Preferences */}
        {activeTab === 1 && (
          <>
            {/* Communication Style */}
            <TextField
              sx={{ mt: '10px' }}
              label={t('agentPersona.communicationStyle')}
              placeholder={t('agentPersona.communicationStylePlaceholder')}
              value={personality.communicationStyle}
              onChange={(e) => updateField('communicationStyle', e.target.value)}
              multiline
              rows={2}
              size="small"
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><RiSpeakLine color="#1976d2" /></InputAdornment> } }}
            />

            {/* Quiet Hours */}
            <TextField
              sx={{ mt: '10px' }}
              label={t('agentPersona.notifications')}
              placeholder={t('agentPersona.notificationsPlaceholder')}
              value={personality.allowReviewNotificationsBetween}
              onChange={(e) => updateField('allowReviewNotificationsBetween', e.target.value)}
              size="small"
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><MdOutlineNotificationsOff color="#b71c1c" /></InputAdornment> } }}
            />

            {/* Contact Channels */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('agentPersona.contactChannels')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label={t('agentPersona.contactEmail')}
                  value={personality.contactChannels.email}
                  onChange={(e) => updateContactChannel('email', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><AiOutlineMail color="#1976d2" /></InputAdornment> } }}
                />
                <TextField
                  label={t('agentPersona.contactTeams')}
                  value={personality.contactChannels.teamsAccount}
                  onChange={(e) => updateContactChannel('teamsAccount', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><PiMicrosoftTeamsLogoLight color="#1976d2" /></InputAdornment> } }}
                />
                <TextField
                  label={t('agentPersona.contactTelegram')}
                  value={personality.contactChannels.telegramHandle}
                  onChange={(e) => updateContactChannel('telegramHandle', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><PiTelegramLogoDuotone color="#1976d2" /></InputAdornment> } }}
                />
              </Box>
              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ fontSize: '0.85rem' }}>
                  {t('agentPersona.preferredChannel')}
                </FormLabel>
                <RadioGroup
                  row
                  value={personality.contactChannels.preferredChannel}
                  onChange={(e) => updateContactChannel('preferredChannel', e.target.value)}
                >
                  <FormControlLabel value="email" control={<Radio size="small" />} label={t('agentPersona.contactEmail')} />
                  <FormControlLabel value="teamsAccount" control={<Radio size="small" />} label={t('agentPersona.contactTeams')} />
                  <FormControlLabel value="telegramHandle" control={<Radio size="small" />} label={t('agentPersona.contactTelegram')} />
                </RadioGroup>
              </FormControl>
            </Box>

            {/* Avoid At All Costs */}
            <TextField
              label={t('agentPersona.avoidAtAllCosts')}
              placeholder={t('agentPersona.avoidPlaceholder')}
              value={personality.avoidAtAllCosts}
              onChange={(e) => updateField('avoidAtAllCosts', e.target.value)}
              multiline
              rows={2}
              size="small"
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mt: '8px', alignSelf: 'flex-start' }}><MdDoNotDisturbAlt color="#b71c1c" /></InputAdornment> } }}
            />
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleInstall}
          disabled={!isValid || installing}
          sx={{ minWidth: 100 }}
        >
          {installing ? <CircularProgress size={20} /> : t('agentPersona.go')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
