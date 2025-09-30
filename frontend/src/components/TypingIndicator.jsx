import React from 'react';
import { Box, Paper } from '@mui/material';
import { keyframes } from '@mui/system';

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-8px);
  }
`;

export default function TypingIndicator() {
  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'flex-end',
      mb: 2,
      px: 2
    }}>
      <Box sx={{ maxWidth: '70%' }}>
        <Paper
          elevation={2}
          sx={{
            p: 2,
            backgroundColor: '#f5f5f5',
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            minWidth: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', py: 0.5 }}>
            <Box
              sx={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#999',
                animation: `${bounce} 1.4s infinite ease-in-out`,
                animationDelay: '0s'
              }}
            />
            <Box
              sx={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#999',
                animation: `${bounce} 1.4s infinite ease-in-out`,
                animationDelay: '0.2s'
              }}
            />
            <Box
              sx={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#999',
                animation: `${bounce} 1.4s infinite ease-in-out`,
                animationDelay: '0.4s'
              }}
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
