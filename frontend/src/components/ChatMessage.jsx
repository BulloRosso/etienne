import React, { useState } from 'react';
import { Box, Typography, Paper, IconButton, Collapse } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import TokenConsumptionPane from './TokenConsumptionPane.tsx';

export default function ChatMessage({ role, text, timestamp, usage }) {
  const isUser = role === 'user';
  const [tokenPaneExpanded, setTokenPaneExpanded] = useState(false);

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isUser ? 'flex-start' : 'flex-end',
      mb: 2,
      px: 2
    }}>
      <Box sx={{ maxWidth: '70%' }}>
        <Paper
          elevation={2}
          sx={{
            p: 2,
            pb: isUser || !isUser && !usage ? 2 : 0,
            backgroundColor: isUser ? '#fff' : '#f5f5f5',
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <Typography
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'Roboto',
              fontSize: '14px',
              wordBreak: 'break-word'
            }}
          >
            {text}
          </Typography>
          {usage && !isUser && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#999', fontSize: '11px', mr: 0.5 }}>
                  Costs
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setTokenPaneExpanded(!tokenPaneExpanded)}
                  sx={{ p: 0.5 }}
                >
                  {tokenPaneExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={tokenPaneExpanded}>
                <TokenConsumptionPane usage={usage} />
              </Collapse>
            </Box>
          )}
        </Paper>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.5,
            ml: isUser ? '10px': '0',
            mr: isUser ? '0': '10px',
            color: '#999',
            fontSize: '11px',
            textAlign: isUser ? 'left' : 'right'
          }}
        >
          {timestamp}
        </Typography>
      </Box>
    </Box>
  );
}
