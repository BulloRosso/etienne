import React, { useState, useRef, useMemo } from 'react';
import { Box, Popover, List, ListItemButton, ListItemText, Collapse, Typography, Tooltip } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { filePreviewHandler } from '../services/FilePreviewHandler';

function pickLabel(labels, lang, defaultLocale) {
  if (!labels || typeof labels !== 'object') return '';
  if (labels[lang]) return labels[lang];
  const short = (lang || '').split('-')[0];
  if (labels[short]) return labels[short];
  if (defaultLocale && labels[defaultLocale]) return labels[defaultLocale];
  const first = Object.values(labels)[0];
  return typeof first === 'string' ? first : '';
}

/**
 * WelcomePageMenu
 * ───────────────
 * Layout strategy:
 *   pane (provided by parent)
 *     └── centerer (flex, centers child)
 *           └── stage  (sized to image's natural aspect ratio,
 *                       fits inside the pane — letterboxed)
 *                 ├── <img> (fills stage)
 *                 └── hotspots (absolute, x%/y% of stage = of image)
 *
 * Because the stage uses the image's aspect ratio, hotspot %s map
 * exactly to image pixels regardless of pane size.
 */
export default function WelcomePageMenu({ config, projectName }) {
  const { i18n } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const [imgSize, setImgSize] = useState(null); // { w, h } once loaded
  const [imgFailed, setImgFailed] = useState(false);
  const anchorRefs = useRef({});

  const lang = (i18n.language || 'en').split('-')[0];
  const defaultLocale = config?.defaultLocale || 'en';
  const hotspots = Array.isArray(config?.hotspots) ? config.hotspots : [];

  const imageUrl = useMemo(() => {
    if (!config?.background || !projectName) return null;
    return `/api/workspace/${encodeURIComponent(projectName)}/files/${config.background}`;
  }, [config?.background, projectName]);

  const handleImgLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setImgSize({ w: naturalWidth, h: naturalHeight });
    }
  };

  const handleAction = (action) => {
    if (!action || !projectName) return;
    if (action.type === 'preview' && action.path) {
      filePreviewHandler.handlePreview(action.path, projectName);
    }
  };

  const activeHotspot = hotspots.find(h => h.id === activeHotspotId) || null;
  const activeAnchor = activeHotspotId ? anchorRefs.current[activeHotspotId] : null;

  // Pane backdrop: transparent when an image is loaded; gradient as a
  // visible placeholder while loading or if no image is configured.
  const paneBg = (imageUrl && !imgFailed)
    ? 'transparent'
    : (isDark
        ? 'linear-gradient(135deg, #1e2a3a, #2a3a2a)'
        : 'linear-gradient(135deg, #cfe6f4, #a8cf94)');

  // Stage = natural image pixel box, anchored at 0,0 of the pane.
  // Hotspots are absolute children of the stage with left/top in px,
  // so their positions track image pixels exactly. overflow: hidden
  // ensures hotspots placed outside the image don't expand the
  // scrollable area beyond the image bottom.
  const stageSx = imgSize
    ? { position: 'relative', width: imgSize.w, height: imgSize.h, flexShrink: 0, overflow: 'hidden' }
    : { position: 'relative', width: '100%', height: '100%' };

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        background: paneBg,
      }}
    >
      <Box sx={stageSx}>
        {imageUrl && !imgFailed && (
          <img
            src={imageUrl}
            alt=""
            onLoad={handleImgLoad}
            onError={() => setImgFailed(true)}
            draggable={false}
            style={{
              display: 'block',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        )}

        {hotspots.map((h) => {
          const x = Number(h.x) || 0;
          const y = Number(h.y) || 0;
          const tip = pickLabel(h.labels, lang, defaultLocale);
          const isActive = activeHotspotId === h.id;
          return (
            <Tooltip key={h.id} title={tip} placement="top" arrow>
              <Box
                ref={(el) => { anchorRefs.current[h.id] = el; }}
                onClick={() => setActiveHotspotId(h.id)}
                sx={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: 'translate(-50%, -50%)',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  bgcolor: isDark ? 'rgba(255,215,0,0.85)' : 'rgba(25,118,210,0.92)',
                  color: isDark ? '#222' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 0 0 4px rgba(255,255,255,0.45)',
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                  '&:hover': {
                    transform: 'translate(-50%, -50%) scale(1.08)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,255,255,0.6)',
                  },
                  animation: isActive ? 'none' : 'welcomeHotspotPulse 2.4s ease-in-out infinite',
                  '@keyframes welcomeHotspotPulse': {
                    '0%, 100%': { boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 0 0 4px rgba(255,255,255,0.45)' },
                    '50%':      { boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 0 0 8px rgba(255,255,255,0.25)' },
                  },
                }}
              >
                {h.icon || '+'}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {activeHotspot && (
        <HotspotPopover
          hotspot={activeHotspot}
          anchorEl={activeAnchor}
          onClose={() => setActiveHotspotId(null)}
          lang={lang}
          defaultLocale={defaultLocale}
          onAction={handleAction}
        />
      )}
    </Box>
  );
}

function HotspotPopover({ hotspot, anchorEl, onClose, lang, defaultLocale, onAction }) {
  const [openGroupIdx, setOpenGroupIdx] = useState(0);
  const groups = Array.isArray(hotspot?.menu) ? hotspot.menu : [];
  const hasGroups = groups.some(g => Array.isArray(g.items) && g.items.length > 0);

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{ paper: { sx: { mt: 1, minWidth: 240, maxWidth: 360, borderRadius: 2 } } }}
    >
      {hotspot?.labels && (
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {pickLabel(hotspot.labels, lang, defaultLocale)}
          </Typography>
        </Box>
      )}
      <List disablePadding sx={{ py: 0.5 }}>
        {!hasGroups && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            (no menu items)
          </Typography>
        )}
        {groups.map((group, gi) => {
          const items = Array.isArray(group.items) ? group.items : [];
          const isOpen = openGroupIdx === gi;
          return (
            <React.Fragment key={gi}>
              <ListItemButton onClick={() => setOpenGroupIdx(isOpen ? -1 : gi)} sx={{ py: 0.75 }}>
                <ListItemText
                  primary={pickLabel(group.labels, lang, defaultLocale)}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                />
                {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List disablePadding>
                  {items.map((item, ii) => (
                    <ListItemButton
                      key={ii}
                      onClick={() => {
                        onAction(item.action);
                        onClose();
                      }}
                      sx={{ pl: 4, py: 0.5 }}
                    >
                      <ListItemText
                        primary={pickLabel(item.labels, lang, defaultLocale)}
                        primaryTypographyProps={{ fontSize: '0.85rem' }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          );
        })}
      </List>
    </Popover>
  );
}
