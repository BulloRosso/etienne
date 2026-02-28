import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Drawer,
  TextField,
  Typography,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import { Close, DeleteOutline, Edit, Save, UploadFile, InsertDriveFileOutlined, InfoOutlined, MoreVert } from '@mui/icons-material';
import { Menu, MenuItem } from '@mui/material';
import { GiAtom } from 'react-icons/gi';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function SkillsSettings({ open, onClose, project }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [skills, setSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hoveredSkill, setHoveredSkill] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [skillFiles, setSkillFiles] = useState([]);
  const [repoSkills, setRepoSkills] = useState([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [provisioningSkill, setProvisioningSkill] = useState(null);
  const [modificationStatus, setModificationStatus] = useState({});
  const [modMenuAnchor, setModMenuAnchor] = useState(null);
  const [modMenuSkill, setModMenuSkill] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  useEffect(() => {
    if (open && project) {
      loadSkills();
    }
  }, [open, project]);

  useEffect(() => {
    if (!open) {
      setActiveTab(0);
      setRepoSkills([]);
      setSelectedSkill(null);
    }
  }, [open]);

  const loadSkills = async () => {
    try {
      const response = await apiFetch(`/api/skills/${project}/all-skills`);
      if (response.ok) {
        const data = await response.json();
        const loadedSkills = data.skills || [];
        setSkills(loadedSkills);
        // Check modifications for current project skills
        checkModifications(loadedSkills.filter(s => s.isFromCurrentProject));
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  const checkModifications = async (projectSkills) => {
    const results = {};
    for (const skill of projectSkills) {
      try {
        const resp = await apiFetch(`/api/skills/${project}/${skill.name}/detect-modifications`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.status && data.status !== 'current') {
            results[skill.name] = data;
          }
        }
      } catch { /* ignore */ }
    }
    setModificationStatus(results);
  };

  const handleUpdateFromRepo = async (skillName) => {
    try {
      const resp = await apiFetch(`/api/skills/${project}/${skillName}/update-from-repo`, { method: 'POST' });
      if (resp.ok) {
        await loadSkills();
      } else {
        const data = await resp.json();
        showToast(data.message || t('skills.failedToUpdateFromRepo'), 'error');
      }
    } catch (error) {
      console.error('Failed to update from repo:', error);
      showToast(t('skills.failedToUpdateFromRepo'), 'error');
    }
    setModMenuAnchor(null);
    setModMenuSkill(null);
  };

  const handleSendForReview = async (skillName) => {
    try {
      const resp = await apiFetch(`/api/skills/${project}/${skillName}/submit-for-review`, { method: 'POST' });
      if (resp.ok) {
        showToast(t('skills.submittedForReview'));
      } else {
        const data = await resp.json();
        showToast(data.message || t('skills.failedToSubmitForReview'), 'error');
      }
    } catch (error) {
      console.error('Failed to submit for review:', error);
      showToast(t('skills.failedToSubmitForReview'), 'error');
    }
    setModMenuAnchor(null);
    setModMenuSkill(null);
  };

  const loadRepoSkills = async () => {
    setRepoLoading(true);
    try {
      const response = await apiFetch('/api/skills/repository/list?includeOptional=true');
      if (response.ok) {
        const data = await response.json();
        setRepoSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load repository skills:', error);
    } finally {
      setRepoLoading(false);
    }
  };

  const loadSkillFiles = async (skillName) => {
    try {
      const response = await apiFetch(`/api/skills/${project}/${skillName}/files`);
      if (response.ok) {
        const data = await response.json();
        setSkillFiles(data.files || []);
      }
    } catch (error) {
      console.error('Failed to load skill files:', error);
      setSkillFiles([]);
    }
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !skillName) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiFetch(`/api/skills/${project}/${skillName}/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await loadSkillFiles(skillName);
      } else {
        const data = await response.json();
        showToast(data.message || t('skills.failedToUploadFile'), 'error');
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      showToast(t('skills.failedToUploadFile'), 'error');
    }

    // Reset file input
    e.target.value = '';
  };

  const handleDeleteFile = async (fileName) => {
    try {
      const response = await apiFetch(`/api/skills/${project}/${skillName}/files/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadSkillFiles(skillName);
      } else {
        const data = await response.json();
        showToast(data.message || t('skills.failedToDeleteFile'), 'error');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      showToast(t('skills.failedToDeleteFile'), 'error');
    }
  };

  const handleSkillClick = (skill) => {
    setSelectedSkill(skill);
  };

  const SKILL_PLACEHOLDER = `---
name: skill-name
description: A description of what this skill does and when to use it.
---

# Skill Name

## Instructions
When this skill is activated, follow these guidelines:

1. **Context**: Describe the context in which this skill applies
2. **Behavior**: Define the expected behavior and approach
3. **Output Format**: Specify the desired output format

## Examples

### Example Input
Provide a sample input or trigger for this skill.

### Example Output
Show what the expected output should look like.

## Constraints
- List any limitations or boundaries
- Define what this skill should NOT do
- Specify any required tools or dependencies
`;

  const handleNewSkill = () => {
    setSelectedSkill(null);
    setSkillName('');
    setSkillContent(SKILL_PLACEHOLDER);
    setIsEditing(false);
    setDrawerOpen(true);
  };

  const handleEditSkill = async (skillObj) => {
    const skillName = typeof skillObj === 'string' ? skillObj : skillObj.name;
    const skillProject = typeof skillObj === 'string' ? project : skillObj.project;

    try {
      const response = await apiFetch(`/api/skills/${skillProject}/${skillName}`);
      if (response.ok) {
        const data = await response.json();
        setSkillName(skillName);
        setSkillContent(data.skill.content);
        setIsEditing(true);
        setDrawerOpen(true);
        await loadSkillFiles(skillName);
      }
    } catch (error) {
      console.error('Failed to load skill:', error);
    }
  };

  const handleCopySkill = async (skillObj) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/skills/${project}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromProject: skillObj.project,
          skillName: skillObj.name,
        }),
      });

      if (response.ok) {
        await loadSkills();
        setSelectedSkill(null);
      } else {
        const data = await response.json();
        showToast(data.message || t('skills.failedToCopySkill'), 'error');
      }
    } catch (error) {
      console.error('Failed to copy skill:', error);
      showToast(t('skills.failedToCopySkill'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionSkill = async (repoSkill) => {
    setProvisioningSkill(repoSkill.name);
    try {
      const response = await apiFetch(`/api/skills/${project}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillNames: [repoSkill.name],
          source: repoSkill.source,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.results?.[0];
        if (result && !result.success) {
          showToast(result.error || t('skills.failedToProvisionSkill'), 'error');
        } else {
          await loadSkills();
          setSelectedSkill(null);
        }
      } else {
        const data = await response.json();
        showToast(data.message || t('skills.failedToProvisionSkill'), 'error');
      }
    } catch (error) {
      console.error('Failed to provision skill:', error);
      showToast(t('skills.failedToProvisionSkill'), 'error');
    } finally {
      setProvisioningSkill(null);
    }
  };

  const handleDeleteSkill = async (skill) => {
    try {
      const response = await apiFetch(`/api/skills/${project}/${skill}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadSkills();
        setSelectedSkill(null);
      } else {
        console.error('Failed to delete skill');
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  const handleSaveSkill = async () => {
    if (!skillName.trim()) {
      showToast(t('skills.pleaseEnterSkillName'), 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/api/skills/${project}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillName: skillName.trim(),
          content: skillContent,
        }),
      });

      if (response.ok) {
        await loadSkills();
        setDrawerOpen(false);
        setSkillName('');
        setSkillContent('');
        setSelectedSkill(null);
      } else {
        const data = await response.json();
        showToast(data.message || t('skills.failedToSaveSkill'), 'error');
      }
    } catch (error) {
      console.error('Failed to save skill:', error);
      showToast(t('skills.failedToSaveSkill'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSkillName('');
    setSkillContent('');
    setSelectedSkill(null);
    setSkillFiles([]);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GiAtom style={{ fontSize: '24px' }} />
            <span>{t('skills.dialogTitle')}</span>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={activeTab}
          onChange={(e, v) => {
            setActiveTab(v);
            setSelectedSkill(null);
            if (v === 2 && repoSkills.length === 0) {
              loadRepoSkills();
            }
          }}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label={t('skills.tabThisProject')} />
          <Tab label={t('skills.tabOtherProjects')} />
          <Tab label={t('skills.tabRepository')} />
        </Tabs>
        <DialogContent sx={{ p: 0 }}>
          {activeTab === 2 ? (
            <List sx={{ minHeight: '300px', maxHeight: '400px', overflow: 'auto' }}>
              {repoLoading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('skills.loadingRepository')}
                  </Typography>
                </Box>
              ) : repoSkills.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('skills.noRepoSkills')}
                  </Typography>
                </Box>
              ) : (
                <>
                  {repoSkills.filter(s => s.source === 'standard').length > 0 && (
                    <>
                      <Typography variant="overline" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
                        {t('skills.sectionStandard')}
                      </Typography>
                      {repoSkills.filter(s => s.source === 'standard').map((repoSkill) => {
                        const isAlreadyProvisioned = skills.some(s => s.isFromCurrentProject && s.name === repoSkill.name);
                        const isSelected = selectedSkill && selectedSkill.name === repoSkill.name && selectedSkill._repoSource === repoSkill.source;
                        const isProvisioning = provisioningSkill === repoSkill.name;

                        return (
                          <ListItem
                            key={`repo-${repoSkill.name}`}
                            disablePadding
                          >
                            <ListItemButton
                              onClick={() => setSelectedSkill({ name: repoSkill.name, _repoSource: repoSkill.source })}
                              selected={isSelected}
                              disabled={isAlreadyProvisioned}
                            >
                              <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                                {repoSkill.hasThumbnail ? (
                                  <img
                                    src={`/api/skills/catalog/${repoSkill.name}/thumbnail?source=${repoSkill.source}`}
                                    alt={repoSkill.name}
                                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <GiAtom style={{ fontSize: '20px' }} />
                                )}
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{repoSkill.name}</span>
                                    {isAlreadyProvisioned && (
                                      <Chip label={t('skills.added')} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                  </Box>
                                }
                                secondary={repoSkill.description}
                                secondaryTypographyProps={{ fontSize: '0.75rem' }}
                              />
                              {isSelected && !isAlreadyProvisioned && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleProvisionSkill(repoSkill); }}
                                  disabled={isProvisioning}
                                  sx={{ ml: 1, flexShrink: 0 }}
                                >
                                  {isProvisioning ? t('skills.adding') : t('skills.addToProject')}
                                </Button>
                              )}
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </>
                  )}

                  {repoSkills.filter(s => s.source === 'standard').length > 0 &&
                   repoSkills.filter(s => s.source === 'optional').length > 0 && (
                    <Divider sx={{ my: 1 }} />
                  )}

                  {repoSkills.filter(s => s.source === 'optional').length > 0 && (
                    <>
                      <Typography variant="overline" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
                        {t('skills.sectionOptional')}
                      </Typography>
                      {repoSkills.filter(s => s.source === 'optional').map((repoSkill) => {
                        const isAlreadyProvisioned = skills.some(s => s.isFromCurrentProject && s.name === repoSkill.name);
                        const isSelected = selectedSkill && selectedSkill.name === repoSkill.name && selectedSkill._repoSource === repoSkill.source;
                        const isProvisioning = provisioningSkill === repoSkill.name;

                        return (
                          <ListItem
                            key={`repo-${repoSkill.name}`}
                            disablePadding
                          >
                            <ListItemButton
                              onClick={() => setSelectedSkill({ name: repoSkill.name, _repoSource: repoSkill.source })}
                              selected={isSelected}
                              disabled={isAlreadyProvisioned}
                            >
                              <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                                {repoSkill.hasThumbnail ? (
                                  <img
                                    src={`/api/skills/catalog/${repoSkill.name}/thumbnail?source=${repoSkill.source}`}
                                    alt={repoSkill.name}
                                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <GiAtom style={{ fontSize: '20px', color: '#e65100' }} />
                                )}
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{repoSkill.name}</span>
                                    {isAlreadyProvisioned && (
                                      <Chip label={t('skills.added')} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                  </Box>
                                }
                                secondary={repoSkill.description}
                                secondaryTypographyProps={{ fontSize: '0.75rem' }}
                              />
                              {isSelected && !isAlreadyProvisioned && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleProvisionSkill(repoSkill); }}
                                  disabled={isProvisioning}
                                  sx={{ ml: 1, flexShrink: 0 }}
                                >
                                  {isProvisioning ? t('skills.adding') : t('skills.addToProject')}
                                </Button>
                              )}
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </List>
          ) : (
            (() => {
              const filteredSkills = activeTab === 0
                ? skills.filter(s => s.isFromCurrentProject)
                : skills.filter(s => !s.isFromCurrentProject);
              const emptyMessage = activeTab === 0
                ? t('skills.noSkillsCreate')
                : t('skills.noSkillsOtherProjects');

              return (
                <List sx={{ minHeight: '300px', maxHeight: '400px', overflow: 'auto' }}>
                  {filteredSkills.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        {emptyMessage}
                      </Typography>
                    </Box>
                  ) : (
                    filteredSkills.map((skill) => {
                      const isFromOtherProject = !skill.isFromCurrentProject;
                      const skillKey = `${skill.project}-${skill.name}`;
                      const isSelected = selectedSkill && selectedSkill.name === skill.name && selectedSkill.project === skill.project;

                      const modStatus = modificationStatus[skill.name];

                      return (
                        <ListItem
                          key={skillKey}
                          disablePadding
                        >
                          <ListItemButton
                            onClick={() => handleSkillClick(skill)}
                            selected={isSelected}
                          >
                            <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                              {skill.hasThumbnail ? (
                                <img
                                  src={`/api/skills/${skill.project}/${skill.name}/thumbnail`}
                                  alt={skill.name}
                                  style={{ width: 24, height: 24, objectFit: 'contain' }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <GiAtom style={{ fontSize: '20px' }} />
                              )}
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <span>{skill.name}</span>
                                  {modStatus?.status === 'updated' && (
                                    <Chip label={t('skills.updateAvailable')} size="small" sx={{ bgcolor: '#ff9800', color: '#fff', height: 20, fontSize: '0.7rem' }} />
                                  )}
                                  {modStatus?.status === 'refined' && (
                                    <Chip label={t('skills.modified')} size="small" sx={{ bgcolor: '#ff9800', color: '#fff', height: 20, fontSize: '0.7rem' }} />
                                  )}
                                </Box>
                              }
                              secondary={skill.description || (isFromOtherProject ? t('skills.fromProject', { project: skill.project }) : null)}
                              secondaryTypographyProps={{ fontSize: '0.75rem' }}
                            />
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', flexShrink: 0, ml: 1 }}>
                              {modStatus && (
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModMenuAnchor(e.currentTarget);
                                    setModMenuSkill(skill.name);
                                  }}
                                >
                                  <MoreVert fontSize="small" />
                                </IconButton>
                              )}
                              {isSelected && (
                                <>
                                  {isFromOtherProject ? (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); handleCopySkill(skill); }}
                                      disabled={loading}
                                    >
                                      {t('skills.useInThisProject')}
                                    </Button>
                                  ) : (
                                    <>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); handleEditSkill(skill); }}
                                      >
                                        <Edit fontSize="small" />
                                      </IconButton>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSkill(skill.name); }}
                                        sx={{ color: '#c62828' }}
                                      >
                                        <DeleteOutline fontSize="small" />
                                      </IconButton>
                                    </>
                                  )}
                                </>
                              )}
                            </Box>
                          </ListItemButton>
                        </ListItem>
                      );
                    })
                  )}
                </List>
              );
            })()
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', p: 2 }}>
          {activeTab === 0 && (
            <Button
              variant="contained"
              startIcon={<GiAtom />}
              onClick={handleNewSkill}
              size="small"
            >
              {t('skills.newSkillButton')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleCloseDrawer}
        sx={{ zIndex: 1400 }}
        PaperProps={{
          sx: { width: '80%' },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              borderBottom: '1px solid #ddd',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GiAtom style={{ fontSize: '24px' }} />
              <Typography variant="h6">{t('skills.drawerTitle')}</Typography>
            </Box>
            <IconButton onClick={handleCloseDrawer} size="small">
              <Close />
            </IconButton>
          </Box>

          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              label={t('skills.skillNameLabel')}
              value={skillName}
              onChange={(e) => {
                const value = e.target.value;
                // Only allow lowercase letters, numbers, and hyphens
                if (value === '' || /^[a-z0-9-]*$/.test(value)) {
                  setSkillName(value);
                }
              }}
              disabled={isEditing}
              helperText={t('skills.skillNameHelper')}
              size="small"
              sx={{ mb: 2 }}
            />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, borderTop: '1px solid #ddd', overflow: 'hidden' }}>
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={skillContent}
              onChange={(value) => setSkillContent(value || '')}
              theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
            />
          </Box>

          {isEditing && (
            <Box sx={{ borderTop: '1px solid #ddd', p: 2, flexShrink: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">{t('skills.filesSection')}</Typography>
                <Button
                  size="small"
                  startIcon={<UploadFile />}
                  component="label"
                >
                  {t('common.upload')}
                  <input type="file" hidden onChange={handleUploadFile} />
                </Button>
              </Box>
              {skillFiles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('skills.noAdditionalFiles')}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {skillFiles.map((fileName) => (
                    <ListItem
                      key={fileName}
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDeleteFile(fileName)}
                          sx={{ color: '#c62828' }}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <InsertDriveFileOutlined fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={fileName}
                        primaryTypographyProps={{ fontSize: '0.85rem' }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}

          {!isEditing && (
            <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {t('skills.filesUploadHint')}
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              p: 2,
              borderTop: '1px solid #ddd',
            }}
          >
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSaveSkill}
              disabled={loading}
            >
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Context menu for updated/modified skills */}
      <Menu
        anchorEl={modMenuAnchor}
        open={Boolean(modMenuAnchor)}
        onClose={() => { setModMenuAnchor(null); setModMenuSkill(null); }}
      >
        <MenuItem onClick={() => modMenuSkill && handleUpdateFromRepo(modMenuSkill)}>
          {t('skills.updateFromRepository')}
        </MenuItem>
        <MenuItem onClick={() => modMenuSkill && handleSendForReview(modMenuSkill)}>
          {t('skills.sendForReview')}
        </MenuItem>
      </Menu>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
