import React from 'react';
import {
  Box,
  IconButton,
  Typography,
  Divider,
  Card,
  CardContent,
  Chip,
  Tooltip
} from '@mui/material';
import { Add, RemoveCircleOutline } from '@mui/icons-material';
import { GiAtom } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';

const SkillIcon = ({ skill, size = 28 }) => {
  if (skill?.hasThumbnail) {
    return (
      <img
        src={`/api/skills/catalog/${skill.name}/thumbnail?source=${skill.source}`}
        alt={skill.name}
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }
  return <GiAtom style={{ fontSize: size }} />;
};

export default function SkillsSelector({
  standardSkills = [],
  optionalSkills = [],
  selectedOptionalSkills = [],
  onSelectionChange
}) {
  const { t } = useTranslation();

  const isSelected = (skillName) => selectedOptionalSkills.includes(skillName);

  const toggleOptionalSkill = (skillName) => {
    if (isSelected(skillName)) {
      onSelectionChange(selectedOptionalSkills.filter(s => s !== skillName));
    } else {
      onSelectionChange([...selectedOptionalSkills, skillName]);
    }
  };

  const gridSx = {
    display: 'grid',
    gridTemplateColumns: {
      xs: '1fr',
      sm: 'repeat(2, 1fr)',
      md: 'repeat(3, 1fr)',
      lg: 'repeat(4, 1fr)',
    },
    gap: 1.5,
  };

  const renderSkillCard = (skill, { isConfigured, isStandard }) => {
    return (
      <Tooltip key={skill.name} title={skill.description || ''} arrow placement="top" enterDelay={400}>
        <Card
          variant="outlined"
          sx={{
            position: 'relative',
            minHeight: 90,
            display: 'flex',
            flexDirection: 'column',
            borderColor: isConfigured ? 'primary.main' : '#ccc',
            borderWidth: isConfigured ? 2 : 1,
            bgcolor: isConfigured ? '#e3f2fd' : 'background.paper',
            transition: 'border-color 0.2s, background-color 0.2s',
            '&:hover': { borderColor: 'primary.light', bgcolor: isConfigured ? '#d0e8fc' : 'action.hover' },
          }}
        >
          <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 }, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            {/* Top-right action: add or remove */}
            <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
              {isConfigured && !isStandard && (
                <IconButton
                  size="small"
                  onClick={() => toggleOptionalSkill(skill.name)}
                  sx={{ color: 'error.main', p: 0.25 }}
                >
                  <RemoveCircleOutline sx={{ fontSize: 18 }} />
                </IconButton>
              )}
              {!isConfigured && (
                <IconButton
                  size="small"
                  onClick={() => toggleOptionalSkill(skill.name)}
                  sx={{ color: 'primary.main', p: 0.25 }}
                >
                  <Add sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>

            {/* Centered icon */}
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', mt: 0.5 }}>
              <SkillIcon skill={skill} />
            </Box>

            {/* Skill name + badge */}
            <Typography
              variant="subtitle2"
              sx={{
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.3,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {skill.name.charAt(0).toUpperCase() + skill.name.slice(1)}
            </Typography>
            {isConfigured && isStandard && (
              <Chip size="small" label={t('skillsSelector.standardChip', 'Standard')} sx={{ fontSize: '0.65rem', height: 18, mt: 0.25, bgcolor: '#616161', color: '#fff' }} />
            )}
            {isConfigured && !isStandard && (
              <Chip size="small" label={t('skillsSelector.optionalChip', 'Optional')} color="primary" sx={{ fontSize: '0.65rem', height: 18, mt: 0.25 }} />
            )}
          </CardContent>
        </Card>
      </Tooltip>
    );
  };

  // Build the two groups
  const selectedCards = [
    ...standardSkills.map(skill => ({ skill, isConfigured: true, isStandard: true })),
    ...selectedOptionalSkills.map(skillName => {
      const skill = optionalSkills.find(s => s.name === skillName) || { name: skillName };
      return { skill, isConfigured: true, isStandard: false };
    }),
  ];

  const availableCards = optionalSkills
    .filter(skill => !isSelected(skill.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(skill => ({ skill, isConfigured: false, isStandard: false }));

  return (
    <Box>
      {/* Selected skills (standard + chosen optional) */}
      {selectedCards.length > 0 && (
        <Box sx={{ ...gridSx, mb: availableCards.length > 0 ? 1 : 2 }}>
          {selectedCards.map(({ skill, isConfigured, isStandard }) =>
            renderSkillCard(skill, { isConfigured, isStandard })
          )}
        </Box>
      )}

      {/* Available optional skills */}
      {availableCards.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t('skillsSelector.optionalSkillsTitle')}
          </Typography>
          <Box sx={{ ...gridSx, mb: 2 }}>
            {availableCards.map(({ skill, isConfigured, isStandard }) =>
              renderSkillCard(skill, { isConfigured, isStandard })
            )}
          </Box>
        </>
      )}

      {selectedCards.length === 0 && availableCards.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('skillsSelector.noStandardSkills')}
        </Typography>
      )}
    </Box>
  );
}
