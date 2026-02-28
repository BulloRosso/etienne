import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import MCPServerConfiguration from './MCPServerConfiguration';
import A2ASettings from './A2ASettings';

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

export default function ConnectivitySettings({ projectName, showBackgroundInfo }) {
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        value={tabValue}
        onChange={(e, newValue) => setTabValue(newValue)}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
        TabIndicatorProps={{ sx: { height: 3 } }}
      >
        <Tab
          label={t('connectivity.tabMcp')}
          sx={{ minHeight: 42, textTransform: 'none' }}
        />
        <Tab
          label={t('connectivity.tabA2a')}
          sx={{ minHeight: 42, textTransform: 'none' }}
        />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <MCPServerConfiguration projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <A2ASettings projectName={projectName} showBackgroundInfo={showBackgroundInfo} />
      </TabPanel>
    </Box>
  );
}
