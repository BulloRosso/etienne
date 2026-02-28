import React, { useState, useEffect } from 'react';
import { Drawer, Box, Typography, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress, Snackbar, Alert } from '@mui/material';
import { Close, PlayArrow, Stop, MoreVert } from '@mui/icons-material';
import CodingAgentConfigDialog from './CodingAgentConfigDialog.jsx';
import { VscServerProcess } from 'react-icons/vsc';
import { PiShareNetworkLight, PiTelegramLogo, PiMicrosoftTeamsLogo, PiVectorThree } from 'react-icons/pi';
import { AiOutlineMail } from 'react-icons/ai';
import { RiRobot2Line } from 'react-icons/ri';
import { MdSecurity } from 'react-icons/md';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const serviceIcons = {
  'rdf-store': PiShareNetworkLight,
  'telegram': PiTelegramLogo,
  'ms-teams': PiMicrosoftTeamsLogo,
  'imap-connector': AiOutlineMail,
  'a2a-server': RiRobot2Line,
  'vector-store': PiVectorThree,
  'oauth-server': MdSecurity,
};

export default function ServiceControlDrawer({ open, onClose }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [services, setServices] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState(null);
  const [codingAgentConfigOpen, setCodingAgentConfigOpen] = useState(false);
  const [errorToast, setErrorToast] = useState({ open: false, message: '' });

  useEffect(() => {
    if (open) {
      fetchServicesAndStatuses();
    }
  }, [open]);

  const fetchServicesAndStatuses = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/process-manager');
      const data = await response.json();
      const serviceList = (data.services || []).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
      setServices(serviceList);

      const statusResults = {};
      await Promise.all(
        serviceList.map(async (svc) => {
          try {
            const res = await apiFetch(`/api/process-manager/${svc.name}`);
            const statusData = await res.json();
            statusResults[svc.name] = statusData;
          } catch {
            statusResults[svc.name] = { status: 'stopped' };
          }
        })
      );
      setStatuses(statusResults);
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTileClick = (event, service) => {
    setSelectedService(service);
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedService(null);
  };

  const handleAction = async (action) => {
    if (!selectedService) return;
    const serviceName = selectedService.name;
    const displayName = selectedService.displayName || serviceName;
    handleMenuClose();
    setActionInProgress(serviceName);

    try {
      const response = await apiFetch(`/api/process-manager/${serviceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        setErrorToast({ open: true, message: `Failed to ${action} ${displayName}: ${result.message || 'Unknown error'}` });
        setActionInProgress(null);
        return;
      }

      // Poll for status update
      const pollStatus = async (attempts = 0) => {
        try {
          const res = await apiFetch(`/api/process-manager/${serviceName}`);
          const statusData = await res.json();
          setStatuses(prev => ({ ...prev, [serviceName]: statusData }));
          const expectedPrevStatus = action === 'start' ? 'stopped' : 'running';
          if (attempts < 5 && statusData.status === expectedPrevStatus) {
            setTimeout(() => pollStatus(attempts + 1), 2000);
          } else {
            if (statusData.status === expectedPrevStatus) {
              setErrorToast({ open: true, message: `${displayName} failed to ${action}. The service did not reach the expected state.` });
            }
            setActionInProgress(null);
          }
        } catch {
          setErrorToast({ open: true, message: `Failed to check status of ${displayName} after ${action}.` });
          setActionInProgress(null);
        }
      };

      setTimeout(() => pollStatus(), 2000);
    } catch (error) {
      console.error(`Failed to ${action} service ${serviceName}:`, error);
      setErrorToast({ open: true, message: `Failed to ${action} ${displayName}: ${error.message || 'Network error'}` });
      setActionInProgress(null);
    }
  };

  const isRunning = (serviceName) => statuses[serviceName]?.status === 'running';
  const getPort = (serviceName) => statuses[serviceName]?.port;

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        sx={{
          '& .MuiDrawer-paper': {
            height: '220px',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px'
          }
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0
          }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('serviceControl.title')}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                onClick={(e) => setSettingsMenuAnchor(e.currentTarget)}
                size="small"
              >
                <MoreVert />
              </IconButton>
              <IconButton onClick={onClose} size="small">
                <Close />
              </IconButton>
            </Box>
          </Box>

          {/* Service Tiles */}
          <Box sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            px: 2,
            backgroundColor: themeMode === 'dark' ? '#1e1e1e' : '#efefef',
            overflowX: 'auto',
            '&::-webkit-scrollbar': { height: '6px' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: themeMode === 'dark' ? '#555' : '#ccc',
              borderRadius: '3px'
            }
          }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              services.map((svc) => {
                const running = isRunning(svc.name);
                const port = getPort(svc.name);
                const busy = actionInProgress === svc.name;

                return (
                  <Box
                    key={svc.name}
                    onClick={(e) => !busy && handleTileClick(e, svc)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '120px',
                      minWidth: '120px',
                      maxWidth: '120px',
                      p: 2,
                      borderRadius: '8px',
                      cursor: busy ? 'wait' : 'pointer',
                      backgroundColor: themeMode === 'dark' ? '#2d2d2d' : '#fff',
                      boxShadow: 2,
                      border: running ? `2px solid ${themeMode === 'dark' ? '#4caf50' : '#000'}` : '1px solid transparent',
                      transition: 'all 0.2s',
                      '&:hover': busy ? {} : {
                        transform: 'translateY(-2px)',
                        boxShadow: 4,
                        borderColor: running ? '#4caf50' : 'action.hover'
                      }
                    }}
                  >
                    {busy ? (
                      <CircularProgress size={28} sx={{ mb: 1 }} />
                    ) : (() => {
                      const IconComponent = serviceIcons[svc.name] || VscServerProcess;
                      return (
                        <IconComponent
                          size={28}
                          color={running ? '#4caf50' : '#9e9e9e'}
                          style={{ marginBottom: '8px' }}
                        />
                      );
                    })()}
                    <Typography
                      variant="caption"
                      align="center"
                      sx={{ fontWeight: 500, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {svc.displayName}
                    </Typography>
                    {running && port && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                        :{port}
                      </Typography>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      </Drawer>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {selectedService && isRunning(selectedService.name) ? (
          <MenuItem onClick={() => handleAction('stop')}>
            <ListItemIcon>
              <Stop sx={{ color: '#d32f2f' }} />
            </ListItemIcon>
            <ListItemText>{t('serviceControl.stop')}</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => handleAction('start')}>
            <ListItemIcon>
              <PlayArrow sx={{ color: '#4caf50' }} />
            </ListItemIcon>
            <ListItemText>{t('serviceControl.start')}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Settings Menu */}
      <Menu
        anchorEl={settingsMenuAnchor}
        open={Boolean(settingsMenuAnchor)}
        onClose={() => setSettingsMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          setSettingsMenuAnchor(null);
          setCodingAgentConfigOpen(true);
        }}>
          <ListItemText>{t('serviceControl.codingAgentConfig')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Coding Agent Configuration Dialog */}
      <CodingAgentConfigDialog
        open={codingAgentConfigOpen}
        onClose={() => setCodingAgentConfigOpen(false)}
      />

      {/* Error Toast */}
      <Snackbar
        open={errorToast.open}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setErrorToast({ open: false, message: '' })}
        >
          {errorToast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
