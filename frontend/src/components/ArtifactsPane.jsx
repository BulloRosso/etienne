import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import FilesPanel from './FilesPanel';

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

export default function ArtifactsPane({ files }) {
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
        <Tab label="Files" />
      </Tabs>
      <TabPanel value={tabValue} index={0}>
        <FilesPanel files={files} />
      </TabPanel>
    </Box>
  );
}
