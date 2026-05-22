import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Button,
} from '@mui/material';
import { Close, RestartAlt } from '@mui/icons-material';
import CatalogPane from './CatalogPane';
import ManifestPane from './ManifestPane';
import BuildPane from './BuildPane';
import ProfileMenu from './ProfileMenu';
import ImportButton from './ImportButton';
import usePackageDraftStore from '../../stores/usePackageDraftStore';

/**
 * Agent Package Composer — full-screen dialog with three resizable panes.
 *
 *   ┌─ Catalog ─║─ Manifest (flex) ─║─ Build ─┐
 *
 * The Catalog and Build columns hold fixed pixel widths the user can drag,
 * while the Manifest column absorbs the remaining width. Widths are
 * persisted to sessionStorage so they survive close/reopen of the dialog.
 */

const STORAGE_KEY = 'package-composer-column-widths';
const DEFAULTS = { catalog: 380, build: 360 };
const MIN = { catalog: 240, build: 280 };
const MAX_CATALOG_FRACTION = 0.5; // never let catalog exceed 50% of dialog
const MAX_BUILD_FRACTION = 0.5;

function loadWidths() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        catalog: typeof parsed.catalog === 'number' ? parsed.catalog : DEFAULTS.catalog,
        build: typeof parsed.build === 'number' ? parsed.build : DEFAULTS.build,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

function saveWidths(widths) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

export default function Composer({ open, onClose, onDeployed }) {
  const reset = usePackageDraftStore((s) => s.reset);
  const resolveNow = usePackageDraftStore((s) => s.resolveNow);
  const manifest = usePackageDraftStore((s) => s.manifest);

  const [widths, setWidths] = useState(loadWidths);
  const containerRef = useRef(null);

  useEffect(() => {
    if (open) resolveNow();
  }, [open, resolveNow]);

  useEffect(() => {
    saveWidths(widths);
  }, [widths]);

  // Drag-handle factory. `side` is which column the splitter resizes.
  const startDrag = useCallback(
    (side) => (ev) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = widths[side];
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const maxForSide =
        side === 'catalog'
          ? Math.floor(containerWidth * MAX_CATALOG_FRACTION)
          : Math.floor(containerWidth * MAX_BUILD_FRACTION);

      const onMove = (e) => {
        // Catalog grows when dragging right; Build grows when dragging left.
        const delta = side === 'catalog' ? e.clientX - startX : startX - e.clientX;
        const next = Math.min(maxForSide, Math.max(MIN[side], startW + delta));
        setWidths((w) => ({ ...w, [side]: next }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths],
  );

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flex: 1, fontSize: '1rem' }}>
            Agent Package Composer
            {manifest.name && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                — {manifest.name}
              </Typography>
            )}
          </Typography>
          <ProfileMenu />
          <ImportButton onImported={onDeployed} />
          <Button
            size="small"
            startIcon={<RestartAlt />}
            onClick={() => {
              if (window.confirm('Discard the current package draft?')) {
                reset();
              }
            }}
            sx={{ mr: 1 }}
          >
            Reset
          </Button>
          <IconButton edge="end" onClick={onClose}>
            <Close />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          display: 'grid',
          // Catalog | splitter | Manifest (flex) | splitter | Build.
          // The 1fr middle column absorbs the remaining width so resizing
          // one splitter never reflows the opposite column.
          gridTemplateColumns: `${widths.catalog}px 6px 1fr 6px ${widths.build}px`,
          overflow: 'hidden',
          height: 'calc(100vh - 48px)',
        }}
      >
        <Box sx={{ overflow: 'hidden' }}>
          <CatalogPane />
        </Box>
        <Splitter onPointerDown={startDrag('catalog')} />
        <Box sx={{ overflow: 'hidden' }}>
          <ManifestPane />
        </Box>
        <Splitter onPointerDown={startDrag('build')} />
        <Box sx={{ overflow: 'hidden' }}>
          <BuildPane onDeployed={onDeployed} />
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * Vertical drag handle between two columns. Invisible by default; a thin
 * primary-color strip appears on hover/active to telegraph that it's
 * draggable.
 */
function Splitter({ onPointerDown }) {
  return (
    <Box
      onPointerDown={onPointerDown}
      sx={{
        cursor: 'col-resize',
        position: 'relative',
        '&:hover .grip, &:active .grip': {
          backgroundColor: 'primary.main',
        },
      }}
    >
      <Box
        className="grip"
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 2,
          backgroundColor: 'transparent',
          transition: 'background-color 0.15s',
        }}
      />
    </Box>
  );
}
