import React from 'react';
import { Box, Typography, Chip, Stack, Paper } from '@mui/material';
import { Description, Person } from '@mui/icons-material';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

/**
 * RationaleCard — renders a DecisionRationale (shared between workflow
 * transitions and HITL verification responses).
 *
 * Props:
 *   rationale: { reasoning, evidenceDocuments[], recordedAt, recordedBy }
 *   projectName: string
 *   variant: 'card' | 'inline'   (card = elevated paper, inline = flat)
 *   title?: string               (optional heading shown above the reasoning)
 */
export default function RationaleCard({ rationale, projectName, variant = 'card', title }) {
  if (!rationale || !rationale.reasoning) return null;

  const docs = Array.isArray(rationale.evidenceDocuments) ? rationale.evidenceDocuments : [];
  const recordedAt = rationale.recordedAt ? new Date(rationale.recordedAt).toLocaleString() : null;

  const handleOpenDocument = (docPath) => {
    if (!projectName || !docPath) return;
    const action = docPath.endsWith('.quarterly.json') ? 'quarterly-preview' : 'markdown-preview';
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      action,
      filePath: docPath,
      projectName,
    });
  };

  const inner = (
    <Box>
      {title && (
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
          {title}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: title ? 0.5 : 0, mb: docs.length > 0 ? 1 : 0 }}>
        {rationale.reasoning}
      </Typography>
      {docs.length > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.75 }}>
          {docs.map((docPath) => (
            <Chip
              key={docPath}
              icon={<Description />}
              label={docPath.split('/').pop()}
              size="small"
              variant="outlined"
              onClick={() => handleOpenDocument(docPath)}
              title={docPath}
            />
          ))}
        </Stack>
      )}
      {(recordedAt || rationale.recordedBy) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {rationale.recordedBy && (
            <>
              <Person sx={{ fontSize: 12, verticalAlign: 'text-bottom', mr: 0.25 }} />
              {rationale.recordedBy}
            </>
          )}
          {rationale.recordedBy && recordedAt ? ' · ' : ''}
          {recordedAt}
        </Typography>
      )}
    </Box>
  );

  if (variant === 'inline') {
    return inner;
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {inner}
    </Paper>
  );
}
