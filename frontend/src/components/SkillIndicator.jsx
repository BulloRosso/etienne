import React, { useState, useEffect } from 'react';
import { Box, Tooltip, Menu, MenuItem, Typography, Divider } from '@mui/material';
import { GiAtom } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import SkillsSettings from './SkillsSettings';
import DonClippoModal from './DonClippoModal';

export default function SkillIndicator({ projectName, sessionId }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
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
            minWidth: 20,
            px: 0.5,
            py: 0.25,
            bgcolor: '#ff9800',
            color: '#ffffff',
            borderRadius: '10px',
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
          <img src="/don-clippo.png" alt="" style={{ width: 20, height: 20, marginRight: 8, borderRadius: 4, objectFit: 'contain' }} />
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
