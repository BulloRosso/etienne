import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Typography, Tooltip, CircularProgress, Avatar, Menu, MenuItem, ListItemIcon, ListItemText, Slide } from '@mui/material';
import { PiDotsThreeVertical, PiCaretLeft } from 'react-icons/pi';
import * as PiIcons from 'react-icons/pi';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { filePreviewHandler } from '../services/FilePreviewHandler';
import { getIcon as getRegistryIcon } from '../utils/iconRegistry';

/**
 * Hyperscreen — an overlay that renders a configurable, card-based layout on top
 * of the chat message pane.
 *
 * Configuration lives in the project directory at `hyperscreen/settings.json`,
 * and each card's image (and submenu/background images) are project-relative
 * files served by `GET /api/workspace/:project/files/*`.
 *
 * Localization is handled entirely inside settings.json (titles, tooltips, the
 * background label, etc. are read verbatim from the config).
 *
 * Card click → emits a FILE_PREVIEW_REQUEST (via filePreviewHandler) so the
 * file preview handler opens the configured artifact in the preview pane.
 */

const DEFAULT_BACKGROUND = '#eef4fb'; // pale, very light blue

// Resolve an icon name from any supported react-icons set. Phosphor (Pi*) icons
// are resolved directly; everything else falls back to the shared registry.
function resolveIcon(name) {
  if (!name) return null;
  if (name.startsWith('Pi') && PiIcons[name]) return PiIcons[name];
  return getRegistryIcon(name);
}

