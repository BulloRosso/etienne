import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Chip,
  TextField,
  Button,
  IconButton,
  Divider,
  Alert,
  Snackbar,
  Paper,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
} from '@mui/material';
import { TbPlus, TbTrash, TbEdit, TbChevronDown, TbChevronUp } from 'react-icons/tb';
import { BsWindow } from 'react-icons/bs';
import { GoFileCode } from 'react-icons/go';
import { VscServerProcess } from 'react-icons/vsc';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { apiFetch } from '../services/api';
import { VIEWER_COMPONENTS, VIEWER_COMPONENT_NAMES, SERVICE_PREVIEWERS } from './viewerRegistry';

const SUPPORTED_LANGUAGES = ['en', 'de', 'it', 'zh'];
const CONDITION_TYPES = ['filename', 'extension', 'pathContains'];
const PARAM_SOURCES = ['filePath', 'fileName', 'fileNameWithoutExt', 'projectName', 'folderPath'];

const emptyAction = () => ({
  id: `action-${Date.now()}`,
  labels: { en: '', de: '', it: '', zh: '' },
  icon: '',
  modalComponent: '',
  params: [],
  condition: null,
  minRole: '',
});

export default function PreviewersManager({ open, onClose, onConfigChanged }) {
  const { t } = useTranslation();

  const [previewers, setPreviewers] = useState([]);
  const [servicePreviewers, setServicePreviewers] = useState([]);
  const [selectedViewer, setSelectedViewer] = useState(null);
  const [newExtension, setNewExtension] = useState('');
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Context menu action editing
  const [editingActionIdx, setEditingActionIdx] = useState(null);

  // Add new previewer dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newViewerName, setNewViewerName] = useState('');
  const [newFunction, setNewFunction] = useState('');

  // Info alert fade-out
  const [infoVisible, setInfoVisible] = useState(true);

  // Fetch configuration when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchConfig();
    setEditingActionIdx(null);
    setInfoVisible(true);
    const timer = setTimeout(() => setInfoVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [open]);

  const fetchConfig = async () => {
    try {
      const response = await apiFetch('/api/previewers/configuration');
      const data = await response.json();
      setPreviewers(data.previewers || []);
      setServicePreviewers(data.servicePreviewers || []);
      if (!selectedViewer && data.previewers?.length > 0) {
        setSelectedViewer(data.previewers[0].viewer);
      }
    } catch (err) {
      console.error('Failed to fetch previewer config:', err);
    }
  };

  // Build a combined sorted list
  const sortedViewers = useMemo(() => {
    const items = [];

    for (const p of previewers) {
      items.push({
        id: p.viewer,
        name: p.viewer,
        type: 'file',
        extensions: p.extensions,
        contextMenuActions: p.contextMenuActions || [],
      });
    }

    for (const sp of servicePreviewers) {
      if (!items.find(i => i.id === sp.viewerName)) {
        items.push({
          id: sp.viewerName,
          name: sp.displayName || sp.viewerName,
          type: 'service',
          serviceName: sp.serviceName,
          functions: sp.functions,
          requiresService: sp.requiresService,
        });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [previewers, servicePreviewers]);

  const selectedItem = sortedViewers.find(v => v.id === selectedViewer);
  const selectedPreviewer = previewers.find(p => p.viewer === selectedViewer);

  // ── Extension management ──

  const handleAddExtension = () => {
    if (!newExtension || !selectedPreviewer) return;
    const ext = newExtension.startsWith('.') ? newExtension.toLowerCase() : `.${newExtension.toLowerCase()}`;

    const updated = previewers.map(p => {
      if (p.viewer === selectedViewer) {
        if (p.extensions.includes(ext)) return p;
        return { ...p, extensions: [...p.extensions, ext] };
      }
      return p;
    });

    setPreviewers(updated);
    setNewExtension('');
  };

  const handleRemoveExtension = (ext) => {
    const updated = previewers.map(p => {
      if (p.viewer === selectedViewer) {
        return { ...p, extensions: p.extensions.filter(e => e !== ext) };
      }
      return p;
    });
    setPreviewers(updated);
  };

  // ── Context menu action management ──

  const updatePreviewerActions = (viewerName, newActions) => {
    setPreviewers(prev => prev.map(p =>
      p.viewer === viewerName ? { ...p, contextMenuActions: newActions } : p
    ));
  };

  const handleAddAction = () => {
    if (!selectedPreviewer) return;
    const actions = [...(selectedPreviewer.contextMenuActions || []), emptyAction()];
    updatePreviewerActions(selectedViewer, actions);
    setEditingActionIdx(actions.length - 1);
  };

  const handleRemoveAction = (idx) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).filter((_, i) => i !== idx);
    updatePreviewerActions(selectedViewer, actions);
    if (editingActionIdx === idx) setEditingActionIdx(null);
    else if (editingActionIdx > idx) setEditingActionIdx(editingActionIdx - 1);
  };

  const handleUpdateAction = (idx, field, value) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).map((a, i) => {
      if (i !== idx) return a;
      if (field.startsWith('labels.')) {
        const lang = field.split('.')[1];
        return { ...a, labels: { ...a.labels, [lang]: value } };
      }
      if (field.startsWith('condition.')) {
        const condField = field.split('.')[1];
        const cond = a.condition || { type: 'filename', value: '' };
        return { ...a, condition: { ...cond, [condField]: value } };
      }
      return { ...a, [field]: value };
    });
    updatePreviewerActions(selectedViewer, actions);
  };

  const handleAddParam = (actionIdx) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).map((a, i) => {
      if (i !== actionIdx) return a;
      return { ...a, params: [...(a.params || []), { name: '', source: 'filePath' }] };
    });
    updatePreviewerActions(selectedViewer, actions);
  };

  const handleUpdateParam = (actionIdx, paramIdx, field, value) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).map((a, i) => {
      if (i !== actionIdx) return a;
      const params = (a.params || []).map((p, pi) =>
        pi === paramIdx ? { ...p, [field]: value } : p
      );
      return { ...a, params };
    });
    updatePreviewerActions(selectedViewer, actions);
  };

  const handleRemoveParam = (actionIdx, paramIdx) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).map((a, i) => {
      if (i !== actionIdx) return a;
      return { ...a, params: (a.params || []).filter((_, pi) => pi !== paramIdx) };
    });
    updatePreviewerActions(selectedViewer, actions);
  };

  const handleToggleCondition = (actionIdx) => {
    if (!selectedPreviewer) return;
    const actions = (selectedPreviewer.contextMenuActions || []).map((a, i) => {
      if (i !== actionIdx) return a;
      return { ...a, condition: a.condition ? null : { type: 'filename', value: '' } };
    });
    updatePreviewerActions(selectedViewer, actions);
  };

  // ── Add new previewer ──

  const handleAddPreviewer = () => {
    if (!newViewerName.trim()) return;
    const name = newViewerName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (previewers.some(p => p.viewer === name)) {
      setSnackbar({ open: true, message: t('previewersManager.duplicateViewer'), severity: 'warning' });
      return;
    }
    setPreviewers(prev => [...prev, { viewer: name, extensions: [], contextMenuActions: [] }]);
    setSelectedViewer(name);
    setAddDialogOpen(false);
    setNewViewerName('');
  };

  // ── Save ──

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiFetch('/api/previewers/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewers }),
      });

      if (response.ok) {
        setSnackbar({ open: true, message: t('previewersManager.saveSuccess'), severity: 'success' });
        if (onConfigChanged) onConfigChanged();
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      setSnackbar({ open: true, message: t('previewersManager.saveError'), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ──

  const hasComponent = (viewerName) => !!VIEWER_COMPONENTS[viewerName];
  const ucFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  const handleRemovePreviewer = (viewerName) => {
    setPreviewers(prev => prev.filter(p => p.viewer !== viewerName));
    if (selectedViewer === viewerName) {
      setSelectedViewer(null);
      setEditingActionIdx(null);
    }
  };

  const renderActionEditor = (action, idx) => {
    const isEditing = editingActionIdx === idx;

    return (
      <Paper key={action.id || idx} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 1 }}>
        {/* Action summary row */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, cursor: 'pointer' }}
          onClick={() => setEditingActionIdx(isEditing ? null : idx)}
        >
          {action.icon && <i className={action.icon} style={{ fontSize: 16, flexShrink: 0 }} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
              {action.labels?.[i18n.language] || action.labels?.en || t('previewersManager.newAction')}
            </Typography>
            {action.condition && (
              <Typography variant="caption" color="text.secondary">
                {action.condition.type}: {action.condition.value}
              </Typography>
            )}
          </Box>
          <Chip
            label={action.modalComponent === '__preview__' ? 'Preview' : (action.modalComponent || '...')}
            size="small"
            variant="outlined"
          />
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleRemoveAction(idx); }}>
            <TbTrash size={14} />
          </IconButton>
          {isEditing ? <TbChevronUp size={16} /> : <TbChevronDown size={16} />}
        </Box>

        {/* Expanded editor */}
        <Collapse in={isEditing}>
          <Divider />
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Labels */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {t('previewersManager.actionLabels')}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              {SUPPORTED_LANGUAGES.map(lang => (
                <TextField
                  key={lang}
                  size="small"
                  label={lang.toUpperCase()}
                  value={action.labels?.[lang] || ''}
                  onChange={(e) => handleUpdateAction(idx, `labels.${lang}`, e.target.value)}
                />
              ))}
            </Box>

            {/* Icon & Modal Component */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label={t('previewersManager.actionIcon')}
                value={action.icon || ''}
                onChange={(e) => handleUpdateAction(idx, 'icon', e.target.value)}
                placeholder="codicon codicon-notebook"
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label={t('previewersManager.actionModal')}
                value={action.modalComponent || ''}
                onChange={(e) => handleUpdateAction(idx, 'modalComponent', e.target.value)}
                placeholder="OfferGeneratorModal or __preview__"
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Min Role */}
            <FormControl size="small" sx={{ width: 150 }}>
              <InputLabel>{t('previewersManager.actionMinRole')}</InputLabel>
              <Select
                value={action.minRole || ''}
                onChange={(e) => handleUpdateAction(idx, 'minRole', e.target.value)}
                label={t('previewersManager.actionMinRole')}
              >
                <MenuItem value="">({t('previewersManager.noRestriction')})</MenuItem>
                <MenuItem value="user">user</MenuItem>
                <MenuItem value="admin">admin</MenuItem>
              </Select>
            </FormControl>

            {/* Condition */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('previewersManager.actionCondition')}
              </Typography>
              <Button size="small" variant="text" onClick={() => handleToggleCondition(idx)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                {action.condition ? t('previewersManager.removeCondition') : t('previewersManager.addCondition')}
              </Button>
            </Box>
            {action.condition && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ width: 160 }}>
                  <InputLabel>{t('previewersManager.conditionType')}</InputLabel>
                  <Select
                    value={action.condition.type || 'filename'}
                    onChange={(e) => handleUpdateAction(idx, 'condition.type', e.target.value)}
                    label={t('previewersManager.conditionType')}
                  >
                    {CONDITION_TYPES.map(ct => (
                      <MenuItem key={ct} value={ct}>{ct}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label={t('previewersManager.conditionValue')}
                  value={action.condition.value || ''}
                  onChange={(e) => handleUpdateAction(idx, 'condition.value', e.target.value)}
                  placeholder="e.g. inbox"
                  sx={{ flex: 1 }}
                />
              </Box>
            )}

            {/* Params */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('previewersManager.actionParams')}
              </Typography>
              <Button size="small" variant="text" onClick={() => handleAddParam(idx)} startIcon={<TbPlus size={12} />} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                {t('common.add')}
              </Button>
            </Box>
            {(action.params || []).map((param, pi) => (
              <Box key={pi} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small"
                  label={t('previewersManager.paramName')}
                  value={param.name}
                  onChange={(e) => handleUpdateParam(idx, pi, 'name', e.target.value)}
                  placeholder="filePath"
                  sx={{ width: 130 }}
                />
                <TextField
                  size="small"
                  label={t('previewersManager.paramSource')}
                  value={param.source}
                  onChange={(e) => handleUpdateParam(idx, pi, 'source', e.target.value)}
                  placeholder="filePath or template ${fileNameWithoutExt}"
                  sx={{ flex: 1 }}
                />
                <IconButton size="small" onClick={() => handleRemoveParam(idx, pi)}>
                  <TbTrash size={14} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Collapse>
      </Paper>
    );
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 0 }}>
          {t('previewersManager.title')}{selectedItem ? ` — ${ucFirst(selectedItem.name)}` : ''}
        </DialogTitle>
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 1.5, pt: 0.5 }}>
          {t('previewersManager.description')}
        </Typography>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', height: 500 }}>

            {/* ── Left Column: Previewer List ── */}
            <Box sx={{
              width: '35%',
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
              p: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,0,0,0.15) transparent',
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: 'rgba(0,0,0,0.15)', borderRadius: 2 },
            }}>
              {sortedViewers.map(item => {
                const isSelected = selectedViewer === item.id;
                const extCount = item.extensions?.length || 0;
                return (
                  <Paper
                    key={item.id}
                    elevation={isSelected ? 3 : 0}
                    variant={isSelected ? 'elevation' : 'outlined'}
                    onClick={() => { setSelectedViewer(item.id); setEditingActionIdx(null); }}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                      p: 1.25,
                      borderRadius: 2,
                      cursor: 'pointer',
                      flexShrink: 0,
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      color: isSelected ? 'primary.contrastText' : 'text.primary',
                      transition: 'all 0.15s',
                      '&:hover': isSelected ? {} : {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <BsWindow size={18} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.6, marginTop: 2 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ucFirst(item.name)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: isSelected ? 'primary.contrastText' : 'text.secondary', opacity: isSelected ? 0.85 : 1 }}
                      >
                        {item.type === 'service'
                          ? t('previewersManager.serviceViewer')
                          : t('previewersManager.mappedExtensions', { count: extCount })}
                      </Typography>
                    </Box>
                    {!hasComponent(item.id) && (
                      <Tooltip title={t('previewersManager.noComponent')}>
                        <Typography variant="caption" sx={{ color: isSelected ? 'warning.light' : 'warning.main', mt: 0.25 }}>!</Typography>
                      </Tooltip>
                    )}
                  </Paper>
                );
              })}

              {/* Add previewer button */}
              <Paper
                variant="outlined"
                onClick={() => setAddDialogOpen(true)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  p: 1.25,
                  borderRadius: 2,
                  cursor: 'pointer',
                  flexShrink: 0,
                  borderStyle: 'dashed',
                  color: 'text.secondary',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
                }}
              >
                <TbPlus size={16} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {t('previewersManager.addPreviewer')}
                </Typography>
              </Paper>
            </Box>

            {/* ── Right Column: Settings ── */}
            <Box sx={{ width: '65%', px: 2, pb: 2, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              {selectedItem ? (
                <>
                  <Box sx={{ flex: 1 }}>

                  {/* Component name header with remove button */}
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 1.5,
                    py: 1,
                    borderTop: '1px solid',
                    borderBottom: '1px solid',
                    borderColor: 'primary.main',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <GoFileCode size={16} style={{ flexShrink: 0, color: 'inherit', opacity: 0.6 }} />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }} noWrap>
                        /components/<Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{VIEWER_COMPONENT_NAMES[selectedItem.id] || selectedItem.id}</Box>.jsx
                      </Typography>
                    </Box>
                    {selectedItem.type === 'file' && (
                      <Tooltip title={t('previewersManager.removePreviewer')}>
                        <IconButton size="small" color="error" onClick={() => handleRemovePreviewer(selectedViewer)} sx={{ flexShrink: 0 }}>
                          <TbTrash size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>

                  {selectedItem.type === 'file' && (
                    <>
                      {/* Assigned Extensions */}
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('previewersManager.assignedExtensions')}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                        {selectedPreviewer?.extensions?.length > 0 ? (
                          selectedPreviewer.extensions.map(ext => (
                            <Chip
                              key={ext}
                              label={ext}
                              size="small"
                              onDelete={() => handleRemoveExtension(ext)}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {t('previewersManager.noExtensions')}
                          </Typography>
                        )}
                      </Box>

                      {/* Add extension */}
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
                        <TextField
                          size="small"
                          label={t('previewersManager.addExtension')}
                          value={newExtension}
                          onChange={(e) => setNewExtension(e.target.value.toLowerCase())}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddExtension(); }}
                          placeholder=".csv"
                          sx={{ width: 150 }}
                        />
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<TbPlus />}
                          onClick={handleAddExtension}
                          disabled={!newExtension}
                        >
                          {t('common.add')}
                        </Button>
                      </Box>

                      <Divider sx={{ mb: 2 }} />

                      {/* Context Menu Actions */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('previewersManager.contextMenuActions')}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<TbPlus size={14} />}
                          onClick={handleAddAction}
                          sx={{ textTransform: 'none' }}
                        >
                          {t('common.add')}
                        </Button>
                      </Box>

                      {(selectedPreviewer?.contextMenuActions || []).length > 0 ? (
                        <Box sx={{ mb: 2 }}>
                          {(selectedPreviewer.contextMenuActions || []).map((action, idx) =>
                            renderActionEditor(action, idx)
                          )}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {t('previewersManager.noContextActions')}
                        </Typography>
                      )}

                    </>
                  )}

                  {selectedItem.type === 'service' && (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <VscServerProcess size={18} />
                        <Typography variant="body2">
                          {t('previewersManager.serviceViewer')}
                        </Typography>
                      </Box>

                      {/* Functions */}
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('previewersManager.serviceFunctions')}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                        {(selectedItem.functions || []).map(fn => (
                          <Chip
                            key={fn}
                            label={fn}
                            size="small"
                            onDelete={() => {
                              setServicePreviewers(prev => prev.map(sp =>
                                sp.viewerName === selectedItem.id
                                  ? { ...sp, functions: sp.functions.filter(f => f !== fn) }
                                  : sp
                              ));
                            }}
                          />
                        ))}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
                        <TextField
                          size="small"
                          label={t('previewersManager.addFunction')}
                          value={newFunction}
                          onChange={(e) => setNewFunction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newFunction.trim()) {
                              const fn = newFunction.trim().startsWith('/') ? newFunction.trim() : `/${newFunction.trim()}`;
                              setServicePreviewers(prev => prev.map(sp =>
                                sp.viewerName === selectedItem.id && !sp.functions.includes(fn)
                                  ? { ...sp, functions: [...sp.functions, fn] }
                                  : sp
                              ));
                              setNewFunction('');
                            }
                          }}
                          placeholder="/inbox"
                          sx={{ width: 180 }}
                        />
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<TbPlus />}
                          onClick={() => {
                            if (!newFunction.trim()) return;
                            const fn = newFunction.trim().startsWith('/') ? newFunction.trim() : `/${newFunction.trim()}`;
                            setServicePreviewers(prev => prev.map(sp =>
                              sp.viewerName === selectedItem.id && !sp.functions.includes(fn)
                                ? { ...sp, functions: [...sp.functions, fn] }
                                : sp
                            ));
                            setNewFunction('');
                          }}
                          disabled={!newFunction.trim()}
                        >
                          {t('common.add')}
                        </Button>
                      </Box>

                      <Divider sx={{ mb: 2 }} />

                      {/* Required service */}
                      <TextField
                        size="small"
                        label={t('previewersManager.requiresService')}
                        value={selectedItem.requiresService || ''}
                        onChange={(e) => {
                          setServicePreviewers(prev => prev.map(sp =>
                            sp.viewerName === selectedItem.id
                              ? { ...sp, requiresService: e.target.value }
                              : sp
                          ));
                        }}
                        placeholder="e.g. imap-connector"
                        sx={{ mb: 1 }}
                        fullWidth
                      />
                    </>
                  )}

                  </Box>
                  {/* Bottom-pinned: info note + save */}
                  <Box sx={{ mt: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Collapse in={infoVisible}>
                      <Alert severity="info" sx={{ transition: 'opacity 0.5s', opacity: infoVisible ? 1 : 0 }}>
                        {t('previewersManager.systemLevelNote')}
                      </Alert>
                    </Collapse>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? t('common.saving') : t('common.save')}
                      </Button>
                    </Box>
                  </Box>
                </>
              ) : (
                <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
                  {t('previewersManager.selectPreviewer')}
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Add Previewer Dialog ── */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('previewersManager.addPreviewer')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('previewersManager.addPreviewerHint')}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t('previewersManager.componentName')}
            value={newViewerName}
            onChange={(e) => setNewViewerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreviewer(); }}
            placeholder="e.g. csv"
            helperText={newViewerName && !hasComponent(newViewerName.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
              ? t('previewersManager.componentNotRegistered')
              : ' '
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleAddPreviewer} disabled={!newViewerName.trim()}>
            {t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
