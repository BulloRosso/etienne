import React from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';

const UseCasesTab = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <img
        src="/condition-monitoring-usecases.jpg"
        alt={t('useCasesTab.altText')}
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
