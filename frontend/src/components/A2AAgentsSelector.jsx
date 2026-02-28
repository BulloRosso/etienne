import React from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Chip
} from '@mui/material';
import { RiRobot2Line } from 'react-icons/ri';
import { useTranslation } from 'react-i18next';

export default function A2AAgentsSelector({
  registryAgents = [],
  selectedAgents = [],
  onSelectionChange
}) {
  const { t } = useTranslation();
  const isSelected = (agentUrl) =>
    selectedAgents.some(a => a.url === agentUrl);

  const toggleAgent = (agent) => {
    if (isSelected(agent.url)) {
      onSelectionChange(selectedAgents.filter(a => a.url !== agent.url));
    } else {
      onSelectionChange([...selectedAgents, agent]);
    }
  };

  if (registryAgents.length === 0) {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary">
          {t('a2aAgentsSelector.noAgentsAvailable')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('a2aAgentsSelector.description')}
      </Typography>

      <List dense sx={{ bgcolor: '#f5f5f5', borderRadius: 1, color: '#000' }}>
        {registryAgents.map(agent => (
          <ListItem
            key={agent.url}
            onClick={() => toggleAgent(agent)}
            sx={{
              cursor: 'pointer',
              '&:hover': { bgcolor: '#e0e0e0' },
              borderRadius: 1,
              alignItems: 'flex-start'
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, mt: '-3px' }}>
              <Checkbox
                edge="start"
                checked={isSelected(agent.url)}
                tabIndex={-1}
                disableRipple
                sx={{ color: '#000', '&.Mui-checked': { color: '#000' } }}
              />
            </ListItemIcon>
            <ListItemIcon sx={{ minWidth: 36, mt: '5px', color: '#000' }}>
              <RiRobot2Line size={24} />
            </ListItemIcon>
            <ListItemText
              primary={agent.name}
              secondary={
                <Box>
                  <Typography variant="body2" component="span" sx={{ color: 'rgba(0,0,0,0.6)' }}>
                    {agent.description}
                  </Typography>
                  {agent.skills && agent.skills.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {agent.skills.slice(0, 3).map((skill, idx) => (
                        <Chip
                          key={idx}
                          size="small"
                          variant="outlined"
                          label={skill.name || skill}
                          sx={{ fontSize: '0.65rem', height: 20, color: '#000', borderColor: '#000' }}
                        />
                      ))}
                      {agent.skills.length > 3 && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t('a2aAgentsSelector.moreSkills', { count: agent.skills.length - 3 })}
                          sx={{ fontSize: '0.65rem', height: 20, color: '#000', borderColor: '#000' }}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {selectedAgents.length > 0 && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          {t('a2aAgentsSelector.agentsSelected', { count: selectedAgents.length })}
        </Typography>
      )}
    </Box>
  );
}
