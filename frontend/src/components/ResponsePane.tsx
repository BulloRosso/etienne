import * as React from 'react';
import { Box, Paper, Typography, LinearProgress } from '@mui/material';

type Props = {
  streaming: boolean;
  text: string;
  sessionId?: string;
};

export default function ResponsePane({ streaming, text, sessionId }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'navy', color: 'white', fontFamily: 'Roboto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ color: 'white', fontFamily: 'Roboto', fontWeight: 'bold' }}>Model Response</Typography>
        <Typography variant="caption" sx={{ color: 'gold', fontFamily: 'Roboto' }}>
          {sessionId ? `session: ${sessionId}` : 'no session'}
        </Typography>
      </Box>
      {streaming && <LinearProgress sx={{ mb: 2 }} />}
      <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'Roboto', m: 0, color: 'white', fontSize: '80%' }}>
        {text}
      </Typography>
    </Paper>
  );
}
