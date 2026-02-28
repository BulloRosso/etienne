import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Divider,
  Card,
  CardContent,
  Paper,
  Stack,
  Alert
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const ExamplesTab = () => {
  const { t } = useTranslation();
  return (
    <Box>
      <Stack spacing={3}>
        {/* Simple Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={t('examplesTab.simpleChip')} color="primary" size="small" />
              {t('examplesTab.simpleCondition')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('examplesTab.simpleDescription')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              {t('examplesTab.simpleExample')}
            </Typography>
            <Paper sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "simple",
  "event": {
    "group": "Filesystem",
    "name": "File Created",
    "payload.path": "*.py"
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('examplesTab.simpleAlert')}
            </Alert>
          </CardContent>
        </Card>

        {/* Semantic Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={t('examplesTab.semanticChip')} color="secondary" size="small" />
              {t('examplesTab.semanticCondition')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('examplesTab.semanticDescription')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              {t('examplesTab.semanticExample')}
            </Typography>
            <Paper sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "semantic",
  "event": {
    "group": "Filesystem",
    "payload": {
      "similarity": {
        "query": "user authentication and login security",
        "threshold": 0.86
      }
    }
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('examplesTab.semanticAlert')}
            </Alert>
          </CardContent>
        </Card>

        {/* Compound Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={t('examplesTab.compoundChip')} color="warning" size="small" />
              {t('examplesTab.compoundCondition')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('examplesTab.compoundDescription')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              {t('examplesTab.compoundExample')}
            </Typography>
            <Paper sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "compound",
  "operator": "AND",
  "conditions": [
    {
      "type": "simple",
      "event": { "group": "Filesystem", "name": "File Modified" }
    },
    {
      "type": "simple",
      "event": { "payload.path": "*/test/*" }
    }
  ],
  "timeWindow": 300000
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('examplesTab.compoundAlert')}
            </Alert>
          </CardContent>
        </Card>

        {/* Temporal Constraint Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={t('examplesTab.temporalChip')} color="success" size="small" />
              {t('examplesTab.temporalConstraint')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('examplesTab.temporalDescription')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              {t('examplesTab.temporalExample')}
            </Typography>
            <Paper sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "temporal",
  "time": {
    "after": "09:00",
    "before": "17:00",
    "dayOfWeek": [1, 2, 3, 4, 5]
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('examplesTab.temporalAlert')}
            </Alert>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default ExamplesTab;
