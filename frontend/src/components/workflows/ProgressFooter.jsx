import React, { useMemo } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

/**
 * Footer for the Status tab. Renders one button per outgoing transition from
 * the workflow's current state, with the target state's description as a
 * subtitle. Clicking a button calls onPick(eventName) — the parent then opens
 * the full ProgressStateDialog with that event pre-selected.
 *
 * Renders nothing when the current state is final or has no outgoing events.
 */
export default function ProgressFooter({ definitionData, statusData, onPick }) {
  const transitions = useMemo(() => {
    if (!definitionData || !statusData) return [];
    const states = definitionData.machineConfig?.states || {};
    const current = states[definitionData.currentState];
    if (!current?.on || current.type === 'final') return [];

    const allowed = new Set(statusData.availableEvents || []);
    return Object.entries(current.on)
      .filter(([eventKey]) => allowed.size === 0 || allowed.has(eventKey))
      .map(([eventKey, targetSpec]) => {
        const targetState = typeof targetSpec === 'string' ? targetSpec : targetSpec?.target;
        const meta = states[targetState]?.meta;
        return {
          event: eventKey,
          target: targetState,
          targetLabel: meta?.label || targetState,
          targetDescription: meta?.description || '',
        };
      });
  }, [definitionData, statusData]);

  if (transitions.length === 0) return null;

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        backgroundColor: 'background.default',
        p: 1.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          mb: 1,
          fontWeight: 600,
          textTransform: 'uppercase',
          color: 'text.secondary',
          letterSpacing: 0.5,
        }}
      >
        Progress to next state
      </Typography>
      <Stack spacing={0.75}>
        {transitions.map((trn) => (
          <Button
            key={trn.event}
            variant="outlined"
            size="small"
            onClick={() => onPick?.(trn.event)}
            startIcon={<PlayArrow fontSize="small" />}
            sx={{
              textTransform: 'none',
              justifyContent: 'flex-start',
              textAlign: 'left',
              alignItems: 'flex-start',
              py: 0.75,
              px: 1.25,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {trn.targetLabel}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 0.75, color: 'text.secondary', fontWeight: 400 }}
                >
                  ({trn.event})
                </Typography>
              </Typography>
              {trn.targetDescription && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    color: 'text.secondary',
                    mt: 0.25,
                    lineHeight: 1.35,
                    whiteSpace: 'normal',
                  }}
                >
                  {trn.targetDescription}
                </Typography>
              )}
            </Box>
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
