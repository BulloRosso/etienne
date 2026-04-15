import React from 'react';
import { Box, Typography } from '@mui/material';
import TechnologyRadar, { EXAMPLE_DATA } from '../components/TechnologyRadar';

const TechnologyRadarPage = () => {
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Technology Radar
      </Typography>
      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Explore patent clusters by technology. Click a keyword in the radar to see related patents below.
      </Typography>
      <TechnologyRadar data={EXAMPLE_DATA} />
    </Box>
  );
};

export default TechnologyRadarPage;
