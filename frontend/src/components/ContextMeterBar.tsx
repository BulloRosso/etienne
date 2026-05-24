import * as React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';

export type ContextState = {
  percentFull: number;
  usedTokens: number;
  maxTokens: number;
  model: string;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

type Props = { state?: ContextState };

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ContextMeterBar({ state }: Props) {
  if (!state) return null;

  const pct = Math.max(0, Math.min(100, state.percentFull));
  const color: 'success' | 'warning' | 'error' =
    pct < 60 ? 'success' : pct < 85 ? 'warning' : 'error';

  return (
    <Box sx={{ px: 2, py: 0.75, borderBottom: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
        <Typography sx={{ fontFamily: 'Roboto', fontSize: '11px', color: '#555' }}>
          {state.model} — context {pct.toFixed(1)}% full
        </Typography>
        <Typography sx={{ fontFamily: 'Roboto', fontSize: '11px', color: '#777' }}>
          {formatTokens(state.usedTokens)} / {formatTokens(state.maxTokens)} tokens
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 4, borderRadius: 2 }} />
    </Box>
  );
}
