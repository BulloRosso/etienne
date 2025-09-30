import * as React from 'react';
import { Paper, Typography } from '@mui/material';

type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number; model?: string };

type Props = { usage?: Usage };

export default function TokenConsumptionPane({ usage }: Props) {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? (inputTokens + outputTokens);
  const model = usage?.model ?? 'n/a';

  return (
    <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#efefef', fontFamily: 'Roboto' }}>
      <Typography sx={{ fontFamily: 'Roboto', fontSize: '80%' }}>
        <strong>Model:</strong> {model}
      </Typography>
      <Typography sx={{ fontFamily: 'Roboto', fontSize: '80%' }}>
        <strong>Last Request:</strong> {inputTokens} Input + {outputTokens} Output = {totalTokens} Tokens total
      </Typography>
    </Paper>
  );
}
