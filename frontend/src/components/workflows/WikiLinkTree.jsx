import React from 'react';
import { Box, Link as MuiLink } from '@mui/material';

const ROW_HEIGHT = 22;
const TRUNK_LEFT = 6;   // distance from container's content edge to the vertical trunk
const STUB_WIDTH = 10;  // horizontal length of each item's connector
const LABEL_GAP = 6;    // gap between the end of the stub and the link text

/**
 * Wiki-link list rendered with a continuous CSS tree:
 *   - one absolutely-positioned vertical trunk down the left,
 *     stopping at the vertical center of the last row (L-joint).
 *   - each row contributes a horizontal stub from the trunk to the label.
 */
export default function WikiLinkTree({ items = [], onClick }) {
  if (!items.length) return null;

  const trunkHeight = items.length === 1
    ? ROW_HEIGHT / 2
    : (items.length - 1) * ROW_HEIGHT + ROW_HEIGHT / 2;

  return (
    <Box sx={{ position: 'relative', ml: 1, pl: `${TRUNK_LEFT}px` }}>
      {/* vertical trunk */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: `${TRUNK_LEFT}px`,
          top: 0,
          width: 0,
          height: `${trunkHeight}px`,
          borderLeft: '1px solid',
          borderColor: 'divider',
        }}
      />
      {items.map((item) => (
        <Box
          key={item.key}
          sx={{
            display: 'flex',
            alignItems: 'center',
            height: `${ROW_HEIGHT}px`,
          }}
        >
          {/* horizontal stub */}
          <Box
            aria-hidden
            sx={{
              width: `${STUB_WIDTH}px`,
              height: 0,
              borderTop: '1px solid',
              borderColor: 'divider',
              mr: `${LABEL_GAP}px`,
              flexShrink: 0,
            }}
          />
          <MuiLink
            component="button"
            type="button"
            onClick={() => onClick?.(item)}
            underline="hover"
            title={item.title || item.label}
            sx={{
              textAlign: 'left',
              fontSize: 13,
              lineHeight: 1.4,
              color: 'primary.main',
              p: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {item.label}
          </MuiLink>
          {item.meta}
        </Box>
      ))}
    </Box>
  );
}