// Build the workspace file URL for a project-relative path inside hyperscreen/.
// Accepts either a bare filename ("space.jpg") or an explicit relative path.
function fileUrl(projectName, relPath) {
  if (!relPath) return null;
  const clean = relPath.replace(/^\.?\//, '');
  const path = clean.includes('/') ? clean : `hyperscreen/${clean}`;
  return `/api/workspace/${encodeURIComponent(projectName)}/files/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function SubmenuButtons({ items, projectName, parentCard, onSelect }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Box
      sx={{
        position: 'absolute',
        // Overlap the lower image border by 30% of the button height (30px → -9px),
        // right-aligned.
        bottom: '-9px',
        right: 8,
        display: 'flex',
        gap: 0.75,
        zIndex: 2,
      }}
    >
      {items.map((item, idx) => {
        const Icon = resolveIcon(item.icon);
        return (
          <Tooltip key={item.id || idx} title={item.title || ''}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item, parentCard);
              }}
              sx={{
                width: 30,
                height: 30,
                backgroundColor: 'rgba(255,255,255,0.92)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                '&:hover': { backgroundColor: '#fff' },
              }}
            >
              {Icon ? (
                <Icon size={16} color={item.color || '#444'} />
              ) : (
                <Avatar src={fileUrl(projectName, item.image)} sx={{ width: 24, height: 24 }} />
              )}
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}

// Title block (title + optional subtitle), fixed common height so all cards align.
function CardTitle({ card }) {
  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        height: 64,
        flex: '0 0 64px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 600,
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={card.title}
      >
        {card.title}
      </Typography>
      {card.subtitle && (
        <Typography
          variant="caption"
          color="text.secondary"
          title={card.subtitle}
          sx={{
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card.subtitle}
        </Typography>
      )}
    </Box>
  );
}

function HyperscreenCard({ card, projectName, compact, imgHeight, reversed = false, onOpen, onSelectSubmenu }) {
  const { mode: themeMode } = useThemeMode();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const contextItems = Array.isArray(card.contextMenu) ? card.contextMenu : [];

  const handleContextSelect = (item) => {
    setMenuAnchor(null);
    if (item.previewFile) {
      filePreviewHandler.handlePreview(item.previewFile, projectName);
    } else if (item.title) {
      onSelectSubmenu(item, card);
    }
  };

  return (
    <Box
      onClick={() => onOpen(card)}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        cursor: card.previewFile ? 'pointer' : 'default',
        borderRadius: 2.5,
        overflow: 'hidden',
        backgroundColor: themeMode === 'dark' ? '#2f2f2f' : '#fff',
        // Submenu (reversed) cards get a shadow that is ~half the size of the main
        // menu cards' and falls further to the bottom-right (positive x-offset).
        boxShadow: reversed
          ? (themeMode === 'dark'
              ? '5px 5px 14px rgba(0,0,0,0.55), 1px 1px 3px rgba(0,0,0,0.4)'
              : '6px 6px 14px rgba(31,45,61,0.18), 2px 2px 4px rgba(31,45,61,0.12)')
          : (themeMode === 'dark'
              ? '0 10px 28px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)'
              : '0 12px 28px rgba(31,45,61,0.18), 0 4px 8px rgba(31,45,61,0.12)'),
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        '&:hover': card.previewFile
          ? {
              transform: 'translateY(-4px)',
              boxShadow: reversed
                ? (themeMode === 'dark'
                    ? '8px 8px 18px rgba(0,0,0,0.65)'
                    : '9px 9px 19px rgba(31,45,61,0.26)')
                : (themeMode === 'dark'
                    ? '0 16px 36px rgba(0,0,0,0.65)'
                    : '0 18px 38px rgba(31,45,61,0.26)'),
            }
          : {},
      }}
    >
      {/* Context menu trigger (right-aligned vertical ellipsis) */}
      {contextItems.length > 0 && (
        <>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
            sx={{
              position: 'absolute',
              top: 6,
              right: 6,
              zIndex: 3,
              backgroundColor: 'rgba(255,255,255,0.85)',
              '&:hover': { backgroundColor: '#fff' },
            }}
          >
            <PiDotsThreeVertical size={18} color="#444" />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            onClick={(e) => e.stopPropagation()}
          >
            {contextItems.map((item, idx) => {
              const Icon = resolveIcon(item.icon);
              return (
                <MenuItem key={item.id || idx} onClick={() => handleContextSelect(item)}>
                  {Icon && (
                    <ListItemIcon>
                      <Icon size={18} />
                    </ListItemIcon>
                  )}
                  <ListItemText>{item.title}</ListItemText>
                </MenuItem>
              );
            })}
          </Menu>
        </>
      )}

      {reversed ? (
        <>
          {/* Reversed layout (submenu cards): title on top, light-grey
              description area below in secondary text style. The grey area is
              hidden entirely when there is no (non-empty) description. */}
          <CardTitle card={card} />
          {card.description && card.description.trim() && (
            <Box
              sx={{
                px: 1.75,
                py: 1.25,
                flex: 1,
                backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#fafafa',
                borderTop: themeMode === 'dark' ? '1px solid #3a3a3a' : '1px solid #f0f0f0',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {card.description}
              </Typography>
            </Box>
          )}
        </>
      ) : (
        <>
          {/* Central image — optional. Fixed common height (px) so every card with an
              image is identically tall regardless of the image's native ratio;
              objectFit: cover keeps the image undistorted (cropped, never stretched).
              Cards without an image (and no submenu buttons) render title-only. */}
          {(card.image || (Array.isArray(card.submenu) && card.submenu.length > 0)) && (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: imgHeight ? `${imgHeight}px` : compact ? 150 : 200,
                backgroundColor: themeMode === 'dark' ? '#262626' : '#f3f6fa',
              }}
            >
              {card.image && (
                <Box
                  component="img"
                  src={fileUrl(projectName, card.image)}
                  alt={card.title || ''}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <SubmenuButtons items={card.submenu} projectName={projectName} parentCard={card} onSelect={onSelectSubmenu} />
            </Box>
          )}
          <CardTitle card={card} />
        </>
      )}
    </Box>
  );
}

export default function Hyperscreen({ open, onClose, projectName, slideContainer = null }) {
  const { mode: themeMode } = useThemeMode();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // When a context (secondary) panel is open, the main cards slide left to 50%.
  const [contextCards, setContextCards] = useState(null);
  const slid = Boolean(contextCards);
  // Common image aspect ratio (width / height) computed from the natural sizes
  // of all configured images before rendering, so every card shares one layout
  // height while images stay non-skewed (objectFit: cover). null until measured.
  const [commonRatio, setCommonRatio] = useState(null);
  const [imagesReady, setImagesReady] = useState(false);
  // Measured width of a single grid column; combined with commonRatio it yields a
  // fixed pixel height shared by every card (uniform height, responsive on resize).
  const [colWidth, setColWidth] = useState(0);
  const gridRef = useRef(null);
  // Same measurement for the submenu (context) grid, which has its own column width.
  const [subColWidth, setSubColWidth] = useState(0);
  const subGridRef = useRef(null);

  useEffect(() => {
    if (!open || !projectName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/files/hyperscreen/settings.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`settings.json not found (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setSettings(JSON.parse(text));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectName]);

  // Reset the slide-in context panel whenever the overlay is reopened.
  useEffect(() => {
    if (!open) setContextCards(null);
  }, [open]);

  const background = settings?.background || DEFAULT_BACKGROUND;
  const cards = useMemo(() => (Array.isArray(settings?.cards) ? settings.cards : []), [settings]);

  // Collect every image referenced anywhere in the config (primary + context cards).
  const allImages = useMemo(() => {
    const out = [];
    const walk = (card) => {
      if (card.image) out.push(card.image);
      (Array.isArray(card.contextMenu) ? card.contextMenu : []).forEach((m) =>
        (Array.isArray(m.cards) ? m.cards : []).forEach(walk),
      );
    };
    cards.forEach(walk);
    return out;
  }, [cards]);

  // Preload all images, measure natural aspect ratios, and derive a single common
  // ratio (median — robust against outliers) before the cards render. This gives a
  // uniform layout height across cards while objectFit: cover keeps images undistorted.
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    if (allImages.length === 0) {
      setCommonRatio(null);
      setImagesReady(true);
      return;
    }
    setImagesReady(false);
    const ratios = [];
    let remaining = allImages.length;
    const done = () => {
      if (cancelled) return;
      if (ratios.length > 0) {
        const sorted = [...ratios].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median =
          sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        setCommonRatio(median);
      } else {
        setCommonRatio(null);
      }
      setImagesReady(true);
    };
    allImages.forEach((rel) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          ratios.push(img.naturalWidth / img.naturalHeight);
        }
        if (--remaining === 0) done();
      };
      img.onerror = () => {
        if (--remaining === 0) done();
      };
      img.src = fileUrl(projectName, rel);
    });
    return () => {
      cancelled = true;
    };
  }, [settings, allImages, projectName]);

  // Track the real width of a grid column so the shared image height can be derived
  // from it (and stays correct on resize / when the context panel slides in).
  useEffect(() => {
    if (!imagesReady) return;
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const first = grid.firstElementChild;
      if (first) setColWidth(first.getBoundingClientRect().width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [imagesReady, slid, settings]);

  // Same, but for the submenu grid (only mounted while slid).
  useEffect(() => {
    if (!slid) return;
    const grid = subGridRef.current;
    if (!grid) return;
    const measure = () => {
      const first = grid.firstElementChild;
      if (first) setSubColWidth(first.getBoundingClientRect().width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [slid, contextCards]);

  // Fixed common image height in px: column width ÷ common ratio. Falls back to a
  // sensible default until measured.
  const imgHeight = useMemo(() => {
    if (colWidth && commonRatio) return Math.round(colWidth / commonRatio);
    return slid ? 150 : 200;
  }, [colWidth, commonRatio, slid]);

  // Separate height for submenu cards, derived from their own (narrower) columns.
  const subImgHeight = useMemo(() => {
    if (subColWidth && commonRatio) return Math.round(subColWidth / commonRatio);
    return 150;
  }, [subColWidth, commonRatio]);

  const handleOpenCard = (card) => {
    if (card.previewFile) {
      // Always emit an event for the file preview handler to catch.
      filePreviewHandler.handlePreview(card.previewFile, projectName);
    }
  };

  // A submenu / context item that defines its own set of cards slides them in
  // from the right; otherwise it routes to the preview handler. The parent card is
  // tracked so the main layout can show only it while the panel is open.
  const handleSelectSubmenu = (item, parentCard = null) => {
    if (Array.isArray(item.cards) && item.cards.length > 0) {
      setContextCards({
        title: item.title,
        background: item.background,
        cards: item.cards,
        parentCard,
      });
    } else if (item.previewFile) {
      filePreviewHandler.handlePreview(item.previewFile, projectName);
    }
  };

  // Close when the click lands on the background itself (not on a card or control).
  const closeOnBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <Slide direction="up" in={open} container={slideContainer} mountOnEnter unmountOnExit timeout={320}>
    <Box
      onClick={closeOnBackdrop}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        // Single full-width background so the main + submenu panes share one
        // continuous horizontal gradient (no seam at the 50% boundary). When the
        // submenu is open, fade from the main background (left) into the submenu
        // color (right); otherwise a flat main background.
        background: slid
          ? `linear-gradient(to right, ${background} 0%, ${background} 50%, ${contextCards?.background || DEFAULT_BACKGROUND} 75%)`
          : background,
        overflow: 'hidden',
      }}
    >
      {/* Minimal-width vertical scrollbar for the scrollable panes */}
      <style>{`
        .hyperscreen-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(120,120,120,0.5) transparent;
        }
        .hyperscreen-scroll::-webkit-scrollbar { width: 4px; }
        .hyperscreen-scroll::-webkit-scrollbar-track { background: transparent; }
        .hyperscreen-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(120,120,120,0.5);
          border-radius: 2px;
        }
        .hyperscreen-scroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
      `}</style>
      {/* Primary cards — slide left to 50% when a context panel is open */}
      <Box
        onClick={closeOnBackdrop}
        className="hyperscreen-scroll"
        sx={{
          flex: slid ? '0 0 50%' : '1 1 100%',
          height: '100%',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 1,
          // Uniform inset on all sides.
          p: 2.5,
          transition: 'flex-basis 0.32s ease, flex-grow 0.32s ease',
        }}
      >
        {(loading || (!error && !imagesReady)) && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">{error}</Typography>
            <Typography variant="caption" color="text.secondary">
              Expected at <code>hyperscreen/settings.json</code>
            </Typography>
          </Box>
        )}

        {!loading && !error && imagesReady && (
          <Box
            ref={gridRef}
            onClick={closeOnBackdrop}
            sx={{
              display: 'grid',
              gridTemplateColumns: slid
                ? 'repeat(auto-fill, minmax(180px, 1fr))'
                : 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 2.5,
              alignContent: 'start',
              // Don't stretch cards to the tallest in the row — keep each card's
              // intrinsic height so captions line up uniformly.
              alignItems: 'start',
            }}
          >
            {(slid && contextCards?.parentCard ? [contextCards.parentCard] : cards).map((card, idx) => (
              <HyperscreenCard
                key={card.id || idx}
                card={card}
                projectName={projectName}
                compact={slid}
                imgHeight={imgHeight}
                onOpen={handleOpenCard}
                onSelectSubmenu={handleSelectSubmenu}
              />
            ))}
          </Box>
        )}

        {/* Back / close-submenu section under the main menu item (right-aligned) */}
        {slid && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
            <Box
              onClick={() => setContextCards(null)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.75,
                py: 1,
                borderRadius: '999px',
                backgroundColor: themeMode === 'dark' ? '#2f2f2f' : '#fff',
                boxShadow: themeMode === 'dark'
                  ? '0 2px 8px rgba(0,0,0,0.5)'
                  : '0 2px 8px rgba(31,45,61,0.15)',
                cursor: 'pointer',
                color: 'text.secondary',
                '&:hover': { backgroundColor: themeMode === 'dark' ? '#3a3a3a' : '#f7f7f7' },
              }}
            >
              <PiCaretLeft size={18} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Zurück
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Context panel — fills the right 50%, cards stacked bottom-to-top */}
      {slid && (
        <Box
          className="hyperscreen-scroll"
          sx={{
            flex: '0 0 50%',
            height: '100%',
            overflowY: 'auto',
            position: 'relative',
            zIndex: 1,
            // Transparent — the continuous gradient lives on the outer container.
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            // Same top inset as the main menu; small left inset so cards don't
            // hug the panel's left edge.
            pt: 2.5,
            pl: 1,
            pr: 2.5,
            pb: 2.5,
          }}
        >
          {/* Cards stacked top-to-bottom */}
          <Box
            ref={subGridRef}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 2,
              alignContent: 'start',
              alignItems: 'start',
            }}
          >
            {contextCards.cards.map((card, idx) => (
              <HyperscreenCard
                key={card.id || idx}
                card={card}
                projectName={projectName}
                compact
                reversed
                imgHeight={subImgHeight}
                onOpen={handleOpenCard}
                onSelectSubmenu={handleSelectSubmenu}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
    </Slide>
  );
}
