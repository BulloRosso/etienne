import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  ListItemIcon,
  IconButton,
  TextField,
  Paper,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Popover,
} from '@mui/material';
import { Add, DeleteOutlined, ArrowBack } from '@mui/icons-material';
import { RiRobot2Line } from 'react-icons/ri';
import Editor from '@monaco-editor/react';
import { apiAxios } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';

export default function SubagentConfiguration({ project, codingAgent = 'anthropic' }) {
  const { t } = useTranslation(["subagent","common"]);
  const { mode: themeMode } = useThemeMode();
  const [subagents, setSubagents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [selectedSubagent, setSelectedSubagent] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subagentToDelete, setSubagentToDelete] = useState(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [originalName, setOriginalName] = useState('');

  // Available tools from MCP config
  const [availableTools, setAvailableTools] = useState([]);

  // Repository subagents
  const [repositorySubagents, setRepositorySubagents] = useState([]);
  const [addMenuAnchorEl, setAddMenuAnchorEl] = useState(null);

  useEffect(() => {
    loadSubagents();
    loadMcpTools();
    loadRepositorySubagents();
  }, [project]);

  const loadSubagents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAxios.get(`/api/subagents/${project}`);
      setSubagents(response.data.subagents || []);
    } catch (err) {
      setError(t('subagent:errorLoadFailed'));
      console.error('Load subagents error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMcpTools = async () => {
    try {
      const response = await apiAxios.post('/api/claude/mcp/config', {
        projectName: project
      });
      const mcpServers = response.data.mcpServers || {};
      const toolNames = Object.keys(mcpServers);

      // Add built-in tools
      const builtInTools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task'];
      setAvailableTools([...builtInTools, ...toolNames]);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
      // Set only built-in tools if MCP config fails
      setAvailableTools(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task']);
    }
  };

  const loadRepositorySubagents = async () => {
    try {
      const response = await apiAxios.get('/api/subagents/repository/list?includeOptional=true');
      setRepositorySubagents(response.data.subagents || []);
    } catch (err) {
      console.error('Failed to load repository subagents:', err);
    }
  };

  const availableRepoSubagents = repositorySubagents.filter(
    (repo) => !subagents.some((s) => s.name === repo.name)
  );

  const handleProvisionSubagent = async (repoAgent) => {
    setAddMenuAnchorEl(null);
    try {
      await apiAxios.post(`/api/subagents/${project}/provision`, {
        subagentNames: [repoAgent.name],
        source: repoAgent.source,
      });
      await loadSubagents();
    } catch (err) {
      setError(t('subagent:errorProvisionFailed'));
      console.error('Provision subagent error:', err);
    }
  };

  const handleSelectSubagent = (subagent) => {
    setSelectedSubagent(subagent);
    setEditMode(false);
    setName(subagent.name);
    setDescription(subagent.description);
    setModel(subagent.model || '');
    setTools(subagent.tools || '');
    setSystemPrompt(subagent.systemPrompt || '');
    setOriginalName(subagent.name);
  };

  const handleNewSubagent = () => {
    setSelectedSubagent({ name: '', description: '', model: '', tools: '', systemPrompt: '' });
    setEditMode(true);
    setName('');
    setDescription('');
    setModel('');
    setTools('');
    setSystemPrompt('');
    setOriginalName('');
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancel = () => {
    if (originalName === '') {
      // Was creating new subagent, go back to list
      setSelectedSubagent(null);
      setEditMode(false);
    } else {
      // Was editing existing, revert changes
      setEditMode(false);
      const subagent = subagents.find(s => s.name === originalName);
      if (subagent) {
        setName(subagent.name);
        setDescription(subagent.description);
        setModel(subagent.model || '');
        setTools(subagent.tools || '');
        setSystemPrompt(subagent.systemPrompt || '');
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('subagent:errorNameRequired'));
      return;
    }

    if (!description.trim()) {
      setError(t('subagent:errorDescriptionRequired'));
      return;
    }

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(name)) {
      setError(t('subagent:errorNameFormat'));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const config = {
        name: name.trim(),
        description: description.trim(),
        model: model.trim(),
        tools: tools.trim(),
        systemPrompt: systemPrompt.trim(),
      };

      if (originalName === '') {
        // Creating new subagent
        await apiAxios.post(`/api/subagents/${project}`, config);
      } else {
        // Updating existing subagent
        await apiAxios.put(`/api/subagents/${project}/${originalName}`, config);
      }

      setSuccess(true);
      setEditMode(false);
      setOriginalName(config.name);
      await loadSubagents();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(t('subagent:errorSaveFailed'));
      console.error('Save subagent error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (subagent, event) => {
    event.stopPropagation();
    setSubagentToDelete(subagent);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!subagentToDelete) return;

    try {
      await apiAxios.delete(`/api/subagents/${project}/${subagentToDelete.name}`);
      setDeleteDialogOpen(false);
      setSubagentToDelete(null);

      if (selectedSubagent?.name === subagentToDelete.name) {
        setSelectedSubagent(null);
      }

      await loadSubagents();
    } catch (err) {
      setError(t('subagent:errorDeleteFailed'));
      console.error('Delete subagent error:', err);
    }
  };

  const handleBack = () => {
    setSelectedSubagent(null);
    setEditMode(false);
  };

  const handleToolToggle = (tool) => {
    const currentTools = tools ? tools.split(',').map(item => item.trim()) : [];
    const index = currentTools.indexOf(tool);

    if (index > -1) {
      currentTools.splice(index, 1);
    } else {
      currentTools.push(tool);
    }

    setTools(currentTools.join(', '));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          {t('subagent:savedSuccess')}
        </Alert>
      )}

      {!selectedSubagent ? (
        <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, gap: 2, overflow: 'hidden' }}>
          {/* Left column: image + info text */}
          <Box sx={{ width: 300, minWidth: 300, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Box
              component="img"
              src="/puppet-master.png"
              alt="Puppet Master"
              sx={{ width: '100%', height: 'auto', borderRadius: 2 }}
            />
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 2, px: 1 }}>
              {t('subagent:infoHint')}
            </Typography>
          </Box>

          {/* Right column: list + new button */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {subagents.length === 0 && availableRepoSubagents.length === 0 && (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {t('subagent:emptyState')}
                  </Typography>
                </Paper>
              )}
              {subagents.map((subagent) => (
                <ListItem
                  key={subagent.name}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      color="error"
                      onClick={(e) => handleDeleteClick(subagent, e)}
                      className="delete-icon"
                    >
                      <DeleteOutlined />
                    </IconButton>
                  }
                  sx={{
                    border: '1px solid', borderColor: 'divider', borderRadius: '5px', p: 0,
                    alignItems: 'flex-start',
                    '& .MuiListItemSecondaryAction-root': { top: 8, transform: 'none' },
                    '& .delete-icon': { opacity: 0, transition: 'opacity 0.2s' },
                    '&:hover .delete-icon': { opacity: 1 },
                  }}
                >
                  <ListItemButton onClick={() => handleSelectSubagent(subagent)} sx={{ borderRadius: '5px', alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ minWidth: 40, mt: '8px' }}>
                      <RiRobot2Line style={{ fontSize: '24px' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography variant="subtitle1" fontWeight="bold">{subagent.name}</Typography>}
                      secondary={subagent.description?.length > 512 ? subagent.description.substring(0, 512) + '...' : subagent.description}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {availableRepoSubagents.length > 0 && (
                <ListItem
                  sx={{
                    border: '2px dashed', borderColor: 'divider', borderRadius: '5px', p: 0,
                  }}
                >
                  <ListItemButton onClick={(e) => setAddMenuAnchorEl(e.currentTarget)} sx={{ borderRadius: '5px' }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Add />
                    </ListItemIcon>
                    <ListItemText primary={t('subagent:addPredefined')} />
                  </ListItemButton>
                </ListItem>
              )}
            </List>
            <Popover
              open={Boolean(addMenuAnchorEl)}
              anchorEl={addMenuAnchorEl}
              onClose={() => setAddMenuAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
              <List sx={{ minWidth: 300, maxHeight: 400, overflow: 'auto' }}>
                {availableRepoSubagents.map((agent) => (
                  <ListItem key={agent.name} disablePadding>
                    <ListItemButton onClick={() => handleProvisionSubagent(agent)}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {agent.hasThumbnail ? (
                          <Box
                            component="img"
                            src={`/api/subagents/repository/${agent.name}/thumbnail?source=${agent.source}`}
                            sx={{ width: 32, height: 32, borderRadius: 1 }}
                          />
                        ) : (
                          <RiRobot2Line style={{ fontSize: 24 }} />
                        )}
                      </ListItemIcon>
                      <ListItemText primary={agent.name.charAt(0).toUpperCase() + agent.name.slice(1)} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Popover>

            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleNewSubagent}
              >
                {t('subagent:newSubagent')}
              </Button>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={handleBack}>
                <ArrowBack />
              </IconButton>
              <Typography variant="h6">
                {originalName === '' ? t('subagent:newSubagent') : name}
              </Typography>
            </Box>
            <Box>
              {!editMode ? (
                <>
                  <Button variant="outlined" onClick={handleEdit} sx={{ mr: 1 }}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={(e) => handleDeleteClick(selectedSubagent, e)}
                  >
                    {t('common.delete')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outlined" onClick={handleCancel} sx={{ mr: 1 }}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </>
              )}
            </Box>
          </Box>

          <Paper sx={{ flex: 1, p: 2, overflow: 'auto' }}>
            <Stack spacing={2}>
              <TextField
                label={t('subagent:formName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!editMode}
                fullWidth
                helperText={t('subagent:formNameHelper')}
              />

              <TextField
                label={t('subagent:formDescription')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!editMode}
                fullWidth
                multiline
                rows={2}
                helperText={t('subagent:formDescriptionHelper')}
              />

              <FormControl fullWidth>
                <InputLabel>{t('subagent:formModel')}</InputLabel>
                <Select
                  value={model}
                  label={t('subagent:formModel')}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!editMode}
                >
                  <MenuItem value="">{t('subagent:formModelDefault')}</MenuItem>
                  <MenuItem value="haiku">{t('subagent:formModelHaiku')}</MenuItem>
                  <MenuItem value="sonnet">{t('subagent:formModelSonnet')}</MenuItem>
                  <MenuItem value="opus">{t('subagent:formModelOpus')}</MenuItem>
                  <MenuItem value="inherit">{t('subagent:formModelInherit')}</MenuItem>
                </Select>
              </FormControl>

              {codingAgent !== 'openai' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('subagent:formToolsHelp')}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableTools.map((tool) => {
                    const currentTools = tools ? tools.split(',').map(item => item.trim()) : [];
                    const isSelected = currentTools.includes(tool);

                    return (
                      <Chip
                        key={tool}
                        label={tool}
                        onClick={() => editMode && handleToolToggle(tool)}
                        color={isSelected ? 'primary' : 'default'}
                        variant={isSelected ? 'filled' : 'outlined'}
                        disabled={!editMode}
                        sx={{ cursor: editMode ? 'pointer' : 'default' }}
                      />
                    );
                  })}
                </Box>
              </Box>
              )}

              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('subagent:formSystemPrompt')}
                </Typography>
                <Box sx={{ border: '1px solid #ddd', borderRadius: 1, height: '300px' }}>
                  <Editor
                    height="300px"
                    defaultLanguage="markdown"
                    value={systemPrompt}
                    onChange={(value) => setSystemPrompt(value || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      readOnly: !editMode,
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                    }}
                  />
                </Box>
              </Box>
            </Stack>
          </Paper>
        </Box>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('subagent:deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('subagent:deleteMessage', { name: subagentToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
