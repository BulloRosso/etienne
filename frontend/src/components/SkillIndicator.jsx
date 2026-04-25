import React, { useState, useEffect } from 'react';
import { Box, Tooltip, Menu, MenuItem, Typography, Divider } from '@mui/material';
import { GiAtom } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUxMode } from '../contexts/UxModeContext.jsx';
import SkillsSettings from './SkillsSettings';
import { LiaHatCowboySideSolid } from 'react-icons/lia';
import DonClippoModal from './DonClippoModal';

export default function SkillIndicator({ projectName, sessionId }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { isMinimalistic } = useUxMode();
  const [skills, setSkills] = useState([]);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [donClippoOpen, setDonClippoOpen] = useState(false);

  // Hide for admin role
  const isAdmin = hasRole('admin');

  useEffect(() => {
    if (projectName && !isAdmin) {
      loadSkills();
    }
  }, [projectName, isAdmin]);

  const loadSkills = async () => {
    try {
      const response = await apiAxios.get(`/api/skills/${encodeURIComponent(projectName)}`);
      setSkills(response.data.skills || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setSkills([]);
    }
  };

  // Don't render for admin role
  if (isAdmin) {
    return null;
  }

  const skillCount = skills.length;

  // Don't render if no skills
  if (skillCount === 0) {
    return null;
  }

  return (
    <>
      <Tooltip title={t('skillIndicator.tooltip')}>
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            fontSize: '0.75rem',
            mr: 1,
            '&:hover': { opacity: 0.8 }
          }}
        >
          <Box component="span" sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            bgcolor: isMinimalistic ? 'transparent' : '#ff9800',
            color: isMinimalistic ? '#ff9800' : '#ffffff',
            border: isMinimalistic ? '1px solid #ff9800' : 'none',
            boxShadow: isMinimalistic ? '0 0 0 0.5px rgba(255,152,0,0.4)' : 'none',
            borderRadius: '50%',
            fontWeight: 600,
            fontSize: '0.7rem'
          }}>
            {skillCount}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>{t('skillIndicator.label')}</Box>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {skills.map(skill => (
          <MenuItem key={skill} onClick={() => { setAnchorEl(null); setSkillsModalOpen(true); }}>
            <GiAtom style={{ fontSize: 16, marginRight: 8, color: '#ff9800' }} />
            <Typography variant="body2">{skill}</Typography>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchorEl(null); setDonClippoOpen(true); }}>
          <LiaHatCowboySideSolid style={{ fontSize: 20, marginRight: 8 }} />
          <Typography variant="body2">{t('donClippo.visitMenuItem')}</Typography>
        </MenuItem>
      </Menu>

      <SkillsSettings
        open={skillsModalOpen}
        onClose={() => {
          setSkillsModalOpen(false);
          loadSkills();
        }}
        project={projectName}
      />

      <DonClippoModal
        open={donClippoOpen}
        onClose={() => { setDonClippoOpen(false); loadSkills(); }}
        projectName={projectName}
        sessionId={sessionId}
      />
    </>
  );
}
