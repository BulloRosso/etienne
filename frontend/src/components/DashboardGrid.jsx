import React from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { InfoOutlined, Logout } from '@mui/icons-material';

const DashboardGrid = ({ currentProject, onItemClick, onClose, onAboutClick, user, onLogout }) => {
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
      disabled: !currentProject
    },
    // 4th row
    {
      id: 'budget',
      image: '/budget.jpg',
      label: 'Budget Settings',
      disabled: !currentProject
    },
    {
      id: 'email',
      image: '/email.jpg',
      label: 'Email',
      disabled: false // Email configuration is global, not project-specific
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
    }
  ];

  const handleClick = (id) => {
    onItemClick(id);
    onClose();
  };

  return (
    <Box sx={{ width: '300px' }}>
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
                bgcolor: 'error.light',
                '& .logout-icon': {
                  color: 'error.contrastText'
                },
                '& .logout-text': {
                  color: 'error.contrastText'
                }
              }
            }}
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <Box>
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
        {dashboardItems.map((item) => (
          <Paper
            key={item.id}
            elevation={3}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
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
                color: item.disabled ? 'text.disabled' : 'text.primary',
                fontWeight: 500,
                fontSize: '0.75rem'
              }}
            >
              {item.label}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default DashboardGrid;
