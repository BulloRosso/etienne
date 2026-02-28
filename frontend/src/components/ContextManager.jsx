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
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: '16px' }}>
      {value === index && children}
    </div>
  );
}

export default function ContextManager({ open, onClose, projectName, allTags, onContextChange }) {
  const { t } = useTranslation();
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
      const response = await apiAxios.get(`/api/workspace/${projectName}/contexts`);
      setContexts(response.data || []);
      setError(null);
    } catch (err) {
      setError(t('contextManager.errorLoadFailed', { message: err.response?.data?.message || err.message }));
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
    if (!window.confirm(t('contextManager.deleteConfirm'))) {
      return;
    }

    try {
      setLoading(true);
      await apiAxios.delete(`/api/workspace/${projectName}/contexts/${contextId}`);
      await loadContexts();
      setError(null);
    } catch (err) {
      setError(t('contextManager.errorDeleteFailed', { message: err.response?.data?.message || err.message }));
      console.error('Delete context error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (contextId) => {
    try {
      setLoading(true);
      const response = await apiAxios.get(`/api/workspace/${projectName}/contexts/${contextId}/scope`);
      setPreviewScope(response.data);
      setError(null);
    } catch (err) {
      setError(t('contextManager.errorPreviewFailed', { message: err.response?.data?.message || err.message }));
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
      setError(t('contextManager.errorNameRequired'));
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
        await apiAxios.put(`/api/workspace/${projectName}/contexts/${editingContext.id}`, contextData);
      } else {
        // Create new context
        await apiAxios.post(`/api/workspace/${projectName}/contexts`, contextData);
      }

      await loadContexts();
      resetForm();
      setSelectedTab(0); // Switch back to list tab
      setError(null);
    } catch (err) {
      setError(t('contextManager.errorSaveFailed', { message: err.response?.data?.message || err.message }));
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

  const allTagNames = allTags.map(tag => tag.tag);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('contextManager.title')}
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
          <Tab label={t('contextManager.tabContexts')} />
          <Tab label={editingContext ? t('contextManager.tabEditContext') : t('contextManager.tabNewContext')} />
        </Tabs>

        {/* Contexts List Tab */}
        <TabPanel value={selectedTab} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t('contextManager.contextCount', { count: contexts.length })}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateNew}
              disabled={loading}
            >
              {t('contextManager.createContext')}
            </Button>
          </Box>

          {contexts.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
              <Typography variant="body2" color="text.secondary">
                {t('contextManager.emptyState')}
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
                      secondary={context.description || t('contextManager.noDescription')}
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
                        {t('contextManager.scopeFiles')} {context.fileTagsInclude.map(tag => (
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
                        {t('contextManager.scopeVectorTags')} {context.vectorTagsInclude.join(', ')}
                      </Typography>
                    )}
                    {context.kgEntityTypes?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {t('contextManager.scopeKgEntityTypes')} {context.kgEntityTypes.join(', ')}
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
                {t('contextManager.scopePreview')}
                <IconButton size="small" onClick={() => setPreviewScope(null)} sx={{ ml: 1 }}>
                  <Close fontSize="small" />
                </IconButton>
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                <strong>{t('contextManager.scopeFiles')}</strong> {t('contextManager.scopeFilesCount', { count: previewScope.files?.length || 0 })}
              </Typography>
              <Typography variant="body2">
                <strong>{t('contextManager.scopeVectorTags')}</strong> {previewScope.vectorTags?.join(', ') || t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('contextManager.scopeKgTags')}</strong> {previewScope.kgTags?.join(', ') || t('common.none')}
              </Typography>
              <Typography variant="body2">
                <strong>{t('contextManager.scopeKgEntityTypes')}</strong> {previewScope.kgEntityTypes?.join(', ') || t('common.none')}
              </Typography>
            </Paper>
          )}
        </TabPanel>

        {/* Context Editor Tab */}
        <TabPanel value={selectedTab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('contextManager.contextName')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              required
              disabled={loading}
            />

            <TextField
              label={t('common.description')}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              disabled={loading}
            />

            <Divider />

            <Typography variant="subtitle2">{t('contextManager.fileScope')}</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formFileTagsInclude}
              onChange={(e, newValue) => setFormFileTagsInclude(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label={t('contextManager.includeFilesByTags')} placeholder={t('contextManager.selectTags')} />
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
                <TextField {...params} label={t('contextManager.excludeFilesByTags')} placeholder={t('contextManager.selectTags')} />
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

            <Typography variant="subtitle2">{t('contextManager.vectorStoreScope')}</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formVectorTags}
              onChange={(e, newValue) => setFormVectorTags(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label={t('contextManager.vectorDocumentTags')} placeholder={t('contextManager.selectTags')} />
              )}
            />

            <Divider />

            <Typography variant="subtitle2">{t('contextManager.knowledgeGraphScope')}</Typography>

            <Autocomplete
              multiple
              options={allTagNames}
              value={formKgTags}
              onChange={(e, newValue) => setFormKgTags(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label={t('contextManager.entityTags')} placeholder={t('contextManager.selectTags')} />
              )}
            />

            <Autocomplete
              multiple
              options={entityTypes}
              value={formKgEntityTypes}
              onChange={(e, newValue) => setFormKgEntityTypes(newValue)}
              disabled={loading}
              renderInput={(params) => (
                <TextField {...params} label={t('contextManager.entityTypes')} placeholder={t('contextManager.selectTypes')} />
              )}
            />
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        {selectedTab === 1 ? (
          <>
            <Button onClick={handleCancel} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} variant="contained" disabled={loading}>
              {editingContext ? t('common.update') : t('common.create')}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} disabled={loading}>
            {t('common.close')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
