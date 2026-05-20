import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, Box, IconButton, Tooltip } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CloseIcon from '@mui/icons-material/Close';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

export default function MermaidZoomModal({ open, svg, onClose }) {
  const [surfaceEl, setSurfaceEl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef(null);

  // Reset transform whenever a new diagram opens
  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open, svg]);

  // Inject SVG once both the surface DOM node and svg markup are available.
  // Callback ref (setSurfaceEl) guarantees we run AFTER the node mounts —
  // a plain useRef can attach after this effect on first open.
  useEffect(() => {
    if (!surfaceEl) return;
    surfaceEl.innerHTML = svg || '';
    const svgEl = surfaceEl.querySelector('svg');
    if (svgEl) {
      svgEl.style.maxWidth = 'none';
      svgEl.style.maxHeight = 'none';
      svgEl.style.display = 'block';
      // Mermaid sometimes emits width:100% inline, which collapses inside
      // an inline-block container. Force it to its intrinsic viewBox size
      // so the scale transform has something to scale.
      if (svgEl.hasAttribute('viewBox')) {
        const viewBox = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
        if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
          svgEl.setAttribute('width', String(viewBox[2]));
          svgEl.setAttribute('height', String(viewBox[3]));
        }
      }
    }
  }, [svg, surfaceEl, open]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Wheel-to-zoom (anchored on cursor position so the point under the cursor stays put)
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (!surfaceEl) return;
    const rect = surfaceEl.getBoundingClientRect();
    const cx = e.clientX - (rect.left + rect.width / 2);
    const cy = e.clientY - (rect.top + rect.height / 2);

    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom((prevZoom) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(prevZoom + direction * ZOOM_STEP).toFixed(2)));
      if (nextZoom === prevZoom) return prevZoom;
      const scaleRatio = nextZoom / prevZoom;
      setOffset((prevOffset) => ({
        x: cx - (cx - prevOffset.x) * scaleRatio,
        y: cy - (cy - prevOffset.y) * scaleRatio,
      }));
      return nextZoom;
    });
  }, [surfaceEl]);

  // Pan via mouse drag
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  }, []);

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
    };
  }, [open, handleMouseMove, endDrag]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === '+' || e.key === '=') { zoomIn(); }
      else if (e.key === '-' || e.key === '_') { zoomOut(); }
      else if (e.key === '0') { reset(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, zoomIn, zoomOut, reset]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: '90vw',
          height: '90vh',
          m: 0,
          overflow: 'hidden',
          position: 'relative',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          display: 'flex',
          gap: 0.5,
          bgcolor: 'background.paper',
          boxShadow: 1,
          borderRadius: 1,
          p: 0.5,
        }}
      >
        <Tooltip title="Zoom out (-)">
          <span>
            <IconButton size="small" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`Reset (0) — ${Math.round(zoom * 100)}%`}>
          <IconButton size="small" onClick={reset}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom in (+)">
          <span>
            <IconButton size="small" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Close (Esc)">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        sx={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          cursor: dragStateRef.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Box
          ref={setSurfaceEl}
          sx={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragStateRef.current ? 'none' : 'transform 0.1s ease-out',
            display: 'inline-block',
            pointerEvents: 'none',
          }}
        />
      </Box>
    </Dialog>
  );
}
