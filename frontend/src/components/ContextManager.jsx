import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  Autocomplete,
  Chip,
  Tabs,
  Tab,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Paper,
  Divider
} from '@mui/material';
import { Add, Edit, Delete, Close, Visibility } from '@mui/icons-material';
import axios from 'axios';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: '16px' }}>
      {value === index && children}
    </div>
  );
}

export default function ContextManager({ open, onClose, projectName, allTags, onContextChange }) {
  const [contexts, setContexts] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [editingContext, setEditingContext] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewScope, setPreviewScope] = useState(null);

  // Form state for context editor
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFileTagsInclude, setFormFileTagsInclude] = useState([]);
  const [formFileTagsExclude, setFormFileTagsExclude] = useState([]);
  const [formVectorTags, setFormVectorTags] = useState([]);
  const [formKgTags, setFormKgTags] = useState([]);
  const [formKgEntityTypes, setFormKgEntityTypes] = useState([]);

  const entityTypes = ['Person', 'Company', 'Product', 'Document', 'DocumentChunk'];

  useEffect(() => {
    if (open) {
      loadContexts();
    }
  }, [open, projectName]);

  const loadContexts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/workspace/${projectName}/contexts`);
      setContexts(response.data || []);
      setError(null);
    } catch (err) {
      setError(`Failed to load contexts: ${err.response?.data?.message || err.message}`);
      console.error('Load contexts error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingContext(null);
    resetForm();
    setSelectedTab(1); // Switch to editor tab
  };

  const handleEdit = (context) => {
    setEditingContext(context);
    setFormName(context.name);
    setFormDescription(context.description);
    setFormFileTagsInclude(context.fileTagsInclude || []);
    setFormFileTagsExclude(context.fileTagsExclude || []);
    setFormVectorTags(context.vectorTagsInclude || []);
    setFormKgTags(context.kgTagsInclude || []);
    setFormKgEntityTypes(context.kgEntityTypes || []);
    setSelectedTab(1); // Switch to editor tab
  };

  const handleDelete = async (contextId) => {
    if (!window.confirm('Are you sure you want to delete this context?')) {
      return;
    }

    try {
      setLoading(true);
      await axios.delete(`/api/workspace/${projectName}/contexts/${contextId}`);
      await loadContexts();
      setError(null);
    } catch (err) {
      setError(`Failed to delete context: ${err.response?.data?.message || err.message}`);
      console.error('Delete context error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (contextId) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/workspace/${projectName}/contexts/${contextId}/scope`);
      setPreviewScope(response.data);
      setError(null);
    } catch (err) {
      setError(`Failed to load preview: ${err.response?.data?.message || err.message}`);
      console.error('Preview context error:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormFileTagsInclude([]);
    setFormFileTagsExclude([]);
    setFormVectorTags([]);
    setFormKgTags([]);
    setFormKgEntityTypes([]);
    setPreviewScope(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('Context name is required');
      return;
    }

    const contextData = {
      name: formName.trim(),
      description: formDescription.trim(),
      fileTagsInclude: formFileTagsInclude,
      fileTagsExclude: formFileTagsExclude,
      vectorTagsInclude: formVectorTags,
      kgTagsInclude: formKgTags,
      kgEntityTypes: formKgEntityTypes,
    };

    try {
      setLoading(true);
      if (editingContext) {
        // Update existing context
        await axios.put(`/api/workspace/${projectName}/contexts/${editingContext.id}`, contextData);
      } else {
        // Create new context
        await axios.post(`/api/workspace/${projectName}/contexts`, contextData);
      }

      await loadContexts();
      resetForm();
      setSelectedTab(0); // Switch back to list tab
      setError(null);
    } catch (err) {
      setError(`Failed to save context: ${err.response?.data?.message || err.message}`);
      console.error('Save context error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setEditingContext(null);
    setSelectedTab(0);
  };

  const handleClose = () => {
    resetForm();
    setEditingContext(null);
    setPreviewScope(null);
    setError(null);
    onClose();
  };

  const getTagColor = (tag) => {
    const colors = ['#1976d2', '#388e3c', '#d32f2f', '#f57c00', '#7b1fa2', '#c2185b', '#0097a7', '#689f38', '#e64a19'];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[Math.abs(hash) % colors.length];
  };

  const allTagNames = allTags.map(t => t.tag);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Context Manager
        <IconButton
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={selectedTab} onChange={(e, newValue) => setSelectedTab(newValue)}>
          <Tab label="Contexts" />
          <Tab label={editingContext ? 'Edit Context' : 'New Context'} />
        </Tabs>

        {/* Contexts List Tab */}
        <TabPanel value={selectedTab} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {contexts.length} context{contexts.length !== 1 ? 's' : ''}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateNew}
              disabled={loading}
            >
              Create Context
            </Button>
          </Box>

          {contexts.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
              <Typography variant="body2" color="text.secondary">
                No contexts defined. Create your first context to scope files and data by tags.
              </Typography>
            </Paper>
          ) : (
            <List>
              {contexts.map((context) => (
                <ListItem
                  key={context.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start'
                  }}
                >
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                    <ListItemText
                      primary={context.name}
                      secondary={context.description || 'No description'}
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" onClick={() => handlePreview(context.id)} disabled={loading}>
                        <Visibility />
                      </IconButton>
                      <IconButton edge="end" onClick={() => handleEdit(context)} disabled={loading}>
                        <Edit />
                      </IconButton>
                      <IconButton edge="end" onClick={() => handleDelete(context.id)} disabled={loading}>
                        <Delete />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </Box>

                  {/* Tag summary */}
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {context.fileTagsInclude?.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Files: {context.fileTagsInclude.map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                              height: '16px',
                              fontSize: '0.65rem',
                              ml: 0.5,
                              backgroundColor: getTagColor(tag),
                              color: 'white'
                            }}
                          />
                        ))}
                      </Typography>
                    )}
                    {context.vectorTagsInclude?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        Vectors: {context.vectorTagsInclude.join(', ')}
                      </Typography>
                    )}
                    {context.kgEntityTypes?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        KG: {context.kgEntityTypes.join(', ')}
                      </Typography>
                    )}
                  </Box>
                </ListItem>
              ))}
            </List>
          )}

          {/* Preview Scope Panel */}
          {previewScope && (
            <Paper sx={{ mt: 2, p: 2, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle2" gutterBottom>
                Scope Preview
                <IconButton size="small" onClick={() => setPreviewScope(null)} sx={{ ml: 1 }}>
                  <Close fontSize="small" />
                </IconButton>
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                <strong>Files:</strong> {previewScope.files?.length || 0} file(s)
              </Typography>
              <Typography variant="body2">
                <strong>Vector Tags:</strong> {previewScope.vectorTags?.join(', ') || 'None'}
              </Typography>
              <Typography variant="body2">
                <strong>KG Tags:</strong> {previewScope.kgTags?.join(', ') || 'None'}
              </Typography>
              <Typography variant="body2">
                <strong>KG Entity Types:</strong> {previewScope.kgEntityTypes?.join(', ') || 'None'}
              </Typography>
            </Paper>
          )}
        </TabPanel>

        {/* Context Editor Tab */}
        <TabPanel value={selectedTab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Context Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              required
              disabled={loading}
            />

            <TextField
              label="Description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              disabled={loading}
            />

            <Divider />

            <Typography variant="subtitle2">File Scope</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formFileTagsInclude}
              onChange={(e, newValue) => setFormFileTagsInclude(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label="Include files with tags" placeholder="Select tags" />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option}
                    label={option}
                    size="small"
                    sx={{ backgroundColor: getTagColor(option), color: 'white' }}
                  />
                ))
              }
            />

            <Autocomplete
              multiple
              options={allTagNames}
              value={formFileTagsExclude}
              onChange={(e, newValue) => setFormFileTagsExclude(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label="Exclude files with tags" placeholder="Select tags" />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option}
                    label={option}
                    size="small"
                    sx={{ backgroundColor: getTagColor(option), color: 'white' }}
                  />
                ))
              }
            />

            <Divider />

            <Typography variant="subtitle2">Vector Store Scope</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formVectorTags}
              onChange={(e, newValue) => setFormVectorTags(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label="Vector document tags" placeholder="Select tags" />
              )}
            />

            <Divider />

            <Typography variant="subtitle2">Knowledge Graph Scope</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formKgTags}
              onChange={(e, newValue) => setFormKgTags(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label="Entity tags" placeholder="Select tags" />
              )}
            />

            <Autocomplete
              multiple
              options={entityTypes}
              value={formKgEntityTypes}
              onChange={(e, newValue) => setFormKgEntityTypes(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label="Entity types" placeholder="Select types" />
              )}
            />
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        {selectedTab === 1 ? (
          <>
            <Button onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} variant="contained" disabled={loading}>
              {editingContext ? 'Update' : 'Create'}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} disabled={loading}>
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
