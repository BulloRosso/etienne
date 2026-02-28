import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number; model?: string };

type Props = { usage?: Usage };

export default function TokenConsumptionPane({ usage }: Props) {
  const { t } = useTranslation();
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? (inputTokens + outputTokens);
  const model = usage?.model ?? 'n/a';

  return (
    <Box sx={{ p: 2, backgroundColor: '#efefef', fontFamily: 'Roboto', mb: 1 }}>
      <Typography sx={{ fontFamily: 'Roboto', fontSize: '80%' }}>
        <strong>{t('tokenConsumption.model')}:</strong> {model}
      </Typography>
      <Typography sx={{ fontFamily: 'Roboto', fontSize: '80%' }}>
        {t('tokenConsumption.tokenSummary', { inputTokens, outputTokens, totalTokens })}
      </Typography>
    </Box>
  );
}
