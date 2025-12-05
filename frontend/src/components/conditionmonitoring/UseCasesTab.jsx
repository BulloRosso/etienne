import React from 'react';
import { Box } from '@mui/material';

const UseCasesTab = () => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <img
        src="/condition-monitoring-usecases.jpg"
        alt="Condition Monitoring Use Cases"
        style={{
          maxWidth: 1000,
          width: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 8
        }}
      />
    </Box>
  );
};

export default UseCasesTab;
