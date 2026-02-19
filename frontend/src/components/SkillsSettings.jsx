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
} from '@mui/material';
import { Close, DeleteOutline, Edit, Save, UploadFile, InsertDriveFileOutlined, InfoOutlined } from '@mui/icons-material';
import { GiAtom } from 'react-icons/gi';
import Editor from '@monaco-editor/react';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function SkillsSettings({ open, onClose, project }) {
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
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
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
        alert(data.message || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
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
        alert(data.message || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
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
        alert(data.message || 'Failed to copy skill');
      }
    } catch (error) {
      console.error('Failed to copy skill:', error);
      alert('Failed to copy skill');
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
          alert(result.error || 'Failed to provision skill');
        } else {
          await loadSkills();
          setSelectedSkill(null);
        }
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to provision skill');
      }
    } catch (error) {
      console.error('Failed to provision skill:', error);
      alert('Failed to provision skill');
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
      alert('Please enter a skill name');
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
        alert(data.message || 'Failed to save skill');
      }
    } catch (error) {
      console.error('Failed to save skill:', error);
      alert('Failed to save skill');
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
            <span>Skills</span>
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
          <Tab label="This Project" />
          <Tab label="Other Projects" />
          <Tab label="Repository" />
        </Tabs>
        <DialogContent sx={{ p: 0 }}>
          {activeTab === 2 ? (
            <List sx={{ minHeight: '300px', maxHeight: '400px', overflow: 'auto' }}>
              {repoLoading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Loading repository skills...
                  </Typography>
                </Box>
              ) : repoSkills.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No skills available in the repository.
                  </Typography>
                </Box>
              ) : (
                <>
                  {repoSkills.filter(s => s.source === 'standard').length > 0 && (
                    <>
                      <Typography variant="overline" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
                        Standard
                      </Typography>
                      {repoSkills.filter(s => s.source === 'standard').map((repoSkill) => {
                        const isAlreadyProvisioned = skills.some(s => s.isFromCurrentProject && s.name === repoSkill.name);
                        const isSelected = selectedSkill && selectedSkill.name === repoSkill.name && selectedSkill._repoSource === repoSkill.source;
                        const isProvisioning = provisioningSkill === repoSkill.name;

                        return (
                          <ListItem
                            key={`repo-${repoSkill.name}`}
                            disablePadding
                            secondaryAction={
                              isSelected && !isAlreadyProvisioned && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => handleProvisionSkill(repoSkill)}
                                  disabled={isProvisioning}
                                >
                                  {isProvisioning ? 'Adding...' : 'Add to project'}
                                </Button>
                              )
                            }
                          >
                            <ListItemButton
                              onClick={() => setSelectedSkill({ name: repoSkill.name, _repoSource: repoSkill.source })}
                              selected={isSelected}
                              disabled={isAlreadyProvisioned}
                            >
                              <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                                <GiAtom style={{ fontSize: '20px' }} />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{repoSkill.name}</span>
                                    {isAlreadyProvisioned && (
                                      <Chip label="Added" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                  </Box>
                                }
                                secondary={repoSkill.description}
                                secondaryTypographyProps={{ fontSize: '0.75rem' }}
                              />
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
                        Optional
                      </Typography>
                      {repoSkills.filter(s => s.source === 'optional').map((repoSkill) => {
                        const isAlreadyProvisioned = skills.some(s => s.isFromCurrentProject && s.name === repoSkill.name);
                        const isSelected = selectedSkill && selectedSkill.name === repoSkill.name && selectedSkill._repoSource === repoSkill.source;
                        const isProvisioning = provisioningSkill === repoSkill.name;

                        return (
                          <ListItem
                            key={`repo-${repoSkill.name}`}
                            disablePadding
                            secondaryAction={
                              isSelected && !isAlreadyProvisioned && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => handleProvisionSkill(repoSkill)}
                                  disabled={isProvisioning}
                                >
                                  {isProvisioning ? 'Adding...' : 'Add to project'}
                                </Button>
                              )
                            }
                          >
                            <ListItemButton
                              onClick={() => setSelectedSkill({ name: repoSkill.name, _repoSource: repoSkill.source })}
                              selected={isSelected}
                              disabled={isAlreadyProvisioned}
                            >
                              <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                                <GiAtom style={{ fontSize: '20px', color: '#e65100' }} />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{repoSkill.name}</span>
                                    {isAlreadyProvisioned && (
                                      <Chip label="Added" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                  </Box>
                                }
                                secondary={repoSkill.description}
                                secondaryTypographyProps={{ fontSize: '0.75rem' }}
                              />
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
                ? 'No skills found. Click "+ Skill" to create one.'
                : 'No skills found in other projects.';

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

                      return (
                        <ListItem
                          key={skillKey}
                          disablePadding
                          secondaryAction={
                            isSelected && (
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                {isFromOtherProject ? (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleCopySkill(skill)}
                                    disabled={loading}
                                  >
                                    Use in this project
                                  </Button>
                                ) : (
                                  <>
                                    <IconButton
                                      edge="end"
                                      onClick={() => handleEditSkill(skill)}
                                      size="small"
                                    >
                                      <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      edge="end"
                                      onClick={() => handleDeleteSkill(skill.name)}
                                      size="small"
                                      sx={{ color: '#c62828' }}
                                    >
                                      <DeleteOutline fontSize="small" />
                                    </IconButton>
                                  </>
                                )}
                              </Box>
                            )
                          }
                        >
                          <ListItemButton
                            onClick={() => handleSkillClick(skill)}
                            selected={isSelected}
                          >
                            <ListItemIcon sx={{ alignSelf: 'flex-start', position: 'relative', left: '12px', mt: '10px' }}>
                              <GiAtom style={{ fontSize: '20px' }} />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <span>{skill.name}</span>
                                </Box>
                              }
                              secondary={skill.description || (isFromOtherProject ? `from ${skill.project}` : null)}
                              secondaryTypographyProps={{ fontSize: '0.75rem' }}
                            />
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
              + Skill
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
              <Typography variant="h6">Skill definition</Typography>
            </Box>
            <IconButton onClick={handleCloseDrawer} size="small">
              <Close />
            </IconButton>
          </Box>

          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              label="Skill name"
              value={skillName}
              onChange={(e) => {
                const value = e.target.value;
                // Only allow lowercase letters, numbers, and hyphens
                if (value === '' || /^[a-z0-9-]*$/.test(value)) {
                  setSkillName(value);
                }
              }}
              disabled={isEditing}
              helperText="Only lowercase letters, numbers, and hyphens"
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
                <Typography variant="subtitle2">Files</Typography>
                <Button
                  size="small"
                  startIcon={<UploadFile />}
                  component="label"
                >
                  Upload
                  <input type="file" hidden onChange={handleUploadFile} />
                </Button>
              </Box>
              {skillFiles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No additional files. Upload files to include them with this skill.
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
                Files can be uploaded after the skill has been created.
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
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
