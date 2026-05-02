import React from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { InfoOutlined, Logout, Settings } from '@mui/icons-material';
import { TbDeviceAirtag } from 'react-icons/tb';
import { VscServerProcess } from 'react-icons/vsc';
import { RiRobot2Line } from 'react-icons/ri';
import { useTranslation } from 'react-i18next';
import { useUxMode } from '../contexts/UxModeContext.jsx';

const DashboardGrid = ({ currentProject, sessionId, onCopySessionId, onItemClick, onClose, onAboutClick, user, onLogout, onSettingsClick, onServiceControlClick, onAgentPersonaClick, codingAgent = 'anthropic', fluid = false, hideHeader = false }) => {
  const { t } = useTranslation(["dashboard","common"]);
  const { isMinimalistic } = useUxMode();
  const dashboardItems = [
    // 1st row
    {
      id: 'subagents',
      image: '/subagents.png',
      label: t('dashboard:itemSubagents'),
      disabled: !currentProject
    },
    {
      id: 'skills',
      image: '/skills.png',
      label: t('dashboard:itemSkills'),
      disabled: !currentProject
    },
    // 2nd row
    {
      id: 'knowledge',
      image: '/knowledge.png',
      label: t('dashboard:itemKnowledgeBase'),
      disabled: !currentProject
    },
    {
      id: 'externalevents',
      image: '/externalevents.png',
      label: t('dashboard:itemExternalEvents'),
      disabled: !currentProject
    },
    // 3rd row
    {
      id: 'scheduling',
      image: '/scheduling.png',
      label: t('dashboard:itemScheduling'),
      disabled: !currentProject
    },
    {
      id: 'guardrails',
      image: '/guardrails.png',
      label: t('dashboard:itemGuardrails'),
      disabled: !currentProject,
      adminOnly: true
    },
    // 4th row
    {
      id: 'budget',
      image: '/budget.png',
      label: t('dashboard:itemBudgetSettings'),
      disabled: !currentProject
    },
    // 5th row
    {
      id: 'customui',
      image: '/customui.png',
      label: t('dashboard:itemCustomizeUI'),
      disabled: !currentProject
    },
    {
      id: 'contexts',
      image: '/contextmanager.png',
      label: t('dashboard:itemContextTagging'),
      disabled: !currentProject
    },
    // 6th row
    {
      id: 'conditionmonitoring',
      image: '/conditionmonitoring.png',
      label: t('dashboard:itemConditionMonitoring'),
      disabled: !currentProject
    },
    {
      id: 'scrapbook',
      image: '/scrapbook.png',
      label: t('dashboard:itemScrapbook'),
      disabled: !currentProject
    },
    // 7th row
    {
      id: 'issues',
      image: '/issues.png',
      label: t('dashboard:itemIssues'),
      disabled: !currentProject,
      minRole: 'user'
    },
    {
      id: 'ontologycore',
      image: '/decision-support.png',
      label: t('dashboard:itemDecisionSupport'),
      disabled: !currentProject
    },
    // 8th row
    {
      id: 'a2a',
      image: '/project-wizard-step-6.png',
      label: t('teamUp.title'),
      disabled: !currentProject
    },
    {
      id: 'skillstore',
      image: '/skills.png',
      label: t('dashboard:itemSkillStore'),
      disabled: false,
      adminOnly: true
    },
    {
      id: 'previewers',
      image: '/previewers.png',
      label: t('dashboard:itemPreviewers'),
      disabled: false,
      adminOnly: true
    }
  ];

  const handleClick = (id) => {
    onItemClick(id);
    onClose();
  };

  return (
    <Box sx={{ width: fluid ? '100%' : '300px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      {!hideHeader && (
      <Box
        sx={{
          p: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              position: 'relative',
              top: '-6px',
              left: '10px',
              color: 'primary.main'
            }}
          >
            {t('dashboard:headerTitle')}
          </Typography>
          <IconButton
            size="small"
            onClick={() => {
              onAboutClick();
              onClose();
            }}
            sx={{
              ml: 1,
              position: 'relative',
              top: '-6px',
              color: 'primary.main'
            }}
          >
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Box>
        {sessionId && (
          <Tooltip title={t('app.sessionIdTooltip', { sessionId })} arrow>
            <IconButton
              size="small"

              onClick={(e) => {
                e.stopPropagation();
                if (onCopySessionId) onCopySessionId();
              }}
              sx={{ color: 'text.secondary',
                 position: 'relative',
              top: '-5px',
               }}
            >
              <TbDeviceAirtag size={20} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      )}

      {/* Logout Tile */}
      {user && !isMinimalistic && (
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
              <Tooltip title={t('dashboard:changePasswordTooltip')}>
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
          gridTemplateColumns: fluid ? 'repeat(auto-fill, minmax(130px, 1fr))' : 'repeat(2, 1fr)',
          gap: 2,
          p: 2,
          pt: 1,
          overflow: 'auto',
          flex: 1
        }}
      >
        {dashboardItems.filter((item) => {
          if (item.adminOnly && (!user || user.role !== 'admin')) return false;
          if (item.minRole === 'user' && (!user || user.role === 'guest')) return false;
          return true;
        }).map((item) => {
          const paper = (
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
              minHeight: '100px',
              minWidth: 0,
              overflow: 'hidden'
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
                fontSize: '0.75rem',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={item.label}
            >
              {item.label}
            </Typography>
          </Paper>
          );
          return item.disabledReason ? (
            <Tooltip key={item.id} title={item.disabledReason}>
              <span style={{ display: 'flex' }}>{paper}</span>
            </Tooltip>
          ) : paper;
        })}
      </Box>

      {/* Bottom links - Service Control & Agent Persona */}
      {user && user.role !== 'guest' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMinimalistic ? 'flex-start' : 'center',
            gap: 3,
            px: 2,
            py: 1.5,
            mt: 'auto',
          }}
        >
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
              gap: 0.5,
              cursor: 'pointer',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' }
            }}
          >
            <VscServerProcess size={16} />
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {t('dashboard:serviceControl')}
            </Typography>
          </Box>
          <Box
            onClick={() => {
              if (onAgentPersonaClick) {
                onAgentPersonaClick();
                onClose();
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              color: 'text.secondary',
              '&:hover': { color: '#9c27b0' }
            }}
          >
            <RiRobot2Line size={16} />
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {t('projectMenu.agentPersona')}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DashboardGrid;
