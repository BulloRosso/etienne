import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert, Tabs, Tab, Button, Switch, FormControlLabel, TextField } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { BiMemoryCard } from 'react-icons/bi';
import { AiOutlineDelete } from 'react-icons/ai';
import Editor from '@monaco-editor/react';
import BackgroundInfo from './BackgroundInfo';

export default function MemoryPanel({ projectName, onClose, showBackgroundInfo, isOpen }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Extraction prompt state
  const [extractionPrompt, setExtractionPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState(null);
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({ memoryEnabled: true, decayDays: 6, searchLimit: 5 });
  const [originalSettings, setOriginalSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);

  useEffect(() => {
    loadMemories();
  }, [projectName]);

  // Refresh memories whenever the panel is opened
  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen]);

  const loadMemories = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = 'user'; // Default user ID for single-user system
      const url = `/api/memories/${userId}?project=${encodeURIComponent(projectName)}&limit=100`;
      console.log('Loading memories from:', url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Memory API error:', response.status, errorText);
        throw new Error(`Failed to load memories: ${response.status}`);
      }

      const data = await response.json();
      console.log('Memories loaded:', data);
      setMemories(data.results || []);
    } catch (err) {
      console.error('Failed to load memories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadExtractionPrompt = async () => {
    setPromptLoading(true);
    setPromptError(null);

    try {
      const url = `/api/memories/extraction-prompt?project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load extraction prompt: ${response.status}`);
      }

      const data = await response.json();
      setExtractionPrompt(data.prompt);
      setOriginalPrompt(data.prompt);
      setIsCustomPrompt(data.isCustom);
    } catch (err) {
      console.error('Failed to load extraction prompt:', err);
      setPromptError(err.message);
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    setPromptError(null);

    try {
      const url = `/api/memories/extraction-prompt?project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: extractionPrompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to save extraction prompt');
      }

      setOriginalPrompt(extractionPrompt);
      setIsCustomPrompt(true);
    } catch (err) {
      console.error('Failed to save extraction prompt:', err);
      setPromptError(err.message);
    } finally {
      setPromptSaving(false);
    }
  };

  const handleResetPrompt = async () => {
    setPromptSaving(true);
    setPromptError(null);

    try {
      const url = `/api/memories/extraction-prompt?project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error('Failed to reset extraction prompt');
      }

      const data = await response.json();
      setExtractionPrompt(data.prompt);
      setOriginalPrompt(data.prompt);
      setIsCustomPrompt(false);
    } catch (err) {
      console.error('Failed to reset extraction prompt:', err);
      setPromptError(err.message);
    } finally {
      setPromptSaving(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);

    try {
      const url = `/api/memories/settings?project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load settings: ${response.status}`);
      }

      const data = await response.json();
      setSettings(data);
      setOriginalSettings(JSON.stringify(data));
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);

    try {
      const url = `/api/memories/settings?project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setOriginalSettings(JSON.stringify(settings));

      // Sync memoryEnabled to localStorage so the rest of the UI reacts
      localStorage.setItem('memoryEnabled', String(settings.memoryEnabled));
      window.dispatchEvent(new Event('memoryChanged'));
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSettingsError(err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    try {
      const userId = 'user';
      const url = `/api/memories/${memoryId}?user_id=${userId}&project=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete memory');
      }

      // Refresh the list
      await loadMemories();
    } catch (err) {
      console.error('Failed to delete memory:', err);
      setError(err.message);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (newValue === 1) {
      loadExtractionPrompt();
    } else if (newValue === 2) {
      loadSettings();
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const promptDirty = extractionPrompt !== originalPrompt;
  const settingsDirty = originalSettings !== null && JSON.stringify(settings) !== originalSettings;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        p: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: '14px' }}>
          <BiMemoryCard size={22} color="#000" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Long Term Memory
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <IoClose size={24} />
        </IconButton>
      </Box>

      {/* Tab Strip */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ borderBottom: '1px solid #e0e0e0', px: 1, minHeight: 40 }}
        TabIndicatorProps={{ sx: { height: 2 } }}
      >
        <Tab label="Memories" sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
        <Tab label="Extraction Prompt" sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
        <Tab label="Settings" sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
      </Tabs>

      {/* Tab 0: Memories */}
      {activeTab === 0 && (
        <>
          <Box sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            position: 'relative',
            '&::after': {
              content: '""',
              position: 'absolute',
              left: '50%',
              bottom: 0,
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 220,
              height: '33.3%',
              backgroundImage: 'url(/feature-long-term-memory.jpg)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center bottom',
              opacity: 0.5,
              pointerEvents: 'none',
              zIndex: 0,
            }
          }}>
            <BackgroundInfo infoId="memory" showBackgroundInfo={showBackgroundInfo} />

            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {!loading && !error && memories.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <Typography variant="body1">
                  No memories stored yet.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Enable Long Term Memory in settings and start chatting to build a memory base.
                </Typography>
              </Box>
            )}

            {!loading && !error && memories.length > 0 && (
              <List>
                {memories.map((memory) => (
                  <ListItem
                    key={memory.id}
                    sx={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: '#fafafa',
                      '&:hover': {
                        backgroundColor: '#f5f5f5',
                        '& .delete-icon': {
                          opacity: 1
                        }
                      },
                      alignItems: 'flex-start',
                      flexDirection: 'column',
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                        <BiMemoryCard size={20} color="#1976d2" />
                      </ListItemIcon>
                      <ListItemText
                        primary={memory.memory}
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              Created: {formatDate(memory.created_at)}
                            </Typography>
                            {memory.updated_at && memory.updated_at !== memory.created_at && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>
                                Updated: {formatDate(memory.updated_at)}
                              </Typography>
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { fontWeight: 500 }
                        }}
                        sx={{ pr: 5 }}
                      />
                      <IconButton
                        className="delete-icon"
                        onClick={() => handleDeleteMemory(memory.id)}
                        size="small"
                        sx={{
                          position: 'absolute',
                          right: 8,
                          top: 8,
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          color: '#d32f2f',
                          '&:hover': {
                            backgroundColor: 'rgba(211, 47, 47, 0.08)'
                          }
                        }}
                      >
                        <AiOutlineDelete size={20} />
                      </IconButton>
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Footer */}
          {!loading && !error && memories.length > 0 && (
            <Box sx={{
              p: 2,
              borderTop: '1px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {memories.length} {memories.length === 1 ? 'memory' : 'memories'} stored
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                .etienne/memories.json
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Tab 1: Extraction Prompt */}
      {activeTab === 1 && (
        <>
          <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
            {promptLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                <CircularProgress />
              </Box>
            )}

            {promptError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {promptError}
              </Alert>
            )}

            {!promptLoading && (
              <>
                {isCustomPrompt && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Using a custom extraction prompt for this project.
                  </Alert>
                )}
                <Box sx={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 1, overflow: 'hidden' }}>
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    theme="light"
                    value={extractionPrompt}
                    onChange={(value) => setExtractionPrompt(value || '')}
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: 'off',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      automaticLayout: true,
                    }}
                  />
                </Box>
              </>
            )}
          </Box>

          {/* Footer with actions */}
          {!promptLoading && (
            <Box sx={{
              p: 2,
              borderTop: '1px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Button
                variant="text"
                size="small"
                onClick={handleResetPrompt}
                disabled={promptSaving || !isCustomPrompt}
              >
                Reset to Default
              </Button>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  .etienne/long-term-memory/extraction-prompt.md
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSavePrompt}
                  disabled={promptSaving || !promptDirty}
                >
                  {promptSaving ? 'Saving...' : 'Save'}
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Tab 2: Settings */}
      {activeTab === 2 && (
        <>
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {settingsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            )}

            {settingsError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {settingsError}
              </Alert>
            )}

            {!settingsLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.memoryEnabled}
                      onChange={(e) => setSettings({ ...settings, memoryEnabled: e.target.checked })}
                    />
                  }
                  label="Memory Enabled"
                />

                <TextField
                  label="Memory Decay Window (days)"
                  type="number"
                  size="small"
                  value={settings.decayDays}
                  onChange={(e) => setSettings({ ...settings, decayDays: parseInt(e.target.value, 10) || 0 })}
                  helperText="Number of days before memories expire. Set to 0 to keep forever."
                  inputProps={{ min: 0 }}
                  sx={{ maxWidth: 300 }}
                />

                <TextField
                  label="Memory Search Limit"
                  type="number"
                  size="small"
                  value={settings.searchLimit}
                  onChange={(e) => setSettings({ ...settings, searchLimit: parseInt(e.target.value, 10) || 0 })}
                  helperText="Maximum number of memories injected per session. Set to 0 for unlimited."
                  inputProps={{ min: 0 }}
                  sx={{ maxWidth: 300 }}
                />
              </Box>
            )}
          </Box>

          {/* Footer */}
          {!settingsLoading && (
            <Box sx={{
              p: 2,
              borderTop: '1px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                .etienne/long-term-memory/settings.json
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveSettings}
                disabled={settingsSaving || !settingsDirty}
              >
                {settingsSaving ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
