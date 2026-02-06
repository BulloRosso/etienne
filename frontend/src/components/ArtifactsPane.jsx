import React, { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Drawer, IconButton, Tooltip } from '@mui/material';
import { PiFolders } from 'react-icons/pi';
import { BiMemoryCard } from 'react-icons/bi';
import { IoHandRightOutline } from 'react-icons/io5';
import FilesPanel from './FilesPanel';
import Strategy from './Strategy';
import Filesystem from './Filesystem';
import PermissionList from './PermissionList';
import Interceptors from './Interceptors';
import ConnectivitySettings from './ConnectivitySettings';
import MemoryPanel from './MemoryPanel';
import CheckpointsPane from './CheckpointsPane';
import GuardrailsSettings from './GuardrailsSettings';
import HealthToast from './HealthToast';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useAuth } from '../contexts/AuthContext.jsx';

function TabPanel({ children, value, index }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
    >
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </Box>
  );
}

export default function ArtifactsPane({ files, projectName, showBackgroundInfo, projectExists = true, onClearPreview, onCloseTab }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [tabValue, setTabValue] = useState(0);
  const [filesystemDrawerOpen, setFilesystemDrawerOpen] = useState(false);
  const [filesystemTabValue, setFilesystemTabValue] = useState(0);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [guardrailsEnabled, setGuardrailsEnabled] = useState(false);
  const [guardrailsModalOpen, setGuardrailsModalOpen] = useState(false);

  // Check if memory is enabled from localStorage
  useEffect(() => {
    const checkMemoryEnabled = () => {
      const saved = localStorage.getItem('memoryEnabled');
      setMemoryEnabled(saved === 'true');
    };

    checkMemoryEnabled();

    // Listen for storage changes (when user toggles memory in settings)
    window.addEventListener('storage', checkMemoryEnabled);

    // Custom event for same-window storage changes
    const handleMemoryChange = () => checkMemoryEnabled();
    window.addEventListener('memoryChanged', handleMemoryChange);

    return () => {
      window.removeEventListener('storage', checkMemoryEnabled);
      window.removeEventListener('memoryChanged', handleMemoryChange);
    };
  }, []);

  // Check if guardrails are enabled
  useEffect(() => {
    const checkGuardrailsEnabled = async () => {
      if (!projectName) {
        setGuardrailsEnabled(false);
        return;
      }

      try {
        const response = await fetch(`/api/guardrails/${projectName}/input`);
        if (response.ok) {
          const data = await response.json();
          setGuardrailsEnabled(data.config?.enabled?.length > 0);
        }
      } catch (error) {
        console.error('Failed to check guardrails:', error);
        setGuardrailsEnabled(false);
      }
    };

    checkGuardrailsEnabled();

    // Custom event for guardrails changes
    const handleGuardrailsChange = () => checkGuardrailsEnabled();
    window.addEventListener('guardrailsChanged', handleGuardrailsChange);

    return () => {
      window.removeEventListener('guardrailsChanged', handleGuardrailsChange);
    };
  }, [projectName]);

  // Listen for file preview requests
  useEffect(() => {
    const handleFilePreview = (data) => {
      if (data.action === 'html-preview' || data.action === 'json-preview' || data.action === 'markdown-preview' || data.action === 'mermaid-preview' || data.action === 'research-preview' || data.action === 'image-preview' || data.action === 'excel-preview') {
        // Close filesystem drawer
        setFilesystemDrawerOpen(false);
        // Switch to Live Changes tab (tab 0)
        setTabValue(0);
      }
    };

    const unsubscribe = claudeEventBus.subscribe(ClaudeEvents.FILE_PREVIEW_REQUEST, handleFilePreview);

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ flex: 1 }}>
          <Tab label="Artifacts" />
          {projectExists && <Tab label="Role" />}
          {projectExists && isAdmin && <Tab label="Permissions" />}
          {projectExists && isAdmin && <Tab label="Connectivity" />}
          {projectExists && isAdmin && <Tab label="Observability" />}
        </Tabs>
        {guardrailsEnabled && projectExists && (
          <Tooltip title="Input Guardrails Active">
            <IconButton
              onClick={() => setGuardrailsModalOpen(true)}
              sx={{ mr: 1, color: '#c62828' }}
            >
              <IoHandRightOutline size={24} />
            </IconButton>
          </Tooltip>
        )}
        {memoryEnabled && projectExists && (
          <Tooltip title="Agent Memory Enabled">
            <IconButton
              onClick={() => setMemoryDrawerOpen(true)}
              sx={{ mr: 1, color: '#4caf50' }}
            >
              <BiMemoryCard size={24} />
            </IconButton>
          </Tooltip>
        )}
        {projectExists && (
          <Tooltip title="Filesystem Browser">
            <IconButton
              onClick={() => setFilesystemDrawerOpen(true)}
              sx={{ mr: '12px' }}
            >
              <PiFolders />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <TabPanel value={tabValue} index={0}>
        <FilesPanel
          files={files}
          projectName={projectName}
          showBackgroundInfo={showBackgroundInfo}
          onCloseTab={onCloseTab}
          onCloseAll={onClearPreview}
        />
      </TabPanel>
      {projectExists && (
        <>
          <TabPanel value={tabValue} index={1}>
            <Strategy projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
          </TabPanel>
          {isAdmin && (
            <>
              <TabPanel value={tabValue} index={2}>
                <PermissionList projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
              </TabPanel>
              <TabPanel value={tabValue} index={3}>
                <ConnectivitySettings projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
              </TabPanel>
              <TabPanel value={tabValue} index={4}>
                <Interceptors projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
              </TabPanel>
            </>
          )}
        </>
      )}

      <Drawer
        anchor="right"
        open={filesystemDrawerOpen}
        onClose={() => setFilesystemDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: '600px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Tabs
            value={filesystemTabValue}
            onChange={(e, newValue) => setFilesystemTabValue(newValue)}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Files" />
            <Tab label="Checkpoints" />
          </Tabs>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {filesystemTabValue === 0 && (
              <Filesystem projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
            )}
            {filesystemTabValue === 1 && (
              <CheckpointsPane
                projectName={projectName}
                showBackgroundInfo={showBackgroundInfo}
                onRestoreComplete={() => setFilesystemTabValue(0)}
              />
            )}
          </Box>
        </Box>
      </Drawer>

      <Drawer
        anchor="left"
        open={memoryDrawerOpen}
        onClose={() => setMemoryDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: '500px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <MemoryPanel projectName={projectName} onClose={() => setMemoryDrawerOpen(false)} showBackgroundInfo={showBackgroundInfo} isOpen={memoryDrawerOpen} />
        </Box>
      </Drawer>

      <GuardrailsSettings
        open={guardrailsModalOpen}
        onClose={() => setGuardrailsModalOpen(false)}
        project={projectName}
        showBackgroundInfo={showBackgroundInfo}
      />

      <HealthToast />
    </Box>
  );
}
