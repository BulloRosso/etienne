import React from 'react';
import { Box } from '@mui/material';

export default function TypingIndicator() {
  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'flex-end',
      mb: 2,
      px: 2
    }}>
      <Box
        component="img"
        src="/atom.svg"
        alt=""
        sx={{ width: 55, height: 50 }}
      />
    </Box>
  );
}
