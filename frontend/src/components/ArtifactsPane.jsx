import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
        <Tab label="Live Changes" />
        <Tab label="Strategy" />
        <Tab label="Filesystem" />
        <Tab label="Permissions" />
        <Tab label="MCP" />
        <Tab label="Interceptors" />
      </Tabs>
      <TabPanel value={tabValue} index={0}>
        <FilesPanel files={files} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <Strategy projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <Filesystem projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <PermissionList projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={4}>
        <MCPServerConfiguration projectName={projectName} />
      </TabPanel>
      <TabPanel value={tabValue} index={5}>
        <Interceptors projectName={projectName} />
      </TabPanel>
    </Box>
  );
}
