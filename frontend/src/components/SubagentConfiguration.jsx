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
  IconButton,
  TextField,
  Paper,
  Typography,
  Chip,
  Divider,
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
} from '@mui/material';
import { Add, Delete, ArrowBack } from '@mui/icons-material';
import { RiRobot2Line } from 'react-icons/ri';
import Editor from '@monaco-editor/react';
import axios from 'axios';

export default function SubagentConfiguration({ project }) {
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

  useEffect(() => {
    loadSubagents();
    loadMcpTools();
  }, [project]);

  const loadSubagents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/subagents/${project}`);
      setSubagents(response.data.subagents || []);
    } catch (err) {
      setError('Failed to load subagents');
      console.error('Load subagents error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMcpTools = async () => {
    try {
      const response = await axios.post('/api/claude/mcp/config', {
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
      setError('Name is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(name)) {
      setError('Name must contain only lowercase letters, numbers, and hyphens');
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
        await axios.post(`/api/subagents/${project}`, config);
      } else {
        // Updating existing subagent
        await axios.put(`/api/subagents/${project}/${originalName}`, config);
      }

      setSuccess(true);
      setEditMode(false);
      setOriginalName(config.name);
      await loadSubagents();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save subagent');
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
      await axios.delete(`/api/subagents/${project}/${subagentToDelete.name}`);
      setDeleteDialogOpen(false);
      setSubagentToDelete(null);

      if (selectedSubagent?.name === subagentToDelete.name) {
        setSelectedSubagent(null);
      }

      await loadSubagents();
    } catch (err) {
      setError('Failed to delete subagent');
      console.error('Delete subagent error:', err);
    }
  };

  const handleBack = () => {
    setSelectedSubagent(null);
    setEditMode(false);
  };

  const handleToolToggle = (tool) => {
    const currentTools = tools ? tools.split(',').map(t => t.trim()) : [];
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
          Subagent saved successfully
        </Alert>
      )}

      {!selectedSubagent ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 2, gap: 1 }}>
              <RiRobot2Line style={{ fontSize: '28px' }} />
            </Box>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleNewSubagent}
            >
              New Subagent
            </Button>
          </Box>

          {subagents.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No subagents configured. Click "New Subagent" to create one.
              </Typography>
            </Paper>
          ) : (
            <Paper>
              <List>
                {subagents.map((subagent, index) => (
                  <React.Fragment key={subagent.name}>
                    {index > 0 && <Divider />}
                    <ListItem
                      secondaryAction={
                        <IconButton
                          edge="end"
                          color="error"
                          onClick={(e) => handleDeleteClick(subagent, e)}
                        >
                          <Delete />
                        </IconButton>
                      }
                    >
                      <ListItemButton onClick={() => handleSelectSubagent(subagent)}>
                        <ListItemText
                          primary={<Typography variant="subtitle1" fontWeight="bold">{subagent.name}</Typography>}
                          secondary={subagent.description}
                        />
                      </ListItemButton>
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </Paper>
          )}
        </>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={handleBack}>
                <ArrowBack />
              </IconButton>
              <Typography variant="h6">
                {originalName === '' ? 'New Subagent' : name}
              </Typography>
            </Box>
            <Box>
              {!editMode ? (
                <>
                  <Button variant="outlined" onClick={handleEdit} sx={{ mr: 1 }}>
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={(e) => handleDeleteClick(selectedSubagent, e)}
                  >
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outlined" onClick={handleCancel} sx={{ mr: 1 }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              )}
            </Box>
          </Box>

          <Paper sx={{ flex: 1, p: 2, overflow: 'auto' }}>
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!editMode}
                fullWidth
                helperText="Lowercase letters, numbers, and hyphens only"
              />

              <TextField
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!editMode}
                fullWidth
                multiline
                rows={2}
                helperText="Describe when this agent should be invoked"
              />

              <FormControl fullWidth>
                <InputLabel>Model</InputLabel>
                <Select
                  value={model}
                  label="Model"
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!editMode}
                >
                  <MenuItem value="">Default (inherit)</MenuItem>
                  <MenuItem value="haiku">Haiku</MenuItem>
                  <MenuItem value="sonnet">Sonnet</MenuItem>
                  <MenuItem value="opus">Opus</MenuItem>
                  <MenuItem value="inherit">Inherit</MenuItem>
                </Select>
              </FormControl>

              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Tools (leave empty to inherit all tools)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableTools.map((tool) => {
                    const currentTools = tools ? tools.split(',').map(t => t.trim()) : [];
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

              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  System Prompt
                </Typography>
                <Box sx={{ border: '1px solid #ddd', borderRadius: 1, height: '300px' }}>
                  <Editor
                    height="300px"
                    defaultLanguage="markdown"
                    value={systemPrompt}
                    onChange={(value) => setSystemPrompt(value || '')}
                    theme="light"
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
        <DialogTitle>Delete Subagent</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the subagent "{subagentToDelete?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
