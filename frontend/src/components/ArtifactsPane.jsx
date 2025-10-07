import React, { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Drawer, IconButton, Tooltip } from '@mui/material';
import { PiFolders } from 'react-icons/pi';
import { BiMemoryCard } from 'react-icons/bi';
import FilesPanel from './FilesPanel';
import Strategy from './Strategy';
import Filesystem from './Filesystem';
import PermissionList from './PermissionList';
import Interceptors from './Interceptors';
import MCPServerConfiguration from './MCPServerConfiguration';
import MemoryPanel from './MemoryPanel';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

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

export default function ArtifactsPane({ files, projectName, showBackgroundInfo, projectExists = true }) {
  const [tabValue, setTabValue] = useState(0);
  const [filesystemDrawerOpen, setFilesystemDrawerOpen] = useState(false);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);

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

  // Listen for file preview requests
  useEffect(() => {
    const handleFilePreview = (data) => {
      if (data.action === 'html-preview') {
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ flex: 1 }}>
          <Tab label="Artifacts" />
          {projectExists && <Tab label="Role" />}
          {projectExists && <Tab label="Permissions" />}
          {projectExists && <Tab label="Connectivity" />}
          {projectExists && <Tab label="Observability" />}
        </Tabs>
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
              sx={{ mr: 1 }}
            >
              <PiFolders />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <TabPanel value={tabValue} index={0}>
        <FilesPanel files={files} projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
      </TabPanel>
      {projectExists && (
        <>
          <TabPanel value={tabValue} index={1}>
            <Strategy projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <PermissionList projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
          </TabPanel>
          <TabPanel value={tabValue} index={3}>
            <MCPServerConfiguration projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
          </TabPanel>
          <TabPanel value={tabValue} index={4}>
            <Interceptors projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
          </TabPanel>
        </>
      )}

      <Drawer
        anchor="right"
        open={filesystemDrawerOpen}
        onClose={() => setFilesystemDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: '400px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <Filesystem projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
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
          <MemoryPanel projectName={projectName} onClose={() => setMemoryDrawerOpen(false)} />
        </Box>
      </Drawer>
    </Box>
  );
}
