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
} from '@mui/material';
import { Close, DeleteOutline, Edit, Save } from '@mui/icons-material';
import { GiAtom } from 'react-icons/gi';
import Editor from '@monaco-editor/react';

export default function SkillsSettings({ open, onClose, project }) {
  const [skills, setSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hoveredSkill, setHoveredSkill] = useState(null);

  useEffect(() => {
    if (open && project) {
      loadSkills();
    }
  }, [open, project]);

  const loadSkills = async () => {
    try {
      const response = await fetch(`/api/skills/${project}/all-skills`);
      if (response.ok) {
        const data = await response.json();
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  const handleSkillClick = (skill) => {
    setSelectedSkill(skill);
  };

  const handleNewSkill = () => {
    setSelectedSkill(null);
    setSkillName('');
    setSkillContent('');
    setIsEditing(false);
    setDrawerOpen(true);
  };

  const handleEditSkill = async (skillObj) => {
    const skillName = typeof skillObj === 'string' ? skillObj : skillObj.name;
    const skillProject = typeof skillObj === 'string' ? project : skillObj.project;

    try {
      const response = await fetch(`/api/skills/${skillProject}/${skillName}`);
      if (response.ok) {
        const data = await response.json();
        setSkillName(skillName);
        setSkillContent(data.skill.content);
        setIsEditing(true);
        setDrawerOpen(true);
      }
    } catch (error) {
      console.error('Failed to load skill:', error);
    }
  };

  const handleCopySkill = async (skillObj) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/skills/${project}/copy`, {
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

  const handleDeleteSkill = async (skill) => {
    try {
      const response = await fetch(`/api/skills/${project}/${skill}`, {
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
      const response = await fetch(`/api/skills/${project}`, {
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
        <DialogContent sx={{ p: 0 }}>
          <List sx={{ minHeight: '300px', maxHeight: '400px', overflow: 'auto' }}>
            {skills.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No skills found. Click "+ Skill" to create one.
                </Typography>
              </Box>
            ) : (
              skills.map((skill) => {
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
                    onMouseEnter={() => setHoveredSkill(skill)}
                    onMouseLeave={() => setHoveredSkill(null)}
                  >
                    <ListItemButton
                      onClick={() => handleSkillClick(skill)}
                      selected={isSelected}
                      sx={isFromOtherProject ? { color: 'text.disabled' } : {}}
                    >
                      <ListItemIcon sx={isFromOtherProject ? { color: 'text.disabled' } : {}}>
                        <GiAtom style={{ fontSize: '20px' }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={skill.name}
                        secondary={isFromOtherProject ? `from ${skill.project}` : null}
                        primaryTypographyProps={isFromOtherProject ? { color: 'text.disabled' } : {}}
                        secondaryTypographyProps={{ fontSize: '0.75rem' }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })
            )}
          </List>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', p: 2 }}>
          <Button
            variant="contained"
            startIcon={<GiAtom />}
            onClick={handleNewSkill}
            size="small"
          >
            + Skill
          </Button>
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
            <Typography variant="h6">Skill definition</Typography>
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

          <Box sx={{ flex: 1, borderTop: '1px solid #ddd', overflow: 'hidden' }}>
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={skillContent}
              onChange={(value) => setSkillContent(value || '')}
              theme="light"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
            />
          </Box>

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
