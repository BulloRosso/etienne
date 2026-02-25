import React from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { InfoOutlined, Logout, Settings } from '@mui/icons-material';
import { VscServerProcess } from 'react-icons/vsc';

const DashboardGrid = ({ currentProject, onItemClick, onClose, onAboutClick, user, onLogout, onSettingsClick, onServiceControlClick }) => {
  const dashboardItems = [
    // 1st row
    {
      id: 'subagents',
      image: '/subagents.jpg',
      label: 'Subagents',
      disabled: !currentProject
    },
    {
      id: 'skills',
      image: '/skills.jpg',
      label: 'Skills',
      disabled: !currentProject
    },
    // 2nd row
    {
      id: 'knowledge',
      image: '/knowledge.jpg',
      label: 'Knowledge Base',
      disabled: !currentProject
    },
    {
      id: 'externalevents',
      image: '/externalevents.jpg',
      label: 'External Events',
      disabled: !currentProject
    },
    // 3rd row
    {
      id: 'scheduling',
      image: '/scheduling.jpg',
      label: 'Scheduling',
      disabled: !currentProject
    },
    {
      id: 'guardrails',
      image: '/guardrails.jpg',
      label: 'Guardrails',
      disabled: !currentProject,
      adminOnly: true
    },
    // 4th row
    {
      id: 'budget',
      image: '/budget.jpg',
      label: 'Budget Settings',
      disabled: !currentProject
    },
    // 5th row
    {
      id: 'customui',
      image: '/customui.jpg',
      label: 'Customize UI',
      disabled: !currentProject
    },
    {
      id: 'contexts',
      image: '/contextmanager.jpg',
      label: 'Context/Tagging',
      disabled: !currentProject
    },
    // 6th row
    {
      id: 'conditionmonitoring',
      image: '/conditionmonitoring.jpg',
      label: 'Condition Monitoring',
      disabled: !currentProject
    },
    {
      id: 'scrapbook',
      image: '/scrapbook.jpg',
      label: 'Scrapbook',
      disabled: !currentProject
    },
    // 7th row
    {
      id: 'ontologycore',
      image: '/decision-support.jpg',
      label: 'Decision Support',
      disabled: !currentProject
    },
    // 8th row
    {
      id: 'skillstore',
      image: '/skills.jpg',
      label: 'Skill Store',
      disabled: false,
      adminOnly: true
    }
  ];

  const handleClick = (id) => {
    onItemClick(id);
    onClose();
  };

  return (
    <Box sx={{ width: '300px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: 'primary.main'
          }}
        >
          Etienne
        </Typography>
        <IconButton
          size="small"
          onClick={() => {
            onAboutClick();
            onClose();
          }}
          sx={{
            ml: 1,
            color: 'primary.main'
          }}
        >
          <InfoOutlined fontSize="small" />
        </IconButton>
      </Box>

      {/* Logout Tile */}
      {user && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Paper
            elevation={3}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 6,
                bgcolor: '#e3f2fd',
                '& .logout-icon': {
                  color: 'text.primary'
                },
                '& .logout-text': {
                  color: 'text.primary'
                }
              }
            }}
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Change Password">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSettingsClick) {
                      onSettingsClick();
                      onClose();
                    }
                  }}
                  sx={{ color: 'text.secondary' }}
                >
                  <Settings fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, ml: 1 }}>
              <Typography
                variant="body2"
                className="logout-text"
                sx={{ fontWeight: 600 }}
              >
                {user.displayName || user.username}
              </Typography>
              <Typography
                variant="caption"
                className="logout-text"
                sx={{ color: 'text.secondary', textTransform: 'capitalize' }}
              >
                {user.role}
              </Typography>
            </Box>
            <Logout className="logout-icon" sx={{ color: 'text.secondary' }} />
          </Paper>
        </Box>
      )}

      {/* Dashboard Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(5, 1fr)',
          gap: 2,
          p: 2,
          pt: 1
        }}
      >
        {dashboardItems.filter((item) => !item.adminOnly || (user && user.role === 'admin')).map((item) => (
          <Paper
            key={item.id}
            elevation={3}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
              backgroundColor: '#fff',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.5 : 1,
              transition: 'all 0.2s',
              '&:hover': item.disabled ? {} : {
                transform: 'translateY(-2px)',
                boxShadow: 6
              },
              minHeight: '100px'
            }}
            onClick={() => !item.disabled && handleClick(item.id)}
          >
            <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={item.image}
                alt={item.label}
                style={{
                  height: '60px',
                  width: 'auto',
                  objectFit: 'contain',
                  filter: item.disabled ? 'grayscale(100%)' : 'none'
                }}
              />
            </Box>
            <Typography
              variant="caption"
              align="center"
              sx={{
                color: item.disabled ? 'rgba(0,0,0,0.38)' : '#000',
                fontWeight: 500,
                fontSize: '0.75rem'
              }}
            >
              {item.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Service Control link - bottom aligned, centered, hidden for guest role */}
      {user && user.role !== 'guest' && (
        <Box
          onClick={() => {
            if (onServiceControlClick) {
              onServiceControlClick();
              onClose();
            }
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            mt: 'auto',
            cursor: 'pointer',
            color: 'text.secondary',
            '&:hover': {
              color: 'primary.main'
            }
          }}
        >
          <VscServerProcess size={16} />
          <Typography variant="caption" sx={{ fontWeight: 500 }}>
            Service Control
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default DashboardGrid;
