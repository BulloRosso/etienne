import React from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { Assessment, InfoOutlined } from '@mui/icons-material';
import { TbCalendarTime, TbPalette } from 'react-icons/tb';
import { IoHandRightOutline } from 'react-icons/io5';
import { RiRobot2Line } from 'react-icons/ri';
import { PiGraphLight } from 'react-icons/pi';
import { GiAtom } from 'react-icons/gi';
import { FcElectricalSensor } from 'react-icons/fc';

const DashboardGrid = ({ currentProject, onItemClick, onClose, onAboutClick }) => {
  const dashboardItems = [
    // 1st row
    {
      id: 'subagents',
      icon: <RiRobot2Line style={{ fontSize: 40 }} />,
      label: 'Subagents',
      disabled: !currentProject
    },
    {
      id: 'skills',
      icon: <GiAtom style={{ fontSize: 40 }} />,
      label: 'Skills',
      disabled: !currentProject
    },
    // 2nd row
    {
      id: 'knowledge',
      icon: <PiGraphLight style={{ fontSize: 40 }} />,
      label: 'Knowledge Base',
      disabled: !currentProject
    },
    {
      id: 'externalevents',
      icon: <FcElectricalSensor style={{ fontSize: 40 }} />,
      label: 'External Events',
      disabled: !currentProject
    },
    // 3rd row
    {
      id: 'scheduling',
      icon: <TbCalendarTime style={{ fontSize: 40 }} />,
      label: 'Scheduling',
      disabled: !currentProject
    },
    {
      id: 'guardrails',
      icon: <IoHandRightOutline style={{ fontSize: 40 }} />,
      label: 'Guardrails',
      disabled: !currentProject
    },
    // 4th row
    {
      id: 'budget',
      icon: <Assessment sx={{ fontSize: 40 }} />,
      label: 'Budget Settings',
      disabled: !currentProject
    },
    {
      id: 'customui',
      icon: <TbPalette style={{ fontSize: 40 }} />,
      label: 'Customize UI',
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

      {/* Dashboard Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
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
            <Box sx={{ color: item.disabled ? 'text.disabled' : 'primary.main', mb: 1 }}>
              {item.icon}
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
