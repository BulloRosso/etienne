import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Donut chart of the token economy — the share each token type contributes.
 * Pure SVG arc math (no charting dependency), mirroring the dashboard prototype.
 *
 * @param {{ slices: Array<{ label: string, value: number, color: string }>, size?: number }} props
 *   `value` is any comparable magnitude (cost or tokens); slices are normalized.
 */
export default function TokenEconomyDonut({ slices, size = 190 }) {
  const data = (slices || []).filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: size }}>
        <Typography variant="caption" color="text.secondary">—</Typography>
      </Box>
    );
  }

  const R = size * 0.41;
  const r = size * 0.27;
  const cx = size / 2;
  const cy = size / 2;
  const gap = 0.03; // radians between slices

  let angle = -Math.PI / 2;
  const paths = data.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a2 = angle + sweep;
    const sa = angle + gap / 2;
    const ea = a2 - gap / 2;
    const x1 = cx + R * Math.cos(sa);
    const y1 = cy + R * Math.sin(sa);
    const x2 = cx + R * Math.cos(ea);
    const y2 = cy + R * Math.sin(ea);
    const xi1 = cx + r * Math.cos(ea);
    const yi1 = cy + r * Math.sin(ea);
    const xi2 = cx + r * Math.cos(sa);
    const yi2 = cy + r * Math.sin(sa);
    const large = sweep > Math.PI ? 1 : 0;
    angle = a2;
    return (
      <path
        key={i}
        d={`M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${xi1},${yi1} A${r},${r} 0 ${large} 0 ${xi2},${yi2} Z`}
        fill={s.color}
      />
    );
  });

  return (
    <Box>
      <Box sx={{ display: 'grid', placeItems: 'center' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
          {paths}
        </svg>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
        {data.map((s, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 14 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: s.color, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1 }}>{s.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round((s.value / total) * 100)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
