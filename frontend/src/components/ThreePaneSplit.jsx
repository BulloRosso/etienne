import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const MIN_PANE_PCT = 12;
const DEFAULT_RATIOS = [22, 48, 30];

function readSaved(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    if (!parsed.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const sum = parsed.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) return null;
    if (parsed.some((n) => n < MIN_PANE_PCT)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Three-pane horizontal layout with two draggable gutters.
 * Widths are percentages summing to 100; persisted to localStorage.
 */
export default function ThreePaneSplit({ left, middle, right, storageKey = 'threePaneSplit' }) {
  const { mode: themeMode } = useThemeMode();
  const containerRef = useRef(null);
  const [ratios, setRatios] = useState(() => readSaved(storageKey) || DEFAULT_RATIOS);
  const [draggingGutter, setDraggingGutter] = useState(null); // 0 (between left/mid) or 1 (between mid/right)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(ratios));
  }, [ratios, storageKey]);

  const handleMouseDown = useCallback((gutterIdx) => (e) => {
    e.preventDefault();
    setDraggingGutter(gutterIdx);
  }, []);

  useEffect(() => {
    if (draggingGutter === null) return;

    const handleMove = (e) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;

      setRatios(([l, m, r]) => {
        if (draggingGutter === 0) {
          const newL = Math.max(MIN_PANE_PCT, Math.min(xPct, l + m - MIN_PANE_PCT));
          const newM = l + m - newL;
          return [newL, newM, r];
        } else {
          const boundary = l + m;
          const newBoundary = Math.max(l + MIN_PANE_PCT, Math.min(xPct, 100 - MIN_PANE_PCT));
          const newM = newBoundary - l;
          const newR = 100 - newBoundary;
          return [l, newM, newR];
        }
      });
    };

    const handleUp = () => setDraggingGutter(null);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // While dragging, neutralise pointer events on every iframe in the
    // document. Otherwise, the moment the cursor enters an iframe (e.g. an
    // MCP UI previewer in the right pane), the iframe captures mousemove
    // and the splitter handler stops receiving them — so the drag freezes
    // until the cursor exits the iframe.
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const previousPointerEvents = iframes.map((f) => f.style.pointerEvents);
    iframes.forEach((f) => { f.style.pointerEvents = 'none'; });

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      iframes.forEach((f, i) => { f.style.pointerEvents = previousPointerEvents[i] || ''; });
    };
  }, [draggingGutter]);

  const gutterSx = {
    width: '6px',
    height: '100%',
    flexShrink: 0,
    cursor: 'col-resize',
    backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '&:hover': { backgroundColor: themeMode === 'dark' ? '#444' : '#efefef' },
    '&:active': { backgroundColor: themeMode === 'dark' ? '#444' : '#efefef' },
  };

  const gripSx = {
    width: '2px',
    height: '30px',
    borderLeft: themeMode === 'dark' ? '2px dotted #555' : '2px dotted #ccc',
  };

  return (
    <Box ref={containerRef} sx={{ display: 'flex', width: '100%', height: '100%' }}>
      <Box sx={{ width: `${ratios[0]}%`, height: '100%', overflow: 'hidden' }}>{left}</Box>
      <Box onMouseDown={handleMouseDown(0)} sx={gutterSx}><Box sx={gripSx} /></Box>
      <Box sx={{ width: `${ratios[1]}%`, height: '100%', overflow: 'hidden' }}>{middle}</Box>
      <Box onMouseDown={handleMouseDown(1)} sx={gutterSx}><Box sx={gripSx} /></Box>
      <Box sx={{ width: `${ratios[2]}%`, height: '100%', overflow: 'hidden' }}>{right}</Box>
    </Box>
  );
}
