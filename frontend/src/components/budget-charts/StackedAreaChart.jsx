import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Stacked area chart of cost per day by token type. Pure SVG (no charting
 * dependency), mirroring the dashboard prototype. Scales responsively via a
 * viewBox; the parent controls the rendered width.
 *
 * @param {{
 *   data: Array<Record<string, number> & { day: string }>,
 *   keys: Array<{ key: string, color: string, label: string }>,
 *   currencySymbol?: string,
 *   emptyLabel?: string,
 * }} props
 */
export default function StackedAreaChart({ data, keys, currencySymbol = '', emptyLabel = '—' }) {
  const rows = data || [];
  const hasData = rows.length > 1 && rows.some((d) => keys.some((k) => (d[k.key] || 0) > 0));

  if (!hasData) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: 220 }}>
        <Typography variant="caption" color="text.secondary">{emptyLabel}</Typography>
      </Box>
    );
  }

  const W = 720;
  const H = 280;
  const P = { l: 44, r: 10, t: 10, b: 24 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  // Build cumulative stacks per day.
  const stacks = rows.map((d) => {
    let acc = 0;
    const o = { day: d.day, _bands: {} };
    keys.forEach((k) => {
      const v = d[k.key] || 0;
      o._bands[k.key] = [acc, acc + v];
      acc += v;
    });
    o._top = acc;
    return o;
  });

  const maxY = Math.max(0.0001, ...stacks.map((s) => s._top)) * 1.05;
  const x = (i) => P.l + (i / (rows.length - 1)) * iw;
  const y = (v) => P.t + ih - (v / maxY) * ih;

  const fmtY = (v) => (v >= 1 ? v.toFixed(0) : v.toFixed(2));

  // Grid lines + y labels.
  const gridlines = [];
  for (let g = 0; g <= 4; g++) {
    const gy = P.t + ih - (g / 4) * ih;
    const val = (maxY * g) / 4;
    gridlines.push(
      <g key={g}>
        <line x1={P.l} x2={W - P.r} y1={gy} y2={gy} stroke="rgba(127,127,127,.18)" />
        <text x={P.l - 6} y={gy + 3} fontSize="10" fill="currentColor" opacity="0.55" textAnchor="end">
          {currencySymbol}{fmtY(val)}
        </text>
      </g>
    );
  }

  // Areas — draw top band first so lower bands overlay cleanly (reverse order).
  const areas = [...keys].reverse().map((k) => {
    let top = '';
    let bot = '';
    stacks.forEach((s, i) => {
      top += `${i ? 'L' : 'M'}${x(i)},${y(s._bands[k.key][1])} `;
    });
    for (let i = stacks.length - 1; i >= 0; i--) {
      bot += `L${x(i)},${y(stacks[i]._bands[k.key][0])} `;
    }
    return (
      <path key={k.key} d={`${top}${bot}Z`} fill={k.color} fillOpacity="0.42" stroke={k.color} strokeWidth="1.3" />
    );
  });

  // X labels (every ~5th to avoid crowding).
  const step = Math.max(1, Math.round(rows.length / 6));
  const xLabels = rows.map((d, i) =>
    i % step === 0 ? (
      <text key={i} x={x(i)} y={H - 7} fontSize="10" fill="currentColor" opacity="0.55" textAnchor="middle">
        {d.day.slice(5)}
      </text>
    ) : null
  );

  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img">
        {gridlines}
        {areas}
        {xLabels}
      </svg>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
        {keys.map((k) => (
          <Box key={k.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: k.color }} />
            <Typography variant="caption" color="text.secondary">{k.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
