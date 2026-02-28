import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Box, Typography, Chip } from '@mui/material';
import { HourglassEmpty, CheckCircle, PlayArrow, RadioButtonChecked, Email, OpenInNew } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const WorkflowStateNode = memo(({ data }) => {
  const { t } = useTranslation();
  const { label, description, nodeType, isCurrent, waitingFor } = data;

  const borderColor = isCurrent ? '#1976d2'
    : nodeType === 'final' ? '#4caf50'
    : nodeType === 'waiting' ? '#ff9800'
    : nodeType === 'initial' ? '#9c27b0'
    : '#757575';

  const bgColor = isCurrent ? '#e3f2fd'
    : nodeType === 'final' ? '#e8f5e9'
    : nodeType === 'waiting' ? '#fff3e0'
    : nodeType === 'initial' ? '#f3e5f5'
    : '#fafafa';

  const waitingIcon = waitingFor === 'human_email' ? <Email sx={{ fontSize: 14 }} />
    : waitingFor === 'external' ? <OpenInNew sx={{ fontSize: 14 }} />
    : <HourglassEmpty sx={{ fontSize: 14 }} />;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <Box sx={{
        border: `2px solid ${borderColor}`,
        borderRadius: 2,
        p: 1.5,
        minWidth: 160,
        maxWidth: 220,
        bgcolor: bgColor,
        boxShadow: isCurrent ? 3 : 1,
        transition: 'box-shadow 0.2s',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          {nodeType === 'initial' && <PlayArrow sx={{ fontSize: 16, color: '#9c27b0' }} />}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
            {label}
          </Typography>
        </Box>
        {description && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5, lineHeight: 1.3 }}>
            {description}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {isCurrent && (
            <Chip
              icon={<RadioButtonChecked sx={{ fontSize: 14 }} />}
              label={t('workflowStateNode.current')}
              size="small"
              color="primary"
              sx={{ height: 20, '& .MuiChip-label': { fontSize: 10, px: 0.5 } }}
            />
          )}
          {waitingFor && (
            <Chip
              icon={waitingIcon}
              label={waitingFor === 'human_chat' ? t('workflowStateNode.chat') : waitingFor === 'human_email' ? t('workflowStateNode.email') : t('workflowStateNode.external')}
              size="small"
              color="warning"
              sx={{ height: 20, '& .MuiChip-label': { fontSize: 10, px: 0.5 } }}
            />
          )}
          {nodeType === 'final' && (
            <Chip
              icon={<CheckCircle sx={{ fontSize: 14 }} />}
              label={t('workflowStateNode.final')}
              size="small"
              color="success"
              sx={{ height: 20, '& .MuiChip-label': { fontSize: 10, px: 0.5 } }}
            />
          )}
        </Box>
      </Box>
      <Handle type="source" position={Position.Right} style={{ background: borderColor }} />
    </>
  );
});

WorkflowStateNode.displayName = 'WorkflowStateNode';

export default WorkflowStateNode;
