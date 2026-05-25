import React from 'react';
import { Box, Typography, Stack, Paper } from '@mui/material';
import { Description, Person } from '@mui/icons-material';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import WikiLinkTree from './workflows/WikiLinkTree';

/**
 * RationaleCard — renders a DecisionRationale (shared between workflow
 * transitions and HITL verification responses).
 *
 * Props:
 *   rationale: { reasoning, evidenceDocuments[], recordedAt, recordedBy }
 *   projectName: string
 *   variant: 'card' | 'inline'   (card = elevated paper, inline = flat)
 *   title?: string               (optional heading shown above the reasoning)
 *   onOpenDocument?: (docPath) => boolean   intercept link clicks; return true to
 *                                           suppress the default eventBus publish
 */
export default function RationaleCard({
  rationale,
  projectName,
  variant = 'card',
  title,
  onOpenDocument,
}) {
  if (!rationale || !rationale.reasoning) return null;

  const docs = Array.isArray(rationale.evidenceDocuments) ? rationale.evidenceDocuments : [];
  const recordedAt = rationale.recordedAt ? new Date(rationale.recordedAt).toLocaleString() : null;

  const handleOpenDocument = (docPath) => {
    if (!projectName || !docPath) return;
    if (onOpenDocument && onOpenDocument(docPath) === true) return;
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
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
            <Description sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
              Evidence
            </Typography>
          </Stack>
          <WikiLinkTree
            items={docs.map((docPath) => ({
              key: docPath,
              label: docPath.split('/').pop(),
              title: docPath,
            }))}
            onClick={(item) => handleOpenDocument(item.key)}
          />
        </Box>
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
    <Paper elevation={4} sx={{ p: 1.5 }}>
      {inner}
    </Paper>
  );
}
