import React, { useState } from 'react';
import { Box, Tabs, Tab, Drawer, IconButton, Tooltip } from '@mui/material';
import { PiFolders } from 'react-icons/pi';
import FilesPanel from './FilesPanel';
import Strategy from './Strategy';
import Filesystem from './Filesystem';
import PermissionList from './PermissionList';
import Interceptors from './Interceptors';
import MCPServerConfiguration from './MCPServerConfiguration';

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

export default function ArtifactsPane({ files, projectName }) {
  const [tabValue, setTabValue] = useState(0);
  const [filesystemDrawerOpen, setFilesystemDrawerOpen] = useState(false);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ flex: 1 }}>
          <Tab label="Live Changes" />
          <Tab label="System Prompt" />
          <Tab label="Permissions" />
          <Tab label="Integrations" />
          <Tab label="Interceptors" />
        </Tabs>
        <Tooltip title="Filesystem Browser">
          <IconButton
            onClick={() => setFilesystemDrawerOpen(true)}
            sx={{ mr: 1 }}
          >
            <PiFolders />
          </IconButton>
        </Tooltip>
      </Box>
      <TabPanel value={tabValue} index={0}>
        <FilesPanel files={files} projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <Strategy projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <PermissionList projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <MCPServerConfiguration projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={4}>
        <Interceptors projectName={projectName} />
      </TabPanel>

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
          <Filesystem projectName={projectName} />
        </Box>
      </Drawer>
    </Box>
  );
}
