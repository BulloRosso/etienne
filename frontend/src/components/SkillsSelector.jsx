import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { GiAtom } from 'react-icons/gi';

export default function SkillsSelector({
  standardSkills = [],
  optionalSkills = [],
  selectedOptionalSkills = [],
  onSelectionChange
}) {
  const [optionalDialogOpen, setOptionalDialogOpen] = useState(false);

  const isSelected = (skillName) => selectedOptionalSkills.includes(skillName);

  const toggleOptionalSkill = (skillName) => {
    if (isSelected(skillName)) {
      onSelectionChange(selectedOptionalSkills.filter(s => s !== skillName));
    } else {
      onSelectionChange([...selectedOptionalSkills, skillName]);
    }
  };

  const removeOptionalSkill = (skillName) => {
    onSelectionChange(selectedOptionalSkills.filter(s => s !== skillName));
  };

  return (
    <Box>
      {/* Standard Skills Section */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Standard Skills (automatically included)
      </Typography>
      {standardSkills.length > 0 ? (
        <List dense sx={{ bgcolor: '#f5f5f5', borderRadius: 1, mb: 2, color: '#000' }}>
          {standardSkills.map(skill => (
            <ListItem key={skill.name} sx={{ alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 36, mt: '-5px' }}>
                <Checkbox checked disabled sx={{ color: '#000', '&.Mui-checked': { color: '#000' }, '&.Mui-disabled': { color: '#000' } }} />
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 42, mt: '8px', color: '#000' }}>
                <GiAtom />
              </ListItemIcon>
              <ListItemText
                primary={skill.name}
                secondary={skill.description}
                secondaryTypographyProps={{ sx: { color: 'rgba(0,0,0,0.6)' } }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No standard skills available in the repository.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Selected Optional Skills Section */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Optional Skills
      </Typography>
      {selectedOptionalSkills.length > 0 && (
        <List dense sx={{ bgcolor: '#fff3e0', borderRadius: 1, mb: 2 }}>
          {selectedOptionalSkills.map(skillName => {
            const skill = optionalSkills.find(s => s.name === skillName);
            return (
              <ListItem key={skillName} sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 36, mt: '-5px' }}>
                  <Checkbox
                    checked
                    onChange={() => removeOptionalSkill(skillName)}
                  />
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 42, mt: '8px' }}>
                  <GiAtom />
                </ListItemIcon>
                <ListItemText
                  primary={skillName}
                  secondary={skill?.description}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {optionalSkills.length > 0 && (
        <Button
          variant="outlined"
          size="small"
          onClick={() => setOptionalDialogOpen(true)}
        >
          + Choose additional skill
        </Button>
      )}

      {optionalSkills.length === 0 && selectedOptionalSkills.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No optional skills available in the repository.
        </Typography>
      )}

      {/* Optional Skills Selection Dialog */}
      <Dialog
        open={optionalDialogOpen}
        onClose={() => setOptionalDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Choose Optional Skills</DialogTitle>
        <DialogContent>
          {optionalSkills.length > 0 ? (
            <List dense>
              {optionalSkills.map(skill => (
                <ListItem
                  key={skill.name}
                  onClick={() => toggleOptionalSkill(skill.name)}
                  sx={{ cursor: 'pointer', alignItems: 'flex-start' }}
                >
                  <ListItemIcon sx={{ minWidth: 36, mt: '-5px' }}>
                    <Checkbox
                      edge="start"
                      checked={isSelected(skill.name)}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemIcon sx={{ minWidth: 36, mt: '4px' }}>
                    <GiAtom />
                  </ListItemIcon>
                  <ListItemText
                    primary={skill.name}
                    secondary={skill.description}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No optional skills available.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOptionalDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
