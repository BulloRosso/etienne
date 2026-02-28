import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Tabs, Tab, TextField, Button, Paper,
  IconButton, List, ListItem, ListItemText, ListItemSecondaryAction,
  Chip, Menu, MenuItem, CircularProgress, Divider, Select,
  FormControl, InputLabel,
} from '@mui/material';
import {
  Close, DeleteOutline, Save, UploadFile, MoreVert, Add, Remove, Download,
} from '@mui/icons-material';
import { GiAtom } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

export default function SkillCatalog({ open, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [catalogSkills, setCatalogSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Skill detail state
  const [metadata, setMetadata] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  const [skillDescription, setSkillDescription] = useState('');

  // Review requests state
  const [reviewRequests, setReviewRequests] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewMenuAnchor, setReviewMenuAnchor] = useState(null);
  const [reviewMenuTarget, setReviewMenuTarget] = useState(null);

  // Category/tag input
  const [newCategory, setNewCategory] = useState('');
  const [newEnvVarName, setNewEnvVarName] = useState('');

  useEffect(() => {
    if (open) {
      loadCatalog();
      setActiveTab(0);
      setSelectedSkill(null);
    }
  }, [open]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/skills/catalog');
      if (response.ok) {
        const data = await response.json();
        setCatalogSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReviewRequests = async () => {
    setReviewLoading(true);
    try {
      const response = await apiFetch('/api/skills/catalog/review/list');
      if (response.ok) {
        const data = await response.json();
        setReviewRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to load review requests:', error);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleSkillClick = async (skill) => {
    setSelectedSkill(skill);
    setSkillDescription(skill.description || '');

    // Load metadata
    try {
      const metaResp = await apiFetch(`/api/skills/catalog/${skill.name}/metadata?source=${skill.source}`);
      if (metaResp.ok) {
        const metaData = await metaResp.json();
        setMetadata(metaData.metadata || { version: '1.0', categories: [], comments: '', knownIssues: [] });
      } else {
        setMetadata({ version: '1.0', categories: [], comments: '', knownIssues: [] });
      }
    } catch {
      setMetadata({ version: '1.0', categories: [], comments: '', knownIssues: [] });
    }

    // Load dependencies
    try {
      const depsResp = await apiFetch(`/api/skills/catalog/${skill.name}/dependencies?source=${skill.source}`);
      if (depsResp.ok) {
        const depsData = await depsResp.json();
        setDependencies(depsData.dependencies || { binaries: [], envVars: [] });
      } else {
        setDependencies({ binaries: [], envVars: [] });
      }
    } catch {
      setDependencies({ binaries: [], envVars: [] });
    }

    setActiveTab(1);
  };

  const handleSave = async () => {
    if (!selectedSkill) return;
    setSaving(true);
    try {
      await apiFetch(`/api/skills/catalog/${selectedSkill.name}/metadata?source=${selectedSkill.source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      });
      await apiFetch(`/api/skills/catalog/${selectedSkill.name}/dependencies?source=${selectedSkill.source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencies }),
      });
      await loadCatalog();
    } catch (error) {
      console.error('Failed to save:', error);
      alert(t('skillCatalog.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!selectedSkill || !confirm(t('skillCatalog.confirmDelete', { name: selectedSkill.name }))) return;
    try {
      await apiFetch(`/api/skills/catalog/${selectedSkill.name}?source=${selectedSkill.source}`, { method: 'DELETE' });
      setSelectedSkill(null);
      setActiveTab(0);
      await loadCatalog();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert(t('skillCatalog.failedToDeleteSkill'));
    }
  };

  const handleUploadZip = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiFetch(`/api/skills/catalog/upload?source=standard`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        await loadCatalog();
        setActiveTab(0);
        setSelectedSkill(null);
      } else {
        const data = await response.json();
        alert(data.message || t('skillCatalog.failedToUploadSkill'));
      }
    } catch (error) {
      console.error('Failed to upload:', error);
      alert(t('skillCatalog.failedToUploadSkillZip'));
    }
    e.target.value = '';
  };

  const handleAcceptReview = async (id) => {
    try {
      const response = await apiFetch(`/api/skills/catalog/review/${id}/accept`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        alert(t('skillCatalog.acceptedNewVersion', { version: data.newVersion }));
        await loadReviewRequests();
        await loadCatalog();
      } else {
        const data = await response.json();
        alert(data.message || t('skillCatalog.failedToAccept'));
      }
    } catch (error) {
      console.error('Failed to accept review:', error);
    }
    setReviewMenuAnchor(null);
    setReviewMenuTarget(null);
  };

  const handleRejectReview = async (id) => {
    if (!confirm(t('skillCatalog.confirmRejectReview'))) return;
    try {
      await apiFetch(`/api/skills/catalog/review/${id}`, { method: 'DELETE' });
      await loadReviewRequests();
    } catch (error) {
      console.error('Failed to reject review:', error);
    }
    setReviewMenuAnchor(null);
    setReviewMenuTarget(null);
  };

  const handleDownloadReview = async (req) => {
    try {
      const response = await apiFetch(`/api/skills/catalog/review/${req.id}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = req.fileName || `${req.id}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download review zip:', error);
    }
  };

  // Metadata helpers
  const addCategory = () => {
    if (!newCategory.trim() || !metadata) return;
    setMetadata({ ...metadata, categories: [...(metadata.categories || []), newCategory.trim()] });
    setNewCategory('');
  };

  const removeCategory = (idx) => {
    if (!metadata) return;
    const cats = [...(metadata.categories || [])];
    cats.splice(idx, 1);
    setMetadata({ ...metadata, categories: cats });
  };

  const addKnownIssue = () => {
    if (!metadata) return;
    setMetadata({
      ...metadata,
      knownIssues: [...(metadata.knownIssues || []), { description: '', ticketId: '' }],
    });
  };

  const updateKnownIssue = (idx, field, value) => {
    if (!metadata) return;
    const issues = [...(metadata.knownIssues || [])];
    issues[idx] = { ...issues[idx], [field]: value };
    setMetadata({ ...metadata, knownIssues: issues });
  };

  const removeKnownIssue = (idx) => {
    if (!metadata) return;
    const issues = [...(metadata.knownIssues || [])];
    issues.splice(idx, 1);
    setMetadata({ ...metadata, knownIssues: issues });
  };

  // Dependencies helpers
  const addBinary = () => {
    if (!dependencies) return;
    setDependencies({
      ...dependencies,
      binaries: [...(dependencies.binaries || []), { name: '', packageManager: 'npm' }],
    });
  };

  const updateBinary = (idx, field, value) => {
    if (!dependencies) return;
    const bins = [...(dependencies.binaries || [])];
    bins[idx] = { ...bins[idx], [field]: value };
    setDependencies({ ...dependencies, binaries: bins });
  };

  const removeBinary = (idx) => {
    if (!dependencies) return;
    const bins = [...(dependencies.binaries || [])];
    bins.splice(idx, 1);
    setDependencies({ ...dependencies, binaries: bins });
  };

  const addEnvVar = () => {
    if (!dependencies) return;
    setDependencies({
      ...dependencies,
      envVars: [...(dependencies.envVars || []), { name: '', description: '', exampleFormat: '' }],
    });
  };

  const updateEnvVar = (idx, field, value) => {
    if (!dependencies) return;
    const vars = [...(dependencies.envVars || [])];
    vars[idx] = { ...vars[idx], [field]: value };
    setDependencies({ ...dependencies, envVars: vars });
  };

  const removeEnvVar = (idx) => {
    if (!dependencies) return;
    const vars = [...(dependencies.envVars || [])];
    vars.splice(idx, 1);
    setDependencies({ ...dependencies, envVars: vars });
  };

  const filteredSkills = catalogSkills.filter(s =>
    s.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const SkillThumbnail = ({ skill, size = 50 }) => {
    if (skill.hasThumbnail) {
      return (
        <img
          src={`/api/skills/catalog/${skill.name}/thumbnail?source=${skill.source}`}
          alt={skill.name}
          style={{ width: size, height: size, objectFit: 'contain' }}
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      );
    }
    return <GiAtom style={{ fontSize: size * 0.6 }} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { height: '80vh' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GiAtom style={{ fontSize: '24px' }} />
          <span>{t('skillCatalog.dialogTitle')}</span>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={activeTab}
        onChange={(e, v) => {
          setActiveTab(v);
          if (v === 0) setSelectedSkill(null);
          if (v === 2) loadReviewRequests();
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab label={t('skillCatalog.tabCatalog')} />
        <Tab label={t('skillCatalog.tabSkill')} disabled={!selectedSkill} />
        <Tab label={t('skillCatalog.tabReview')} />
      </Tabs>

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        {/* Tab 0: Catalog */}
        {activeTab === 0 && (
          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={t('skillCatalog.filterPlaceholder')}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              sx={{ mb: 2 }}
            />
            {loading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : filteredSkills.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                {t('skillCatalog.noSkillsFound')}
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 2 }}>
                {filteredSkills.map((skill) => (
                  <Paper
                    key={`${skill.source}-${skill.name}`}
                    elevation={2}
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', p: 2, cursor: 'pointer',
                      transition: 'all 0.2s', minHeight: '100px',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 },
                    }}
                    onClick={() => handleSkillClick(skill)}
                  >
                    <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 50, height: 50 }}>
                      <SkillThumbnail skill={skill} size={50} />
                    </Box>
                    <Typography variant="caption" align="center" sx={{ fontWeight: 500, fontSize: '0.75rem', wordBreak: 'break-word' }}>
                      {skill.name}
                    </Typography>
                    {skill.source === 'optional' && (
                      <Chip label={t('skillCatalog.optional')} size="small" sx={{ mt: 0.5, height: 16, fontSize: '0.6rem' }} />
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Tab 1: Skill Detail */}
        {activeTab === 1 && selectedSkill && (
          <Box sx={{ p: 2, overflow: 'auto' }}>
            {/* Title & description */}
            <Typography variant="h6" sx={{ mb: 0.5 }}>{selectedSkill.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {skillDescription || t('skillCatalog.noDescription')}
            </Typography>
            <Chip label={selectedSkill.source} size="small" sx={{ mb: 2 }} />

            <Divider sx={{ my: 2 }} />

            {/* Metadata */}
            {metadata && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('skillCatalog.metadataTitle')}</Typography>

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label={t('skillCatalog.creatorNameLabel')} size="small" sx={{ flex: 1 }}
                    value={metadata.creator?.name || ''}
                    onChange={(e) => setMetadata({ ...metadata, creator: { ...metadata.creator, name: e.target.value } })}
                  />
                  <TextField
                    label={t('skillCatalog.creatorEmailLabel')} size="small" sx={{ flex: 1 }}
                    value={metadata.creator?.email || ''}
                    onChange={(e) => setMetadata({ ...metadata, creator: { ...metadata.creator, email: e.target.value } })}
                  />
                </Box>

                <TextField
                  label={t('skillCatalog.versionLabel')} size="small" value={metadata.version || '1.0'}
                  disabled fullWidth sx={{ mb: 2 }}
                />

                {/* Categories */}
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>{t('skillCatalog.categoriesLabel')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {(metadata.categories || []).map((cat, idx) => (
                    <Chip key={idx} label={cat} size="small" onDelete={() => removeCategory(idx)} />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    size="small" placeholder={t('skillCatalog.addCategoryPlaceholder')} value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  />
                  <Button size="small" onClick={addCategory} variant="outlined">{t('common.add')}</Button>
                </Box>

                {/* Comments */}
                <TextField
                  label={t('skillCatalog.commentsLabel')} size="small" fullWidth multiline rows={2}
                  value={metadata.comments || ''}
                  onChange={(e) => setMetadata({ ...metadata, comments: e.target.value })}
                  sx={{ mb: 2 }}
                />

                {/* Known Issues */}
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>{t('skillCatalog.knownIssuesLabel')}</Typography>
                {(metadata.knownIssues || []).map((issue, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      size="small" placeholder={t('skillCatalog.descriptionPlaceholder')} sx={{ flex: 2 }}
                      value={issue.description}
                      onChange={(e) => updateKnownIssue(idx, 'description', e.target.value)}
                    />
                    <TextField
                      size="small" placeholder={t('skillCatalog.ticketIdPlaceholder')} sx={{ flex: 1 }}
                      value={issue.ticketId || ''}
                      onChange={(e) => updateKnownIssue(idx, 'ticketId', e.target.value)}
                    />
                    <IconButton size="small" onClick={() => removeKnownIssue(idx)} sx={{ color: '#c62828' }}>
                      <Remove fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<Add />} onClick={addKnownIssue} sx={{ mb: 2 }}>
                  {t('skillCatalog.addIssue')}
                </Button>
              </>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Dependencies */}
            {dependencies && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('skillCatalog.dependenciesTitle')}</Typography>

                {/* Binaries */}
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>{t('skillCatalog.requiredPackages')}</Typography>
                {(dependencies.binaries || []).map((bin, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      size="small" placeholder={t('skillCatalog.packageNamePlaceholder')} sx={{ flex: 2 }}
                      value={bin.name}
                      onChange={(e) => updateBinary(idx, 'name', e.target.value)}
                    />
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <Select
                        value={bin.packageManager}
                        onChange={(e) => updateBinary(idx, 'packageManager', e.target.value)}
                      >
                        <MenuItem value="npm">npm</MenuItem>
                        <MenuItem value="pypi">pypi</MenuItem>
                      </Select>
                    </FormControl>
                    <IconButton size="small" onClick={() => removeBinary(idx)} sx={{ color: '#c62828' }}>
                      <Remove fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<Add />} onClick={addBinary} sx={{ mb: 2 }}>
                  {t('skillCatalog.addPackage')}
                </Button>

                {/* Env vars */}
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>{t('skillCatalog.requiredEnvVars')}</Typography>
                {(dependencies.envVars || []).map((ev, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      size="small" placeholder={t('skillCatalog.varNamePlaceholder')} sx={{ flex: 1 }}
                      value={ev.name}
                      onChange={(e) => updateEnvVar(idx, 'name', e.target.value)}
                    />
                    <TextField
                      size="small" placeholder={t('skillCatalog.descriptionPlaceholder')} sx={{ flex: 1.5 }}
                      value={ev.description}
                      onChange={(e) => updateEnvVar(idx, 'description', e.target.value)}
                    />
                    <TextField
                      size="small" placeholder={t('skillCatalog.examplePlaceholder')} sx={{ flex: 1 }}
                      value={ev.exampleFormat || ''}
                      onChange={(e) => updateEnvVar(idx, 'exampleFormat', e.target.value)}
                    />
                    <IconButton size="small" onClick={() => removeEnvVar(idx)} sx={{ color: '#c62828' }}>
                      <Remove fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<Add />} onClick={addEnvVar}>
                  {t('skillCatalog.addEnvVar')}
                </Button>
              </>
            )}
          </Box>
        )}

        {/* Tab 2: Requests for Review */}
        {activeTab === 2 && (
          <Box sx={{ p: 2 }}>
            {reviewLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : reviewRequests.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                {t('skillCatalog.noPendingReviews')}
              </Typography>
            ) : (
              <List>
                {reviewRequests.map((req) => (
                  <ListItem
                    key={req.id}
                    divider
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => handleDownloadReview(req)}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Download fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="body1" fontWeight={500}>{req.skillName}</Typography>
                          <Chip label={req.fileName} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        </Box>
                      }
                      secondary={t('skillCatalog.submittedBy', { submittedBy: req.submittedBy, date: new Date(req.submittedAt).toLocaleDateString(), time: new Date(req.submittedAt).toLocaleTimeString() })}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewMenuAnchor(e.currentTarget);
                          setReviewMenuTarget(req);
                        }}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
            <Menu
              anchorEl={reviewMenuAnchor}
              open={Boolean(reviewMenuAnchor)}
              onClose={() => { setReviewMenuAnchor(null); setReviewMenuTarget(null); }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => reviewMenuTarget && handleRejectReview(reviewMenuTarget.id)}>
                {t('skillCatalog.rejectDelete')}
              </MenuItem>
              <MenuItem onClick={() => reviewMenuTarget && handleAcceptReview(reviewMenuTarget.id)}>
                {t('skillCatalog.acceptNewVersion')}
              </MenuItem>
            </Menu>
          </Box>
        )}
      </DialogContent>

      {/* Bottom action buttons */}
      {activeTab === 1 && selectedSkill && (
        <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutline />}
            onClick={handleDeleteSkill}
            size="small"
          >
            {t('skillCatalog.deleteSkill')}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              component="label"
              size="small"
            >
              {t('skillCatalog.uploadZip')}
              <input type="file" hidden accept=".zip" onChange={handleUploadZip} />
            </Button>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              disabled={saving}
              size="small"
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </Box>
        </DialogActions>
      )}

      {activeTab === 0 && (
        <DialogActions sx={{ justifyContent: 'flex-end', p: 2 }}>
          <Button
            variant="outlined"
            startIcon={<UploadFile />}
            component="label"
            size="small"
          >
            {t('skillCatalog.uploadNewSkillZip')}
            <input type="file" hidden accept=".zip" onChange={handleUploadZip} />
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
