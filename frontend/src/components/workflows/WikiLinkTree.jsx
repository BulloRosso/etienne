import React from 'react';
import { Box, Stack, Link as MuiLink, Typography } from '@mui/material';

/**
 * Renders a list of wiki-link items as an indented, tree-line list under a
 * parent label (or icon + label). Each item gets a "├─" connector except the
 * last, which gets "└─". Clicking an item calls onClick(item).
 *
 * Props:
 *   items: Array<{ key: string; label: string; title?: string; meta?: ReactNode }>
 *   onClick: (item) => void
 */
export default function WikiLinkTree({ items = [], onClick }) {
  if (!items.length) return null;
  return (
    <Stack spacing={0} sx={{ ml: 1 }}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <Box
            key={item.key}
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 0.5,
              minHeight: 22,
            }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: 'monospace',
                color: 'text.disabled',
                fontSize: 13,
                lineHeight: 1.4,
                userSelect: 'none',
              }}
            >
              {isLast ? '└─' : '├─'}
            </Typography>
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
        );
      })}
    </Stack>
  );
}
